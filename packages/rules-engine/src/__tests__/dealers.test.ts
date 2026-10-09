import { describe, expect, it } from 'vitest';
import { classicOgV16D, classicOgV16E, classicOgV16F } from '@streets/rulesets';
import { dealerExperienceShares, dealerPace, dealerPressure, dealerPriceRange, dealerRules, dealerStreetPriceCents, dealerTier, demandWord, settleDealerSales } from '../calculations/dealers.js';

describe('1.6.0-E dealer crews', () => {
  const ruleset = classicOgV16E;
  const rules = dealerRules(ruleset)!;

  it('pins dealers to E only', () => {
    expect(dealerRules(classicOgV16D)).toBeUndefined();
    expect(rules.tiers[0]!.minExperience).toBe(0);
  });

  it('promotes a dealer by experience and raises his cut and pace with it', () => {
    expect(dealerTier(rules, 0).key).toBe('ROOKIE');
    expect(dealerTier(rules, 999).key).toBe('ROOKIE');
    expect(dealerTier(rules, 1_000).key).toBe('REGULAR');
    expect(dealerTier(rules, 50_000).key).toBe('CONNECT');
    for (let index = 1; index < rules.tiers.length; index++) {
      expect(rules.tiers[index]!.cutPercent).toBeGreaterThan(rules.tiers[index - 1]!.cutPercent);
      expect(rules.tiers[index]!.paceBonus).toBeGreaterThan(rules.tiers[index - 1]!.paceBonus);
    }
  });

  it('prices a product off Pip, leaned by the city, and bounds what a crew may ask', () => {
    // Cocaine: Pip's $40, Detroit leans 1.2, the street marks up 1.6.
    const street = dealerStreetPriceCents(ruleset, rules, 'detroit', 'COCAINE')!;
    expect(street).toBe(7_680);
    expect(dealerPriceRange(rules, street)).toEqual({ minCents: 5_376, maxCents: 15_360 });
    expect(dealerStreetPriceCents(ruleset, rules, 'detroit', 'NOPE')).toBeNull();
  });

  it('sells faster with more and better dealers, busier districts and lower prices', () => {
    const street = 7_680;
    const base = { rules, demand: 1, district: 'URBAN_GHETTO' as const, dealers: [0], priceCents: street, streetPriceCents: street };
    expect(dealerPace(base)).toEqual({ unitsPerHour: 12, cutPercent: 20, operatingCentsPerHour: 1_500 });
    expect(dealerPace({ ...base, dealers: [0, 0] }).unitsPerHour).toBe(24);
    expect(dealerPace({ ...base, dealers: [0, 4_000] })).toMatchObject({ unitsPerHour: 12 + 12 * 1.3, cutPercent: 23 });
    expect(dealerPace({ ...base, district: 'CASINO' }).unitsPerHour).toBeCloseTo(15);
    expect(dealerPace({ ...base, demand: 0.5 }).unitsPerHour).toBeCloseTo(6);
    expect(dealerPace({ ...base, priceCents: street * 2 }).unitsPerHour).toBeCloseTo(12 * 0.5 ** 1.6);
    expect(dealerPace({ ...base, priceCents: Math.round(street * 0.7) }).unitsPerHour).toBeGreaterThan(12);
    expect(dealerPace({ ...base, dealers: [] })).toEqual({ unitsPerHour: 0, cutPercent: 0, operatingCentsPerHour: 0 });
  });

  it('describes demand in words', () => {
    expect(demandWord(1.15)).toBe('STRONG');
    expect(demandWord(0.8)).toBe('STEADY');
    expect(demandWord(0.6)).toBe('MODEST');
    expect(demandWord(0.4)).toBe('THIN');
  });

  it('prices every supplied product in every city', () => {
    const products = new Set(ruleset.supplyNetwork.suppliers.flatMap((supplier) => Object.keys(supplier.offers)));
    for (const city of Object.keys(ruleset.cities)) {
      for (const product of products) expect(dealerStreetPriceCents(ruleset, rules, city, product)).toBeGreaterThan(0);
    }
  });
});

describe('1.6.0-F dealer sales', () => {
  const rules = dealerRules(classicOgV16F)!;
  const pace = { unitsPerHour: 10.4, cutPercent: 25, operatingCentsPerHour: 3_000 };

  it('slows crews in police-heavy cities only from F', () => {
    const base = { demand: 1, district: 'URBAN_GHETTO' as const, dealers: [0], priceCents: 100, streetPriceCents: 100 };
    expect(dealerPace({ ...base, rules: dealerRules(classicOgV16E)!, pressure: 1.6 }).unitsPerHour).toBe(12);
    expect(dealerPace({ ...base, rules, pressure: 1.6 }).unitsPerHour).toBeCloseTo(12 / Math.sqrt(1.6));
    expect(dealerPace({ ...base, rules, pressure: 0.6 }).unitsPerHour).toBeGreaterThan(12);
    expect(dealerPressure(classicOgV16F, 'san-francisco')).toBe(1.6);
  });

  it('sells whole units over the hours worked, carrying the fraction, and owes wages regardless', () => {
    const first = settleDealerSales({ pace, priceCents: 5_000, inventory: 1_000, hours: 3, carry: 0 });
    expect(first).toEqual({ sold: 31, carry: expect.closeTo(0.2, 6), grossCents: 155_000, cutCents: 38_750, operatingCents: 9_000 });
    // The carried fraction makes up a unit later: never lost.
    const second = settleDealerSales({ pace, priceCents: 5_000, inventory: 969, hours: 1, carry: first.carry });
    expect(second.sold).toBe(10);
    expect(second.carry).toBeCloseTo(0.6);
  });

  it('never sells more than the crew holds, and sells nothing from nothing', () => {
    expect(settleDealerSales({ pace, priceCents: 5_000, inventory: 7, hours: 24, carry: 0 })).toMatchObject({ sold: 7, carry: 0, grossCents: 35_000, operatingCents: 72_000 });
    expect(settleDealerSales({ pace, priceCents: 5_000, inventory: 0, hours: 5, carry: 0.9 })).toMatchObject({ sold: 0, grossCents: 0, cutCents: 0, operatingCents: 15_000 });
    expect(() => settleDealerSales({ pace, priceCents: 5_000, inventory: -1, hours: 1, carry: 0 })).toThrow();
  });

  it('shares experience across the dealers who sold it', () => {
    expect(dealerExperienceShares(31, 3, 1)).toEqual([11, 10, 10]);
    expect(dealerExperienceShares(0, 3, 1)).toEqual([0, 0, 0]);
    expect(dealerExperienceShares(10, 0, 1)).toEqual([]);
  });
});
