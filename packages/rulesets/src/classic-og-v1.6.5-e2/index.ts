import { classicOgV165E } from '../classic-og-v1.6.5-e/index.js';
import type { Ruleset } from '../types.js';
import { guidedCampaignQuests } from './guided-campaign.js';

/** 1.6.0-H2 — a complete opening tour with optional specialties afterward. */
export const classicOgV165E2 = {
  ...classicOgV165E,
  meta: { id: 'classic-og-v1.6.5-e2', version: '1.6.5-E2', name: 'Classic OG - Guided Empire' },
  questDefinitions: guidedCampaignQuests,
} as const satisfies Ruleset;
