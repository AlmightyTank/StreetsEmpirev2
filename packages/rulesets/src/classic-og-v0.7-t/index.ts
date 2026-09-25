import { classicOgV07S } from '../classic-og-v0.7-s/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { communityEvents } from './community-events.js';

/**
 * Quest roadmap Phase U: Community / Seasonal Events.
 *
 * 0.7-T preserves Phase T and adds four round-wide event jobs, one for each
 * quarter of the season.
 */
export const classicOgV07T = {
  ...classicOgV07S,
  meta: { id: 'classic-og-v0.7-t', version: '0.7.0-T', name: 'Classic OG - Community Events' },
  questDefinitions: defineQuestCatalog({
    ...classicOgV07S.questDefinitions!,
    ...communityEvents,
  }),
} as const satisfies Ruleset;
