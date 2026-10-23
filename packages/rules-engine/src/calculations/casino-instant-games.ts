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
  returnBpsByHorse: Readonly<Record<string, number>> = Object.fromEntries(rules.horses.map((horse) => [horse.key, horse.returnBps])),
): string[] {
  const remaining = rules.horses.map((horse) => horse);
  const order: string[] = [];
  while (remaining.length) {
    const index = weightedIndex(remaining.map((horse) => 10_000 / (returnBpsByHorse[horse.key] ?? horse.returnBps)), rng);
    order.push(remaining[index]!.key);
    remaining.splice(index, 1);
  }
  return order;
}

export interface HorseRaceOddsInput {
  /** Total recent stake by horse, used as a capped market-pressure signal. */
  volumeByHorse?: Readonly<Record<string, number>>;
  /** Recent winners, newest first. */
  recentWinners?: readonly string[];
  /** Bounded casino-status adjustment in basis points. */
  statusModifierBps?: number;
}

/**
 * Build a live, bounded odds snapshot. The market is deliberately smooth:
 * volume and winner streaks influence the next race, but neither can make a
 * horse impossible to pick or create extreme payouts.
 */
export function horseRaceOdds(
  rules: NonNullable<CasinoRules['horseRacing']>,
  input: HorseRaceOddsInput = {},
): Record<string, number> {
  const horses = rules.horses;
  const count = Math.max(1, horses.length);
  const totalVolume = horses.reduce((sum, horse) => sum + Math.max(0, input.volumeByHorse?.[horse.key] ?? 0), 0);
  const recent = input.recentWinners ?? [];
  const recentCount = recent.length;
  const modifier = Math.max(-500, Math.min(500, input.statusModifierBps ?? 0));
  return Object.fromEntries(horses.map((horse) => {
    const volumeShare = totalVolume > 0 ? Math.max(0, input.volumeByHorse?.[horse.key] ?? 0) / totalVolume : 1 / count;
    const volumePressure = Math.max(0.78, Math.min(1.22, 1 - (volumeShare - 1 / count) * 0.75));
    const wins = recent.filter((key) => key === horse.key).length;
    const historyPressure = recentCount > 0
      ? Math.max(0.82, Math.min(1.18, 1 + ((1 / count) - wins / recentCount) * 0.55))
      : 1;
    const statusPressure = 1 + modifier / 10000;
    const weight = (10_000 / horse.returnBps) * volumePressure * historyPressure / statusPressure;
    const returnBps = Math.round(10_000 / Math.max(0.000001, weight));
    return [horse.key, Math.max(10_000, Math.min(250_000, returnBps))];
  }));
}

export function horseReturnCents(wagerCents: bigint, returnBps: number, won: boolean): bigint {
  if (!won) return 0n;
  return (wagerCents * BigInt(returnBps)) / 10_000n;
}
