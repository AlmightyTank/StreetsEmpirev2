import { LIVING_CASE_BLUEPRINTS } from './living-cases.js';
import type { LivingCaseKey } from './living-stories.js';

export type CriminalCaseOutcomeCategory = 'CONTACT' | 'INTEL' | 'PEACE' | 'DISCOVERY' | 'SECRECY';

/** Story-only outcomes: choices never add another cash/turn/crew cost. */
export interface CriminalCaseOutcome {
  readonly key: string;
  readonly title: string;
  readonly summary: string;
  readonly category: CriminalCaseOutcomeCategory;
  readonly choiceCostCents: 0;
}
export const LIVING_CASE_OUTCOMES = {
  CASE_MISSING_LEDGER: {
    RETURN_LEDGER: { key: 'RETURN_LEDGER', title: "The Fixer's Favor", summary: 'The ledger gets back to its keeper. You kept your name off the page.', category: 'CONTACT', choiceCostCents: 0 },
    FOLLOW_STASH_LEAD: { key: 'FOLLOW_STASH_LEAD', title: 'The Hidden Trail', summary: 'You kept the trail to yourself. The case is closed, not the rumor.', category: 'DISCOVERY', choiceCostCents: 0 },
  },
  CASE_GHOST_SHIPMENT: {
    LOCATE_SUPPLIES: { key: 'LOCATE_SUPPLIES', title: 'A Trail of Crates', summary: 'The shipment mystery yields a location, not a free load of stock.', category: 'DISCOVERY', choiceCostCents: 0 },
    HAND_OVER_INTEL: { key: 'HAND_OVER_INTEL', title: 'A Quiet Exchange', summary: 'You put the information in trusted hands without exposing your sources.', category: 'CONTACT', choiceCostCents: 0 },
  },
  CASE_THE_FIFTH_WITNESS: {
    REVEAL_INSTIGATOR: { key: 'REVEAL_INSTIGATOR', title: 'The Instigator Exposed', summary: 'Your evidence names the pressure behind the fight. No unverified accusation is published.', category: 'INTEL', choiceCostCents: 0 },
    SEEK_TRUCE: { key: 'SEEK_TRUCE', title: 'A Fragile Peace', summary: 'You choose a quiet ending over another street fight.', category: 'PEACE', choiceCostCents: 0 },
  },
  CASE_FALSE_COLORS: {
    EXPOSE_TRICK: { key: 'EXPOSE_TRICK', title: 'False Colors Unmasked', summary: 'The deception is understood. No rival secrets become public automatically.', category: 'INTEL', choiceCostCents: 0 },
    KEEP_SECRET: { key: 'KEEP_SECRET', title: 'Knowledge Kept Close', summary: 'You close the file and keep the conclusion between your crew.', category: 'SECRECY', choiceCostCents: 0 },
  },
  CASE_MIDNIGHT_SIGNAL: {
    INTERCEPT_SIGNAL: { key: 'INTERCEPT_SIGNAL', title: 'The Signal Traced', summary: 'You establish where the signal led, without revealing private coordinates.', category: 'DISCOVERY', choiceCostCents: 0 },
    LEAVE_MESSAGE: { key: 'LEAVE_MESSAGE', title: 'A Message at Midnight', summary: 'You answer the signal and let the street tell the rest.', category: 'CONTACT', choiceCostCents: 0 },
  },
} as const satisfies Readonly<Record<LivingCaseKey, Readonly<Record<string, CriminalCaseOutcome>>>>;

export const LIVING_CASE_REWARD_CENTS = 2_500;
export const LIVING_CASE_ROUND_REWARD_MAX_CENTS = 10_000;

export function criminalCaseOutcome(caseKey: string, branchKey: string): CriminalCaseOutcome | null {
  const entries = LIVING_CASE_OUTCOMES[caseKey as LivingCaseKey];
  return entries ? (Object.values(entries) as CriminalCaseOutcome[]).find((outcome) => outcome.key === branchKey) ?? null : null;
}
/** Reject mismatches between authored branches and their result descriptions. */
export function validateLivingCaseOutcomes(): void {
  for (const [key, blueprint] of Object.entries(LIVING_CASE_BLUEPRINTS)) {
    const outcomes = LIVING_CASE_OUTCOMES[key as LivingCaseKey];
    if (blueprint.branchKeys.length !== Object.keys(outcomes).length) throw Error('Outcome count mismatches ' + key);
    for (const branch of blueprint.branchKeys) {
      const outcome = criminalCaseOutcome(key, branch);
      if (!outcome || !outcome.title || !outcome.summary || outcome.choiceCostCents !== 0) {
        throw Error('Invalid case outcome: ' + key + ':' + branch);
      }
    }
  }
}
validateLivingCaseOutcomes();
