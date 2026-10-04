import { classicOgV13B } from '../classic-og-v1.3-b/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.3.0-C — Warrants & Raids.
 *
 * A city's Case reaching the Warrant stage drafts a warrant against the player's Hideout, a
 * business or the boss, chosen by what the Case was built from. It is served after a
 * twelve-hour warning unless the player lawyers up. Raids never touch protected cash or
 * product and never take a block; a day's police losses are capped. Heat, busts and arrests
 * are unchanged. See docs/ROADMAP-1.3.0.md.
 */
export const classicOgV13C = {
  ...classicOgV13B,
  meta: { id: 'classic-og-v1.3-c', version: '1.3.0-C', name: 'Classic OG - Warrants & Raids' },
  law: {
    ...classicOgV13B.law,
    warrants: {
      warningHours: 12,
      caseAfterServed: 30,
      caseAfterAnswered: 45,
      hideout: { productSeizedFraction: 0.4, cashFineFraction: 0.05 },
      business: { racketShutHours: 12, registerFineFraction: 0.25 },
      dailyLossCapNetWorthShare: 0.15,
    },
    lawyer: {
      // A week of a lawyer for 1% of net worth, never under $25,000.
      retainer: { days: 7, netWorthShare: 0.01, minCents: 2_500_000, seizureCut: 0.4, downtimeCut: 0.5 },
      // A quarter over what the warrant would take, never under $10,000.
      lawyerUp: { multiplier: 1.25, minCents: 1_000_000 },
    },
  },
} as const satisfies Ruleset;
