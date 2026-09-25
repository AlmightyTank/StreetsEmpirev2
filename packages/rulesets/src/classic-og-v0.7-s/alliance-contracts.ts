import type { QuestDefinitionCatalog } from '../types.js';

/**
 * Quest roadmap Phase T: alliance-wide weekly contracts.
 *
 * These definitions are fixed board slots. The server snapshots the current
 * alliance membership when one is accepted and mirrors authoritative progress
 * to every snapshotted member's PlayerQuest attempt.
 */
export const allianceContracts = {
  ALLIANCE_HOLD_THE_CITY: {
    key: 'ALLIANCE_HOLD_THE_CITY',
    title: 'Hold the City',
    description: 'Your alliance needs to prove it can keep ground when another crew comes to take it.',
    contactKey: 'BLOCKS',
    type: 'ALLIANCE',
    category: 'TURF',
    difficulty: 'KINGPIN_CONTRACT',
    prerequisites: [],
    objectives: [{
      id: 'successful_defenses',
      kind: 'EVENT_COUNT',
      description: 'As an alliance, successfully defend 4 turf pushes.',
      target: 4,
      params: { eventTypes: ['TURF_PUSH_DEFENSE'], where: { held: true } },
    }],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 4_000_000 },
      { kind: 'TURNS', amount: 25 },
    ],
    followUpKeys: [],
    repeatability: 'WEEKLY',
    expiresAfterMinutes: null,
    availability: { allianceContract: true, sharedProgress: true },
  },

  ALLIANCE_WAR_CHEST: {
    key: 'ALLIANCE_WAR_CHEST',
    title: 'War Chest',
    description: 'Build enough legitimate street turnover that the alliance has money moving everywhere at once.',
    contactKey: 'PIP',
    type: 'ALLIANCE',
    category: 'ECONOMY',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [],
    objectives: [{
      id: 'store_sales',
      kind: 'EVENT_SUM',
      description: 'As an alliance, sell $1,000,000 through store counters.',
      target: 100_000_000,
      params: { eventTypes: ['STORE_SELL'], field: 'totalCents', display: 'CURRENCY' },
    }],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 3_500_000 },
      { kind: 'TURNS', amount: 20 },
    ],
    followUpKeys: [],
    repeatability: 'WEEKLY',
    expiresAfterMinutes: null,
    availability: { allianceContract: true, sharedProgress: true },
  },

  ALLIANCE_REINFORCEMENTS: {
    key: 'ALLIANCE_REINFORCEMENTS',
    title: 'Reinforcements',
    description: 'When an ally calls, somebody has to answer. Put real muscle behind alliance defense calls.',
    contactKey: 'TOMMY',
    type: 'ALLIANCE',
    category: 'COMBAT',
    difficulty: 'HIGH_RISK',
    prerequisites: [],
    objectives: [{
      id: 'ally_backup',
      kind: 'EVENT_SUM',
      description: 'Send 100 thugs as ally backup to convoy or turf fights.',
      target: 100,
      params: {
        eventTypes: ['CONVOY_BACKUP', 'TURF_PUSH_BACKUP'],
        field: 'thugs',
        where: { kind: 'ALLY' },
      },
    }],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 3_500_000 },
      { kind: 'TURNS', amount: 20 },
    ],
    followUpKeys: [],
    repeatability: 'WEEKLY',
    expiresAfterMinutes: null,
    availability: { allianceContract: true, sharedProgress: true },
  },

  ALLIANCE_INTERSTATE_EMPIRE: {
    key: 'ALLIANCE_INTERSTATE_EMPIRE',
    title: 'Interstate Empire',
    description: 'Turn the alliance into a real road network instead of a collection of crews that never leave home.',
    contactKey: 'WHEELS',
    type: 'ALLIANCE',
    category: 'TRAVEL',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [],
    objectives: [
      {
        id: 'returned_runs',
        kind: 'EVENT_COUNT',
        description: 'As an alliance, bring 12 intercity runs home.',
        target: 12,
        params: { eventTypes: ['RUN_RETURNED'] },
      },
      {
        id: 'unique_cities',
        kind: 'UNIQUE_VALUES',
        description: 'Visit 6 different cities across those returned runs.',
        target: 6,
        params: { eventTypes: ['RUN_RETURNED'], field: 'cities' },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 4_000_000 },
      { kind: 'ITEM', key: 'lowRiders', amount: 1 },
    ],
    followUpKeys: [],
    repeatability: 'WEEKLY',
    expiresAfterMinutes: null,
    availability: { allianceContract: true, sharedProgress: true },
  },
} as const satisfies QuestDefinitionCatalog;
