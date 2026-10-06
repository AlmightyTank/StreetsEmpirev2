import type { ContactKey, FactionKey, FactionNudgeKind, QuestBranchDefinition, QuestDefinition, Ruleset, SponsoredBoard } from './types.js';

type FactionView = Pick<Ruleset, 'factions' | 'contacts'>;

const TIERS = ['KNOWN', 'TRUSTED', 'CONNECTED', 'INNER_CIRCLE'];

/** 1.4.0-D. The nudges a faction can give at Connected. */
export const FACTION_NUDGE_KINDS: readonly FactionNudgeKind[] = ['CORNER_UPKEEP', 'TOMMY_WEAPONS', 'BODYGUARD_TICKETS', 'PIP_PRODUCT', 'OFFICIAL_EXPOSURE'];

/** 1.4.0-D. No faction nudge may take off more than this share, in whole percent. */
export const FACTION_NUDGE_CAP_PERCENT = 10;

/** The faction a contact works for, if any. */
export function contactFaction(ruleset: FactionView, contactKey: string | null | undefined): FactionKey | undefined {
  return contactKey ? ruleset.contacts?.[contactKey as ContactKey]?.factionKey : undefined;
}

/**
 * 1.4.0-B. The faction a Job works for: the one it names, else its giver's. Independent givers
 * and giverless Jobs that name none work for nobody.
 */
export function jobFaction(ruleset: FactionView, definition: Pick<QuestDefinition, 'contactKey' | 'factionKey'>): FactionKey | undefined {
  return definition.factionKey ?? contactFaction(ruleset, definition.contactKey);
}

/**
 * 1.4.0-B. Every faction a Job helps, and so the only factions it can pay standing: the one it
 * works for, the ones it openly helps, and the side a chosen branch backs (a contact the branch
 * gains reputation with). Rep paid to anyone else's contact earns their faction nothing.
 */
export function jobHelpedFactions(
  ruleset: FactionView,
  definition: Pick<QuestDefinition, 'contactKey' | 'factionKey' | 'helps'>,
  branch?: Pick<QuestBranchDefinition, 'reputationDeltas'> | null,
): Set<FactionKey> {
  const helped = new Set<FactionKey>();
  const own = jobFaction(ruleset, definition);
  if (own) helped.add(own);
  for (const key of definition.helps ?? []) helped.add(key);
  for (const delta of branch?.reputationDeltas ?? []) {
    const side = delta.amount > 0 ? contactFaction(ruleset, delta.contactKey) : undefined;
    if (side) helped.add(side);
  }
  return helped;
}

const SPONSORED_BOARDS: readonly SponsoredBoard[] = ['DAILY', 'WEEKLY', 'CITY_CONTRACT', 'SEASON', 'ALLIANCE'];

/** 1.4.0-C. The board a contract is dealt on, or null for a Job. */
export function contractBoard(definition: Pick<QuestDefinition, 'type'>): SponsoredBoard | null {
  return (SPONSORED_BOARDS as readonly string[]).includes(definition.type) ? definition.type as SponsoredBoard : null;
}

/** 1.4.0-C. The lane a contract's work is in: its category, or a city contract's kind. */
export function contractLane(definition: Pick<QuestDefinition, 'category'>, cityKind?: string | null): string {
  return cityKind ? `CITY_${cityKind}` : definition.category;
}

/**
 * 1.4.0-C. Who may sponsor a board contract: its giver's faction, else the factions of its lane.
 * Empty for a Job, a ruleset without sponsors, or work no faction does (casino, law).
 */
export function sponsorCandidates(
  ruleset: Pick<Ruleset, 'factions' | 'contacts' | 'contractSponsors'>,
  definition: Pick<QuestDefinition, 'type' | 'category' | 'contactKey'>,
  cityKind?: string | null,
): FactionKey[] {
  const rules = ruleset.contractSponsors;
  const board = contractBoard(definition);
  if (!rules || !board || !rules.standing[board]) return [];
  const giver = contactFaction(ruleset, definition.contactKey);
  if (giver) return [giver];
  return [...(rules.lanes[contractLane(definition, cityKind)] ?? [])];
}

/**
 * 1.4.0-A. What is wrong with a ruleset's factions, as readable lines; empty when sound.
 *
 * Every contact that gives Jobs is in the contact catalog and works for a faction in the
 * catalog or says why it is independent (never both), every rivalry is listed on both sides,
 * and no faction is its own rival. Rulesets without factions have nothing to check.
 */
export function factionProblems(ruleset: Pick<Ruleset, 'factions' | 'contacts' | 'questDefinitions'> & Partial<Pick<Ruleset, 'contractSponsors' | 'factionPerks' | 'factionStanding' | 'factionPublic' | 'cosmetics'>>): string[] {
  const factions = ruleset.factions;
  if (!factions) return [];
  const problems: string[] = [];
  const keys = new Set(Object.keys(factions));

  for (const [key, faction] of Object.entries(factions)) {
    if (!faction) continue;
    if (faction.key !== key) problems.push(`Faction ${key} is keyed as ${faction.key}.`);
    for (const rival of faction.rivals) {
      if (rival === faction.key) problems.push(`${faction.name} is its own rival.`);
      else if (!keys.has(rival)) problems.push(`${faction.name} names an unknown rival ${rival}.`);
      else if (!factions[rival]?.rivals.includes(faction.key)) problems.push(`${faction.name} lists ${rival} as a rival, but not the other way round.`);
    }
  }

  const givers = new Set(Object.values(ruleset.questDefinitions ?? {}).map((definition) => definition.contactKey).filter(Boolean) as ContactKey[]);
  for (const giver of givers) {
    if (!ruleset.contacts?.[giver]) problems.push(`Jobs name contact ${giver}, who is missing from the contact catalog.`);
  }
  for (const contact of Object.values(ruleset.contacts ?? {})) {
    if (!contact) continue;
    if (contact.factionKey && contact.independent) problems.push(`${contact.shortName} has a faction and an independent reason.`);
    if (contact.factionKey && !keys.has(contact.factionKey)) problems.push(`${contact.shortName} works for unknown faction ${contact.factionKey}.`);
    if (givers.has(contact.key) && !contact.factionKey && !contact.independent) problems.push(`${contact.shortName} gives Jobs but has no faction and no independent reason.`);
  }

  // 1.4.0-B: a Job pays standing only to the factions it helps, so it never pays reputation to
  // another faction's contact either, unless it says it helps them too.
  for (const job of Object.values(ruleset.questDefinitions ?? {})) {
    const giver = contactFaction(ruleset, job.contactKey);
    const own = jobFaction(ruleset, job);
    if (job.factionKey && !keys.has(job.factionKey)) problems.push(`${job.key} works for unknown faction ${job.factionKey}.`);
    if (job.factionKey && giver && job.factionKey !== giver) problems.push(`${job.key} works for ${job.factionKey}, but its giver works for ${giver}.`);
    if (job.factionKey && job.contactKey && !giver) problems.push(`${job.key} names a faction, but its giver is independent.`);
    // 1.4.0-E: an introduction is a broker's Job, paid by its claim, open only below Known.
    if (job.introduces) {
      if (!keys.has(job.introduces)) problems.push(`${job.key} introduces unknown faction ${job.introduces}.`);
      if (giver || job.factionKey || job.helps?.length) problems.push(`${job.key} introduces ${job.introduces}, so it has to come from an independent broker who works for no one.`);
      if (job.repeatability !== 'ONCE') problems.push(`${job.key} introduces ${job.introduces}, so it has to be one-time.`);
      if (job.rewards.some((reward) => reward.kind === 'FACTION_STANDING' || reward.kind === 'CONTACT_REP')) problems.push(`${job.key} is an introduction and pays standing through its claim, never as a reward.`);
      const below = job.prerequisites.some((prerequisite) => prerequisite.kind === 'FACTION_STANDING_BELOW'
        && prerequisite.params?.factionKey === job.introduces && prerequisite.params?.tier === 'KNOWN');
      if (!below) problems.push(`${job.key} introduces ${job.introduces}, so it needs FACTION_STANDING_BELOW Known with it.`);
    }
    if (job.fee && (!(job.fee.netWorthShare >= 0 && job.fee.netWorthShare < 1) || !Number.isSafeInteger(job.fee.minCents) || job.fee.minCents <= 0)) {
      problems.push(`${job.key} has a fee that is not a share of net worth below 1 with a positive whole floor.`);
    }
    // 1.4.0-E: a capstone at Inner Circle pays standing and cosmetics, never cash or power.
    const capstone = job.prerequisites.some((prerequisite) => prerequisite.kind === 'FACTION_STANDING_AT_LEAST' && prerequisite.params?.tier === 'INNER_CIRCLE');
    if (capstone) {
      const paid = job.rewards.filter((reward) => reward.kind !== 'FACTION_STANDING' && reward.kind !== 'COSMETIC_UNLOCK');
      if (paid.length) problems.push(`${job.key} is an Inner Circle capstone, so it pays only standing and cosmetics, not ${paid.map((reward) => reward.kind).join(', ')}.`);
      if (job.repeatability !== 'ONCE') problems.push(`${job.key} is an Inner Circle capstone, so it has to be one-time.`);
    }
    for (const helped of job.helps ?? []) {
      if (!keys.has(helped)) problems.push(`${job.key} helps unknown faction ${helped}.`);
      else if (!own) problems.push(`${job.key} helps ${helped} without working for a faction itself.`);
      else if (helped === own) problems.push(`${job.key} lists its own faction under helps.`);
      else if (factions[own]?.rivals.includes(helped)) problems.push(`${job.key} helps ${helped}, a rival of ${own}.`);
    }
    const helped = jobHelpedFactions(ruleset, job);
    for (const reward of job.rewards) {
      const paid = reward.kind === 'CONTACT_REP' ? contactFaction(ruleset, reward.key)
        : reward.kind === 'FACTION_STANDING' ? reward.key as FactionKey
          : undefined;
      if (reward.kind === 'FACTION_STANDING' && !keys.has(reward.key ?? '')) problems.push(`${job.key} pays standing with unknown faction ${reward.key}.`);
      else if (paid && !helped.has(paid)) problems.push(`${job.key} pays ${reward.kind === 'CONTACT_REP' ? `${reward.key}'s reputation` : 'standing'} for ${paid}, a faction it does not help.`);
    }
    for (const prerequisite of job.prerequisites) {
      if (prerequisite.kind !== 'FACTION_STANDING_AT_LEAST' && prerequisite.kind !== 'FACTION_STANDING_BELOW') continue;
      if (!keys.has(String(prerequisite.params?.factionKey))) problems.push(`${job.key} needs standing with unknown faction ${String(prerequisite.params?.factionKey)}.`);
      if (!TIERS.includes(String(prerequisite.params?.tier))) problems.push(`${job.key} needs an unknown standing tier ${String(prerequisite.params?.tier)}.`);
    }
  }

  // 1.4.0-C: sponsors name real factions and pay a positive whole standing.
  const sponsors = ruleset.contractSponsors;
  if (sponsors) {
    for (const [board, amount] of Object.entries(sponsors.standing)) {
      if (!(SPONSORED_BOARDS as readonly string[]).includes(board)) problems.push(`Sponsored standing names unknown board ${board}.`);
      if (!Number.isSafeInteger(amount) || (amount ?? 0) <= 0) problems.push(`Sponsored ${board} standing must be a positive whole number.`);
    }
    for (const [lane, candidates] of Object.entries(sponsors.lanes)) {
      if (!candidates.length) problems.push(`Sponsor lane ${lane} names no faction; leave it out instead.`);
      if (new Set(candidates).size !== candidates.length) problems.push(`Sponsor lane ${lane} names a faction twice.`);
      for (const candidate of candidates) if (!keys.has(candidate)) problems.push(`Sponsor lane ${lane} names unknown faction ${candidate}.`);
    }
    if (!(sponsors.knownLean >= 0)) problems.push('The sponsor lean must not be negative.');
  }

  // 1.4.0-D: every nudge is small, capped, whole, and one per kind; warnings look ahead sanely.
  const perks = ruleset.factionPerks;
  if (perks) {
    if (!ruleset.factionStanding) problems.push('Faction perks need faction standing.');
    const kinds = new Set<string>();
    for (const [key, nudge] of Object.entries(perks.nudges)) {
      if (!nudge) continue;
      if (!keys.has(key)) problems.push(`Nudge names unknown faction ${key}.`);
      if (!(FACTION_NUDGE_KINDS as readonly string[]).includes(nudge.kind)) problems.push(`${key} has an unknown nudge ${nudge.kind}.`);
      if (kinds.has(nudge.kind)) problems.push(`Two factions share the ${nudge.kind} nudge.`);
      kinds.add(nudge.kind);
      if (!Number.isSafeInteger(nudge.percent) || nudge.percent <= 0 || nudge.percent > FACTION_NUDGE_CAP_PERCENT) {
        problems.push(`${key}'s nudge must be a whole percent from 1 to ${FACTION_NUDGE_CAP_PERCENT}.`);
      }
    }
    const warnings = perks.warnings;
    for (const [name, value] of Object.entries({ cornerLeadHours: warnings.cornerLeadHours, sweepLeadHours: warnings.sweepLeadHours, supplyLeadHours: warnings.supplyLeadHours, stageLeadPoints: warnings.stageLeadPoints })) {
      if (!(value > 0) || value > 72) problems.push(`Warning ${name} must be above 0 and at most 72.`);
    }
    if (!(warnings.hotRoadChance > 0 && warnings.hotRoadChance < 1)) problems.push('A hot road must be a stop chance between 0 and 1.');
  }

  // 1.4.0-F: tier cosmetics are real cosmetics, for real factions, and nothing else.
  const publicRules = ruleset.factionPublic;
  if (publicRules) {
    if (!ruleset.factionStanding) problems.push('Faction cosmetics and alignment need faction standing.');
    for (const [tier, byFaction] of Object.entries(publicRules.rewards)) {
      for (const [key, cosmetics] of Object.entries(byFaction ?? {})) {
        if (!keys.has(key)) problems.push(`${tier} cosmetics name unknown faction ${key}.`);
        for (const cosmetic of cosmetics ?? []) {
          if (!ruleset.cosmetics?.[cosmetic]) problems.push(`${key}'s ${tier} cosmetic ${cosmetic} is missing from the cosmetics catalog.`);
        }
      }
    }
  }

  for (const faction of Object.values(factions)) {
    if (!faction) continue;
    const faces = Object.values(ruleset.contacts ?? {}).filter((contact) => contact?.factionKey === faction.key);
    if (!faces.length && !faction.facesNote) problems.push(`${faction.name} has no contact and no faces note.`);
  }
  return problems;
}
