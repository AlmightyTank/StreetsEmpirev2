import type { QuestDefinitionCatalog } from '../types.js';

/**
 * Quest roadmap Phase U: round-wide community events.
 *
 * One event is active during each quarter of the round. Progress is shared
 * across the whole round, while each player still has to meet a small personal
 * contribution floor before claiming the community reward.
 */
export const communityEvents = {
  EVENT_OPENING_RUSH: {
    key: 'EVENT_OPENING_RUSH',
    title: 'Opening Rush',
    description: 'The round is young. Put enough eyes on the streets to map out where the early money is moving.',
    contactKey: null,
    type: 'EVENT',
    category: 'COMMUNITY',
    difficulty: 'CONTRACT',
    prerequisites: [],
    objectives: [{
      id: 'community_scouts',
      kind: 'EVENT_COUNT',
      description: 'The community completes 100 scouting actions.',
      target: 100,
      params: { eventTypes: ['SCOUT'] },
    }],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 1_500_000 },
      { kind: 'TURNS', amount: 10 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      communityEvent: true,
      roundStartFraction: 0,
      roundEndFraction: 0.25,
      personalContributionTarget: 5,
      contributionLabel: 'scouting actions',
    },
  },

  EVENT_MONEY_IN_MOTION: {
    key: 'EVENT_MONEY_IN_MOTION',
    title: 'Money in Motion',
    description: 'Keep cash moving through the counters until the whole round has put a million dollars of sales on the books.',
    contactKey: null,
    type: 'EVENT',
    category: 'COMMUNITY',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [],
    objectives: [{
      id: 'community_sales',
      kind: 'EVENT_SUM',
      description: 'The community sells $1,000,000 through store counters.',
      target: 100_000_000,
      params: { eventTypes: ['STORE_SELL'], field: 'totalCents', display: 'CURRENCY' },
    }],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 2_000_000 },
      { kind: 'TURNS', amount: 10 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      communityEvent: true,
      roundStartFraction: 0.25,
      roundEndFraction: 0.5,
      personalContributionTarget: 1_000_000,
      contributionLabel: 'personal store sales',
    },
  },

  EVENT_INTERSTATE_PUSH: {
    key: 'EVENT_INTERSTATE_PUSH',
    title: 'Interstate Push',
    description: 'Turn the middle of the season into a road rush and bring enough crews home from intercity runs.',
    contactKey: null,
    type: 'EVENT',
    category: 'COMMUNITY',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [],
    objectives: [{
      id: 'community_runs',
      kind: 'EVENT_COUNT',
      description: 'The community brings 25 intercity runs home.',
      target: 25,
      params: { eventTypes: ['RUN_RETURNED'] },
    }],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 2_000_000 },
      { kind: 'TURNS', amount: 15 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      communityEvent: true,
      roundStartFraction: 0.5,
      roundEndFraction: 0.75,
      personalContributionTarget: 1,
      contributionLabel: 'returned runs',
    },
  },

  EVENT_LAST_CALL: {
    key: 'EVENT_LAST_CALL',
    title: 'Last Call',
    description: 'The last quarter belongs to crews willing to make moves. Keep the whole round fighting for position through the finish.',
    contactKey: null,
    type: 'EVENT',
    category: 'COMMUNITY',
    difficulty: 'HIGH_RISK',
    prerequisites: [],
    objectives: [{
      id: 'community_attacks',
      kind: 'EVENT_COUNT',
      description: 'The community launches 40 raids or turf pushes.',
      target: 40,
      params: { eventTypes: ['RAID_ATTACK', 'TURF_PUSH_ATTACK'] },
    }],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 2_500_000 },
      { kind: 'TURNS', amount: 20 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      communityEvent: true,
      roundStartFraction: 0.75,
      roundEndFraction: 1,
      personalContributionTarget: 2,
      contributionLabel: 'attacks launched',
    },
  },
} as const satisfies QuestDefinitionCatalog;
