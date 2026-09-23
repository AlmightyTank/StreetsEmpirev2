import { classicOgV07Q } from '../classic-og-v0.7-q/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { cityContractTemplates } from './city-contracts.js';

/**
 * Quest roadmap Phase S: Dynamic City Contracts.
 *
 * 0.7-R preserves the complete 0.7-Q catalog and adds two runtime city-board
 * slots whose city/product/target/reward are generated from live market rules.
 */
export const classicOgV07R = {
  ...classicOgV07Q,
  meta: { id: 'classic-og-v0.7-r', version: '0.7.0-R', name: 'Classic OG - Dynamic City Contracts' },
  questDefinitions: defineQuestCatalog({
    ...classicOgV07Q.questDefinitions!,
    ...cityContractTemplates,
  }),
} as const satisfies Ruleset;
