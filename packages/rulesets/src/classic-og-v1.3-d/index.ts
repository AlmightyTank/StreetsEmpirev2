import { classicOgV13C } from '../classic-og-v1.3-c/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.3.0-D — Corruption & Informants.
 *
 * Corrupt officials join a weekly payroll per city: a Precinct Captain, a District Attorney,
 * a Judge and a Customs Officer. Every favor they do builds exposure, and past the line
 * Internal Affairs opens a file the player is warned about. Informants sell tips, never
 * protection. Heat, busts, arrests and bribes are unchanged. See docs/ROADMAP-1.3.0.md.
 */
export const classicOgV13D = {
  ...classicOgV13C,
  meta: { id: 'classic-og-v1.3-d', version: '1.3.0-D', name: 'Classic OG - Corruption & Informants' },
  law: {
    ...classicOgV13C.law,
    officials: {
      weekDays: 7,
      roles: {
        CAPTAIN: { netWorthShare: 0.004, minCents: 2_000_000, extraWarningHours: 12, headsUpPoints: 5 },
        DA: { netWorthShare: 0.008, minCents: 4_000_000, slowShare: 0.25, quashEveryDays: 7 },
        JUDGE: { netWorthShare: 0.006, minCents: 3_000_000, seizureCut: 0.3, downtimeCut: 0.5 },
        CUSTOMS: { netWorthShare: 0.003, minCents: 1_500_000, checkCut: 0.5 },
      },
      exposure: {
        line: 60,
        iaWarningHours: 24,
        stingPoints: 25,
        rehireCooldownHours: 48,
        perFavor: { captainWindow: 10, captainTip: 5, daQuash: 30, daSlowedPoint: 1, judgeServe: 15, customsFlight: 5 },
      },
    },
    informants: {
      sweep: { netWorthShare: 0.002, minCents: 2_500_000 },
      city: { netWorthShare: 0.001, minCents: 1_500_000 },
    },
  },
} as const satisfies Ruleset;
