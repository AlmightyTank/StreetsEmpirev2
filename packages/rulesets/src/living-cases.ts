import type { LivingCaseKey } from './living-stories.js';

export type CaseClueKind = 'SCOUT' | 'CONTACT' | 'ENCOUNTER' | 'TRAVEL';
export interface CaseClueDefinition {
  readonly key: string;
  readonly label: string;
  /** Only trusted PlayerActivity rows matching eventType can prove this clue. */
  readonly sourceKind: CaseClueKind;
  readonly eventType: string;
}
export interface CriminalCaseBlueprint {
  readonly key: LivingCaseKey;
  readonly title: string;
  readonly clues: readonly CaseClueDefinition[];
  readonly branchKeys: readonly string[];
}

/** Pinned snapshot on the offered case; these are templates, not automatic grants. */
export const LIVING_CASE_BLUEPRINTS: Readonly<Record<LivingCaseKey, CriminalCaseBlueprint>> = {
  CASE_MISSING_LEDGER: {
    key: 'CASE_MISSING_LEDGER', title: 'Missing Ledger',
    clues: [
      { key: 'RETRACE_STREET', label: 'Search the street', sourceKind: 'SCOUT', eventType: 'SCOUT' },
      { key: 'CONTACT_ACCOUNT', label: 'Find a contact lead', sourceKind: 'CONTACT', eventType: 'QUEST_CLAIMED' },
      { key: 'CHECK_ENCOUNTER', label: 'Resolve a street encounter', sourceKind: 'ENCOUNTER', eventType: 'RANDOM_ENCOUNTER_CHOICE' },
    ],
    branchKeys: ['RETURN_LEDGER', 'FOLLOW_STASH_LEAD'],
  },
  CASE_GHOST_SHIPMENT: {
    key: 'CASE_GHOST_SHIPMENT', title: 'Ghost Shipment',
    clues: [
      { key: 'FOLLOW_ROUTE', label: 'Complete a route', sourceKind: 'TRAVEL', eventType: 'RUN_RETURNED' },
      { key: 'RETRACE_CARGO', label: 'Search the streets', sourceKind: 'SCOUT', eventType: 'SCOUT' },
      { key: 'INTERVIEW_SOURCE', label: 'Check a contact lead', sourceKind: 'CONTACT', eventType: 'QUEST_CLAIMED' },
    ],
    branchKeys: ['LOCATE_SUPPLIES', 'HAND_OVER_INTEL'],
  },
  CASE_THE_FIFTH_WITNESS: {
    key: 'CASE_THE_FIFTH_WITNESS', title: 'The Fifth Witness',
    clues: [
      { key: 'FOLLOW_FOOTPRINTS', label: 'Scout the district', sourceKind: 'SCOUT', eventType: 'SCOUT' },
      { key: 'INTERVIEW_WITNESS', label: 'Consult a contact', sourceKind: 'CONTACT', eventType: 'QUEST_CLAIMED' },
      { key: 'HEAR_STREET_ACCOUNT', label: 'Resolve an encounter', sourceKind: 'ENCOUNTER', eventType: 'RANDOM_ENCOUNTER_CHOICE' },
    ],
    branchKeys: ['REVEAL_INSTIGATOR', 'SEEK_TRUCE'],
  },
  CASE_FALSE_COLORS: {
    key: 'CASE_FALSE_COLORS', title: 'False Colors',
    clues: [
      { key: 'STUDY_BLOCK', label: 'Scout the territory', sourceKind: 'SCOUT', eventType: 'SCOUT' },
      { key: 'QUESTION_LOCALS', label: 'Resolve an encounter', sourceKind: 'ENCOUNTER', eventType: 'RANDOM_ENCOUNTER_CHOICE' },
      { key: 'VERIFY_SOURCE', label: 'Ask a contact', sourceKind: 'CONTACT', eventType: 'QUEST_CLAIMED' },
    ],
    branchKeys: ['EXPOSE_TRICK', 'KEEP_SECRET'],
  },
  CASE_MIDNIGHT_SIGNAL: {
    key: 'CASE_MIDNIGHT_SIGNAL', title: 'Midnight Signal',
    clues: [
      { key: 'CHECK_SIGNAL', label: 'Scout for the signal', sourceKind: 'SCOUT', eventType: 'SCOUT' },
      { key: 'TRACE_MOVEMENT', label: 'Follow the trail', sourceKind: 'TRAVEL', eventType: 'RUN_RETURNED' },
      { key: 'MEET_SOURCE', label: 'Investigate the encounter', sourceKind: 'ENCOUNTER', eventType: 'RANDOM_ENCOUNTER_CHOICE' },
    ],
    branchKeys: ['INTERCEPT_SIGNAL', 'LEAVE_MESSAGE'],
  },
};

export function validateCaseBlueprint(blueprint: CriminalCaseBlueprint): void {
  if (!blueprint.title.trim() || blueprint.clues.length === 0 || blueprint.branchKeys.length < 2) {
    throw new Error('Invalid Criminal Case blueprint');
  }
  const keys = blueprint.clues.map((clue) => clue.key);
  const sources = blueprint.clues.map((clue) => clue.sourceKind);
  if (new Set(keys).size !== keys.length || new Set(sources).size !== sources.length
    || new Set(blueprint.branchKeys).size !== blueprint.branchKeys.length
    || blueprint.clues.some((clue) => !clue.label.trim() || !clue.eventType.trim())) {
    throw new Error('Criminal Case requires distinct verified evidence sources, clue keys and branches');
  }
}
for (const blueprint of Object.values(LIVING_CASE_BLUEPRINTS)) validateCaseBlueprint(blueprint);
