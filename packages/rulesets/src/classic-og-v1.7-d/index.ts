import { classicOgV17C } from '../classic-og-v1.7-c/index.js';

/** 1.7.0-D — assignment controls and bounded paid specialty training. */
export const classicOgV17D = {
  ...classicOgV17C,
  meta: { id: 'classic-og-v1.7-d', version: '1.7.0-D', name: 'Classic OG - Crew Management' },
  crewRoster: {
    ...classicOgV17C.crewRoster,
    training: { turnCost: 1, cashCostCents: 5_000_00, experience: 5, earnedExperienceRatioPercent: 25 },
  },
} as const;
