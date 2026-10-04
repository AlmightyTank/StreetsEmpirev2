import { classicOgV14A } from '../classic-og-v1.4-a/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.4.0-B — Standing.
 *
 * Seasonal standing with each faction, earned from the one-time Jobs of the contacts who work
 * for it: a Job that pays a contact reputation pays their faction the same in standing. Tiers
 * run Unknown, Known, Trusted, Connected, Inner Circle; nothing unlocks from them yet (D). The
 * thresholds are first passes for `qa:factions` (G) to pin. Everything else is 1.4.0-A.
 * See docs/ROADMAP-1.4.0.md.
 */
export const classicOgV14B = {
  ...classicOgV14A,
  meta: { id: 'classic-og-v1.4-b', version: '1.4.0-B', name: 'Classic OG - Faction Standing' },
  factionStanding: {
    tiers: { known: 25, trusted: 75, connected: 150, innerCircle: 300 },
    max: 500,
    perContactRep: 1,
  },
} as const satisfies Ruleset;
