import { classicOgV12F } from '../classic-og-v1.2-f/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.3.0-A — Case Foundation.
 *
 * Each city's police start keeping a Case on the players who draw Heat there. A tenth
 * of the Heat drawn in a city becomes Case in that city, and the Case reads as a stage
 * on the Wanted ladder. Nothing reads the Case yet: Heat, busts, arrests, bribes and
 * every 1.2.0-F rule are unchanged. See docs/ROADMAP-1.3.0.md.
 */
export const classicOgV13A = {
  ...classicOgV12F,
  meta: { id: 'classic-og-v1.3-a', version: '1.3.0-A', name: 'Classic OG - Case Foundation' },
  law: {
    caseMax: 100,
    stages: { noticed: 20, investigation: 40, warrant: 65, federal: 85 },
    heatToCase: 0.1,
  },
} as const satisfies Ruleset;
