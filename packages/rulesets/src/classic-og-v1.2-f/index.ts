import { classicOgV12E2 } from '../classic-og-v1.2-e2/index.js';
import { questContacts } from '../quest-contacts.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { ContactCatalog, QuestCosmeticCatalog, Ruleset } from '../types.js';
import { casinoCosmetics } from './cosmetics.js';
import { casinoJobs } from './casino-jobs.js';

const contacts = {
  ...questContacts,
  ACE: {
    key: 'ACE',
    name: 'Delia “Ace” Navarro',
    shortName: 'Ace',
    role: 'Casino Host',
    description: 'Ace keeps the guest list for every casino on the circuit. She does not lend money or fix games: she decides who gets recognized, comped and let through the velvet rope.',
  },
} as const satisfies ContactCatalog;

const questDefinitions = defineQuestCatalog({
  ...classicOgV12E2.questDefinitions,
  ...casinoJobs,
});

const cosmetics = {
  ...classicOgV12E2.cosmetics,
  ...casinoCosmetics,
} as const satisfies QuestCosmeticCatalog;

/**
 * 1.2.0-F — Casino Jobs & Rewards.
 *
 * Adds Ace, the casino host, with a one-time Job chain driven by real casino play,
 * casino cosmetics, and (server-side) casino season feats that unlock titles.
 * Casino rules are exactly 1.2.0-E2's: no odds, limits, rake or comps change.
 */
export const classicOgV12F = {
  ...classicOgV12E2,
  meta: { id: 'classic-og-v1.2-f', version: '1.2.0-F', name: 'Classic OG - Casino Jobs & Rewards' },
  contacts,
  questDefinitions,
  cosmetics,
} as const satisfies Ruleset;
