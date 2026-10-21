import { classicOgV24C } from '../classic-og-v2.4-c/index.js';
import type { Ruleset } from '../types.js';

/** 2.4.0-D — standard raids consume ammo and defenders receive the free floor. */
export const classicOgV24D = {
  ...classicOgV24C,
  meta: { ...classicOgV24C.meta, id: 'classic-og-v2.4-d', version: '2.4.0-D', name: 'Classic OG - Ammo Combat' },
  ammoParts: {
    ...classicOgV24C.ammoParts!,
    combatEnabled: true,
  },
} as const satisfies Ruleset;
