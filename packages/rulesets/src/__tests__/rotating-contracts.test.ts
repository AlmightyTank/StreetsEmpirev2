import { describe, expect, it } from 'vitest';
import { classicOgV18S } from '../classic-og-v1.8-s/index.js';
import { classicOgV24A } from '../classic-og-v2.4-a/index.js';
import { rotatingContracts } from '../classic-og-v2.4-a/rotating-contracts.js';
import type { QuestDefinition } from '../types.js';

const current = classicOgV24A.questDefinitions as Record<string, QuestDefinition>;
const historical = classicOgV18S.questDefinitions as Record<string, QuestDefinition>;

describe('v2.4 rotating contracts', () => {
  it('adds lore-rich daily and weekly work to the current catalog only', () => {
    for (const quest of Object.values(rotatingContracts)) {
      expect(current[quest.key]).toBeDefined();
      expect(historical[quest.key]).toBeUndefined();
      expect(quest.prerequisites).toEqual([]);
      expect(quest.followUpKeys).toEqual([]);
      expect(quest.description.length).toBeGreaterThan(60);
      expect(quest.story?.intro.length).toBeGreaterThan(20);
      expect(quest.story?.inProgress.length).toBeGreaterThan(20);
      expect(quest.story?.ready.length).toBeGreaterThan(20);
      expect(quest.story?.completed.length).toBeGreaterThan(20);
      expect(quest.story?.lesson.length).toBeGreaterThan(20);
      expect(quest.story?.actionHint.length).toBeGreaterThan(20);
    }
  });

  it('uses the existing repeatability and rotation pools', () => {
    const quests = Object.values(current).filter((quest) => quest.type === 'DAILY' || quest.type === 'WEEKLY');
    expect(quests.filter((quest) => quest.type === 'DAILY').length).toBeGreaterThanOrEqual(180);
    expect(quests.filter((quest) => quest.type === 'WEEKLY').length).toBeGreaterThanOrEqual(20);
    for (const quest of quests) {
      expect(quest.repeatability).toBe(quest.type);
      expect(quest.availability.rotationPool).toBe(
        quest.type === 'DAILY' ? 'DAILY_CONTRACTS' : 'WEEKLY_CONTRACTS',
      );
      expect(quest.rewards.some((reward) => reward.kind === 'CONTACT_REP')).toBe(true);
    }
    expect(classicOgV24A.contractRotation).toEqual({ perRoundDeck: true, freshCityBoards: true, cityJobs: true });
  });

  it('uses only authoritative activity evidence', () => {
    const allowed = new Set([
      'SCOUT', 'STORE_SELL', 'CASE_STAGE_UP', 'CASE_COOLED', 'INFORMANT_TIP', 'RECRUIT_CREW',
      'RUN_RETURNED', 'STORE_BUY', 'PRODUCE_CRACK', 'COMBAT_RECON', 'TURF_POST',
    ]);
    for (const quest of Object.values(rotatingContracts)) {
      for (const objective of quest.objectives) {
        const eventTypes = objective.params?.eventTypes;
        if (Array.isArray(eventTypes)) {
          for (const eventType of eventTypes) {
            if (typeof eventType === 'string') expect(allowed.has(eventType)).toBe(true);
          }
        }
      }
    }
  });
});
