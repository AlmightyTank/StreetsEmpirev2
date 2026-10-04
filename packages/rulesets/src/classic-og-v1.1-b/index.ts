import { classicOgV11A } from '../classic-og-v1.1-a/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.1.0-B turns A's lots into businesses a crew can build, staff and collect from at
 * home. Business balance stays exactly where A's simulation put it. B also treats corner
 * crews the way it treats business staff: still the crew, never working, defending or
 * cooking, but able to desert when the crew is unhappy and to be lured off in a raid.
 * Rackets (C), block wars and fatigue (D) and outpost businesses (E) follow.
 */
export const classicOgV11B = {
  ...classicOgV11A,
  meta: { id: 'classic-og-v1.1-b', version: '1.1.0-B', name: 'Classic OG - Business Building' },
  turf: {
    ...classicOgV11A.turf,
    corner: { ...classicOgV11A.turf.corner, desertTurnsPerHour: 5 },
  },
  business: { ...classicOgV11A.business, building: true },
} as const satisfies Ruleset;
