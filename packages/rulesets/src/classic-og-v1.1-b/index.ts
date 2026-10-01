import { classicOgV11A } from '../classic-og-v1.1-a/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.1.0-B turns A's lots into businesses a crew can build, staff and collect from at
 * home. Balance stays exactly where A's simulation put it; this stage only enables
 * building. Rackets (C), block wars and fatigue (D) and outpost businesses (E) follow.
 */
export const classicOgV11B = {
  ...classicOgV11A,
  meta: { id: 'classic-og-v1.1-b', version: '1.1.0-B', name: 'Classic OG - Business Building' },
  business: { ...classicOgV11A.business, building: true },
} as const satisfies Ruleset;
