import type { RelocationRules, Ruleset } from '@streets/rulesets';
import { cityHeatRules, cityRules, findRoutes } from './cities.js';
import { bustChance, heatTakeMultiplier } from './heat.js';
import { arrestChance } from './road-risk.js';

/**
 * 0.5.0-D. Moving house: the whole operation goes to another city for a fee priced on
 * net worth and a stretch on the road. Everything here is pure; the server checks the
 * things only the database knows (a run out, a revenge window open) and passes them in.
 */

export function relocationRules(ruleset: Ruleset): RelocationRules | undefined {
  return ruleset.travel?.relocation;
}

/** A share of net worth, never under the floor. */
export function relocationFeeCents(netWorthCents: bigint, rules: RelocationRules): bigint {
  const share = BigInt(Math.floor(Number(netWorthCents > 0n ? netWorthCents : 0n) * rules.feeNetWorthFraction));
  const floor = BigInt(rules.feeFloorCents);
  return share > floor ? share : floor;
}

export interface MoveCheck {
  /** What stops the move right now, in words; null when it can go. */
  blockedReason: string | null;
  /** Machine code for the refusal. */
  code: string | null;
  /** When the reason goes away on its own (a cooldown, a revenge window), if it does. */
  blockedUntil: Date | null;
  feeCents: bigint;
  arrivesAt: Date;
  /** When the cooldown from the last move ends, if it is still running. */
  cooldownUntil: Date | null;
  /** When moves close for the round. */
  cutoffAt: Date;
}

/**
 * Can this player move to `to` now, and what would it cost. Checked in this order so
 * the player sees the reason that matters most.
 */
export function checkMove(ruleset: Ruleset, input: {
  from: string;
  to: string;
  now: Date;
  netWorthCents: bigint;
  cashCents: bigint;
  roundEndsAt: Date;
  lastMoveAt: Date | null;
  movingUntil: Date | null;
  lockedUntil: Date | null;
  runOut: boolean;
  /** When the last revenge window someone holds on this player closes, if one is open. */
  revengeOpenUntil: Date | null;
}): MoveCheck {
  const rules = relocationRules(ruleset);
  const now = input.now.getTime();
  const cutoffAt = new Date(input.roundEndsAt.getTime() - (rules?.cutoffHours ?? 0) * 3_600_000);
  const cooldownEnds = input.lastMoveAt && rules ? new Date(input.lastMoveAt.getTime() + rules.cooldownHours * 3_600_000) : null;
  const cooldownUntil = cooldownEnds && cooldownEnds.getTime() > now ? cooldownEnds : null;
  const feeCents = rules ? relocationFeeCents(input.netWorthCents, rules) : 0n;
  const arrivesAt = new Date(now + (rules?.downtimeMinutes ?? 0) * 60_000);
  const result = (code: string | null, blockedReason: string | null, blockedUntil: Date | null = null): MoveCheck => ({ code, blockedReason, blockedUntil, feeCents, arrivesAt, cooldownUntil, cutoffAt });
  const name = (slug: string) => ruleset.cities?.[slug]?.name ?? slug;

  if (!rules) return result('MOVES_DISABLED', 'Nobody moves house this round.');
  if (!cityRules(ruleset, input.to)) return result('UNKNOWN_CITY', 'That city is not on the map.');
  if (input.to === input.from) return result('ALREADY_HOME', `You already live in ${name(input.from)}.`);
  if (input.movingUntil && input.movingUntil.getTime() > now) return result('ON_THE_ROAD', 'You are already on the road.', input.movingUntil);
  if (input.lockedUntil && input.lockedUntil.getTime() > now) return result('LOCKED_UP', 'You are locked up.', input.lockedUntil);
  if (findRoutes(ruleset, input.from, input.to).length === 0) return result('NO_ROAD', `There is no road from ${name(input.from)} to ${name(input.to)}.`);
  if (now >= cutoffAt.getTime()) return result('MOVES_CLOSED', 'Moves are closed as the round ends, so nobody reshuffles local ranks.');
  if (input.runOut) return result('RUN_OUT', 'Your run is still out. Bring it home before you move.');
  if (input.revengeOpenUntil && input.revengeOpenUntil.getTime() > now) {
    return result('IN_A_FIGHT', 'You hit someone who can still hit back. Moving now would be running.', input.revengeOpenUntil);
  }
  if (cooldownUntil) return result('MOVE_COOLDOWN', 'You moved recently. The truck needs a day.', cooldownUntil);
  if (feeCents > input.cashCents) return result('NOT_ENOUGH_CASH', `The move costs $${(Number(feeCents) / 100).toLocaleString('en-US')}.`);
  return result(null, null);
}

/** What a player's Heat would mean living in a city: the city's lines, and what the number costs there. */
export interface HeatThere {
  dragStartsAt: number;
  bustStartsAt: number;
  arrestStartsAt: number | null;
  takeMultiplier: number;
  bustChance: number;
  arrestChance: number;
}

export function heatThere(ruleset: Ruleset, heat: number, city: string): HeatThere | null {
  const rules = cityHeatRules(ruleset, city);
  if (!rules) return null;
  const there = { ...ruleset, heat: rules };
  return {
    dragStartsAt: rules.drag.startsAt,
    bustStartsAt: rules.bust.startsAt,
    arrestStartsAt: rules.arrest?.startsAt ?? null,
    takeMultiplier: heatTakeMultiplier(heat, there),
    bustChance: bustChance(heat, there),
    arrestChance: arrestChance(heat, there),
  };
}
