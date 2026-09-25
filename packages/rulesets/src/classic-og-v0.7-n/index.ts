import { classicOgV07M } from '../classic-og-v0.7-m/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { dailyContracts } from './daily-contracts.js';

/**
 * Quest roadmap Phase O: rotating daily contracts.
 *
 * The 30 handcrafted Jobs remain unchanged. Eight lightweight DAILY definitions
 * form the rotation pool; the server exposes three per daily reset window.
 */
export const classicOgV07N = {
  ...classicOgV07M,
  meta: { id: 'classic-og-v0.7-n', version: '0.7.0-N', name: 'Classic OG - Daily Contracts' },
  questDefinitions: defineQuestCatalog({
    ...classicOgV07M.questDefinitions!,
    ...dailyContracts,
  }),
} as const satisfies Ruleset;
