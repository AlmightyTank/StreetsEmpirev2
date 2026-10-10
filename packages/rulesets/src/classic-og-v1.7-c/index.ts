import { classicOgV17B } from '../classic-og-v1.7-b/index.js';

/** 1.7.0-C — completed work advances a bounded, job-specific crew career. */
export const classicOgV17C = {
  ...classicOgV17B,
  meta: { id: 'classic-og-v1.7-c', version: '1.7.0-C', name: 'Classic OG - Crew Specialties' },
  crewRoster: {
    ...classicOgV17B.crewRoster,
    experiencePerCompletedJob: 5,
    specialtyUnlockExperience: 20,
    specialtyTierTwoExperience: 100,
    specialtyBonusPercent: { tierOne: 2, tierTwo: 5, cap: 5 },
  },
} as const;
