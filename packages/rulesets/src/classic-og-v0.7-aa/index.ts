import { classicOgV07Z } from '../classic-og-v0.7-z/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { holidayEvents } from './holiday-events.js';

/**
 * Phase Y-F: Holiday & Special Event Quests.
 *
 * The event jobs are layered on top of Y-E so the permanent seasonal theme
 * rewards remain compatible with the player-facing site theme catalog.
 */
export const classicOgV07AA = {
  ...classicOgV07Z,
  meta: {
    id: 'classic-og-v0.7-aa',
    version: '0.7.0-AA',
    name: 'Classic OG - Holiday Event Quests',
  },
  questDefinitions: defineQuestCatalog({
    ...classicOgV07Z.questDefinitions!,
    ...holidayEvents,
  }),
} as const satisfies Ruleset;
