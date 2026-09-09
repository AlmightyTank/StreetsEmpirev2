/**
 * Who is out on the block tonight. Sections 25-27.
 *
 * Every district holds a different number of paying clients, the five values
 * are reshuffled every hour, and which district holds which is never shown.
 *
 * Derived from the clock rather than stored, exactly like turn regeneration:
 * there is no table to write, no job to run, and reading it a hundred times
 * costs nothing. Seeded from the round and the hour, so every player in a
 * round sees the same city in the same hour - it is one shared world, not a
 * private roll per player - and any hour can be recomputed later for a
 * receipt, a test or an argument about what happened.
 */

import type { DistrictKey, Ruleset } from '@streets/rulesets';

/** FNV-1a. Small, stable across platforms, and good enough to seed with. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32. Deterministic, uniform enough for a shuffle. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Which rotation the given moment falls in. */
export function rotationIndex(at: Date, ruleset: Ruleset): number {
  return Math.floor(at.getTime() / (ruleset.scouting.clients.rotationMinutes * 60_000));
}

/** When the current rotation ends and the city gets reshuffled. */
export function rotationEndsAt(at: Date, ruleset: Ruleset): Date {
  const span = ruleset.scouting.clients.rotationMinutes * 60_000;
  return new Date((rotationIndex(at, ruleset) + 1) * span);
}

/**
 * This hour's capacities, one per district.
 *
 * A permutation, never a re-roll: the same five numbers are always in play, so
 * the city as a whole is worth the same every hour and only the question of
 * where changes.
 */
export function districtCapacities(
  roundId: string,
  at: Date,
  ruleset: Ruleset,
): Record<DistrictKey, number> {
  const keys = Object.keys(ruleset.scouting.districts) as DistrictKey[];
  const pool = [...ruleset.scouting.clients.capacities];

  const rng = seeded(hash(`${roundId}:${rotationIndex(at, ruleset)}`));

  // Fisher-Yates, so every arrangement is equally likely.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }

  const out = {} as Record<DistrictKey, number>;
  keys.forEach((key, index) => {
    // A ruleset with more districts than capacities falls back to the most
    // generous, so a variant can never silently starve a block of clients.
    out[key] = pool[index] ?? Math.max(...ruleset.scouting.clients.capacities);
  });
  return out;
}

/**
 * What a block this busy does to the take.
 *
 * `capacity / (capacity + whores)` - the same shape as recruitment's soft cap,
 * for the same reason. It never reaches zero, so a night is always worth
 * something, and it bites harder the bigger the crew.
 */
export function clientMultiplier(capacity: number, whores: number): number {
  if (capacity <= 0) return 0;
  return capacity / (capacity + Math.max(0, whores));
}
