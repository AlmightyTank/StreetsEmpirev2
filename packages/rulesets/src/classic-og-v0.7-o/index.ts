import { classicOgV07N } from '../classic-og-v0.7-n/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { weeklyContracts } from './weekly-contracts.js';

/**
 * Quest roadmap Phase P: rotating weekly contracts.
 *
 * 0.7-O preserves the 30 handcrafted Jobs and eight daily definitions from
 * 0.7-N, then adds six larger WEEKLY definitions. The server exposes two per
 * weekly reset window.
 */
export const classicOgV07O = {
  ...classicOgV07N,
  meta: { id: 'classic-og-v0.7-o', version: '0.7.0-O', name: 'Classic OG - Weekly Contracts' },
  questDefinitions: defineQuestCatalog({
    ...classicOgV07N.questDefinitions!,
    ...weeklyContracts,
  }),
} as const satisfies Ruleset;
