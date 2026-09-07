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
