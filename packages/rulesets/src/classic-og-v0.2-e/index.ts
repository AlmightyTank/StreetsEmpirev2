import { classicOgV02D } from '../classic-og-v0.2-d/index.js';
import type { Ruleset } from '../types.js';

/** 0.2.0-E makes local raid testing self-contained with seeded rivals. */
export const classicOgV02E = {
  ...classicOgV02D,
  meta: { id: 'classic-og-v0.2-e', version: '0.2.0-E', name: 'Classic OG - Testable Raids' },
  round: {
    ...classicOgV02D.round,
    seededRivals: [
      {
        slug: 'razor-ray',
        displayName: 'Razor Ray',
        publicPimpId: 1000,
        note: 'Even match with starter weapons. Good first raid target.',
        startingPlayer: { cashCents: 3_000_000, thugs: 10, pistols: 10, beer: 10, medicine: 2 },
      },
      {
        slug: 'cashbox-carlo',
        displayName: 'Cashbox Carlo',
        publicPimpId: 1001,
        note: 'Cash-heavy crew with lighter muscle. Good recon target.',
        startingPlayer: { cashCents: 6_000_000, thugs: 8, pistols: 8, beer: 8, medicine: 4 },
      },
      {
        slug: 'iron-maya',
        displayName: 'Iron Maya',
        publicPimpId: 1002,
        note: 'Stronger defender for testing losses, wounds and recovery.',
        startingPlayer: { cashCents: 4_000_000, thugs: 16, pistols: 16, beer: 16, medicine: 8 },
      },
    ],
  },
} as const satisfies Ruleset;
