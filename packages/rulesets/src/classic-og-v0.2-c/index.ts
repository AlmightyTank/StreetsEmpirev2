import { classicOgV02 } from '../classic-og-v0.2/index.js';
import type { Ruleset } from '../types.js';

/** 0.2.0-C cash raids with persistent recovery. B remains pinned separately. */
export const classicOgV02C = {
  ...classicOgV02,
  meta: { id: 'classic-og-v0.2-c', version: '0.2.0-C', name: 'Classic OG - Recovery Raids' },
  combat: {
    ...classicOgV02.combat,
    version: '0.2.0-C.1',
    wounds: { winnerFraction: 0.02, loserFraction: 0.08, maxFraction: 0.1, recoveryMinutes: 120 },
  },
} as const satisfies Ruleset;
