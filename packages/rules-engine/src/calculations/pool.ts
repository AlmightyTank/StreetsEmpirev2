import type { CasinoPoolRules, CasinoPoolTableRules } from '@streets/rulesets';
import type { Rng } from '../rng.js';

/**
 * Shot-by-shot eight-ball against a house hustler.
 *
 * The player always breaks and always shoots solids (1-7); the hustler shoots
 * stripes (9-15). The player picks every shot of their own visits. A hustler
 * visit is resolved in one go: they keep shooting until they miss, scratch or
 * sink the 8. Every roll goes through the injected Rng, so a fixed sequence
 * replays a rack exactly.
 */

export type PoolShotKind = 'STEADY' | 'POWER' | 'SAFETY';
export type PoolShooter = 'PLAYER' | 'HUSTLER';
export type PoolShotResult = 'POT' | 'MISS' | 'SCRATCH' | 'SAFE' | 'FOUL' | 'DRY';
export type PoolFinish =
  | 'GOLDEN_BREAK'
  | 'BREAK_AND_RUN'
  | 'EIGHT'
  | 'HUSTLER_SCRATCHED_EIGHT'
  | 'HUSTLER_EIGHT'
  | 'SCRATCHED_EIGHT';

export interface PoolShotEvent {
  shooter: PoolShooter;
  shot: 'BREAK' | PoolShotKind | 'EIGHT';
  result: PoolShotResult;
  /** Balls that dropped on this shot. */
  balls: number[];
}

export interface PoolRackState {
  playerBalls: number[];
  hustlerBalls: number[];
  status: 'ACTIVE' | 'WON' | 'LOST';
  finish: PoolFinish | null;
  /** The player's next shot is taken with ball in hand. */
  ballInHand: boolean;
  /** Hustler visits so far. A win with none is a break-and-run. */
  hustlerVisits: number;
  log: PoolShotEvent[];
}

const MAX_BPS = 9_500;
const HUSTLER_SHOT_LIMIT = 16;

function roll(rng: Rng): number {
  const value = rng();
  if (!Number.isFinite(value)) return 0;
  return Math.floor(Math.max(0, Math.min(0.9999999999999999, value)) * 10_000);
}

function clampBps(value: number): number {
  return Math.max(0, Math.min(MAX_BPS, Math.round(value)));
}

export function newPoolRack(): PoolRackState {
  return {
    playerBalls: [1, 2, 3, 4, 5, 6, 7],
    hustlerBalls: [9, 10, 11, 12, 13, 14, 15],
    status: 'ACTIVE',
    finish: null,
    ballInHand: false,
    hustlerVisits: 0,
    log: [],
  };
}

/** Which shots the player may take right now. */
export function poolAvailableShots(rack: PoolRackState): PoolShotKind[] {
  if (rack.status !== 'ACTIVE') return [];
  return rack.playerBalls.length >= 2 ? ['STEADY', 'POWER', 'SAFETY'] : ['STEADY', 'SAFETY'];
}

/**
 * Doubling the stake is offered only while the hustler is ahead on object balls
 * and the player has no ball in hand. Solved with value iteration, every such
 * spot is worth less than the extra stake, so a press is a swing, never an edge.
 */
export function poolCanPress(rack: PoolRackState, alreadyPressed: boolean): boolean {
  return rack.status === 'ACTIVE'
    && !alreadyPressed
    && !rack.ballInHand
    && rack.hustlerBalls.length >= 1
    && rack.hustlerBalls.length < rack.playerBalls.length;
}

/** The pot and scratch chance the player sees before taking a shot. */
export function poolShotOdds(
  rules: CasinoPoolRules,
  rack: PoolRackState,
  shot: PoolShotKind,
): { potBps: number; scratchBps: number } {
  if (shot === 'SAFETY') return { potBps: 0, scratchBps: rules.safety.foulBps };
  const base = shot === 'POWER' ? rules.power : rules.steady;
  const bonus = rack.ballInHand ? rules.ballInHandBonusBps : 0;
  return { potBps: clampBps(base.potBps + bonus), scratchBps: base.scratchBps };
}

function take<T>(list: T[], count: number): T[] {
  return list.splice(0, Math.min(count, list.length));
}

interface HustlerVisitInput {
  ballInHand: boolean;
  snookered: boolean;
}

/** One full hustler visit. Ends with the player at the table unless the rack is over. */
function hustlerVisit(
  rules: CasinoPoolRules,
  table: CasinoPoolTableRules,
  rack: PoolRackState,
  input: HustlerVisitInput,
  rng: Rng,
): void {
  rack.hustlerVisits += 1;
  rack.ballInHand = false;
  for (let shot = 0; shot < HUSTLER_SHOT_LIMIT; shot++) {
    const onEight = rack.hustlerBalls.length === 0;
    let potBps = onEight ? table.hustler.eightBps : table.hustler.potBps;
    let scratchBps = table.hustler.scratchBps;
    if (shot === 0 && input.snookered) {
      potBps = (potBps * rules.safety.hustlerPotScaleBps) / 10_000;
      scratchBps += rules.safety.hustlerFoulBps;
    }
    if (shot === 0 && input.ballInHand) potBps += rules.ballInHandBonusBps;
    potBps = clampBps(potBps);

    const r = roll(rng);
    const kind = onEight ? 'EIGHT' : 'STEADY';
    if (r < scratchBps) {
      rack.log.push({ shooter: 'HUSTLER', shot: kind, result: 'SCRATCH', balls: [] });
      if (onEight) {
        rack.status = 'WON';
        rack.finish = 'HUSTLER_SCRATCHED_EIGHT';
      } else {
        rack.ballInHand = true;
      }
      return;
    }
    if (r < scratchBps + potBps) {
      if (onEight) {
        rack.log.push({ shooter: 'HUSTLER', shot: 'EIGHT', result: 'POT', balls: [8] });
        rack.status = 'LOST';
        rack.finish = 'HUSTLER_EIGHT';
        return;
      }
      rack.log.push({ shooter: 'HUSTLER', shot: 'STEADY', result: 'POT', balls: take(rack.hustlerBalls, 1) });
      continue;
    }
    rack.log.push({ shooter: 'HUSTLER', shot: kind, result: 'MISS', balls: [] });
    return;
  }
}

/** The opening break. The player always breaks. */
export function poolBreak(rules: CasinoPoolRules, table: CasinoPoolTableRules, rng: Rng): PoolRackState {
  const rack = newPoolRack();
  const r = roll(rng);
  const { goldenBps, scratchBps, dryBps, twoBallBps } = rules.break;
  if (r < goldenBps) {
    rack.log.push({ shooter: 'PLAYER', shot: 'BREAK', result: 'POT', balls: [8] });
    rack.status = 'WON';
    rack.finish = 'GOLDEN_BREAK';
    return rack;
  }
  if (r < goldenBps + scratchBps) {
    rack.log.push({ shooter: 'PLAYER', shot: 'BREAK', result: 'SCRATCH', balls: [] });
    hustlerVisit(rules, table, rack, { ballInHand: true, snookered: false }, rng);
    return rack;
  }
  if (r < goldenBps + scratchBps + dryBps) {
    rack.log.push({ shooter: 'PLAYER', shot: 'BREAK', result: 'DRY', balls: [] });
    hustlerVisit(rules, table, rack, { ballInHand: false, snookered: false }, rng);
    return rack;
  }
  const count = r < goldenBps + scratchBps + dryBps + twoBallBps ? 2 : 1;
  rack.log.push({ shooter: 'PLAYER', shot: 'BREAK', result: 'POT', balls: take(rack.playerBalls, count) });
  return rack;
}

/** Take one player shot and play out any hustler visit it hands over. Mutates and returns the rack. */
export function poolPlayerShot(
  rules: CasinoPoolRules,
  table: CasinoPoolTableRules,
  rack: PoolRackState,
  shot: PoolShotKind,
  rng: Rng,
): PoolRackState {
  if (rack.status !== 'ACTIVE') throw new Error('That rack is already over.');
  if (!poolAvailableShots(rack).includes(shot)) throw new Error('That shot is not available.');
  const onEight = rack.playerBalls.length === 0;
  const odds = poolShotOdds(rules, rack, shot);
  rack.ballInHand = false;
  const r = roll(rng);

  if (shot === 'SAFETY') {
    if (r < odds.scratchBps) {
      rack.log.push({ shooter: 'PLAYER', shot: 'SAFETY', result: 'FOUL', balls: [] });
      hustlerVisit(rules, table, rack, { ballInHand: true, snookered: false }, rng);
    } else {
      rack.log.push({ shooter: 'PLAYER', shot: 'SAFETY', result: 'SAFE', balls: [] });
      hustlerVisit(rules, table, rack, { ballInHand: false, snookered: true }, rng);
    }
    return rack;
  }

  const kind = onEight ? 'EIGHT' : shot;
  if (r < odds.scratchBps) {
    rack.log.push({ shooter: 'PLAYER', shot: kind, result: 'SCRATCH', balls: [] });
    if (onEight) {
      rack.status = 'LOST';
      rack.finish = 'SCRATCHED_EIGHT';
    } else {
      hustlerVisit(rules, table, rack, { ballInHand: true, snookered: false }, rng);
    }
    return rack;
  }
  if (r < odds.scratchBps + odds.potBps) {
    if (onEight) {
      rack.log.push({ shooter: 'PLAYER', shot: 'EIGHT', result: 'POT', balls: [8] });
      rack.status = 'WON';
      rack.finish = rack.hustlerVisits === 0 ? 'BREAK_AND_RUN' : 'EIGHT';
      return rack;
    }
    rack.log.push({ shooter: 'PLAYER', shot: kind, result: 'POT', balls: take(rack.playerBalls, shot === 'POWER' ? 2 : 1) });
    return rack;
  }
  rack.log.push({ shooter: 'PLAYER', shot: kind, result: 'MISS', balls: [] });
  hustlerVisit(rules, table, rack, { ballInHand: false, snookered: false }, rng);
  return rack;
}

/** Total return in bps of the staked amount for a finished rack. Zero on a loss. */
export function poolReturnBps(table: CasinoPoolTableRules, rack: PoolRackState): number {
  if (rack.status !== 'WON') return 0;
  if (rack.finish === 'GOLDEN_BREAK') return table.goldenBreakReturnBps;
  if (rack.finish === 'BREAK_AND_RUN') return table.breakAndRunReturnBps;
  return table.winReturnBps;
}

export function poolReturnCents(stakeCents: bigint, table: CasinoPoolTableRules, rack: PoolRackState): bigint {
  return (stakeCents * BigInt(poolReturnBps(table, rack))) / 10_000n;
}
