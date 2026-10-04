import { classicOgV12F } from '../classic-og-v1.2-f/index.js';
import type { LawRules, Ruleset } from '../types.js';

export const lawReleaseRules = {
  maxAttention: 100,
  decayPerTurnInterval: 1,
  wantedTiers: [
    { level: 0, name: 'Quiet', startsAt: 0, description: 'The law has no active file worth chasing.' },
    { level: 1, name: 'Known', startsAt: 20, description: 'Local attention is building, but there is still room to cool off.' },
    { level: 2, name: 'Watched', startsAt: 40, description: 'Patterns are visible and corrupt help starts getting expensive.' },
    { level: 3, name: 'Wanted', startsAt: 65, description: 'Investigators can turn evidence into warrants if the crew keeps moving loud.' },
    { level: 4, name: 'Most Wanted', startsAt: 85, description: 'Every noisy operation risks informants, warrants and serious pressure.' },
  ],
  sources: {
    STREET_WORK: { attentionPerUnit: 0.25, maxAttentionPerEvent: 6, evidenceShare: 0.1 },
    PRODUCT_SALE: { attentionPerUnit: 0.45, maxAttentionPerEvent: 12, evidenceShare: 0.35 },
    PRODUCTION: { attentionPerUnit: 0.35, maxAttentionPerEvent: 10, evidenceShare: 0.25 },
    TURF_VIOLENCE: { attentionPerUnit: 0.75, maxAttentionPerEvent: 18, evidenceShare: 0.5 },
    BUSINESS_RACKET: { attentionPerUnit: 0.6, maxAttentionPerEvent: 14, evidenceShare: 0.45 },
    CONVOY_HIJACK: { attentionPerUnit: 0.9, maxAttentionPerEvent: 20, evidenceShare: 0.55 },
    CASINO_MARKER: { attentionPerUnit: 0.3, maxAttentionPerEvent: 8, evidenceShare: 0.2 },
    LARGE_CASH_MOVEMENT: { attentionPerUnit: 0.4, maxAttentionPerEvent: 10, evidenceShare: 0.3 },
  },
  corruption: {
    minCentsPerAttention: 50_000,
    netWorthSharePpmPerAttention: 250,
    dailyAttentionCap: 20,
  },
  investigation: {
    evidenceStartsAt: 25,
    warrantStartsAt: 60,
    informantStartsAt: 80,
    maxEvidence: 100,
  },
} as const satisfies LawRules;

/**
 * 1.3.0-F — Law Pressure Release.
 *
 * F pins the systemic law-pressure contract that later routes can persist:
 * wanted tiers, event-source attention, evidence pressure and capped corruption
 * counterplay. It intentionally leaves 1.2.0-F casino/jobs balance unchanged.
 */
export const classicOgV13F = {
  ...classicOgV12F,
  meta: { id: 'classic-og-v1.3-f', version: '1.3.0-F', name: 'Classic OG - Law Pressure Release' },
  law: lawReleaseRules,
} as const satisfies Ruleset;
