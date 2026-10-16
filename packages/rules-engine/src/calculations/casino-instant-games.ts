import type { CasinoRules } from '@streets/rulesets';
import type { Rng } from '../rng.js';

function roll01(rng: Rng): number {
  const value = rng();
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.9999999999999999, value));
}

export function weightedIndex(weights: readonly number[], rng: Rng): number {
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!(total > 0)) throw new Error('At least one positive weight is required.');
  let cursor = roll01(rng) * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= Math.max(0, weights[index] ?? 0);
    if (cursor < 0) return index;
  }
  return weights.length - 1;
}

export function scratchPrizeMultiplier(
  rules: NonNullable<CasinoRules['scratchCards']>,
  rng: Rng,
): number {
  return rules.payoutTiers[weightedIndex(rules.payoutTiers.map((tier) => tier.weight), rng)]?.multiplier ?? 0;
}

/** Fixed odds imply probability proportional to 1 / total return. */
export function horseRaceOrder(
  rules: NonNullable<CasinoRules['horseRacing']>,
  rng: Rng,
): string[] {
  const remaining = rules.horses.map((horse) => horse);
  const order: string[] = [];
  while (remaining.length) {
    const index = weightedIndex(remaining.map((horse) => 10_000 / horse.returnBps), rng);
    order.push(remaining[index]!.key);
    remaining.splice(index, 1);
  }
  return order;
}

export function horseReturnCents(wagerCents: bigint, returnBps: number, won: boolean): bigint {
  if (!won) return 0n;
  return (wagerCents * BigInt(returnBps)) / 10_000n;
}
