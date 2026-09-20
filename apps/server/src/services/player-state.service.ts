import type { City, Prisma, PrismaClient, Round, RoundPlayer } from '@prisma/client';
import { decayHeat, loadRulesetForRound, rulesetForCity, type Ruleset, type Standings } from '@streets/rules-engine';
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
import { ConvoyService } from './convoy.service.js';
import { RelocationService } from './relocation.service.js';
import { RunSettleService, runSummary } from './run-settle.service.js';
import type { RoundPlayerDto } from '@streets/shared';
import { TurfService } from './turf.service.js';
import { TurfWarSettlementService } from './turf-war-settle.service.js';

/** 0.3.0-C: the alliance tag rides along so every screen can show it before the name. */
export type PlayerWithCity = RoundPlayer & { city: City; alliance: { name: string; tag: string } | null };

const ALLIANCE_TAG = { select: { name: true, tag: true } } as const;

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
  /** 0.4.0-C. Non-crack product stock on rounds where it moves happiness; undefined elsewhere. */
  products?: Record<string, number>;
  /** 0.5.0-B. The player's run in one line, or null. */
  run: RoundPlayerDto['run'];
  /** 0.5.0-D. The player's move on the road, or null. */
  moving: RoundPlayerDto['moving'];
  /** 0.5.0-E. A tail on the player's run, or an ally's call. */
  convoyAlert: RoundPlayerDto['convoyAlert'];
  /** 0.6.0-B. Home turf summary. */
  turf: RoundPlayerDto['turf'];
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
    await TurfWarSettlementService.settleDueFor(prisma, roundPlayerId, now);
    return prisma.$transaction((tx) =>
      PlayerStateService.settleInTransaction(tx, roundPlayerId, { ...options, now }),
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
    // 0.5.0-B: a run that is due home is home before the player is read.
    await RunSettleService.settle(tx, roundPlayerId, now);
    // 0.5.0-D: and a move that has arrived has arrived.
    await RelocationService.settleOwn(tx, roundPlayerId, now);
    // 0.5.0-E: and whatever came back from a convoy fight is back.
    await ConvoyService.credit(tx, roundPlayerId, now);
    // 0.6.0-C: and turf-war squads/help are back or posted after the landing.
    await TurfWarSettlementService.credit(tx, roundPlayerId, now);

    const player = await tx.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      include: { city: true, round: true, alliance: ALLIANCE_TAG },
    });

    if (!player) {
      throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');
    }

    const { round, ...loadedRest } = player;
    let rest = loadedRest;
    // 0.5.0-A: Heat reads the player's own city.
    const ruleset = rulesetForCity(loadRulesetForRound(round), rest.city.slug);
    const turfSettlement = await TurfService.settlePlayer(tx, roundPlayerId, ruleset, now);
    if (turfSettlement) {
      rest = {
        ...rest,
        cashCents: turfSettlement.cashCents,
        beer: turfSettlement.beer,
        crack: turfSettlement.crack,
        thugs: turfSettlement.thugs,
        postedThugs: turfSettlement.postedThugs,
        postedNetWorthCents: turfSettlement.postedNetWorthCents,
        pistols: turfSettlement.pistols,
        shotguns: turfSettlement.shotguns,
        tek9s: turfSettlement.tek9s,
        ak47s: turfSettlement.ak47s,
      };
    }
    const recovery = await CombatRecoveryService.settle(tx, roundPlayerId, now);
    // 1. Turns, and the shop shelves on the same clock. Heat cools on it too.
    const turns = TurnService.settle(rest, now, ruleset);
    const heat = ruleset.heat ? decayHeat(rest.heat, turns.intervalsProcessed, ruleset.heat) : rest.heat;
    const recovered = { ...rest, woundedThugs: recovery.woundedThugs, heat };
    const standings = await ReputationService.load(tx, roundPlayerId, ruleset);
    const stock = StockService.settle(recovered, now, ruleset, standings);

    // 2. Happiness, read straight off the player's current state.
    const products = await HappinessService.otherProducts(tx, roundPlayerId, ruleset);
    const happiness = HappinessService.recalculate(
      { ...recovered, thugs: fitThugs(recovered), products },
      ruleset,
    );

    // 3. Net worth.
    const netWorthCents = NetWorthService.calculate({ ...recovered, products }, ruleset);

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
    if (heat !== rest.heat) {
      data.heat = heat;
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
      data.localRankSinceAt = now;
    }
    if (ranks.nationalRank !== rest.nationalRank) {
      data.nationalRank = ranks.nationalRank;
      data.nationalRankSinceAt = now;
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
        include: { city: true, alliance: ALLIANCE_TAG },
      });
    }

    if (turns.awayBonus.awarded) {
      await ActivityService.log(tx, roundPlayerId, 'AWAY_BONUS', {
        turns: turns.awayBonus.amount,
        awayHours: ruleset.turns.awayBonus.afterHours,
      });
    }

    const run = await runSummary(tx, roundPlayerId, ruleset, now);
    const move = await tx.relocation.findFirst({ where: { roundPlayerId, arrivedAt: null }, select: { toCity: true, arrivesAt: true } });
    const moving = move ? { to: move.toCity, toName: ruleset.cities?.[move.toCity]?.name ?? move.toCity, arrivesAt: move.arrivesAt.toISOString() } : null;
    const convoyAlert = await ConvoyService.alertFor(tx, settled, ruleset, now);
    const turf = await TurfService.summary(tx, roundPlayerId, ruleset, now);
    return { player: settled, round, ruleset, turns, stock, standings, recovery, products, run, moving, convoyAlert, turf };
  },
};
