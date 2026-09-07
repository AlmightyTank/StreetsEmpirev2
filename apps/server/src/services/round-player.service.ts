import type { Account, PrismaClient, Round, RoundPlayer } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import { AppError } from '../utils/errors.js';
import { HappinessService } from './happiness.service.js';
import { NetWorthService } from './net-worth.service.js';
import { RankingService } from './ranking.service.js';
import { assertJoinable } from './round.service.js';

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
        cashCents: BigInt(start.cashCents),
      };

      // A brand new crew is rested.
      const happiness = HappinessService.recalculate(
        { ...seed, whoreFatigue: 0, thugFatigue: 0 },
        ruleset,
      );
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

          whoreHappiness: happiness.whoreHappiness,
          thugHappiness: happiness.thugHappiness,

          netWorthCents,

          localRank: ranks.localRank,
          nationalRank: ranks.nationalRank,
          dailyStartingLocalRank: ranks.localRank,
          dailyStartingNationalRank: ranks.nationalRank,
        },
      });

      await tx.playerActivity.create({
        data: {
          roundPlayerId: player.id,
          type: 'ROUND_JOINED',
          payload: {
            roundName: round.name,
            publicPimpId,
            city: city.name,
            startingCashCents: start.cashCents,
            startingTurns: start.turns,
          },
        },
      });

      return player;
    });
  },
};
