import { describe, expect, it } from 'vitest';
import { classicOgV16D, classicOgV16E } from '@streets/rulesets';
import { dealerPace, dealerPriceRange, dealerRules, dealerStreetPriceCents, dealerTier, demandWord } from '../calculations/dealers.js';

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
