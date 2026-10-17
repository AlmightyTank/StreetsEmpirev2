import { classicOgV21B } from '../classic-og-v2.1-b/index.js';
import type { Ruleset } from '../types.js';

/** Opt-in only for newly pinned rounds. No historical gameplay powers change. */
export const classicOgV21C = {
  ...classicOgV21B,
  meta: {
    ...classicOgV21B.meta,
    id: 'classic-og-v2.1-c',
    version: '2.1.0-C',
    name: 'Classic OG - Crew Loyalty Ledger',
  },
  crewRoster: {
    ...classicOgV21B.crewRoster!,
    loyalty: { enabled: true },
  },
} satisfies Ruleset;
