import { classicOgV07R } from '../classic-og-v0.7-r/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { allianceContracts } from './alliance-contracts.js';

/**
 * Quest roadmap Phase T: Alliance Contracts.
 *
 * 0.7-S preserves the complete 0.7-R catalog and adds four weekly contracts
 * whose progress is shared by a snapshotted alliance roster.
 */
export const classicOgV07S = {
  ...classicOgV07R,
  meta: { id: 'classic-og-v0.7-s', version: '0.7.0-S', name: 'Classic OG - Alliance Contracts' },
  questDefinitions: defineQuestCatalog({
    ...classicOgV07R.questDefinitions!,
    ...allianceContracts,
  }),
} as const satisfies Ruleset;
