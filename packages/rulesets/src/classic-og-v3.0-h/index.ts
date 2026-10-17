import { classicOgV30G } from '../classic-og-v3.0-g/index.js';
import type { Ruleset } from '../types.js';

/** Opt-in only for newly pinned rounds. No historical gameplay powers change. */
export const classicOgV30H = {
  ...classicOgV30G,
  meta: {
    ...classicOgV30G.meta,
    id: 'classic-og-v3.0-h',
    version: '3.0.0-H',
    name: 'Classic OG - Crew Loyalty Ledger',
  },
  crewRoster: {
    ...classicOgV30G.crewRoster!,
    loyalty: { enabled: true },
  },
} satisfies Ruleset;
