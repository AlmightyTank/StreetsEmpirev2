import type { City, Prisma, PrismaClient, Round, RoundPlayer } from '@prisma/client';
import { loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { HappinessService } from './happiness.service.js';
import { NetWorthService } from './net-worth.service.js';
import { RankingService } from './ranking.service.js';
import { TurnService, type TurnSettlement } from './turn.service.js';

export type PlayerWithCity = RoundPlayer & { city: City };

export interface SettledPlayer {
  player: PlayerWithCity;
  round: Round;
  ruleset: Ruleset;
  turns: TurnSettlement;
}

export interface SettleOptions {
  now?: Date;
  /**
   * Whether this request counts as the player being at the keyboard.
   *
   * The dashboard's background poll passes false, so a tab left open all night
   * still earns the away bonus. Section 15.
   */
  markActive?: boolean;
}

/**
 * Brings a player up to date and hands back authoritative state.
 *
 * This is the single read path behind the dashboard, and the opening move of
 * every action that follows in 0.1.0-C. It runs the section 51 sequence:
 *
 *   begin transaction -> lock the player -> refresh turns -> recalculate
 *   happiness -> recalculate net worth -> recalculate ranks -> write -> commit
 *
 * Nothing is written when nothing moved, so a 60 second poll on an idle player
 * costs reads only.
 */
export const PlayerStateService = {
  async settle(
    prisma: PrismaClient,
    roundPlayerId: string,
    options: SettleOptions = {},
  ): Promise<SettledPlayer> {
    const now = options.now ?? new Date();
    const markActive = options.markActive ?? true;

    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);

      const player = await tx.roundPlayer.findUnique({
        where: { id: roundPlayerId },
        include: { city: true, round: true },
      });

      if (!player) {
        throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');
      }

      const { round, ...rest } = player;
      const ruleset = loadRulesetForRound(round);

      // 1. Turns.
      const turns = TurnService.settle(rest, now, ruleset);

      // 2. Happiness, from whatever the resources currently are.
      const happiness = HappinessService.recalculate(rest, ruleset);

      // 3. Net worth.
      const netWorthCents = NetWorthService.calculate(rest, ruleset);

      // 4. Ranks, against the net worth we just derived.
      const ranks = await RankingService.ranksFor(tx, {
        roundId: rest.roundId,
        cityId: rest.cityId,
        netWorthCents,
      });

      // 5. The daily baseline that rank movement is measured against.
      const snapshotStale = RankingService.isDailySnapshotStale(rest, now, ruleset);

      const data: Prisma.RoundPlayerUpdateInput = {};

      if (turns.changed) {
        data.turns = turns.turns;
        data.lastTurnCalculationAt = turns.lastTurnCalculationAt;
      }
      if (turns.awayBonus.awarded) {
        data.lastAwayBonusAt = now;
      }
      if (happiness.whoreHappiness !== rest.whoreHappiness) {
        data.whoreHappiness = happiness.whoreHappiness;
      }
      if (happiness.thugHappiness !== rest.thugHappiness) {
        data.thugHappiness = happiness.thugHappiness;
      }
      if (netWorthCents !== rest.netWorthCents) {
        data.netWorthCents = netWorthCents;
      }
      if (ranks.localRank !== rest.localRank) {
        data.localRank = ranks.localRank;
      }
      if (ranks.nationalRank !== rest.nationalRank) {
        data.nationalRank = ranks.nationalRank;
      }
      if (snapshotStale) {
        data.dailyStartingLocalRank = ranks.localRank;
        data.dailyStartingNationalRank = ranks.nationalRank;
        data.dailyRankSnapshotAt = now;
      }
      if (markActive) {
        data.lastActiveAt = now;
      }

      let settled: PlayerWithCity = rest;

      if (Object.keys(data).length > 0) {
        settled = await tx.roundPlayer.update({
          where: { id: roundPlayerId },
          data,
          include: { city: true },
        });
      }

      if (turns.awayBonus.awarded) {
        await ActivityService.log(tx, roundPlayerId, 'AWAY_BONUS', {
          turns: turns.awayBonus.amount,
          awayHours: ruleset.turns.awayBonus.afterHours,
        });
      }

      return { player: settled, round, ruleset, turns };
    });
  },
};
