import { classicOgV30C } from '../classic-og-v3.0-c/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestDefinition, QuestDefinitionCatalog, Ruleset } from '../types.js';

type PacedQuestKey =
  | 'MAMA_RECRUITMENT_DRIVE'
  | 'MAMA_NIGHT_SHIFT'
  | 'MAMA_HOUSE_FULL'
  | 'PIP_BULK_ORDER'
  | 'PIP_PARTY_FAVORS'
  | 'PIP_MOVE_THE_WEIGHT'
  | 'TOMMY_STOCK_THE_CREW'
  | 'TOMMY_TWO_COLLECTIONS'
  | 'TOMMY_PATCH_JOB'
  | 'VIC_FACE_TO_FACE'
  | 'VIC_SCOPE_THE_STRIP'
  | 'WHEELS_RIDING_SHOTGUN'
  | 'ACE_HOUSE_RULES'
  | 'ACE_FLOOR_TOUR'
  | 'ACE_KNOWN_FACE'
  | 'ACE_NATURAL'
  | 'LEDGER_OPEN_FILE'
  | 'LEDGER_COOLING_OFF'
  | 'LEDGER_RIGHT_TO_COUNSEL'
  | 'LEDGER_FRIENDS_DOWNTOWN'
  | 'CIVIC_SHAKE_HANDS';

const base = classicOgV30C.questDefinitions! as unknown as QuestDefinitionCatalog & Record<PacedQuestKey, QuestDefinition>;

/**
 * Pace side work for newly pinned rounds without changing historical catalogs.
 * Contact ladders open one job at a time; standalone systems use time or action gates.
 */
const questDefinitions = defineQuestCatalog({
  ...base,

  MAMA_RECRUITMENT_DRIVE: {
    ...base.MAMA_RECRUITMENT_DRIVE,
    followUpKeys: [...base.MAMA_RECRUITMENT_DRIVE.followUpKeys, 'MAMA_NIGHT_SHIFT'],
  },
  MAMA_NIGHT_SHIFT: {
    ...base.MAMA_NIGHT_SHIFT,
    prerequisites: [
      ...base.MAMA_NIGHT_SHIFT.prerequisites,
      { kind: 'QUEST_COMPLETED', params: { questKey: 'MAMA_RECRUITMENT_DRIVE' } },
    ],
    followUpKeys: [...base.MAMA_NIGHT_SHIFT.followUpKeys, 'MAMA_HOUSE_FULL'],
  },
  MAMA_HOUSE_FULL: {
    ...base.MAMA_HOUSE_FULL,
    prerequisites: [
      ...base.MAMA_HOUSE_FULL.prerequisites,
      { kind: 'QUEST_COMPLETED', params: { questKey: 'MAMA_NIGHT_SHIFT' } },
    ],
  },

  PIP_BULK_ORDER: {
    ...base.PIP_BULK_ORDER,
    followUpKeys: [...base.PIP_BULK_ORDER.followUpKeys, 'PIP_PARTY_FAVORS'],
  },
  PIP_PARTY_FAVORS: {
    ...base.PIP_PARTY_FAVORS,
    prerequisites: [
      ...base.PIP_PARTY_FAVORS.prerequisites,
      { kind: 'QUEST_COMPLETED', params: { questKey: 'PIP_BULK_ORDER' } },
    ],
    followUpKeys: [...base.PIP_PARTY_FAVORS.followUpKeys, 'PIP_MOVE_THE_WEIGHT'],
  },
  PIP_MOVE_THE_WEIGHT: {
    ...base.PIP_MOVE_THE_WEIGHT,
    prerequisites: [
      ...base.PIP_MOVE_THE_WEIGHT.prerequisites,
      { kind: 'QUEST_COMPLETED', params: { questKey: 'PIP_PARTY_FAVORS' } },
    ],
  },

  TOMMY_STOCK_THE_CREW: {
    ...base.TOMMY_STOCK_THE_CREW,
    followUpKeys: [...base.TOMMY_STOCK_THE_CREW.followUpKeys, 'TOMMY_TWO_COLLECTIONS'],
  },
  TOMMY_TWO_COLLECTIONS: {
    ...base.TOMMY_TWO_COLLECTIONS,
    prerequisites: [
      ...base.TOMMY_TWO_COLLECTIONS.prerequisites,
      { kind: 'QUEST_COMPLETED', params: { questKey: 'TOMMY_STOCK_THE_CREW' } },
    ],
    followUpKeys: [...base.TOMMY_TWO_COLLECTIONS.followUpKeys, 'TOMMY_PATCH_JOB'],
  },
  TOMMY_PATCH_JOB: {
    ...base.TOMMY_PATCH_JOB,
    prerequisites: [
      ...base.TOMMY_PATCH_JOB.prerequisites,
      { kind: 'QUEST_COMPLETED', params: { questKey: 'TOMMY_TWO_COLLECTIONS' } },
    ],
  },

  VIC_FACE_TO_FACE: {
    ...base.VIC_FACE_TO_FACE,
    prerequisites: [
      ...base.VIC_FACE_TO_FACE.prerequisites,
      { kind: 'TIME_SINCE_JOIN', params: { minutes: 720 } },
    ],
  },
  VIC_SCOPE_THE_STRIP: {
    ...base.VIC_SCOPE_THE_STRIP,
    prerequisites: [
      ...base.VIC_SCOPE_THE_STRIP.prerequisites,
      { kind: 'ACTION_COUNT', params: { eventTypes: ['TRIP_RETURNED'], count: 2, label: 'Complete trips to other cities' } },
    ],
  },
  WHEELS_RIDING_SHOTGUN: {
    ...base.WHEELS_RIDING_SHOTGUN,
    prerequisites: [
      ...base.WHEELS_RIDING_SHOTGUN.prerequisites,
      { kind: 'ACTION_COUNT', params: { eventTypes: ['SCOUT'], count: 10, label: 'Scout the streets' } },
    ],
  },

  ACE_HOUSE_RULES: {
    ...base.ACE_HOUSE_RULES,
    prerequisites: [
      ...base.ACE_HOUSE_RULES.prerequisites,
      { kind: 'TIME_SINCE_JOIN', params: { minutes: 360 } },
    ],
    followUpKeys: base.ACE_HOUSE_RULES.followUpKeys.filter((key) => key === 'ACE_FLOOR_TOUR'),
  },
  ACE_FLOOR_TOUR: {
    ...base.ACE_FLOOR_TOUR,
    followUpKeys: [...base.ACE_FLOOR_TOUR.followUpKeys, 'ACE_KNOWN_FACE'],
  },
  ACE_KNOWN_FACE: {
    ...base.ACE_KNOWN_FACE,
    prerequisites: [
      ...base.ACE_KNOWN_FACE.prerequisites.filter((gate) => gate.kind !== 'QUEST_COMPLETED'),
      { kind: 'QUEST_COMPLETED', params: { questKey: 'ACE_FLOOR_TOUR' } },
    ],
    followUpKeys: [...base.ACE_KNOWN_FACE.followUpKeys, 'ACE_NATURAL'],
  },
  ACE_NATURAL: {
    ...base.ACE_NATURAL,
    prerequisites: [
      ...base.ACE_NATURAL.prerequisites.filter((gate) => gate.kind !== 'QUEST_COMPLETED'),
      { kind: 'QUEST_COMPLETED', params: { questKey: 'ACE_KNOWN_FACE' } },
    ],
  },

  LEDGER_OPEN_FILE: {
    ...base.LEDGER_OPEN_FILE,
    prerequisites: [
      ...base.LEDGER_OPEN_FILE.prerequisites,
      { kind: 'TIME_SINCE_JOIN', params: { minutes: 1_440 } },
    ],
    followUpKeys: base.LEDGER_OPEN_FILE.followUpKeys.filter((key) => key === 'LEDGER_COOLING_OFF'),
  },
  LEDGER_COOLING_OFF: {
    ...base.LEDGER_COOLING_OFF,
    followUpKeys: [...base.LEDGER_COOLING_OFF.followUpKeys, 'LEDGER_RIGHT_TO_COUNSEL'],
  },
  LEDGER_RIGHT_TO_COUNSEL: {
    ...base.LEDGER_RIGHT_TO_COUNSEL,
    prerequisites: [
      ...base.LEDGER_RIGHT_TO_COUNSEL.prerequisites.filter((gate) => gate.kind !== 'QUEST_COMPLETED'),
      { kind: 'QUEST_COMPLETED', params: { questKey: 'LEDGER_COOLING_OFF' } },
    ],
    followUpKeys: [...base.LEDGER_RIGHT_TO_COUNSEL.followUpKeys, 'LEDGER_FRIENDS_DOWNTOWN'],
  },
  LEDGER_FRIENDS_DOWNTOWN: {
    ...base.LEDGER_FRIENDS_DOWNTOWN,
    prerequisites: [
      ...base.LEDGER_FRIENDS_DOWNTOWN.prerequisites.filter((gate) => gate.kind !== 'QUEST_COMPLETED'),
      { kind: 'QUEST_COMPLETED', params: { questKey: 'LEDGER_RIGHT_TO_COUNSEL' } },
    ],
  },

  CIVIC_SHAKE_HANDS: {
    ...base.CIVIC_SHAKE_HANDS,
    prerequisites: [
      ...base.CIVIC_SHAKE_HANDS.prerequisites,
      { kind: 'TIME_SINCE_JOIN', params: { minutes: 2_880 } },
    ],
  },
});

export const classicOgV30D = {
  ...classicOgV30C,
  meta: { id: 'classic-og-v3.0-d', version: '3.0.0-D', name: 'Classic OG - Side Quest Pacing' },
  questDefinitions,
} as const satisfies Ruleset;
