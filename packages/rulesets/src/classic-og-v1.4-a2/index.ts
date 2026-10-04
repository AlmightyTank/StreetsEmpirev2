import { classicOgV14A } from '../classic-og-v1.4-a/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { moreDailyContracts } from './daily-contracts.js';
import { moreWeeklyContracts } from './weekly-contracts.js';

/**
 * 1.4.0-A2 — Contract Rotation.
 *
 * Twenty-two more daily contracts (thirty in all) and ten more weekly contracts
 * (sixteen in all). Each round deals its boards from its own shuffled deck, so a new
 * game gets a different order. Every daily contract is dealt once every ten days and
 * never twice within five; every weekly one about once every eight weeks. City boards
 * stop posting two orders in one city and avoid the last board's cities. Everything
 * else is exactly 1.4.0-A.
 */
export const classicOgV14A2 = {
  ...classicOgV14A,
  meta: { id: 'classic-og-v1.4-a2', version: '1.4.0-A2', name: 'Classic OG - Contract Rotation' },
  questDefinitions: defineQuestCatalog({
    ...classicOgV14A.questDefinitions,
    ...moreDailyContracts,
    ...moreWeeklyContracts,
  }),
  contractRotation: { perRoundDeck: true, freshCityBoards: true },
} as const satisfies Ruleset;
