import type { FactionStandingRules, FactionTier } from '@streets/rulesets';

/**
 * 1.4.0-B. Faction standing: seasonal, a whole number from 0 to the ruleset's max, and a tier
 * reached deterministically from it. Everything here is pure; the server keeps the receipts.
 */

/** The tiers, lowest first. */
export const FACTION_TIERS: readonly FactionTier[] = ['UNKNOWN', 'KNOWN', 'TRUSTED', 'CONNECTED', 'INNER_CIRCLE'];

const TIER_NAMES: Readonly<Record<FactionTier, string>> = {
  UNKNOWN: 'Unknown',
  KNOWN: 'Known',
  TRUSTED: 'Trusted',
  CONNECTED: 'Connected',
  INNER_CIRCLE: 'Inner Circle',
};

export function factionTierName(tier: FactionTier): string {
  return TIER_NAMES[tier];
}

export function factionTierRank(tier: FactionTier): number {
  return FACTION_TIERS.indexOf(tier);
}

/** Where a tier starts. Unknown starts at 0. */
export function factionTierStartsAt(tier: FactionTier, rules: FactionStandingRules): number {
  switch (tier) {
    case 'UNKNOWN': return 0;
    case 'KNOWN': return rules.tiers.known;
    case 'TRUSTED': return rules.tiers.trusted;
    case 'CONNECTED': return rules.tiers.connected;
    case 'INNER_CIRCLE': return rules.tiers.innerCircle;
  }
}

export function factionTier(points: number, rules: FactionStandingRules): FactionTier {
  let reached: FactionTier = 'UNKNOWN';
  for (const tier of FACTION_TIERS) {
    if (points >= factionTierStartsAt(tier, rules)) reached = tier;
  }
  return reached;
}

/** The next tier up and where it starts, or null at Inner Circle. */
export function nextFactionTier(points: number, rules: FactionStandingRules): { tier: FactionTier; startsAt: number } | null {
  const next = FACTION_TIERS[factionTierRank(factionTier(points, rules)) + 1];
  return next ? { tier: next, startsAt: factionTierStartsAt(next, rules) } : null;
}

/** Standing after a change, kept between 0 and the max. */
export function addStanding(points: number, delta: number, rules: FactionStandingRules): number {
  return Math.min(rules.max, Math.max(0, Math.round(points + delta)));
}

/** Standing a one-time Job pays for the contact reputation it pays. Never negative. */
export function standingFromRep(amount: number, rules: FactionStandingRules): number {
  return amount > 0 ? Math.round(amount * rules.perContactRep) : 0;
}
