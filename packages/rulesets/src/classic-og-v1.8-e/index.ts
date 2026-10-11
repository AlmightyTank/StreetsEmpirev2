import { classicOgV17E } from '../classic-og-v1.7-e/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.8.0-E — Pregame Sportsbook. Pins the sportsbook and its game-cash limits on top of 1.7.0-E
 * and changes nothing else. A round on an earlier ruleset has no `casino.sportsbook`, so it takes
 * no new tickets; tickets it already holds still settle and stay visible.
 *
 * Limits are the values tuned in docs/SPORTSBOOK-SIMULATION-1.8.0-D.md (`npm run qa:sportsbook`).
 */
export const classicOgV18E = {
  ...classicOgV17E,
  meta: { id: 'classic-og-v1.8-e', version: '1.8.0-E', name: 'Classic OG - Pregame Sportsbook' },
  casino: {
    ...classicOgV17E.casino,
    sportsbook: {
      limits: {
        minStakeCents: 1_000,
        maxStakeCents: 2_500_000,
        maxProfitCents: 5_000_000,
        perGameStakeCents: 2_500_000,
        openStakeCents: 15_000_000,
        openTickets: 20,
        dailyStakeCents: 12_500_000,
        sideLiabilityCents: 100_000_000,
      },
    },
  },
} as const satisfies Ruleset;
