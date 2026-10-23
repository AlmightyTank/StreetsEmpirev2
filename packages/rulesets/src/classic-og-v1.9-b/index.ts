import { classicOgV19A } from '../classic-og-v1.9-a/index.js';
import type { Ruleset } from '../types.js';

/** The existing alliance gains seats only for newly pinned 1.9.0-B rounds. */
export const classicOgV19B = {
  ...classicOgV19A,
  meta: { id: 'classic-og-v1.9-b', version: '1.9.0-B', name: 'Classic OG - Alliance Cohesion' },
  alliances: { ...classicOgV19A.alliances!, maxMembers: 15 },
} satisfies Ruleset;
