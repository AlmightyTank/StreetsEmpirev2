import type { QuestDefinitionCatalog } from '../types.js';

/**
 * Phase S city contracts are runtime offers. These two stable template keys
 * give the board two simultaneous slots while each PlayerQuest.rewardState
 * carries the generated city, product, target and payout for its 12-hour window.
 */
export const cityContractTemplates = {
  CITY_MARKET_ORDER_A: {
    key: 'CITY_MARKET_ORDER_A',
    title: 'City Market Order',
    description: 'A city market is paying for a short-term delivery.',
    contactKey: null,
    type: 'EVENT',
    category: 'CITY_CONTRACT',
    difficulty: 'CONTRACT',
    prerequisites: [],
    objectives: [{
      id: 'deliver',
      kind: 'EVENT_SUM',
      description: 'Complete the generated city delivery.',
      target: 1,
      params: { eventTypes: ['RUN_TRADE', 'STORE_SELL'], field: 'quantity' },
    }],
    bonusObjectives: [],
    rewards: [],
    followUpKeys: [],
    repeatability: 'REPEATABLE',
    expiresAfterMinutes: null,
    availability: { dynamicCityContract: true, slot: 0 },
  },
  CITY_MARKET_ORDER_B: {
    key: 'CITY_MARKET_ORDER_B',
    title: 'City Market Order',
    description: 'A city market is paying for a short-term delivery.',
    contactKey: null,
    type: 'EVENT',
    category: 'CITY_CONTRACT',
    difficulty: 'CONTRACT',
    prerequisites: [],
    objectives: [{
      id: 'deliver',
      kind: 'EVENT_SUM',
      description: 'Complete the generated city delivery.',
      target: 1,
      params: { eventTypes: ['RUN_TRADE', 'STORE_SELL'], field: 'quantity' },
    }],
    bonusObjectives: [],
    rewards: [],
    followUpKeys: [],
    repeatability: 'REPEATABLE',
    expiresAfterMinutes: null,
    availability: { dynamicCityContract: true, slot: 1 },
  },
} as const satisfies QuestDefinitionCatalog;
