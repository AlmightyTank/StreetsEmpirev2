import type { Account, PrismaClient, Round, RoundPlayer } from '@prisma/client';
import { loadRulesetForRound, startingStock } from '@streets/rules-engine';
import { AppError } from '../utils/errors.js';
import { HappinessService } from './happiness.service.js';
import { NetWorthService } from './net-worth.service.js';
import { RankingService } from './ranking.service.js';
import { ReputationService } from './reputation.service.js';
import { assertJoinable } from './round.service.js';
import {
  parseAftermathRewardQualifications,
  RoundAftermathRewardService,
} from './round-aftermath-reward.service.js';
import { EncounterGangService } from './encounter-gang.service.js';

export type RoundPlayerWithCity = Awaited<
  ReturnType<typeof RoundPlayerService.find>
>;

export const RoundPlayerService = {
  find(prisma: PrismaClient, roundId: string, accountId: string) {
    return prisma.roundPlayer.findUnique({
      where: { roundId_accountId: { roundId, accountId } },
      include: { city: true },
    });
  },

  /**
   * Section 11. Create the account's player for this round.
   *
   * Runs as one transaction: allocate the public pimp id, seed the starting
   * resources from the ruleset, derive happiness and net worth immediately,
   * take the opening rank snapshot, and log the join.
   */
  async join(
    prisma: PrismaClient,
    round: Round,
    account: Account,
  ): Promise<RoundPlayer> {
    assertJoinable(round);

    const existing = await prisma.roundPlayer.findUnique({
      where: { roundId_accountId: { roundId: round.id, accountId: account.id } },
    });
    if (existing) {
      throw AppError.conflict(
        'ALREADY_JOINED',
        `You are already playing ${round.name}.`,
      );
    }

    const ruleset = loadRulesetForRound(round);
    const start = ruleset.round.startingPlayer;

    const city = await prisma.city.findUnique({
      where: { slug: ruleset.round.startingCitySlug },
    });
    if (!city || !city.isEnabled) {
      throw AppError.notFound(
        'STARTING_CITY_UNAVAILABLE',
        'The starting city is not available. An admin needs to look at this.',
      );
    }

    return prisma.$transaction(async (tx) => {
      const existingRewardClaim = await tx.roundAftermathRewardClaim.findUnique({
        where: { targetRoundId_accountId: { targetRoundId: round.id, accountId: account.id } },
      });
      const reward = existingRewardClaim
        ? {
          sourceRoundId: existingRewardClaim.sourceRoundId,
          amountCents: existingRewardClaim.amountCents,
          qualifications: parseAftermathRewardQualifications(existingRewardClaim.qualificationKeys),
        }
        : await RoundAftermathRewardService.forNextRound(tx, round, account.id);

      // Updating the counter row serialises concurrent joins, so two players
      // can never be handed the same public id.
      const counter = await tx.round.update({
        where: { id: round.id },
        data: { nextPublicPimpId: { increment: 1 } },
        select: { nextPublicPimpId: true },
      });
      const publicPimpId = counter.nextPublicPimpId - 1;

      const seed = {
        whores: start.whores,
        thugs: start.thugs,
        condoms: start.condoms,
        medicine: start.medicine,
        crack: start.crack,
        beer: start.beer,
        pistols: start.pistols,
        shotguns: start.shotguns,
        tek9s: start.tek9s,
        ak47s: start.ak47s,
        lowRiders: start.lowRiders,
        payoutPercent: start.payoutPercent,
        cashCents: BigInt(start.cashCents) + reward.amountCents,
      };

      const happiness = HappinessService.recalculate(seed, ruleset);
      const netWorthCents = NetWorthService.calculate(seed, ruleset);

      const ranks = await RankingService.ranksFor(tx, {
        roundId: round.id,
        cityId: city.id,
        netWorthCents,
      });

      const now = new Date();

      const player = await tx.roundPlayer.create({
        data: {
          roundId: round.id,
          accountId: account.id,
          publicPimpId,
          displayName: account.username,
          cityId: city.id,

          ...seed,

          turns: start.turns,
          lastTurnCalculationAt: now,
          lastActiveAt: now,

          // A new player finds the shelves stocked; the caps keep that from
          // being worth much, and starting empty would mean waiting hours for
          // a first shotgun for no reason worth explaining.
          ...startingStock(ruleset, now),

          // A stranger to everybody. Rows are created up front so the first
          // trade has something to credit rather than racing to create it.
          reputation: { create: ReputationService.seedFor(ruleset) },

          whoreHappiness: happiness.whoreHappiness,
          thugHappiness: happiness.thugHappiness,

          netWorthCents,

          localRank: ranks.localRank,
          nationalRank: ranks.nationalRank,
          localRankSinceAt: now,
          nationalRankSinceAt: now,
          dailyStartingLocalRank: ranks.localRank,
          dailyStartingNationalRank: ranks.nationalRank,
        },
      });

      if (reward.amountCents > 0n && !existingRewardClaim) {
        if (!reward.sourceRoundId) {
          throw new AppError(500, 'AFTERMATH_REWARD_SOURCE_MISSING', 'A qualifying aftermath reward has no source round.');
        }
        await tx.roundAftermathRewardClaim.create({
          data: {
            targetRoundId: round.id,
            sourceRoundId: reward.sourceRoundId,
            accountId: account.id,
            amountCents: reward.amountCents,
            qualificationKeys: reward.qualifications,
          },
        });
      }

      await tx.playerActivity.create({
        data: {
          roundPlayerId: player.id,
          type: 'ROUND_JOINED',
          payload: {
            roundName: round.name,
            publicPimpId,
            city: city.name,
            startingCashCents: start.cashCents,
            aftermathRewardCents: Number(reward.amountCents),
            aftermathRewardQualifications: reward.qualifications,
            totalStartingCashCents: seed.cashCents.toString(),
            startingTurns: start.turns,
          },
        },
      });

      // Seed encounter-only crews with the first human join, before players can
      // take locals' turf. These records never receive an Account or RoundPlayer.
      await EncounterGangService.ensureRound(tx, round.id, ruleset, now);

      return player;
    });
  },
};
