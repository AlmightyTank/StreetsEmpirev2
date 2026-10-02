import { classicOgV11E } from '../classic-og-v1.1-e/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.1.0-F is the Businesses release ruleset. Balance from E stays pinned;
 * F adds release gating and makes the existing federal turf crackdown hit
 * active rackets harder without creating a second law-enforcement system.
 */
export const classicOgV11F = {
  ...classicOgV11E,
  meta: { id: 'classic-og-v1.1-f', version: '1.1.0-F', name: 'Classic OG - Business Release' },
  business: {
    ...classicOgV11E.business,
    crackdown: {
      activeRacketHeatPerBusiness: 8,
      registerSeizureShare: 0.25,
    },
  },
} as const satisfies Ruleset;
