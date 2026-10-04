import type { QuestDefinitionCatalog } from '../types.js';

/**
 * 1.4.0-B. Each faction's own Jobs.
 *
 * Two one-time Jobs per faction: the first opens at Known, the second at Trusted. Civic
 * Handshake has no contact to get you Known, so its first Job is open to anyone and its second
 * opens at Known. Every objective is ordinary play in the faction's lane, read from signals the
 * game already sends.
 *
 * A faction Job pays standing with the faction it works for (and, for the one joint Job, the
 * faction it openly helps), never contact reputation, so it is never counted twice. The cash is
 * modest. Civic Handshake's Jobs pay standing only: the payroll costs money, and a Job is never
 * a rebate on it or a way to clear a Case.
 */
export const factionJobs = {
  KINGS_NEIGHBORHOOD_WATCH: {
    key: 'KINGS_NEIGHBORHOOD_WATCH',
    title: 'Neighborhood Watch',
    description: 'The Kings keep their blocks by making an example of anyone who reaches for them. Blocks wants you making a few examples of your own.',
    contactKey: 'BLOCKS',
    factionKey: 'KINGS',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'KINGS', tier: 'KNOWN' } },
    ],
    objectives: [
      {
        id: 'raids',
        kind: 'WIN_EVENTS',
        description: 'Win 3 raids.',
        target: 3,
        params: { eventTypes: ['RAID_ATTACK'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'recon',
        kind: 'EVENT_COUNT',
        description: 'Bonus: scout a target before you hit it.',
        target: 1,
        params: { eventTypes: ['COMBAT_RECON'] },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 1_500_000 },
      { kind: 'FACTION_STANDING', key: 'KINGS', amount: 15 },
    ],
    followUpKeys: ['KINGS_BLOCK_PARTY'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  KINGS_BLOCK_PARTY: {
    key: 'KINGS_BLOCK_PARTY',
    title: 'Block Party',
    description: 'Mama King wants the whole neighborhood to see the Kings’ colors on corners that used to be somebody else’s.',
    contactKey: 'MAMA_KING',
    factionKey: 'KINGS',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'KINGS', tier: 'TRUSTED' } },
    ],
    objectives: [
      {
        id: 'pushes',
        kind: 'WIN_EVENTS',
        description: 'Win 2 turf pushes.',
        target: 2,
        params: { eventTypes: ['TURF_PUSH_ATTACK'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'hold',
        kind: 'EVENT_COUNT',
        description: 'Bonus: hold a block against a push.',
        target: 1,
        params: { eventTypes: ['TURF_PUSH_DEFENSE'], where: { held: true } },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 2_500_000 },
      { kind: 'ITEM', key: 'beer', amount: 40 },
      { kind: 'FACTION_STANDING', key: 'KINGS', amount: 25 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  OUTFIT_PROTECTION_MONEY: {
    key: 'OUTFIT_PROTECTION_MONEY',
    title: 'Protection Money',
    description: 'Tommy says a business without a racket is a charity. The Outfit wants to see you run one.',
    contactKey: 'TOMMY',
    factionKey: 'OUTFIT',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'OUTFIT', tier: 'KNOWN' } },
    ],
    objectives: [
      {
        id: 'racket',
        kind: 'EVENT_COUNT',
        description: 'Set a racket running on one of your businesses.',
        target: 1,
        params: { eventTypes: ['BUSINESS_RACKET'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'collect',
        kind: 'EVENT_COUNT',
        description: 'Bonus: collect from your businesses.',
        target: 1,
        params: { eventTypes: ['BUSINESS_COLLECT'] },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 1_500_000 },
      { kind: 'FACTION_STANDING', key: 'OUTFIT', amount: 15 },
    ],
    followUpKeys: ['OUTFIT_THE_VIG'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  OUTFIT_THE_VIG: {
    key: 'OUTFIT_THE_VIG',
    title: 'The Vig',
    description: 'The Outfit gets paid every week, rain or shine. Tommy wants to see you collect like you mean it.',
    contactKey: 'TOMMY',
    factionKey: 'OUTFIT',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'OUTFIT', tier: 'TRUSTED' } },
    ],
    objectives: [
      {
        id: 'collections',
        kind: 'EVENT_COUNT',
        description: 'Collect from your businesses 3 times.',
        target: 3,
        params: { eventTypes: ['BUSINESS_COLLECT'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'drive_by',
        kind: 'WIN_EVENTS',
        description: 'Bonus: land a drive-by on someone who is late paying.',
        target: 1,
        params: { eventTypes: ['DRIVE_BY_ATTACK'] },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 2_500_000 },
      { kind: 'ITEM', key: 'medicine', amount: 20 },
      { kind: 'FACTION_STANDING', key: 'OUTFIT', amount: 25 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  SAINTS_CLEAN_MILES: {
    key: 'SAINTS_CLEAN_MILES',
    title: 'Clean Miles',
    description: 'The Road Saints judge a crew by how it rides. Wheels wants to see your runs come home without a scratch.',
    contactKey: 'WHEELS',
    factionKey: 'ROAD_SAINTS',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'ROAD_SAINTS', tier: 'KNOWN' } },
    ],
    objectives: [
      {
        id: 'clean_runs',
        kind: 'EVENT_COUNT',
        description: 'Bring 2 runs home without a road incident.',
        target: 2,
        params: { eventTypes: ['RUN_RETURNED'], where: { incidents: [] } },
      },
    ],
    bonusObjectives: [
      {
        id: 'boss_aboard',
        kind: 'EVENT_COUNT',
        description: 'Bonus: ride along on one of them.',
        target: 1,
        params: { eventTypes: ['RUN_RETURNED'], where: { bossAboard: true } },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 1_500_000 },
      { kind: 'FACTION_STANDING', key: 'ROAD_SAINTS', amount: 15 },
    ],
    followUpKeys: ['SAINTS_LONG_HAUL'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  SAINTS_LONG_HAUL: {
    key: 'SAINTS_LONG_HAUL',
    title: 'Long Haul',
    description: 'The Saints are driving for the Cartel Line this week, and Wheels needs a crew who can sell on the road. The work helps both of them.',
    contactKey: 'WHEELS',
    factionKey: 'ROAD_SAINTS',
    helps: ['CARTEL_LINE'],
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'ROAD_SAINTS', tier: 'TRUSTED' } },
    ],
    objectives: [
      {
        id: 'road_sales',
        kind: 'EVENT_SUM',
        description: 'Sell 150 product on your runs.',
        target: 150,
        params: { eventTypes: ['RUN_TRADE'], field: 'quantity', where: { direction: 'sell' } },
      },
      {
        id: 'home',
        kind: 'EVENT_COUNT',
        description: 'Bring 2 runs home.',
        target: 2,
        params: { eventTypes: ['RUN_RETURNED'] },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 2_500_000 },
      { kind: 'ITEM', key: 'lowRiders', amount: 1 },
      { kind: 'FACTION_STANDING', key: 'ROAD_SAINTS', amount: 25 },
      { kind: 'FACTION_STANDING', key: 'CARTEL_LINE', amount: 10 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  CARTEL_FRESH_BATCH: {
    key: 'CARTEL_FRESH_BATCH',
    title: 'Fresh Batch',
    description: 'The Cartel Line wants to know you can cook before it trusts you with weight. Pip is watching the numbers.',
    contactKey: 'PIP',
    factionKey: 'CARTEL_LINE',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'CARTEL_LINE', tier: 'KNOWN' } },
    ],
    objectives: [
      {
        id: 'cook',
        kind: 'EVENT_SUM',
        description: 'Produce 100 product.',
        target: 100,
        params: { eventTypes: ['PRODUCE_CRACK'], field: 'product' },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 1_500_000 },
      { kind: 'FACTION_STANDING', key: 'CARTEL_LINE', amount: 15 },
    ],
    followUpKeys: ['CARTEL_KEEP_IT_MOVING'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  CARTEL_KEEP_IT_MOVING: {
    key: 'CARTEL_KEEP_IT_MOVING',
    title: 'Keep It Moving',
    description: 'Product sitting in a stash makes the Line nervous. Pip wants to see it move.',
    contactKey: 'PIP',
    factionKey: 'CARTEL_LINE',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'CARTEL_LINE', tier: 'TRUSTED' } },
    ],
    objectives: [
      {
        id: 'sell',
        kind: 'EVENT_SUM',
        description: 'Sell 300 product to Pip.',
        target: 300,
        params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP' } },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 2_500_000 },
      { kind: 'FACTION_STANDING', key: 'CARTEL_LINE', amount: 25 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  CIVIC_SHAKE_HANDS: {
    key: 'CIVIC_SHAKE_HANDS',
    title: 'Shake Hands',
    description: 'Civic Handshake has no office and no sign on the door. You meet it by putting one of its people on your payroll.',
    contactKey: null,
    factionKey: 'CIVIC_HANDSHAKE',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'CONTRACT',
    prerequisites: [],
    objectives: [
      {
        id: 'hire',
        kind: 'EVENT_COUNT',
        description: 'Put an official on your payroll.',
        target: 1,
        params: { eventTypes: ['OFFICIAL_HIRED'], where: { renewed: false } },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'FACTION_STANDING', key: 'CIVIC_HANDSHAKE', amount: 25 },
    ],
    followUpKeys: ['CIVIC_KEEP_THEM_SWEET'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  CIVIC_KEEP_THEM_SWEET: {
    key: 'CIVIC_KEEP_THEM_SWEET',
    title: 'Keep Them Sweet',
    description: 'An official paid once is a favor. An official paid every week is a friend. Civic Handshake remembers who keeps paying.',
    contactKey: null,
    factionKey: 'CIVIC_HANDSHAKE',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'CIVIC_HANDSHAKE', tier: 'KNOWN' } },
    ],
    objectives: [
      {
        id: 'renew',
        kind: 'EVENT_COUNT',
        description: 'Keep an official on your payroll for another week.',
        target: 1,
        params: { eventTypes: ['OFFICIAL_HIRED'], where: { renewed: true } },
      },
    ],
    bonusObjectives: [
      {
        id: 'two_cities',
        kind: 'UNIQUE_VALUES',
        description: 'Bonus: have officials on your payroll in 2 different cities.',
        target: 2,
        params: { eventTypes: ['OFFICIAL_HIRED'], field: 'cityName' },
      },
    ],
    rewards: [
      { kind: 'FACTION_STANDING', key: 'CIVIC_HANDSHAKE', amount: 25 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },
} as const satisfies QuestDefinitionCatalog;
