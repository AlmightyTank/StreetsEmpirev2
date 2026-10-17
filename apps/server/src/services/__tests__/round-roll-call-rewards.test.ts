import { describe, expect, it } from 'vitest';
import {
  ROUND_ROLL_CALL_REWARD_VERSION,
  ROLL_CALL_PER_STEP_CAPS,
  roundRollCallCatalog,
  validateRollCallRewards,
} from '../round-roll-call-rewards.js';
import { assertRoundRollCallClaimable } from '../round-roll-call-reward.service.js';

describe('Round Roll Call Slice B catalog', () => {
  it('gives 21 stamps exactly 10 Common, 6 Uncommon, 4 Rare, 1 final Legendary', () => {
    const catalog = roundRollCallCatalog(21);
    expect(catalog).toHaveLength(21);
    const rarities = catalog.reduce<Record<string, number>>((counts, step) => {
      counts[step.rarity] = (counts[step.rarity] ?? 0) + 1;
      return counts;
    }, {});
    expect(rarities).toEqual({ common: 10, uncommon: 6, rare: 4, legendary: 1 });
    expect(catalog[20]?.rarity).toBe('legendary');
    expect(catalog.filter((step) => step.rarity === 'legendary')).toHaveLength(1);
    expect(catalog.map((step) => step.tier)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
  });

  it('generates deterministic, versioned tracks for 14, 28, 35 and 42-day rounds', () => {
    for (const stamps of [7, 14, 21, 28, 35]) {
      const first = roundRollCallCatalog(stamps);
      expect(first).toEqual(roundRollCallCatalog(stamps));
      expect(first).toHaveLength(stamps);
      expect(first.at(-1)?.rarity).toBe('legendary');
      expect(first.filter((step) => step.rarity === 'legendary')).toHaveLength(1);
      expect(new Set(first.map((step) => step.key)).size).toBe(stamps);
      expect(first.every((step) => step.key.startsWith(ROUND_ROLL_CALL_REWARD_VERSION))).toBe(true);
      expect(first.every((step) => validateRollCallRewards(step.rewards))).toBe(true);
    }
  });

  it('caps every tier and keeps the complete 21-day track light', () => {
    const tiers = roundRollCallCatalog(21);
    const rewards = tiers.flatMap((tier) => tier.rewards);
    const sum = (kind: string) => rewards
      .filter((reward) => reward.kind === kind)
      .reduce((amount, reward) => amount + (reward.amount ?? 0), 0);
    expect(sum('CASH')).toBe(1_915_000);
    expect(sum('TURNS')).toBe(74);
    expect(sum('CASH')).toBeLessThan(2_000_000);
    expect(rewards.filter((reward) => reward.kind === 'ITEM').every((reward) =>
      ['condoms', 'beer', 'medicine'].includes(reward.key ?? ''))).toBe(true);
    expect(rewards.every((reward) => (reward.amount ?? 0) <=
      (reward.kind === 'CASH' ? ROLL_CALL_PER_STEP_CAPS.cashCents
        : reward.kind === 'TURNS' ? ROLL_CALL_PER_STEP_CAPS.turns
          : ROLL_CALL_PER_STEP_CAPS.supplies))).toBe(true);
  });

  it('disallows guns, permanent access, or out-of-budget rewards', () => {
    expect(validateRollCallRewards([{ kind: 'ITEM', key: 'pistols', amount: 1 }])).toBe(false);
    expect(validateRollCallRewards([{ kind: 'TURNS', amount: 100 }])).toBe(false);
    expect(validateRollCallRewards([{ kind: 'CASH', amount: 1_000_000 }])).toBe(false);
    expect(validateRollCallRewards([{ kind: 'ITEM', key: 'medicine', amount: 12 }])).toBe(true);
  });

  it('requires a real stamp and rejects already paid rewards', () => {
    expect(() => assertRoundRollCallClaimable(21, 4, 4, false)).not.toThrow();
    expect(() => assertRoundRollCallClaimable(21, 4, 5, false))
      .toThrowError('Earn 5 attendance stamps');
    expect(() => assertRoundRollCallClaimable(21, 21, 21, true))
      .toThrowError('already collected');
    expect(() => assertRoundRollCallClaimable(21, 21, 22, false))
      .toThrowError('not in this round');
    expect(() => assertRoundRollCallClaimable(21, 0, 0, false))
      .toThrowError('not in this round');
  });
  it('does not silently switch a round to an unknown future catalog', () => {
    expect(() => roundRollCallCatalog(21, ROUND_ROLL_CALL_REWARD_VERSION)).not.toThrow();
    expect(() => roundRollCallCatalog(21, 'round-roll-call-v2'))
      .toThrow('Unsupported Round Roll Call reward catalog version');
  });

});
