import { classicOgV07I } from '../classic-og-v0.7-i/index.js';
import type { Ruleset } from '../types.js';
import { favorCatalog } from './favors.js';

/**
 * Quest roadmap Phase K: timed favor activation and live effects.
 *
 * One timed favor may be active in each STREET / UNDERWORLD / MUSCLE category.
 * Timers are real server time and continue while the player is offline.
 */
export const classicOgV07J = {
  ...classicOgV07I,
  meta: { id: 'classic-og-v0.7-j', version: '0.7.0-J', name: 'Classic OG - Timed Favors' },
  favors: favorCatalog,
} as const satisfies Ruleset;
