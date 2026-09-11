import { classicOgV02C } from '../classic-og-v0.2-c/index.js';
import type { Ruleset } from '../types.js';

/** 0.2.0-D adds recon and revenge windows on top of recovery raids. */
export const classicOgV02D = {
  ...classicOgV02C,
  meta: { id: 'classic-og-v0.2-d', version: '0.2.0-D', name: 'Classic OG - Strategy Raids' },
  round: {
    ...classicOgV02C.round,
    startingPlayer: {
      ...classicOgV02C.round.startingPlayer,
      cashCents: 2_000_000,
      thugs: 10,
      pistols: 10,
      beer: 10,
      medicine: 5,
    },
  },
  combat: {
    ...classicOgV02C.combat,
    version: '0.2.0-D.1',
    newcomerHours: 0,
    strategy: {
      intel: { turnCost: 2, expiresMinutes: 60 },
      retaliation: { revengeHours: 24, bypassProtection: true, bypassMinimumStrength: true },
    },
  },
} as const satisfies Ruleset;
