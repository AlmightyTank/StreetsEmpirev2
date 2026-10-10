import { classicOgV165E2 } from '../classic-og-v1.6.5-e2/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.6.5-G — Balance, Mobile & Release.
 *
 * This is the release snapshot after the loan collection and guided campaign work.
 * The slice validates the complete loop and intentionally changes no gameplay values.
 */
export const classicOgV165G = {
  ...classicOgV165E2,
  meta: { id: 'classic-og-v1.6.5-g', version: '1.6.5-G', name: 'Classic OG - Loan Shark Release' },
} as const satisfies Ruleset;
