import type { QuestDefinitionCatalog } from '../types.js';

/**
 * Quest roadmap Phase R: rare, meaningful choices that permanently decide a
 * follow-up path for the current round.
 */
export const branchingQuests = {
  TAKING_SIDES: {
    key: 'TAKING_SIDES',
    title: 'Taking Sides',
    description: 'A shipment is ready and both Pip and Tommy know it. Do the work first; when it is time to hand it over, only one of them gets the call.',
    contactKey: null,
    type: 'CONTRACT',
    category: 'UNDERWORLD',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'PIP_BULK_ORDER' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'HEAVY_HANDS' } },
    ],
    objectives: [{
      id: 'prepare_shipment',
      kind: 'EVENT_SUM',
      description: 'Produce 250 units of product for the shipment.',
      target: 250,
      params: { eventTypes: ['PRODUCE_CRACK'], field: 'product' },
    }],
    bonusObjectives: [],
    rewards: [],
    branches: [
      {
        key: 'PIP',
        title: 'Give it to Pip',
        description: 'Pip gets the shipment, opens a higher-risk product line early, and Tommy remembers being cut out.',
        rewards: [
          { kind: 'CASH', amount: 2_000_000 },
          { kind: 'FAVOR_ITEM', key: 'PIP_CONNECTION', amount: 2 },
          { kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_HEROIN_ACCESS' },
        ],
        reputationDeltas: [
          { contactKey: 'PIP', amount: 25 },
          { contactKey: 'TOMMY', amount: -10 },
        ],
        followUpKeys: ['PIP_AFTER_HOURS'],
      },
      {
        key: 'TOMMY',
        title: 'Give it to Tommy',
        description: 'Tommy gets the shipment, moves you up the rack early, and Pip remembers who took the weight away from him.',
        rewards: [
          { kind: 'CASH', amount: 2_000_000 },
          { kind: 'FAVOR_ITEM', key: 'TOMMY_VOUCHER', amount: 2 },
          { kind: 'PERMANENT_UNLOCK', key: 'WEAPON_TEK9_ACCESS' },
        ],
        reputationDeltas: [
          { contactKey: 'TOMMY', amount: 25 },
          { contactKey: 'PIP', amount: -10 },
        ],
        followUpKeys: ['TOMMY_BACK_ROOM'],
      },
    ],
    followUpKeys: ['PIP_AFTER_HOURS', 'TOMMY_BACK_ROOM'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: { branching: true },
  },

  PIP_AFTER_HOURS: {
    key: 'PIP_AFTER_HOURS',
    title: 'After Hours',
    description: 'Pip kept the lights on for you. Make the private counter worth the trouble before he decides the favor was wasted.',
    contactKey: 'PIP',
    type: 'SIDE',
    category: 'PRODUCT',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [{
      kind: 'BRANCH_CHOSEN',
      params: { questKey: 'TAKING_SIDES', branchKey: 'PIP' },
    }],
    objectives: [{
      id: 'pip_volume',
      kind: 'EVENT_SUM',
      description: 'Sell 250 units of product to Pip.',
      target: 250,
      params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP' } },
    }],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 3_000_000 },
      { kind: 'FAVOR_ITEM', key: 'PIP_CONNECTION', amount: 2 },
      { kind: 'CONTACT_REP', key: 'PIP', amount: 20 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: { branchFollowUp: true },
  },

  TOMMY_BACK_ROOM: {
    key: 'TOMMY_BACK_ROOM',
    title: 'Back Room',
    description: 'Tommy opened the back room early. Buy enough steel through his counter to prove the extra access belongs in your hands.',
    contactKey: 'TOMMY',
    type: 'SIDE',
    category: 'COMBAT',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [{
      kind: 'BRANCH_CHOSEN',
      params: { questKey: 'TAKING_SIDES', branchKey: 'TOMMY' },
    }],
    objectives: [{
      id: 'tommy_volume',
      kind: 'EVENT_SUM',
      description: 'Buy 3 weapons from Tommy.',
      target: 3,
      params: { eventTypes: ['STORE_BUY'], field: 'quantity', where: { storeKey: 'TOMMY' } },
    }],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 3_000_000 },
      { kind: 'FAVOR_ITEM', key: 'TOMMY_VOUCHER', amount: 2 },
      { kind: 'CONTACT_REP', key: 'TOMMY', amount: 20 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: { branchFollowUp: true },
  },
} as const satisfies QuestDefinitionCatalog;
