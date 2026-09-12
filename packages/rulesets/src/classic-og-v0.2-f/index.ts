import { classicOgV02E } from '../classic-og-v0.2-e/index.js';
import type { Ruleset } from '../types.js';

/** 0.2.0-F turns the E raid-onboarding rules into the first production-facing public raid round. */
export const classicOgV02F = {
  ...classicOgV02E,
  meta: { id: 'classic-og-v0.2-f', version: '0.2.0-F', name: 'Classic OG - Public Raids' },
  round: {
    ...classicOgV02E.round,
    seededRivals: [],
  },
  combat: {
    ...classicOgV02E.combat,
    version: '0.2.0-F.1',
  },
} as const satisfies Ruleset;
