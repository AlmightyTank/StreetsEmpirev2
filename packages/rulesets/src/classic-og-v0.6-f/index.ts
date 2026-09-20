import { classicOgV06E } from '../classic-og-v0.6-e/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.6.0-F is the Turf release ruleset. It starts from the completed Territory
 * balance unchanged; F's remaining work is release simulation, the seeded
 * crackdown, UI/phone polish and regression coverage.
 */
export const classicOgV06F = {
  ...classicOgV06E,
  meta: { id: 'classic-og-v0.6-f', version: '0.6.0-F', name: 'Classic OG - Turf Release' },
  turf: {
    ...classicOgV06E.turf,
    crackdown: {
      // One sweep two days before the bell, announced exactly one day ahead.
      hoursBeforeRoundEnd: 48,
      warningHours: 24,
      // A held block draws attention; the sweep hurts but never deletes a corner outright.
      heatPerHeldBlock: 12,
      pickupShare: 0.2,
      maxPickedUpPerBlock: 6,
      minimumCornerSurvivors: 1,
    },
  },
} as const satisfies Ruleset;
