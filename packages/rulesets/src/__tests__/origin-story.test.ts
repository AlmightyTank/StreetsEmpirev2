import { describe, expect, it } from 'vitest';
import { classicOgV30C } from '../classic-og-v3.0-c/index.js';

describe('2.0 origin story', () => {
  it('defines four linear real-action beats with equal fixed rewards', () => {
    const keys = ['ORIGIN_MEET_CONTACT', 'ORIGIN_FIRST_FRONT', 'ORIGIN_STREET_CHOICE', 'ORIGIN_CHOOSE_CAREER'] as const;
    const quests = keys.map((key) => classicOgV30C.questDefinitions[key]);

    expect(quests.map((quest) => quest.objectives[0]?.params?.eventTypes?.[0])).toEqual([
      'SCOUT', 'BUSINESS_BUILD', 'RANDOM_ENCOUNTER_CHOICE', 'CAREER_CHOSEN',
    ]);
    expect(quests.map((quest) => quest.rewards)).toEqual(keys.map(() => [{ kind: 'CASH', amount: 100000 }]));
    expect(quests.map((quest) => quest.prerequisites[0]?.params?.questKey ?? null)).toEqual([
      null, 'ORIGIN_MEET_CONTACT', 'ORIGIN_FIRST_FRONT', 'ORIGIN_STREET_CHOICE',
    ]);
    expect(quests.every((quest) => quest.type === 'STORY' && quest.repeatability === 'ONCE')).toBe(true);
  });
});
