/**
 * Randomness is injected, never reached for.
 *
 * Every calculation that rolls takes an `Rng` so a test can hand it a fixed
 * sequence and assert an exact number, and so a future replay or seeded round
 * does not need any of the maths rewritten.
 */
export type Rng = () => number;

export const defaultRng: Rng = Math.random;

/** Always the midpoint. Handy for tests and for reasoning about averages. */
export const flatRng: Rng = () => 0.5;

/**
 * Spread a value by +/- `variance`, e.g. variance 0.35 gives 65%..135%.
 * A roll of 0.5 returns the value untouched.
 */
export function applyVariance(value: number, variance: number, rng: Rng): number {
  if (variance <= 0) return value;
  return value * (1 + (rng() * 2 - 1) * variance);
}

/**
 * Turn a fractional amount into a whole one without throwing the fraction
 * away: 2.4 becomes 2 sixty percent of the time and 3 the rest.
 *
 * Recruiting 0.6 whores per turn has to be able to produce a whore, or a small
 * player scouting a rich district would recruit nobody, ever.
 */
export function roundStochastic(value: number, rng: Rng): number {
  const whole = Math.floor(value);
  const fraction = value - whole;
  return fraction > 0 && rng() < fraction ? whole + 1 : whole;
}

/** Scales an output linearly with happiness, down to `floor` at zero. */
export function happinessMultiplier(happiness: number, floor: number): number {
  const clamped = Math.min(100, Math.max(0, happiness));
  return floor + (1 - floor) * (clamped / 100);
}

/**
 * 0.5.0-C. A 32-bit hash of some parts, for schedules seeded per round. The same
 * parts always give the same number, so a round's supply swings and price events
 * can be worked out whenever they are read, and replayed.
 */
export function hashParts(...parts: Array<string | number>): number {
  let hash = 2166136261;
  for (const part of parts) {
    const text = `${part}|`;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  // A final mix, so parts that differ in one character still land far apart.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** A roll in [0, 1) from some parts. */
export function hashRoll(...parts: Array<string | number>): number {
  return hashParts(...parts) / 4294967296;
}

/** A seeded `Rng` (mulberry32): the same seed rolls the same sequence. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
