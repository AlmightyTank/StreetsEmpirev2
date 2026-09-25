import type { QuestDefinitionCatalog } from '../types.js';

/**
 * Quest roadmap Phase N: the final two contracts in the first handcrafted
 * 30-Job catalog.
 *
 * Both jobs reuse existing store/combat activity. No quest-only action is
 * introduced here.
 */
export const capstoneQuests = {
  PIP_TOP_SHELF: {
    key: 'PIP_TOP_SHELF',
    title: 'Top Shelf',
    description: 'Pip has watched you move ordinary weight. Now he wants the expensive product handled cleanly enough that his best customers keep calling.',
    contactKey: 'PIP',
    type: 'SIDE',
    category: 'PRODUCT',
    difficulty: 'KINGPIN_CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'PIP_MOVE_THE_WEIGHT' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'PIP', points: 60 } },
    ],
    objectives: [
      {
        id: 'sell_cocaine',
        kind: 'EVENT_SUM',
        description: 'Sell 50 Cocaine to Pip.',
        target: 50,
        params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP', product: 'COCAINE' } },
      },
      {
        id: 'sell_heroin',
        kind: 'EVENT_SUM',
        description: 'Sell 25 Heroin to Pip.',
        target: 25,
        params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP', product: 'HEROIN' } },
      },
    ],
    bonusObjectives: [
      {
        id: 'sell_meth',
        kind: 'EVENT_SUM',
        description: 'Bonus: sell 50 Meth to Pip while filling the order.',
        target: 50,
        params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP', product: 'METH' } },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 3000000 },
      { kind: 'FAVOR_ITEM', key: 'PIP_CONNECTION', amount: 2 },
      { kind: 'CONTACT_REP', key: 'PIP', amount: 25 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  TOMMY_FULL_RACK: {
    key: 'TOMMY_FULL_RACK',
    title: 'Full Rack',
    description: 'Tommy is done grading you on pistols and cleanup work. Buy the top shelf, put it behind real muscle, and prove the crew can win with it.',
    contactKey: 'TOMMY',
    type: 'SIDE',
    category: 'COMBAT',
    difficulty: 'KINGPIN_CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'TOMMY_PATCH_JOB' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'PLANT_THE_FLAG' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'TOMMY', points: 90 } },
    ],
    objectives: [
      {
        id: 'buy_ak47s',
        kind: 'EVENT_SUM',
        description: 'Buy 5 AK-47s from Tommy.',
        target: 5,
        params: { eventTypes: ['STORE_BUY'], field: 'quantity', where: { storeKey: 'TOMMY', itemKey: 'AK47' } },
      },
      {
        id: 'raid_wins',
        kind: 'WIN_EVENTS',
        description: 'Win 3 raids.',
        target: 3,
        params: { eventTypes: ['RAID_ATTACK'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'armed_force',
        kind: 'STATE_AT_LEAST',
        description: 'Bonus: have at least 30 armed, fit thugs.',
        target: 30,
        params: { field: 'armedThugs' },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 3500000 },
      { kind: 'FAVOR_ITEM', key: 'TOMMY_VOUCHER', amount: 2 },
      { kind: 'FAVOR_ITEM', key: 'BURNER_PHONE', amount: 1 },
      { kind: 'CONTACT_REP', key: 'TOMMY', amount: 25 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },
} as const satisfies QuestDefinitionCatalog;
