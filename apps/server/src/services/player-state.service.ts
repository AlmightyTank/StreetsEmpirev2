import type { City, Prisma, PrismaClient, Round, RoundPlayer } from '@prisma/client';
import { loadRulesetForRound, type Ruleset, type Standings } from '@streets/rules-engine';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { HappinessService } from './happiness.service.js';
import { NetWorthService } from './net-worth.service.js';
import { RankingService } from './ranking.service.js';
import { TurnService, type TurnSettlement } from './turn.service.js';
import { ReputationService } from './reputation.service.js';
import { StockService, type StockSettlementSet } from './stock.service.js';
import { CombatRecoveryService, type RecoverySettlement } from './combat-recovery.service.js';
import { fitThugs } from './action.service.js';

export type PlayerWithCity = RoundPlayer & { city: City };

export interface SettledPlayer {
  player: PlayerWithCity;
  round: Round;
  ruleset: Ruleset;
  turns: TurnSettlement;
  /** Settled shop shelves, so a store can show what it actually has. */
  stock: StockSettlementSet;
  /** Standing with each trader, which is what shortens those shelves' waits. */
  standings: Standings;
  recovery: RecoverySettlement;
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
    return prisma.$transaction((tx) =>
      PlayerStateService.settleInTransaction(tx, roundPlayerId, options),
    );
  },

  /** Caller owns the transaction; combat locks both players before using this. */
  async settleInTransaction(
    tx: Db,
    roundPlayerId: string,
    options: SettleOptions = {},
  ): Promise<SettledPlayer> {
    const now = options.now ?? new Date();
    const markActive = options.markActive ?? true;

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
    const recovery = await CombatRecoveryService.settle(tx, roundPlayerId, now);
    const recovered = { ...rest, woundedThugs: recovery.woundedThugs };

    // 1. Turns, and the shop shelves on the same clock.
    const turns = TurnService.settle(recovered, now, ruleset);
    const standings = await ReputationService.load(tx, roundPlayerId, ruleset);
    const stock = StockService.settle(recovered, now, ruleset, standings);

    // 2. Happiness, read straight off the player's current state.
    const happiness = HappinessService.recalculate(
      { ...recovered, thugs: fitThugs(recovered) },
      ruleset,
    );

    // 3. Net worth.
    const netWorthCents = NetWorthService.calculate(recovered, ruleset);

    // 4. Ranks, against the net worth we just derived.
    const ranks = await RankingService.ranksFor(tx, {
      id: roundPlayerId,
      roundId: rest.roundId,
      cityId: rest.cityId,
      netWorthCents,
    });

    // 5. The daily baseline that rank movement is measured against.
    const snapshotStale = RankingService.isDailySnapshotStale(rest, now, ruleset);

    const data: Prisma.RoundPlayerUpdateInput = {};

    if (recovery.woundedThugs !== rest.woundedThugs) {
      data.woundedThugs = recovery.woundedThugs;
    }
    if (turns.changed) {
      data.turns = turns.turns;
      data.lastTurnCalculationAt = turns.lastTurnCalculationAt;
    }
    if (turns.awayBonus.awarded) {
      data.lastAwayBonusAt = now;
    }
    if (stock.changed) {
      Object.assign(data, stock.counts, stock.clocks);
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

    return { player: settled, round, ruleset, turns, stock, standings, recovery };
  },
};
