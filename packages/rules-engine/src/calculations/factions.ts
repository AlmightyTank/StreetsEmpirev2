import {
  contactFaction,
  jobHelpedFactions,
  type FactionKey,
  type FactionStandingRules,
  type FactionTier,
  type QuestBranchDefinition,
  type QuestDefinition,
  type Ruleset,
} from '@streets/rulesets';

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

/**
 * 1.4.0-B. The standing a one-time Job pays, per faction. A Job pays only the factions it helps
 * (its own, the ones it openly helps, and the side a chosen branch backs): the reputation it
 * pays their contacts, turned into standing, plus any standing reward. Reputation paid to
 * anyone else's contact, a loss, or a repeatable Job pays no standing. Neither does a 1.4.0-B2
 * Season contract: it is one-time, but it is board work, and standing from boards is C's call.
 */
export function jobStanding(
  ruleset: Pick<Ruleset, 'factions' | 'contacts' | 'factionStanding'>,
  definition: Pick<QuestDefinition, 'type' | 'contactKey' | 'factionKey' | 'helps' | 'repeatability'>,
  rewards: ReadonlyArray<{ readonly kind: string; readonly key?: string | null; readonly amount?: number | null }>,
  branch?: Pick<QuestBranchDefinition, 'reputationDeltas'> | null,
): Map<FactionKey, number> {
  const result = new Map<FactionKey, number>();
  const rules = ruleset.factionStanding;
  if (!rules || definition.repeatability !== 'ONCE' || definition.type === 'SEASON') return result;
  const helped = jobHelpedFactions(ruleset, definition, branch);
  const add = (factionKey: FactionKey | undefined, standing: number) => {
    if (factionKey && helped.has(factionKey) && standing > 0) result.set(factionKey, (result.get(factionKey) ?? 0) + standing);
  };
  for (const reward of rewards) {
    if (reward.kind === 'CONTACT_REP') add(contactFaction(ruleset, reward.key), standingFromRep(reward.amount ?? 0, rules));
    else if (reward.kind === 'FACTION_STANDING') add(reward.key as FactionKey, Math.round(reward.amount ?? 0));
  }
  for (const delta of branch?.reputationDeltas ?? []) add(contactFaction(ruleset, delta.contactKey), standingFromRep(delta.amount, rules));
  return result;
}
