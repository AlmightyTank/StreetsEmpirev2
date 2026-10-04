import { classicOgV13F } from '../classic-og-v1.3-f/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.3.0-G — Balance, Admin & Release.
 *
 * The law numbers pinned by `qa:law`. The first-pass numbers had a careful crack player at a
 * warrant every few days and a player ignoring Heat at one a day, because a Case only cooled
 * after a full quiet day, which an active player never has. G scales the Case to the Heat
 * game's real volumes: a fifth of the Heat-to-Case rate, smaller direct evidence, currency
 * reports per $1,000,000, cooling after a night's quiet, and a served warrant that drops the
 * Case to the Noticed line. Stages, warrants, lawyers, officials, informants, city pace and
 * the Feds work exactly as in F. See docs/ROADMAP-1.3.0.md.
 */
export const classicOgV13G = {
  ...classicOgV13F,
  meta: { id: 'classic-og-v1.3-g', version: '1.3.0-G', name: 'Classic OG - Law Balance & Release' },
  law: {
    ...classicOgV13F.law,
    heatToCase: 0.005,
    evidence: { bust: 1, arrest: 3, roadStop: 1, torch: 3, sack: 3, hijack: 2 },
    currencyReport: { thresholdCents: 100_000_000, points: 2 },
    cooling: { quietHours: 6, decayPerHour: 0.5 },
    laundering: { casePerHeat: 0.02, dailyCaseCap: 3 },
    warrants: { ...classicOgV13F.law.warrants, caseAfterServed: 20 },
    federal: { ...classicOgV13F.law.federal, sweepPoints: 5 },
  },
} as const satisfies Ruleset;
