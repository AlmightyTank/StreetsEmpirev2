import { describe, expect, it } from 'vitest';
import { classicOgV04B, type Ruleset } from '@streets/rulesets';
import { calculateWorkConsumption } from '../calculations/upkeep.js';
import { defaultWorkSupplyPolicy, planWorkSupply, workSupplyOrder } from '../calculations/work-supply.js';

// A ruleset where products and dry slices actually pay differently, to prove the weighting.
const tuned = {
  ...classicOgV04B,
  products: {
    ...classicOgV04B.products,
    ECSTASY: { ...classicOgV04B.products.ECSTASY, work: { takeMultiplier: 1.2 } },
    COCAINE: { ...classicOgV04B.products.COCAINE, work: { takeMultiplier: 1.1 } },
  },
  workSupply: { productPerWhorePerTurn: 0.1, dryTakeMultiplier: 0.5 },
} as Ruleset;

const casino = { primary: 'ECSTASY', fallback: 'COCAINE', emergency: 'CRACK', strict: false };

describe('work supply order', () => {
  it('follows primary, fallback, emergency, and strict keeps only the primary', () => {
    expect(workSupplyOrder(casino)).toEqual(['ECSTASY', 'COCAINE', 'CRACK']);
    expect(workSupplyOrder({ ...casino, strict: true })).toEqual(['ECSTASY']);
    expect(workSupplyOrder({ primary: 'CRACK', fallback: 'CRACK', emergency: null, strict: false })).toEqual(['CRACK']);
  });
});

describe('planWorkSupply', () => {
  it('burns exactly what crack always burned under the default policy', () => {
    for (const [whores, turns, stock] of [[80, 20, 230], [7, 13, 3], [100, 1, 1000], [3, 144, 0]] as const) {
      const plan = planWorkSupply({ job: 'CASINO', whores, turns, policy: defaultWorkSupplyPolicy(), inventory: { CRACK: stock }, ruleset: classicOgV04B });
      const legacy = calculateWorkConsumption({ whores, thugs: 0, condoms: 0, crack: stock, beer: 0, medicine: 0, whoreHappiness: 100, thugHappiness: 100 }, turns, classicOgV04B);
      expect(plan.consumed.CRACK ?? 0).toBe(legacy.crack);
      expect(plan.takeMultiplier).toBe(1);
    }
  });

  it('runs 80 Casino workers for 20 turns across Ecstasy, then Cocaine, then dry, in proportion', () => {
    // Need 80 x 0.1 x 20 = 160. 112 Ecstasy covers 70%, 24 Cocaine 15%, 24 units missing 15%.
    const plan = planWorkSupply({ job: 'CASINO', whores: 80, turns: 20, policy: casino, inventory: { ECSTASY: 112, COCAINE: 24, CRACK: 0 }, ruleset: tuned });
    expect(plan.need).toBe(160);
    expect(plan.perTurn).toBe(8);
    expect(plan.slices.map((slice) => [slice.product, slice.state, slice.units])).toEqual([
      ['ECSTASY', 'supplied', 112], ['COCAINE', 'substituted', 24], [null, 'dry', 24],
    ]);
    expect(plan.slices.map((slice) => slice.turns)).toEqual([14, 3, 3]);
    expect(plan.slices.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1, 10);
    expect(plan.takeMultiplier).toBeCloseTo(0.7 * 1.2 + 0.15 * 1.1 + 0.15 * 0.5, 10);
    expect(plan.consumed).toEqual({ ECSTASY: 112, COCAINE: 24 });
    expect(plan.switchesAtTurn).toBe(14);
  });

  it('never lets a little of a great product supply the whole crew', () => {
    const plan = planWorkSupply({ job: 'CASINO', whores: 100, turns: 10, policy: casino, inventory: { ECSTASY: 1 }, ruleset: tuned });
    expect(plan.slices[0]).toMatchObject({ product: 'ECSTASY', units: 1, share: 0.01 });
    expect(plan.takeMultiplier).toBeCloseTo(0.01 * 1.2 + 0.99 * 0.5, 10);
  });

  it('strict supply leaves fallback stock alone and runs dry instead', () => {
    const plan = planWorkSupply({ job: 'CASINO', whores: 80, turns: 20, policy: { ...casino, strict: true }, inventory: { ECSTASY: 40, COCAINE: 500, CRACK: 500 }, ruleset: tuned });
    expect(plan.consumed).toEqual({ ECSTASY: 40 });
    expect(plan.slices.at(-1)).toMatchObject({ state: 'dry', units: 120 });
  });

  it('starts substituted when the primary is already gone', () => {
    const plan = planWorkSupply({ job: 'CASINO', whores: 10, turns: 10, policy: casino, inventory: { COCAINE: 100 }, ruleset: tuned });
    expect(plan.slices).toHaveLength(1);
    expect(plan.slices[0]).toMatchObject({ product: 'COCAINE', state: 'substituted', share: 1 });
    expect(plan.switchesAtTurn).toBe(0);
  });

  it('treats a trip with nobody to supply as supplied and burns nothing', () => {
    const plan = planWorkSupply({ job: 'CASINO', whores: 0, turns: 20, policy: casino, inventory: {}, ruleset: tuned });
    expect(plan).toMatchObject({ need: 0, consumed: {}, takeMultiplier: 1.2, switchesAtTurn: null });
  });
});
