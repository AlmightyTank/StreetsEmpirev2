import type { DealerRules, DealerTierRules, DistrictKey, Ruleset } from '@streets/rulesets';

/**
 * 1.6.0-E. Dealer crews, as pure numbers: what a dealer's experience makes him, what a
 * product's street price is in a city, what a crew may ask, and how fast it sells. 1.6.0-F
 * runs its sales on the same pace and cut; nothing here rolls or reads the clock.
 */

export function dealerRules(ruleset: Ruleset): DealerRules | undefined {
  return ruleset.supplyNetwork?.enabled ? ruleset.supplyNetwork.dealers : undefined;
}

/** The highest tier a dealer's experience reaches. */
export function dealerTier(rules: DealerRules, experience: number): DealerTierRules {
  let tier = rules.tiers[0]!;
  for (const candidate of rules.tiers) if (experience >= candidate.minExperience) tier = candidate;
  return tier;
}

/** Pip's price for a product, leaned by the city, marked up for the street. Null where it does not sell. */
export function dealerStreetPriceCents(ruleset: Ruleset, rules: DealerRules, citySlug: string, productKey: string): number | null {
  const reference = ruleset.products?.[productKey]?.effects?.referenceCostCents;
  const lean = ruleset.cities?.[citySlug]?.products?.[productKey];
  if (!reference || !lean) return null;
  return Math.max(1, Math.round(reference * lean.price * rules.streetPriceMultiplier));
}

/** The lowest and highest price a crew may ask, whole cents. */
export function dealerPriceRange(rules: DealerRules, streetPriceCents: number): { minCents: number; maxCents: number } {
  return {
    minCents: Math.max(1, Math.ceil(streetPriceCents * rules.priceRange.min)),
    maxCents: Math.max(1, Math.floor(streetPriceCents * rules.priceRange.max)),
  };
}

/** How much a city wants a product, 1 being ordinary. Zero where it does not sell. */
export function dealerDemand(ruleset: Ruleset, citySlug: string, productKey: string): number {
  return ruleset.cities?.[citySlug]?.products?.[productKey]?.demand ?? 0;
}

export type DemandWord = 'STRONG' | 'STEADY' | 'MODEST' | 'THIN';

/** Demand in words, never a number. */
export function demandWord(demand: number): DemandWord {
  if (demand >= 1) return 'STRONG';
  if (demand >= 0.7) return 'STEADY';
  if (demand >= 0.5) return 'MODEST';
  return 'THIN';
}

export interface DealerPaceInput {
  rules: DealerRules;
  demand: number;
  district: DistrictKey;
  /** Each dealer's experience. */
  dealers: readonly number[];
  priceCents: number;
  streetPriceCents: number;
}

export interface DealerPace {
  /** Units an hour while the crew has stock. */
  unitsPerHour: number;
  /** What the crew takes of each sale, averaged over its dealers, in percent. */
  cutPercent: number;
  /** Wages and rent an hour while it works. */
  operatingCentsPerHour: number;
}

/**
 * A crew's selling pace: each dealer's base pace and tier bonus, the district's traffic, the
 * city's demand, and the price against the street price bent by elasticity. A crew with no
 * dealers, no demand or no price sells nothing.
 */
export function dealerPace(input: DealerPaceInput): DealerPace {
  const { rules } = input;
  const tiers = input.dealers.map((experience) => dealerTier(rules, experience));
  const operatingCentsPerHour = input.dealers.length * rules.operatingCentsPerDealerHour;
  if (!tiers.length || input.demand <= 0 || input.priceCents <= 0 || input.streetPriceCents <= 0) {
    return { unitsPerHour: 0, cutPercent: tiers.length ? average(tiers.map((tier) => tier.cutPercent)) : 0, operatingCentsPerHour };
  }
  const crew = tiers.reduce((sum, tier) => sum + rules.unitsPerDealerHour * (1 + tier.paceBonus), 0);
  const price = (input.streetPriceCents / input.priceCents) ** rules.priceElasticity;
  return {
    unitsPerHour: crew * (rules.districtTraffic[input.district] ?? 1) * input.demand * price,
    cutPercent: average(tiers.map((tier) => tier.cutPercent)),
    operatingCentsPerHour,
  };
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
