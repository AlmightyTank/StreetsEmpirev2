import { classicOgV24E } from '../classic-og-v2.4-e/index.js';
import type { Ruleset } from '../types.js';

/** 2.4.0-F — territory ammo/parts flows, low-stock notices, and staged beta rollout. */
export const classicOgV24F = {
  ...classicOgV24E,
  meta: { ...classicOgV24E.meta, id: 'classic-og-v2.4-f', version: '2.4.0-F', name: 'Classic OG - Ammo & Parts Economy' },
  ammoParts: {
    ...classicOgV24E.ammoParts!,
    lowAmmoNotificationsEnabled: true,
    territoryYieldsEnabled: true,
  },
} as const satisfies Ruleset;
