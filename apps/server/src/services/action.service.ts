import type {
  ActivityType,
  City,
  Prisma,
  PrismaClient,
  Round,
  RoundPlayer,
} from '@prisma/client';
import { decayHeat, loadRulesetForRound, rulesetForCity, totalWeapons, type Ruleset, type Standings } from '@streets/rules-engine';
import type {
  GameActionResult,
  PlayerSnapshot,
  RankChanges,
  ResourceChange,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { HappinessService } from './happiness.service.js';
import { IdempotencyService } from './idempotency.service.js';
import { assertPlayerState } from './invariant.service.js';
import { NetWorthService } from './net-worth.service.js';
import { RankingService } from './ranking.service.js';
import { TurnService } from './turn.service.js';
import { ReputationService, type ReputationChange } from './reputation.service.js';
import { StockService, type StockSettlementSet } from './stock.service.js';
import { CombatRecoveryService, type RecoverySettlement } from './combat-recovery.service.js';
import { ConvoyService } from './convoy.service.js';
import { RelocationService } from './relocation.service.js';
import { RunSettleService } from './run-settle.service.js';
import { TurfService } from './turf.service.js';
import { TurfWarSettlementService } from './turf-war-settle.service.js';

/**
 * Everything an action is allowed to move. Turn-settled before an action sees
 * it, and the only thing an action may hand back.
 */
export interface PlayerState {
  cashCents: bigint;
  turns: number;
  payoutPercent: number;

  whores: number;
  thugs: number;
  woundedThugs: number;

  condoms: number;
  medicine: number;
  crack: number;
  beer: number;

  pistols: number;
  shotguns: number;
  tek9s: number;
  ak47s: number;

  lowRiders: number;

  /** Weapon access, earned with reputation and never revoked. */
  shotgunUnlocked: boolean;
  tek9Unlocked: boolean;
  ak47Unlocked: boolean;

  /** 0.4.0-C. Settled Heat: decayed on the turn clock before an action sees it. Always 0 without Heat. */
  heat: number;
  /** 0.5.0-B. Net worth of what is out on a run. Runs move it; nothing else does. */
  awayNetWorthCents: bigint;
  /** 0.6.0-B/C. Net worth of turf-deployed guns removed from the home arsenal. */
  postedNetWorthCents: bigint;
  /** 0.6.0-D. Net worth stored in away outpost boxes. */
  outpostNetWorthCents: bigint;
  /** 0.5.0-C. Set by an arrest at home; left out, it is not written. */
  lockedUntil?: Date | null;
  /** 0.5.0-D. Set by a move; left out, it is not written. */
  movingUntil?: Date | null;
  /** 0.5.0-E. Thugs on a tail or convoy backup: counted, never fit. */
  busyThugs: number;
  /** 0.6.0-A. Thugs on held corners: counted, never fit at home. */
  postedThugs: number;

  /** Quest progress that is per-player rather than per-trader. */
  cleanShiftStreak: number;
  rocksSuppliedToPip: number;
  driveBysDone: number;
  condomsBought: number;
  medicineBought: number;
  beerBought: number;
  pistolsBought: number;
  raidsDone: number;

  /** Seasonal hideout rooms. Reset by new round-player rows. */
  hideoutSafeRoomLevel: number;
  hideoutLookoutsLevel: number;
  hideoutWorkshopLevel: number;
  hideoutBackOfficeLevel: number;

  /**
   * What Tommy has on the shelf, already settled. Counters rather than
   * resources: they never reach a snapshot, and an action spends them the
   * same way it spends turns.
   */
  pistolStock: number;
  shotgunStock: number;
  tek9Stock: number;
  ak47Stock: number;
  lowRiderStock: number;
  condomStock: number;
  medicineStock: number;
  beerStock: number;
  crackStock: number;
  thugStock: number;
}

export interface ActionContext {
  /** The action's transaction, with the player already locked. For product rows; everything else goes in `next`. */
  tx: Db;
  /** Turn-settled, happiness and net worth already true for these numbers. */
  current: PlayerState;
  whoreHappiness: number;
  thugHappiness: number;
  player: RoundPlayer & { city: City };
  round: Round;
  ruleset: Ruleset;
  now: Date;
  /** Settled shop shelves, for actions that need to explain the wait. */
  stock: StockSettlementSet;
  /** Standing with each trader, as it stands before the action. */
  standings: Standings;
  recovery: RecoverySettlement;
}

export interface ActionOutcome<T> {
  next: PlayerState;
  result: T;
  /** Left out by actions too small for the feed, like one trade on a run. */
  activity?: { type: ActivityType; payload: Prisma.InputJsonValue };
  /**
   * Standing to write alongside the player, in the same transaction. Actions
   * that do not touch reputation leave this out.
   */
  reputation?: ReputationChange[];
}

export interface RunActionOptions<T> {
  /** Name carried in the result, e.g. "SCOUT". */
  action: string;
  /** Client generated id. Section 52. */
  actionId?: string;
  execute: (context: ActionContext) => ActionOutcome<T> | Promise<ActionOutcome<T>>;
}

/**
 * Section 50. The turn error a player can actually act on.
 */
export function assertTurns(available: number, requested: number): void {
  if (requested > available) {
    throw AppError.badRequest(
      'NOT_ENOUGH_TURNS',
      `You tried to spend ${requested} ${requested === 1 ? 'Turn' : 'Turns'}, but only ${available} ${available === 1 ? 'is' : 'are'} available.`,
      { turns: `Only ${available} available.` },
    );
  }
}

/** The action pipeline's view of a stored player. Also what the store reads. */
export function toState(player: RoundPlayer): PlayerState {
  return {
    cashCents: player.cashCents,
    turns: player.turns,
    payoutPercent: player.payoutPercent,
    whores: player.whores,
    thugs: player.thugs,
    woundedThugs: player.woundedThugs,
    condoms: player.condoms,
    medicine: player.medicine,
    crack: player.crack,
    beer: player.beer,
    pistols: player.pistols,
    shotguns: player.shotguns,
    tek9s: player.tek9s,
    ak47s: player.ak47s,
    lowRiders: player.lowRiders,
    shotgunUnlocked: player.shotgunUnlocked,
    tek9Unlocked: player.tek9Unlocked,
    ak47Unlocked: player.ak47Unlocked,
    heat: player.heat,
    awayNetWorthCents: player.awayNetWorthCents,
    postedNetWorthCents: player.postedNetWorthCents,
    outpostNetWorthCents: player.outpostNetWorthCents,
    busyThugs: player.busyThugs,
    postedThugs: player.postedThugs,
    cleanShiftStreak: player.cleanShiftStreak,
    rocksSuppliedToPip: player.rocksSuppliedToPip,
    driveBysDone: player.driveBysDone,
    condomsBought: player.condomsBought,
    medicineBought: player.medicineBought,
    beerBought: player.beerBought,
    pistolsBought: player.pistolsBought,
    raidsDone: player.raidsDone,
    hideoutSafeRoomLevel: player.hideoutSafeRoomLevel,
    hideoutLookoutsLevel: player.hideoutLookoutsLevel,
    hideoutWorkshopLevel: player.hideoutWorkshopLevel,
    hideoutBackOfficeLevel: player.hideoutBackOfficeLevel,
    pistolStock: player.pistolStock,
    shotgunStock: player.shotgunStock,
    tek9Stock: player.tek9Stock,
    ak47Stock: player.ak47Stock,
    lowRiderStock: player.lowRiderStock,
    condomStock: player.condomStock,
    medicineStock: player.medicineStock,
    beerStock: player.beerStock,
    crackStock: player.crackStock,
    thugStock: player.thugStock,
  };
}

/** Thugs who can do something at home: not wounded, busy elsewhere, or posted on a corner. */
export function fitThugs(player: { thugs: number; woundedThugs: number; busyThugs?: number; postedThugs?: number }): number {
  return Math.max(0, player.thugs - player.woundedThugs - (player.busyThugs ?? 0) - (player.postedThugs ?? 0));
}

function armedThugsForSnapshot(state: PlayerState): number {
  return Math.min(fitThugs(state), totalWeapons(state));
}

function toSnapshot(
  state: PlayerState,
  happiness: { whoreHappiness: number; thugHappiness: number },
  netWorthCents: bigint,
): PlayerSnapshot {
  return {
    cashCents: Number(state.cashCents),
    netWorthCents: Number(netWorthCents),
    turns: state.turns,
    whoreHappiness: happiness.whoreHappiness,
    thugHappiness: happiness.thugHappiness,
    resources: {
      cashCents: Number(state.cashCents),
      whores: state.whores,
      thugs: state.thugs,
      fitThugs: fitThugs(state),
      woundedThugs: state.woundedThugs,
      postedThugs: state.postedThugs,
      armedThugs: armedThugsForSnapshot(state),
      unarmedThugs: Math.max(0, fitThugs(state) - armedThugsForSnapshot(state)),
      condoms: state.condoms,
      medicine: state.medicine,
      product: state.crack,
      crack: state.crack,
      beer: state.beer,
      pistols: state.pistols,
      shotguns: state.shotguns,
      tek9s: state.tek9s,
      ak47s: state.ak47s,
      lowRiders: state.lowRiders,
    },
  };
}

/** Section 44. Only what actually moved. */
function diff(before: PlayerSnapshot, after: PlayerSnapshot): ResourceChange[] {
  const changes: ResourceChange[] = [];

  const push = (resource: string, from: number, to: number) => {
    if (from !== to) changes.push({ resource, before: from, after: to, change: to - from });
  };

  push('turns', before.turns, after.turns);
  push('cashCents', before.cashCents, after.cashCents);
  push('netWorthCents', before.netWorthCents, after.netWorthCents);
  push('whoreHappiness', before.whoreHappiness, after.whoreHappiness);
  push('thugHappiness', before.thugHappiness, after.thugHappiness);

  for (const key of Object.keys(before.resources) as (keyof typeof before.resources)[]) {
    if (key === 'cashCents') continue; // already reported above
    if (key === 'product') continue; // alias for crack during the product migration
    push(key, before.resources[key], after.resources[key]);
  }

  return changes;
}

/**
 * Runs one resource-changing action. Section 51, end to end:
 *
 *   begin transaction -> lock the player -> replay guard -> refresh turns ->
 *   validate -> calculate -> apply -> recalculate happiness -> recalculate
 *   net worth -> recalculate ranks -> write activity -> commit
 *
 * The action itself only decides what the numbers become. It never touches
 * happiness, net worth, ranks, the clock or the database.
 */
export const ActionService = {
  async run<T>(
    prisma: PrismaClient,
    roundPlayerId: string,
    options: RunActionOptions<T>,
    now: Date = new Date(),
  ): Promise<GameActionResult<T>> {
    await TurfWarSettlementService.settleDueFor(prisma, roundPlayerId, now);
    return prisma.$transaction(async (tx) => {
      // The lock comes first. Checking for a replay before taking it lets two
      // concurrent duplicates both look, both find nothing, and both execute.
      await lockRoundPlayer(tx, roundPlayerId);

      if (options.actionId) {
        const replay = await IdempotencyService.find<GameActionResult<T>>(
          tx,
          options.actionId,
          roundPlayerId,
          options.action,
        );
        // Section 52: the same action id answers with the original result
        // rather than executing a second time.
        if (replay) return replay;
      }

      // 0.5.0-B: a run that is due home is home before anything reads the player.
      await RunSettleService.settle(tx, roundPlayerId, now);
      // 0.5.0-D: and a move that has arrived has arrived.
      await RelocationService.settleOwn(tx, roundPlayerId, now);
      // 0.5.0-E: and whatever came back from a convoy fight is back.
      await ConvoyService.credit(tx, roundPlayerId, now);
      // 0.6.0-C: turf squads and allied backup return before another action reads them.
      await TurfWarSettlementService.credit(tx, roundPlayerId, now);

      const loaded = await tx.roundPlayer.findUnique({
        where: { id: roundPlayerId },
        include: { city: true, round: true },
      });
      if (!loaded) {
        throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');
      }

      const { round, ...loadedPlayer } = loaded;
      let player = loadedPlayer;
      assertRoundPlayable(round, now);
      // 0.5.0-C: nobody acts from a cell. A run still out comes home on its own.
      if (player.lockedUntil && player.lockedUntil.getTime() > now.getTime()) {
        const minutes = Math.ceil((player.lockedUntil.getTime() - now.getTime()) / 60_000);
        throw AppError.conflict('LOCKED_UP', `You are locked up for another ${minutes} minute${minutes === 1 ? '' : 's'}. Nothing moves until you are out.`);
      }
      // 0.5.0-D: nor from the cab of a moving truck.
      if (player.movingUntil && player.movingUntil.getTime() > now.getTime()) {
        const minutes = Math.ceil((player.movingUntil.getTime() - now.getTime()) / 60_000);
        throw AppError.conflict('ON_THE_ROAD', `You are moving house: another ${minutes} minute${minutes === 1 ? '' : 's'} on the road. Nothing moves until you arrive.`);
      }

      // 0.5.0-A: Heat reads the player's own city.
      const ruleset = rulesetForCity(loadRulesetForRound(round), player.city.slug);
      // 0.6.0-B: settle corner upkeep/walkouts and pending house-minted tax before
      // an action reads cash, thugs, product or the home arsenal.
      const turfSettlement = await TurfService.settlePlayer(tx, roundPlayerId, ruleset, now);
      if (turfSettlement) {
        player = await tx.roundPlayer.findUniqueOrThrow({
          where: { id: roundPlayerId },
          include: { city: true },
        });
      }
      const recovery = await CombatRecoveryService.settle(tx, roundPlayerId, now);

      // Turns first: an action always spends from a settled balance. The shop
      // shelves settle in the same breath, for the same reason.
      const turns = TurnService.settle(player, now, ruleset);
      const standings = await ReputationService.load(tx, roundPlayerId, ruleset);
      // Standing shortens a shop's wait, so it has to be read before the
      // shelves settle - never the cap, only the interval.
      const stock = StockService.settle(player, now, ruleset, standings);
      const current: PlayerState = {
        ...toState(player),
        woundedThugs: recovery.woundedThugs,
        turns: turns.turns,
        // 0.4.0-C: Heat cools on the same clock turns regenerate on.
        heat: ruleset.heat ? decayHeat(player.heat, turns.intervalsProcessed, ruleset.heat) : player.heat,
        ...stock.counts,
      };
      assertPlayerState(current, ruleset, 'before');
      const beforeProducts = await HappinessService.otherProducts(tx, roundPlayerId, ruleset);
      const beforeHappiness = HappinessService.recalculate({ ...current, thugs: fitThugs(current), products: beforeProducts }, ruleset);
      const beforeNetWorth = NetWorthService.calculate({ ...current, products: beforeProducts }, ruleset);
      const beforeRanks = await RankingService.ranksFor(tx, {
        id: roundPlayerId,
        roundId: player.roundId,
        cityId: player.cityId,
        netWorthCents: beforeNetWorth,
      });

      const outcome = await options.execute({
        tx,
        current,
        whoreHappiness: beforeHappiness.whoreHappiness,
        thugHappiness: beforeHappiness.thugHappiness,
        player,
        round,
        ruleset,
        now,
        stock,
        standings,
        recovery,
      });

      const next = outcome.next;
      assertPlayerState(next, ruleset, 'after');

      if (outcome.reputation?.length) {
        await ReputationService.write(tx, roundPlayerId, outcome.reputation);
      }
      // The action may have moved product rows, so they are read again.
      const afterProducts = beforeProducts && (await HappinessService.otherProducts(tx, roundPlayerId, ruleset));
      const afterHappiness = HappinessService.recalculate({ ...next, thugs: fitThugs(next), products: afterProducts }, ruleset);
      const afterNetWorth = NetWorthService.calculate({ ...next, products: afterProducts }, ruleset);
      const afterRanks = await RankingService.ranksFor(tx, {
        id: roundPlayerId,
        roundId: player.roundId,
        cityId: player.cityId,
        netWorthCents: afterNetWorth,
      });

      const snapshotStale = RankingService.isDailySnapshotStale(player, now, ruleset);

      await tx.roundPlayer.update({
        where: { id: roundPlayerId },
        data: {
          ...next,
          ...stock.clocks,
          lastTurnCalculationAt: turns.lastTurnCalculationAt,
          lastActiveAt: now,
          ...(turns.awayBonus.awarded ? { lastAwayBonusAt: now } : {}),

          whoreHappiness: afterHappiness.whoreHappiness,
          thugHappiness: afterHappiness.thugHappiness,
          netWorthCents: afterNetWorth,

          localRank: afterRanks.localRank,
          nationalRank: afterRanks.nationalRank,
          ...(afterRanks.localRank !== player.localRank ? { localRankSinceAt: now } : {}),
          ...(afterRanks.nationalRank !== player.nationalRank ? { nationalRankSinceAt: now } : {}),
          ...(snapshotStale
            ? {
                dailyStartingLocalRank: beforeRanks.localRank,
                dailyStartingNationalRank: beforeRanks.nationalRank,
                dailyRankSnapshotAt: now,
              }
            : {}),
        },
      });

      if (turns.awayBonus.awarded) {
        await ActivityService.log(tx, roundPlayerId, 'AWAY_BONUS', {
          turns: turns.awayBonus.amount,
          awayHours: ruleset.turns.awayBonus.afterHours,
        });
      }

      if (outcome.activity) {
        await ActivityService.log(
          tx,
          roundPlayerId,
          outcome.activity.type,
          outcome.activity.payload,
        );
      }

      const before = toSnapshot(current, beforeHappiness, beforeNetWorth);
      const after = toSnapshot(next, afterHappiness, afterNetWorth);

      const rankChanges: RankChanges = {
        localBefore: beforeRanks.localRank,
        localAfter: afterRanks.localRank,
        nationalBefore: beforeRanks.nationalRank,
        nationalAfter: afterRanks.nationalRank,
      };

      const result: GameActionResult<T> = {
        success: true,
        action: options.action,
        before,
        after,
        changes: diff(before, after),
        result: outcome.result,
        rankChanges,
      };

      if (options.actionId) {
        await IdempotencyService.record(
          tx,
          options.actionId,
          roundPlayerId,
          options.action,
          result,
          now,
        );
      }

      return result;
    });
  },
};

function assertRoundPlayable(round: Round, now: Date): void {
  if (round.status !== 'ACTIVE' || round.endsAt.getTime() <= now.getTime()) {
    throw AppError.conflict('ROUND_ENDED', `${round.name} has ended.`);
  }
}

export type ActionDb = Db;
