import { classicOgV13E } from '../classic-og-v1.3-e/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { ContactCatalog, QuestCosmeticCatalog, Ruleset } from '../types.js';
import { lawCosmetics } from './cosmetics.js';
import { lawJobs } from './law-jobs.js';

const contacts = {
  ...classicOgV13E.contacts,
  LEDGER: {
    key: 'LEDGER',
    name: 'Marisol “Ledger” Pike',
    shortName: 'Ledger',
    role: 'Retired Records Sergeant',
    description: 'Ledger kept the precinct’s case files for twenty-two years and never took an envelope. Now she explains to anyone buying the coffee how a file gets built, so they stop building their own.',
  },
} as const satisfies ContactCatalog;

const questDefinitions = defineQuestCatalog({
  ...classicOgV13E.questDefinitions,
  ...lawJobs,
});

const cosmetics = {
  ...classicOgV13E.cosmetics,
  ...lawCosmetics,
} as const satisfies QuestCosmeticCatalog;

/**
 * 1.3.0-F — Jobs, Feats & Titles.
 *
 * Adds Ledger, a retired records sergeant, with a one-time Job chain driven by the law
 * system working normally, law cosmetics, and (server-side) clean-record season feats that
 * unlock titles. The law block is exactly 1.3.0-E's: no Case, warrant or official number
 * changes. See docs/ROADMAP-1.3.0.md.
 */
export const classicOgV13F = {
  ...classicOgV13E,
  meta: { id: 'classic-og-v1.3-f', version: '1.3.0-F', name: 'Classic OG - Jobs, Feats & Titles' },
  contacts,
  questDefinitions,
  cosmetics,
} as const satisfies Ruleset;
