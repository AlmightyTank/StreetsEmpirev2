import { classicOgV16H } from '../classic-og-v1.6-h/index.js';
import type { Ruleset } from '../types.js';
import { guidedCampaignQuests } from './guided-campaign.js';

/** 1.6.0-H2 — a complete opening tour with optional specialties afterward. */
export const classicOgV16H2 = {
  ...classicOgV16H,
  meta: { id: 'classic-og-v1.6-h2', version: '1.6.0-H2', name: 'Classic OG - Guided Empire' },
  questDefinitions: guidedCampaignQuests,
} as const satisfies Ruleset;
