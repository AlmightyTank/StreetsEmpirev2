import type { ContactKey, Ruleset } from './types.js';

/**
 * 1.4.0-A. What is wrong with a ruleset's factions, as readable lines; empty when sound.
 *
 * Every contact that gives Jobs works for a faction in the catalog or says why it is
 * independent (never both), every rivalry is listed on both sides, and no faction is its
 * own rival. Rulesets without factions have nothing to check.
 */
export function factionProblems(ruleset: Pick<Ruleset, 'factions' | 'contacts' | 'questDefinitions'>): string[] {
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
  for (const contact of Object.values(ruleset.contacts ?? {})) {
    if (!contact) continue;
    if (contact.factionKey && contact.independent) problems.push(`${contact.shortName} has a faction and an independent reason.`);
    if (contact.factionKey && !keys.has(contact.factionKey)) problems.push(`${contact.shortName} works for unknown faction ${contact.factionKey}.`);
    if (givers.has(contact.key) && !contact.factionKey && !contact.independent) problems.push(`${contact.shortName} gives Jobs but has no faction and no independent reason.`);
  }

  for (const faction of Object.values(factions)) {
    if (!faction) continue;
    const faces = Object.values(ruleset.contacts ?? {}).filter((contact) => contact?.factionKey === faction.key);
    if (!faces.length && !faction.facesNote) problems.push(`${faction.name} has no contact and no faces note.`);
  }
  return problems;
}
