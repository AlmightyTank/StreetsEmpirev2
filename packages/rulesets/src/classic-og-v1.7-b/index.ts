import { classicOgV17A } from '../classic-og-v1.7-a/index.js';

/**
 * 1.7.0-B — Profiles, Traits & History.
 * Crew profiles are presentation and career-history additions; there are no gameplay changes.
 */
export const classicOgV17B = {
  ...classicOgV17A,
  meta: { id: 'classic-og-v1.7-b', version: '1.7.0-B', name: 'Classic OG - Crew Careers' },
} as const;
