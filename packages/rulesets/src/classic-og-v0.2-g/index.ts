import { classicOgV02F } from '../classic-og-v0.2-f/index.js';
import type { Ruleset } from '../types.js';

/** 0.2.0-G keeps F combat balance and starts the player-facing polish/community pass. */
export const classicOgV02G = {
  ...classicOgV02F,
  meta: { id: 'classic-og-v0.2-g', version: '0.2.0-G', name: 'Classic OG - Street Polish' },
  combat: {
    ...classicOgV02F.combat,
    version: '0.2.0-G.1',
  },
} as const satisfies Ruleset;
