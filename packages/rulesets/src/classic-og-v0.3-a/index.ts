import { classicOgV02H } from '../classic-og-v0.2-h/index.js';
import type { Ruleset } from '../types.js';

/** 0.3.0-A keeps 0.2.0-H balance and adds server-side season endings. */
export const classicOgV03A = {
  ...classicOgV02H,
  meta: { id: 'classic-og-v0.3-a', version: '0.3.0-A', name: 'Classic OG - Season End' },
  hideout: {
    rooms: {
      SAFE_ROOM: {
        name: 'Safe Room',
        blurb: 'Lock away a bigger cash floor before rivals can touch it.',
        maxLevel: 5,
        costsCents: [50_000, 150_000, 400_000, 1_000_000, 2_500_000],
      },
      LOOKOUTS: {
        name: 'Lookouts',
        blurb: 'Pay eyes on the corners for a small home-defense edge.',
        maxLevel: 5,
        costsCents: [75_000, 225_000, 600_000, 1_500_000, 3_750_000],
      },
      WORKSHOP: {
        name: 'Workshop',
        blurb: 'Better tables and burners squeeze a little more product out of cooks.',
        maxLevel: 5,
        costsCents: [100_000, 300_000, 800_000, 2_000_000, 5_000_000],
      },
      BACK_OFFICE: {
        name: 'Back Office',
        blurb: 'Cleaner books and tighter collections add a small bump to your take.',
        maxLevel: 5,
        costsCents: [125_000, 375_000, 1_000_000, 2_500_000, 6_250_000],
      },
    },
    buffs: {
      safeRoomProtectedCashCentsPerLevel: 100_000,
      lookoutsDefenseBonusPercentPerLevel: 2,
      workshopCrackBonusPercentPerLevel: 3,
      backOfficeTakeBonusPercentPerLevel: 2,
    },
  },
} as const satisfies Ruleset;
