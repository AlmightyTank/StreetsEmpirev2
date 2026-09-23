import { classicOgV07T } from '../classic-og-v0.7-t/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { hardenedAllianceContracts } from './alliance-contracts.js';

/**
 * Quest roadmap Phase W: Balance & Anti-Abuse.
 *
 * 0.7-U preserves the Phase U catalog while hardening shared alliance rewards
 * with small personal contribution floors. Older 0.7-T rounds remain pinned to
 * their original behavior.
 */
export const classicOgV07U = {
  ...classicOgV07T,
  meta: { id: 'classic-og-v0.7-u', version: '0.7.0-U', name: 'Classic OG - Quest Hardening' },
  questDefinitions: defineQuestCatalog({
    ...classicOgV07T.questDefinitions!,
    ...hardenedAllianceContracts,
  }),
} as const satisfies Ruleset;
