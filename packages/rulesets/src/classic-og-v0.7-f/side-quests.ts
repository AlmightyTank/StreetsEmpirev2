import type { QuestDefinitionCatalog } from '../types.js';

/**
 * Quest roadmap Phase H: optional side work for the first three contacts.
 *
 * These jobs deliberately reuse normal gameplay events. Nothing here adds a
 * quest-only button or action path.
 */
export const sideQuests = {
  MAMA_RECRUITMENT_DRIVE: {
    key: 'MAMA_RECRUITMENT_DRIVE',
    title: 'Recruitment Drive',
    description: 'Mama has more corners than dependable faces. Bring fresh workers into the operation and show her you can grow without buying a crew.',
    contactKey: 'MAMA_KING',
    type: 'SIDE',
    category: 'STREET',
    difficulty: 'STREET_JOB',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'FRESH_FACES' } },
    ],
    objectives: [
      {
        id: 'recruit_whores',
        kind: 'RECRUIT_CREW',
        description: 'Recruit 10 hoes from Scout trips after accepting the job.',
        target: 10,
        params: { eventTypes: ['SCOUT'], crew: 'WHORES' },
      },
    ],
    bonusObjectives: [
      {
        id: 'recruit_thugs',
        kind: 'RECRUIT_CREW',
        description: 'Bonus: recruit 5 thugs while you are out.',
        target: 5,
        params: { eventTypes: ['SCOUT'], crew: 'THUGS' },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 750000 },
      { kind: 'ITEM', key: 'condoms', amount: 50 },
      { kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 10 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  MAMA_NIGHT_SHIFT: {
    key: 'MAMA_NIGHT_SHIFT',
    title: 'Night Shift',
    description: 'Mama wants a real nightclub shift, not a quick walk-through. Work the room long enough to prove that the crew can turn one district into dependable money.',
    contactKey: 'MAMA_KING',
    type: 'SIDE',
    category: 'STREET',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'KEEPING_THEM_HAPPY' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'MAMA_KING', points: 30 } },
    ],
    objectives: [
      {
        id: 'nightclub_turns',
        kind: 'SPEND_TURNS',
        description: 'Spend 24 Scout turns in the Nightclub.',
        target: 24,
        params: { eventTypes: ['SCOUT'], where: { districtKey: 'NIGHTCLUB' } },
      },
      {
        id: 'nightclub_take',
        kind: 'EARN_CASH',
        description: 'Earn $15,000 from those Nightclub Scout trips.',
        target: 1500000,
        params: { eventTypes: ['SCOUT'], where: { districtKey: 'NIGHTCLUB' } },
      },
    ],
    bonusObjectives: [
      {
        id: 'nightclub_recruits',
        kind: 'RECRUIT_CREW',
        description: 'Bonus: recruit 3 hoes during Nightclub Scout trips.',
        target: 3,
        params: { eventTypes: ['SCOUT'], crew: 'WHORES', where: { districtKey: 'NIGHTCLUB' } },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 1000000 },
      { kind: 'ITEM', key: 'beer', amount: 25 },
      { kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 15 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  MAMA_HOUSE_FULL: {
    key: 'MAMA_HOUSE_FULL',
    title: 'House Full',
    description: 'Mama is done judging one good shift at a time. She wants to see an operation with enough people and enough supplies to survive a bad night.',
    contactKey: 'MAMA_KING',
    type: 'SIDE',
    category: 'STREET',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'PAYDAY' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'MAMA_KING', points: 50 } },
    ],
    objectives: [
      { id: 'house_whores', kind: 'STATE_AT_LEAST', description: 'Own at least 25 hoes.', target: 25, params: { field: 'whores' } },
      { id: 'house_thugs', kind: 'STATE_AT_LEAST', description: 'Own at least 15 thugs.', target: 15, params: { field: 'thugs' } },
      { id: 'house_condoms', kind: 'STATE_AT_LEAST', description: 'Have at least 150 condoms.', target: 150, params: { field: 'condoms' } },
      { id: 'house_beer', kind: 'STATE_AT_LEAST', description: 'Have at least 50 beer.', target: 50, params: { field: 'beer' } },
      { id: 'house_crack', kind: 'STATE_AT_LEAST', description: 'Have at least 75 crack.', target: 75, params: { field: 'crack' } },
    ],
    bonusObjectives: [
      { id: 'house_armed', kind: 'STATE_AT_LEAST', description: 'Bonus: have 10 armed, fit thugs.', target: 10, params: { field: 'armedThugs' } },
    ],
    rewards: [
      { kind: 'CASH', amount: 1250000 },
      { kind: 'ITEM', key: 'medicine', amount: 15 },
      { kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 20 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  PIP_BULK_ORDER: {
    key: 'PIP_BULK_ORDER',
    title: 'Bulk Order',
    description: 'Pip has a customer who wants something stronger than rocks. Put together a Meth order and prove your cookhouse can handle more than one recipe.',
    contactKey: 'PIP',
    type: 'SIDE',
    category: 'PRODUCT',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'COOKHOUSE' } },
    ],
    objectives: [
      {
        id: 'cook_meth',
        kind: 'EVENT_SUM',
        description: 'Produce 150 Meth after accepting the job.',
        target: 150,
        params: { eventTypes: ['PRODUCE_CRACK'], field: 'product', where: { productType: 'METH' } },
      },
    ],
    bonusObjectives: [
      {
        id: 'cook_crack_bonus',
        kind: 'EVENT_SUM',
        description: 'Bonus: produce 50 Crack while filling the order.',
        target: 50,
        params: { eventTypes: ['PRODUCE_CRACK'], field: 'product', where: { productType: 'CRACK' } },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 1000000 },
      { kind: 'CONTACT_REP', key: 'PIP', amount: 15 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  PIP_PARTY_FAVORS: {
    key: 'PIP_PARTY_FAVORS',
    title: 'Party Favors',
    description: 'The club crowd is running hot and Pip wants Ecstasy on hand before somebody else fills the gap.',
    contactKey: 'PIP',
    type: 'SIDE',
    category: 'PRODUCT',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'COOKHOUSE' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'PIP', points: 25 } },
    ],
    objectives: [
      {
        id: 'cook_ecstasy',
        kind: 'EVENT_SUM',
        description: 'Produce 100 Ecstasy after accepting the job.',
        target: 100,
        params: { eventTypes: ['PRODUCE_CRACK'], field: 'product', where: { productType: 'ECSTASY' } },
      },
    ],
    bonusObjectives: [
      {
        id: 'sell_ecstasy',
        kind: 'EVENT_SUM',
        description: 'Bonus: sell 50 Ecstasy to Pip.',
        target: 50,
        params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP', product: 'ECSTASY' } },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 1250000 },
      { kind: 'ITEM', key: 'crack', amount: 50 },
      { kind: 'CONTACT_REP', key: 'PIP', amount: 15 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  PIP_MOVE_THE_WEIGHT: {
    key: 'PIP_MOVE_THE_WEIGHT',
    title: 'Move the Weight',
    description: 'Pip does not need another cook. He needs distribution. Bring him a mixed load so he can cover more than one kind of customer.',
    contactKey: 'PIP',
    type: 'SIDE',
    category: 'PRODUCT',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'COOKHOUSE' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'PIP', points: 40 } },
    ],
    objectives: [
      {
        id: 'sell_weed',
        kind: 'EVENT_SUM',
        description: 'Sell 100 Weed to Pip.',
        target: 100,
        params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP', product: 'WEED' } },
      },
      {
        id: 'sell_ecstasy',
        kind: 'EVENT_SUM',
        description: 'Sell 50 Ecstasy to Pip.',
        target: 50,
        params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP', product: 'ECSTASY' } },
      },
      {
        id: 'sell_meth',
        kind: 'EVENT_SUM',
        description: 'Sell 50 Meth to Pip.',
        target: 50,
        params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP', product: 'METH' } },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 2000000 },
      { kind: 'CONTACT_REP', key: 'PIP', amount: 20 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  TOMMY_STOCK_THE_CREW: {
    key: 'TOMMY_STOCK_THE_CREW',
    title: 'Stock the Crew',
    description: 'Tommy says one good gun does not make a crew dangerous. Put enough pistols through his counter to arm the people doing the work.',
    contactKey: 'TOMMY',
    type: 'SIDE',
    category: 'COMBAT',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'HEAVY_HANDS' } },
    ],
    objectives: [
      {
        id: 'buy_pistols',
        kind: 'EVENT_SUM',
        description: 'Buy 15 pistols from Tommy after accepting the job.',
        target: 15,
        params: { eventTypes: ['STORE_BUY'], field: 'quantity', where: { storeKey: 'TOMMY', itemKey: 'PISTOL' } },
      },
    ],
    bonusObjectives: [
      { id: 'armed_crew', kind: 'STATE_AT_LEAST', description: 'Bonus: have at least 15 armed, fit thugs.', target: 15, params: { field: 'armedThugs' } },
    ],
    rewards: [
      { kind: 'CASH', amount: 750000 },
      { kind: 'ITEM', key: 'medicine', amount: 5 },
      { kind: 'CONTACT_REP', key: 'TOMMY', amount: 10 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  TOMMY_TWO_COLLECTIONS: {
    key: 'TOMMY_TWO_COLLECTIONS',
    title: 'Two Collections',
    description: 'One win can be luck. Tommy wants two successful collections before he starts sending better work your way.',
    contactKey: 'TOMMY',
    type: 'SIDE',
    category: 'COMBAT',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'EYES_OPEN' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'TOMMY', points: 30 } },
    ],
    objectives: [
      {
        id: 'raid_wins',
        kind: 'WIN_EVENTS',
        description: 'Win 2 raids.',
        target: 2,
        params: { eventTypes: ['RAID_ATTACK'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'recons',
        kind: 'EVENT_COUNT',
        description: 'Bonus: run recon twice while working the contract.',
        target: 2,
        params: { eventTypes: ['COMBAT_RECON'] },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 1500000 },
      { kind: 'ITEM', key: 'medicine', amount: 10 },
      { kind: 'CONTACT_REP', key: 'TOMMY', amount: 15 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  TOMMY_PATCH_JOB: {
    key: 'TOMMY_PATCH_JOB',
    title: 'Patch Job',
    description: 'Anybody can throw bodies at a problem. Tommy wants proof you can put wounded muscle back on its feet instead of replacing it.',
    contactKey: 'TOMMY',
    type: 'SIDE',
    category: 'COMBAT',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'COLLECTION_DAY' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'TOMMY', points: 50 } },
    ],
    objectives: [
      {
        id: 'treat_thugs',
        kind: 'EVENT_SUM',
        description: 'Treat 10 wounded thugs.',
        target: 10,
        params: { eventTypes: ['COMBAT_TREATMENT'], field: 'treatedThugs' },
      },
    ],
    bonusObjectives: [
      { id: 'armed_reserve', kind: 'STATE_AT_LEAST', description: 'Bonus: have 20 armed, fit thugs after treatment.', target: 20, params: { field: 'armedThugs' } },
    ],
    rewards: [
      { kind: 'CASH', amount: 1250000 },
      { kind: 'ITEM', key: 'medicine', amount: 25 },
      { kind: 'CONTACT_REP', key: 'TOMMY', amount: 20 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },
} as const satisfies QuestDefinitionCatalog;
