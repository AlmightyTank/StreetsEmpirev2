import type { QuestDefinitionCatalog } from '../types.js';

/**
 * 1.4.0-B2: a third city board slot. Like the two market orders, it is a template;
 * each PlayerQuest.rewardState carries the generated city job (a fly-in trip or a
 * casino visit) for its 12-hour window.
 */
export const cityJobTemplates = {
  CITY_JOB_C: {
    key: 'CITY_JOB_C',
    title: 'City Job',
    description: 'Somebody in another city wants the boss in person.',
    contactKey: null,
    type: 'CITY_CONTRACT',
    category: 'CITY_CONTRACT',
    difficulty: 'CONTRACT',
    prerequisites: [],
    objectives: [{
      id: 'city_job',
      kind: 'EVENT_COUNT',
      description: 'Complete the generated city job.',
      target: 1,
      params: { eventTypes: ['TRIP_RETURNED', 'CASINO_WAGER'] },
    }],
    bonusObjectives: [],
    rewards: [],
    followUpKeys: [],
    repeatability: 'REPEATABLE',
    expiresAfterMinutes: null,
    availability: { dynamicCityContract: true, slot: 2 },
  },
} as const satisfies QuestDefinitionCatalog;
