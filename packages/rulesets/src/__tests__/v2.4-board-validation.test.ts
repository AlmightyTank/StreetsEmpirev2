import { describe, expect, it } from 'vitest';
import { questDefinitionProblems } from '../quest-definitions.js';
import { classicOgV18S, classicOgV24A } from '../index.js';
import type { QuestDefinitionCatalog } from '../types.js';

const current = classicOgV24A.questDefinitions as QuestDefinitionCatalog;
const historical = classicOgV18S.questDefinitions as QuestDefinitionCatalog;

const retiredKeys = new Set([
  'TOUR_FIRST_JOB', 'TOUR_SCOUT', 'TOUR_SUPPLIES', 'TOUR_CREW', 'TOUR_COOK', 'TOUR_HIDEOUT', 'TOUR_RAID',
  'FIRST_NIGHT_OUT', 'FRESH_FACES', 'KEEPING_THEM_HAPPY', 'COOKHOUSE', 'PAYDAY', 'HEAVY_HANDS',
  'EYES_OPEN', 'COLLECTION_DAY', 'PACK_YOUR_BAGS',
]);

describe('v2.4 quest-board migration boundary', () => {
  it('validates the complete current catalog and all graph references', () => {
    expect(questDefinitionProblems(current)).toEqual([]);
    for (const quest of Object.values(current)) {
      expect(quest.followUpKeys.every((key) => Boolean(current[key]))).toBe(true);
      expect(quest.prerequisites.every((requirement) => requirement.params?.questKey === undefined
        || typeof requirement.params.questKey !== 'string'
        || Boolean(current[requirement.params.questKey]))).toBe(true);
    }
  });

  it('does not expose retired linear jobs in new rounds or retain retired graph edges', () => {
    for (const key of retiredKeys) expect(current[key]).toBeUndefined();
    for (const quest of Object.values(current)) {
      expect(quest.followUpKeys.some((key) => retiredKeys.has(key))).toBe(false);
      expect(quest.prerequisites.some((requirement) => typeof requirement.params?.questKey === 'string' && retiredKeys.has(requirement.params.questKey))).toBe(false);
    }
  });

  it('preserves the historical catalog and its original linear chain', () => {
    for (const key of ['FIRST_NIGHT_OUT', 'FRESH_FACES', 'KEEPING_THEM_HAPPY', 'COOKHOUSE', 'PAYDAY', 'HEAVY_HANDS', 'EYES_OPEN', 'COLLECTION_DAY', 'PACK_YOUR_BAGS']) {
      expect(historical[key]).toBeDefined();
    }
    expect(historical.TOUR_RAID).toBeDefined();
    expect(historical.PLANT_THE_FLAG).toBeDefined();
  });

  it('keeps the evidence boundary round-scoped and the identity boundary current-only', () => {
    expect(current.BOARD_MAMA_FIRST_LOOK?.prerequisites).toEqual([]);
    expect(current.BOARD_REFERRAL_COMMISSIONER?.prerequisites).toEqual([
      { kind: 'QUEST_COMPLETED', params: { questKey: 'BOARD_BLOCKS_HOLD_THE_LINE' } },
    ]);
    expect(current.BOARD_COMMISSIONER_BADGE_IN_DARK?.contactKey).toBe('COMMISSIONER');
    expect(classicOgV24A.contacts?.COMMISSIONER?.name).toBe('The Commissioner');
  });
});
