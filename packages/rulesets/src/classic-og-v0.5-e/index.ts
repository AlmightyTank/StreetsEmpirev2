import { classicOgV05D } from '../classic-og-v0.5-d/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.5.0-E puts other players on the road. A run can be tailed and hit near a city,
 * leaving it, in town or coming in, by the crews that live there and by rival runs in
 * reach at the same time. Nobody sees them coming for free: a crew recons its area for
 * turns to find runs coming near or leaving. The hit lands when a short window closes;
 * the owner is not told, and only their lookouts give them a few minutes to send backup
 * or call allies who live there. Near home the crew at home rides out on its own.
 *
 * Escorts ride armed with the best guns from home, and a bust or an arrest on the run
 * takes every one of them.
 *
 * BALANCE_APPROXIMATION, set against `runConvoySimulation`
 * (docs/TRAVEL-SIMULATION-0.5.0-E.md).
 */
export const classicOgV05E = {
  ...classicOgV05D,
  meta: { id: 'classic-og-v0.5-e', version: '0.5.0-E', name: 'Classic OG - Travel' },
  travel: {
    ...classicOgV05D.travel,
    convoys: {
      // Short enough that a run leaving town is about to get away. Nobody is told a tail
      // started: an owner only finds out through their lookouts.
      warningMinutes: 8,
      // Lookouts spot a tail in its last minutes: four at the top level, none without them.
      headsUpMinutesPerLookouts: 0.8,
      recon: { turnCost: 2, freshMinutes: 20, lookaheadMinutes: 10, lookaheadMinutesPerLookouts: 4 },
      turnCost: 8,
      rehitMinutes: 120,
      homeBackupMaxShare: 0.5,
      // Raids hold at 1.1 and 10%: a crew on its own block has the edge and fights are close to sure.
      fight: { defenseMultiplier: 1, variance: 0.3 },
      loot: {
        cashPercent: { min: 15, max: 40 },
        cargoPercent: { min: 15, max: 40 },
        cashPerAttackerCents: 25_000,
        cargoPerAttacker: 40,
        lowRiderChance: 0.3,
      },
    },
  },
} as const satisfies Ruleset;
