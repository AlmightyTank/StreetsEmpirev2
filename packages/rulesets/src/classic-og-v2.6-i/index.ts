import { classicOgV26H } from '../classic-og-v2.6-h/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { Ruleset } from '../types.js';
import { campaignOnlyStories } from './campaign-only-stories.js';

/**
 * 2.6.0-I. The Missing Line is the only story: older story and side jobs are retired from new
 * rounds and their permanent unlocks move onto campaign chapters. Boards, events and secrets stay.
 */
export const classicOgV26I = {
  ...classicOgV26H,
  meta: { ...classicOgV26H.meta, id: 'classic-og-v2.6-i', version: '2.6.0-I', name: 'Classic OG - The Missing Line' },
  questDefinitions: defineQuestCatalog(campaignOnlyStories),
} as const satisfies Ruleset;
