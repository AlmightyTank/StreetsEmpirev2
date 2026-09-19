import { classicOgV04E } from '../classic-og-v0.4-e/index.js';
import type { Ruleset } from '../types.js';
import { cities } from './cities.js';
import { travel } from './roads.js';

/**
 * 0.5.0-A keeps 0.4.0-E balance and gives every city a character: Pip's prices
 * and supply, high-market demand and depth, police, Heat levels and the roads
 * between them. Nobody travels yet (runs are 0.5.0-B), and New York, where
 * everyone lives, is every base price and the 0.4.0-C Heat levels, so a round
 * plays exactly like 0.4.0-E.
 *
 * The scout, income and crack modifiers move here from the City table.
 */
export const classicOgV05A = {
  ...classicOgV04E,
  meta: { id: 'classic-og-v0.5-a', version: '0.5.0-A', name: 'Classic OG - Travel' },
  cities,
  travel,
} as const satisfies Ruleset;
