import { classicOgV14A } from '../classic-og-v1.4-a/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { factionJobs } from './faction-jobs.js';

const questDefinitions = defineQuestCatalog({
  ...classicOgV14A.questDefinitions,
  ...factionJobs,
});

/**
 * 1.4.0-B — Standing.
 *
 * Seasonal standing with each faction. A one-time Job pays standing only to the factions it
 * helps: the one its giver works for (or that it names), any it openly helps, and the side a
 * branch backs. Contact reputation turns into standing one for one, and each faction adds two
 * Jobs of its own, opened by standing. Tiers run Unknown, Known, Trusted, Connected, Inner
 * Circle; nothing else unlocks from them yet (D). The thresholds are first passes for
 * `qa:factions` (G) to pin. Everything else is 1.4.0-A. See docs/ROADMAP-1.4.0.md.
 */
export const classicOgV14B = {
  ...classicOgV14A,
  meta: { id: 'classic-og-v1.4-b', version: '1.4.0-B', name: 'Classic OG - Faction Standing' },
  questDefinitions,
  factionStanding: {
    tiers: { known: 25, trusted: 75, connected: 150, innerCircle: 300 },
    max: 500,
    perContactRep: 1,
  },
} as const satisfies Ruleset;
