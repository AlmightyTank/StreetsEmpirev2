import {
  contactFaction,
  contractBoard,
  jobHelpedFactions,
  type FactionKey,
  type FactionNudgeKind,
  type FactionStandingRules,
  type FactionTier,
  type QuestBranchDefinition,
  type QuestDefinition,
  type Ruleset,
  type SponsoredBoard,
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
 * anyone else's contact, a loss, or a repeatable Job pays no standing. Neither does a board
 * contract, even a one-time 1.4.0-B2 Season contract: from 1.4.0-C it pays its sponsor instead.
 */
export function jobStanding(
  ruleset: Pick<Ruleset, 'factions' | 'contacts' | 'factionStanding'>,
  definition: Pick<QuestDefinition, 'type' | 'contactKey' | 'factionKey' | 'helps' | 'repeatability'>,
  rewards: ReadonlyArray<{ readonly kind: string; readonly key?: string | null; readonly amount?: number | null }>,
  branch?: Pick<QuestBranchDefinition, 'reputationDeltas'> | null,
): Map<FactionKey, number> {
  const result = new Map<FactionKey, number>();
  const rules = ruleset.factionStanding;
  // Board contracts pay their sponsor instead (1.4.0-C), never a Job's standing.
  if (!rules || definition.repeatability !== 'ONCE' || contractBoard(definition)) return result;
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

function unitRoll(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // MurmurHash3's finalizer, so seeds that differ by a character still roll independently.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

/**
 * 1.4.0-C. Pick each offer's sponsor from its candidates. An offer with one candidate keeps it;
 * with two or more, a candidate the player is Known with or above weighs `1 + knownLean`, the
 * rest weigh 1, and a roll seeded by the player and the offer picks one, so the same board gives
 * the same player the same sponsors. Then, where the board would otherwise be one faction's work
 * only and an offer has another candidate, that offer switches.
 */
export function pickSponsors(
  offers: ReadonlyArray<{ readonly seed: string; readonly candidates: readonly FactionKey[] }>,
  tiers: Readonly<Partial<Record<FactionKey, FactionTier>>>,
  knownLean: number,
): Array<FactionKey | null> {
  const picks = offers.map(({ seed, candidates }): FactionKey | null => {
    if (candidates.length <= 1) return candidates[0] ?? null;
    const weights = candidates.map((key) => 1 + (factionTierRank(tiers[key] ?? 'UNKNOWN') >= factionTierRank('KNOWN') ? knownLean : 0));
    let roll = unitRoll(seed) * weights.reduce((sum, weight) => sum + weight, 0);
    for (let index = 0; index < candidates.length; index += 1) {
      roll -= weights[index]!;
      if (roll < 0) return candidates[index]!;
    }
    return candidates[candidates.length - 1]!;
  });
  const sponsored = picks.filter((pick): pick is FactionKey => pick !== null);
  if (sponsored.length > 1 && new Set(sponsored).size === 1) {
    const only = sponsored[0]!;
    const index = offers.findIndex((offer) => offer.candidates.some((key) => key !== only));
    if (index >= 0) picks[index] = offers[index]!.candidates.find((key) => key !== only)!;
  }
  return picks;
}

/** 1.4.0-C. Standing a completed board contract pays its sponsor; 0 for a board that pays none. */
export function contractStanding(
  ruleset: Pick<Ruleset, 'contractSponsors' | 'factionStanding'>,
  board: SponsoredBoard | null,
): number {
  if (!board || !ruleset.factionStanding) return 0;
  return Math.max(0, Math.round(ruleset.contractSponsors?.standing[board] ?? 0));
}

/**
 * 1.4.0-D. What standing opens: a faction's information at Known, its early warnings at Trusted,
 * and its nudge at Connected. Each level keeps the ones below it.
 */
export type FactionPerkLevel = 'INFORMATION' | 'WARNINGS' | 'NUDGE';

export const FACTION_PERK_TIERS: Readonly<Record<FactionPerkLevel, FactionTier>> = {
  INFORMATION: 'KNOWN',
  WARNINGS: 'TRUSTED',
  NUDGE: 'CONNECTED',
};

/** 1.4.0-D. Whether a tier opens a perk level. */
export function factionPerkOpen(tier: FactionTier | undefined, level: FactionPerkLevel): boolean {
  return factionTierRank(tier ?? 'UNKNOWN') >= factionTierRank(FACTION_PERK_TIERS[level]);
}

export interface FactionNudge {
  factionKey: FactionKey;
  percent: number;
}

/**
 * 1.4.0-D. The nudge of a kind a player has: the faction that gives it, and its whole percent,
 * when they are Connected or above with it. Null in a ruleset without perks or below Connected.
 */
export function factionNudge(
  ruleset: Pick<Ruleset, 'factionPerks' | 'factionStanding'>,
  tiers: Readonly<Partial<Record<FactionKey, FactionTier>>>,
  kind: FactionNudgeKind,
): FactionNudge | null {
  const perks = ruleset.factionPerks;
  if (!perks || !ruleset.factionStanding) return null;
  for (const [factionKey, nudge] of Object.entries(perks.nudges) as Array<[FactionKey, { kind: FactionNudgeKind; percent: number }]>) {
    if (nudge?.kind !== kind || !factionPerkOpen(tiers[factionKey], 'NUDGE')) continue;
    return { factionKey, percent: Math.min(100, Math.max(0, Math.round(nudge.percent))) };
  }
  return null;
}

/** 1.4.0-D. A whole amount with a nudge's percent taken off, rounded to the nearest whole. */
export function nudgedAmount(amount: number, percent: number): number {
  return Math.round(amount * (100 - Math.min(100, Math.max(0, percent))) / 100);
}

/** 1.4.0-D. A cents amount with a nudge's percent taken off, rounding the saving down. */
export function nudgedCents(cents: bigint, percent: number): bigint {
  const whole = BigInt(Math.min(100, Math.max(0, Math.round(percent))));
  return cents - (cents * whole) / 100n;
}

const TOMMY_GUNS: readonly string[] = ['PISTOL', 'SHOTGUN', 'TEK9', 'AK47'];

/**
 * 1.4.0-D. The nudge a store purchase can take: Tommy's guns (never his thugs) for The Outfit,
 * and anything Pip sells for The Cartel Line. Null for every other store and item.
 */
export function storeNudgeKind(store: string, item: string): Extract<FactionNudgeKind, 'TOMMY_WEAPONS' | 'PIP_PRODUCT'> | null {
  if (store === 'TOMMY' && TOMMY_GUNS.includes(item)) return 'TOMMY_WEAPONS';
  if (store === 'PIP') return 'PIP_PRODUCT';
  return null;
}

/**
 * 1.4.0-E. The rival whose Inner Circle locks this faction's for the season, or null. Locked
 * means a rival is already at Inner Circle; the lock only matters in a ruleset that has it.
 */
export function innerCircleLockedBy(
  ruleset: Pick<Ruleset, 'factions' | 'factionStanding' | 'factionRivalry'>,
  points: Readonly<Partial<Record<FactionKey, number>>>,
  factionKey: FactionKey,
): FactionKey | null {
  const rules = ruleset.factionStanding;
  if (!rules || !ruleset.factionRivalry?.innerCircleLock) return null;
  return ruleset.factions?.[factionKey]?.rivals.find((rival) => (points[rival] ?? 0) >= rules.tiers.innerCircle) ?? null;
}

/**
 * 1.4.0-E. The most standing a player may hold with a faction: the ruleset's max, or one point
 * short of Inner Circle while a rival holds theirs. Never below what they already have, so a
 * lock never takes standing away.
 */
export function standingCap(
  ruleset: Pick<Ruleset, 'factions' | 'factionStanding' | 'factionRivalry'>,
  points: Readonly<Partial<Record<FactionKey, number>>>,
  factionKey: FactionKey,
): number {
  const rules = ruleset.factionStanding;
  if (!rules) return 0;
  if (!innerCircleLockedBy(ruleset, points, factionKey)) return rules.max;
  return Math.max(points[factionKey] ?? 0, rules.tiers.innerCircle - 1);
}

/**
 * 1.4.0-E. What a standing payment would set off: the rivals whose Inner Circles it would lock
 * (it takes this faction to Inner Circle for the first time, and they are not there yet), or
 * that it stops short because this faction is locked. Shown before the player takes the step.
 */
export function innerCirclePreview(
  ruleset: Pick<Ruleset, 'factions' | 'factionStanding' | 'factionRivalry'>,
  points: Readonly<Partial<Record<FactionKey, number>>>,
  factionKey: FactionKey,
  amount: number,
): { locks: FactionKey[]; lockedBy: FactionKey | null } {
  const rules = ruleset.factionStanding;
  if (!rules || !ruleset.factionRivalry?.innerCircleLock || amount <= 0) return { locks: [], lockedBy: null };
  const lockedBy = innerCircleLockedBy(ruleset, points, factionKey);
  const before = points[factionKey] ?? 0;
  if (lockedBy) return { locks: [], lockedBy: before + amount >= rules.tiers.innerCircle ? lockedBy : null };
  const reaches = before < rules.tiers.innerCircle && before + amount >= rules.tiers.innerCircle;
  const locks = reaches
    ? (ruleset.factions?.[factionKey]?.rivals ?? []).filter((rival) => (points[rival] ?? 0) < rules.tiers.innerCircle)
    : [];
  return { locks, lockedBy: null };
}
