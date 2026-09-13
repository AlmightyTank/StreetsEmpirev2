import { classicOgV02G } from '../classic-og-v0.2-g/index.js';
import type { Ruleset } from '../types.js';

/** 0.2.0-H keeps G balance and starts the raid-form achievement/balance pass. */
export const classicOgV02H = {
  ...classicOgV02G,
  meta: { id: 'classic-og-v0.2-h', version: '0.2.0-H', name: 'Classic OG - Raid Trophies' },
  combat: {
    ...classicOgV02G.combat,
    version: '0.2.0-H.1',
  },
} as const satisfies Ruleset;
