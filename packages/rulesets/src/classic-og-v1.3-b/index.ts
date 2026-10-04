import { classicOgV13A } from '../classic-og-v1.3-a/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.3.0-B — Evidence Sources.
 *
 * Busts, arrests, road stops, torches, sacks and hijacks write evidence of their own on top
 * of the Heat they draw; large cash movements file currency reports; a Case cools once its
 * city has been quiet for a day; laundering washes the Case where it runs. Nothing reads the
 * Case yet, and Heat is untouched. See docs/ROADMAP-1.3.0.md.
 */
export const classicOgV13B = {
  ...classicOgV13A,
  meta: { id: 'classic-og-v1.3-b', version: '1.3.0-B', name: 'Classic OG - Evidence Sources' },
  law: {
    ...classicOgV13A.law,
    evidence: { bust: 8, arrest: 15, roadStop: 4, torch: 6, sack: 6, hijack: 5 },
    // $250,000 moved in a city in a day.
    currencyReport: { thresholdCents: 25_000_000, points: 4 },
    // A day of quiet, then a point every two hours.
    cooling: { quietHours: 24, decayPerHour: 0.5 },
    // A Laundromat at full strength washes 0.2 Case an hour, a Casino Front 0.4.
    laundering: { casePerHeat: 0.1, dailyCaseCap: 8 },
  },
} as const satisfies Ruleset;
