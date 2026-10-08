import { classicOgV15D } from '../classic-og-v1.5-d/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.5.0-E — Vehicles Release.
 *
 * The release ruleset for 1.5, with one balance change. `qa:vehicles` found the Sedan the
 * favourite in every run scenario and 5.2% ahead on a hot road: on a profitable route, carrying
 * less is no cost (bring another Sedan), so its low profile made it the automatic way past
 * Heat. Its edge is trimmed from 10% to 5% lower route risk; every other value is 1.5.0-D's.
 * See docs/ROADMAP-1.5.0.md.
 */
export const classicOgV15E = {
  ...classicOgV15D,
  meta: { id: 'classic-og-v1.5-e', version: '1.5.0-E', name: 'Classic OG - Vehicles Release' },
  vehicleCatalog: {
    ...classicOgV15D.vehicleCatalog,
    routeRisk: { LOW_PROFILE: 0.95, HIGH_VISIBILITY: 1.15 },
  },
} as const satisfies Ruleset;
