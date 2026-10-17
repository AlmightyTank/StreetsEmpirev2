import { classicOgV30A } from '../classic-og-v3.0-a/index.js';
import type { Ruleset } from '../types.js';

/** The existing alliance gains seats only for newly pinned 3.0-B rounds. */
export const classicOgV30B = {
  ...classicOgV30A,
  meta: { id: 'classic-og-v3.0-b', version: '3.0.0-B', name: 'Classic OG - Alliance Cohesion' },
  alliances: { ...classicOgV30A.alliances!, maxMembers: 15 },
} satisfies Ruleset;
