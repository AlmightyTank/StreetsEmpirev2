import type {
  ActivityType,
  City,
  Prisma,
  PrismaClient,
  Round,
  RoundPlayer,
} from '@prisma/client';
import { loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
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
import { NetWorthService } from './net-worth.service.js';
import { RankingService } from './ranking.service.js';
import { TurnService } from './turn.service.js';

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

  condoms: number;
  medicine: number;
  crack: number;
  beer: number;

  pistols: number;
  shotguns: number;
  tek9s: number;
  ak47s: number;

  lowRiders: number;
}

export interface ActionContext {
  /** Turn-settled, happiness and net worth already true for these numbers. */
  current: PlayerState;
  whoreHappiness: number;
  thugHappiness: number;
  player: RoundPlayer & { city: City };
  round: Round;
  ruleset: Ruleset;
  now: Date;
}

export interface ActionOutcome<T> {
  next: PlayerState;
  result: T;
  activity: { type: ActivityType; payload: Prisma.InputJsonValue };
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

function toState(player: RoundPlayer): PlayerState {
  return {
    cashCents: player.cashCents,
    turns: player.turns,
    payoutPercent: player.payoutPercent,
    whores: player.whores,
    thugs: player.thugs,
    condoms: player.condoms,
    medicine: player.medicine,
    crack: player.crack,
    beer: player.beer,
    pistols: player.pistols,
    shotguns: player.shotguns,
    tek9s: player.tek9s,
    ak47s: player.ak47s,
    lowRiders: player.lowRiders,
  };
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
      condoms: state.condoms,
      medicine: state.medicine,
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
    return prisma.$transaction(async (tx) => {
      // The lock comes first. Checking for a replay before taking it lets two
      // concurrent duplicates both look, both find nothing, and both execute.
      await lockRoundPlayer(tx, roundPlayerId);

      if (options.actionId) {
        const replay = await IdempotencyService.find<GameActionResult<T>>(
          tx,
          options.actionId,
          roundPlayerId,
        );
        // Section 52: the same action id answers with the original result
        // rather than executing a second time.
        if (replay) return replay;
      }

      const loaded = await tx.roundPlayer.findUnique({
        where: { id: roundPlayerId },
        include: { city: true, round: true },
      });
      if (!loaded) {
        throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');
      }

      const { round, ...player } = loaded;
      assertRoundPlayable(round, now);

      const ruleset = loadRulesetForRound(round);

      // Turns first: an action always spends from a settled balance.
      const turns = TurnService.settle(player, now, ruleset);

      const current = { ...toState(player), turns: turns.turns };
      const beforeHappiness = HappinessService.recalculate(current, ruleset);
      const beforeNetWorth = NetWorthService.calculate(current, ruleset);
      const beforeRanks = await RankingService.ranksFor(tx, {
        roundId: player.roundId,
        cityId: player.cityId,
        netWorthCents: beforeNetWorth,
      });

      const outcome = await options.execute({
        current,
        whoreHappiness: beforeHappiness.whoreHappiness,
        thugHappiness: beforeHappiness.thugHappiness,
        player,
        round,
        ruleset,
        now,
      });

      const next = outcome.next;
      const afterHappiness = HappinessService.recalculate(next, ruleset);
      const afterNetWorth = NetWorthService.calculate(next, ruleset);
      const afterRanks = await RankingService.ranksFor(tx, {
        roundId: player.roundId,
        cityId: player.cityId,
        netWorthCents: afterNetWorth,
      });

      const snapshotStale = RankingService.isDailySnapshotStale(player, now, ruleset);

      await tx.roundPlayer.update({
        where: { id: roundPlayerId },
        data: {
          ...next,
          lastTurnCalculationAt: turns.lastTurnCalculationAt,
          lastActiveAt: now,
          ...(turns.awayBonus.awarded ? { lastAwayBonusAt: now } : {}),

          whoreHappiness: afterHappiness.whoreHappiness,
          thugHappiness: afterHappiness.thugHappiness,
          netWorthCents: afterNetWorth,

          localRank: afterRanks.localRank,
          nationalRank: afterRanks.nationalRank,
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

      await ActivityService.log(
        tx,
        roundPlayerId,
        outcome.activity.type,
        outcome.activity.payload,
      );

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
