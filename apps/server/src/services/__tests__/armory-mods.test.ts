import { describe, expect, it } from 'vitest';
import { classicOgV25A } from '@streets/rulesets';
import { itemModRule, transitionModSet, validateModSet } from '../armory-mods.js';

const catalog = classicOgV25A.individualItems!;

describe('individual armory mod rules', () => {
  it('prices an install from the item size and selected tier', () => {
    const rule = itemModRule(catalog, 'GUN', 'AK47');
    expect(transitionModSet([], [{ key: 'BARREL', tier: 1 }], rule, catalog.modCosts)).toMatchObject({
      mods: [{ key: 'BARREL', tier: 1 }], partsSpent: 20, partsRefunded: 0, cashSpentCents: 40_000,
    });
  });

  it('refunds half of removed parts when a mod is replaced or removed', () => {
    const rule = itemModRule(catalog, 'GUN', 'AK47');
    expect(transitionModSet([{ key: 'BARREL', tier: 1 }], [{ key: 'BARREL', tier: 2 }], rule, catalog.modCosts))
      .toMatchObject({ partsSpent: 60, partsRefunded: 10, cashSpentCents: 120_000 });
    expect(transitionModSet([{ key: 'BARREL', tier: 1 }], [], rule, catalog.modCosts))
      .toMatchObject({ partsSpent: 0, partsRefunded: 10, cashSpentCents: 0 });
  });

  it('enforces the model catalog, slot count, and one mod per slot', () => {
    const pistol = itemModRule(catalog, 'GUN', 'PISTOL');
    expect(() => validateModSet([{ key: 'SCOPE', tier: 1 }], pistol)).toThrow();
    const ak = itemModRule(catalog, 'GUN', 'AK47');
    expect(() => validateModSet([{ key: 'COMPENSATOR', tier: 1 }, { key: 'SUPPRESSOR', tier: 1 }], ak)).toThrow();
    expect(() => validateModSet([
      { key: 'BARREL', tier: 1 }, { key: 'SCOPE', tier: 1 }, { key: 'EXTENDED_MAG', tier: 1 },
      { key: 'COMPENSATOR', tier: 1 }, { key: 'REINFORCED_FRAME', tier: 1 },
    ], ak)).toThrow();
  });

  it('quotes vehicle mods with the vehicle size table', () => {
    const rule = itemModRule(catalog, 'VEHICLE', 'SEDAN');
    expect(transitionModSet([], [{ key: 'ENGINE', tier: 2 }], rule, catalog.modCosts))
      .toMatchObject({ partsSpent: 15, cashSpentCents: 30_000 });
  });
});
