import { classicOgV14A } from '../classic-og-v1.4-a/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { cityJobTemplates } from './city-jobs.js';
import { moreDailyContracts } from './daily-contracts.js';
import { seasonContracts } from './season-contracts.js';
import { moreWeeklyContracts } from './weekly-contracts.js';

/**
 * 1.4.0-A2 — Contract Rotation.
 *
 * Twenty-eight more daily contracts (thirty-six in all) and fourteen more weekly
 * contracts (twenty in all), including the first ones for businesses, block wars,
 * convoys, boss trips and outposts. Each round deals its boards from its own shuffled
 * deck, so a new game gets a different order: every daily is dealt once every twelve
 * days and never twice within six; every weekly once every ten weeks and never twice
 * within five. City boards stop posting two orders in one city, avoid the last
 * board's cities and add a third city job slot. A new Season board deals each round
 * three of nine round-long goals. Everything else is exactly 1.4.0-A.
 */
export const classicOgV14A2 = {
  ...classicOgV14A,
  meta: { id: 'classic-og-v1.4-a2', version: '1.4.0-A2', name: 'Classic OG - Contract Rotation' },
  questDefinitions: defineQuestCatalog({
    ...classicOgV14A.questDefinitions,
    ...moreDailyContracts,
    ...moreWeeklyContracts,
    ...cityJobTemplates,
    ...seasonContracts,
  }),
  contractRotation: { perRoundDeck: true, freshCityBoards: true, cityJobs: true },
} as const satisfies Ruleset;
