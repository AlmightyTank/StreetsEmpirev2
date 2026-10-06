import type { FactionKey, QuestCosmeticCatalog, QuestDefinition, QuestDefinitionCatalog } from '../types.js';

/**
 * 1.4.0-E. Each first-release faction's arc: a Job that opens at Connected, then a capstone that
 * opens at Inner Circle once the first is done. Every objective is ordinary play in the faction's
 * lane, read from signals the game already sends.
 *
 * The Connected Job pays standing and modest cash. The capstone pays standing and a title, never
 * cash or anything that helps in play, and is one-time, so it cannot be farmed. A capstone is out
 * of reach while the faction's Inner Circle is locked by a rival's.
 */
export const factionArcs = {
  KINGS_HOLD_THE_LINE: {
    key: 'KINGS_HOLD_THE_LINE',
    title: 'Hold the Line',
    description: 'Anybody can take a block. Mama King wants to see you keep them, day after day, while the whole street tries you.',
    contactKey: 'MAMA_KING',
    factionKey: 'KINGS',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'HIGH_RISK',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'KINGS', tier: 'CONNECTED' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'KINGS_BLOCK_PARTY' } },
    ],
    objectives: [
      { id: 'hold', kind: 'TURF_HOLD_HOURS', description: 'Hold turf for 96 combined hours.', target: 96, params: {} },
    ],
    bonusObjectives: [
      { id: 'held', kind: 'EVENT_COUNT', description: 'Bonus: hold a block against a push.', target: 1, params: { eventTypes: ['TURF_PUSH_DEFENSE'], where: { held: true } } },
    ],
    rewards: [
      { kind: 'CASH', amount: 3_500_000 },
      // The Kings already have the most one-time standing: 15 keeps Jobs alone just short of Inner Circle.
      { kind: 'FACTION_STANDING', key: 'KINGS', amount: 15 },
    ],
    followUpKeys: ['KINGS_CROWN_OF_THE_BLOCK'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  KINGS_CROWN_OF_THE_BLOCK: {
    key: 'KINGS_CROWN_OF_THE_BLOCK',
    title: 'Crown of the Block',
    description: 'Blocks has one more thing to ask before the Kings call you family: take five corners off crews who thought they were safe.',
    contactKey: 'BLOCKS',
    factionKey: 'KINGS',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'KINGPIN_CONTRACT',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'KINGS', tier: 'INNER_CIRCLE' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'KINGS_HOLD_THE_LINE' } },
    ],
    objectives: [
      { id: 'pushes', kind: 'WIN_EVENTS', description: 'Win 5 turf pushes.', target: 5, params: { eventTypes: ['TURF_PUSH_ATTACK'] } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'FACTION_STANDING', key: 'KINGS', amount: 20 },
      { kind: 'COSMETIC_UNLOCK', key: 'kings-crown-of-the-block' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  OUTFIT_THE_BOOKS: {
    key: 'OUTFIT_THE_BOOKS',
    title: 'The Books',
    description: 'Tommy wants proof you can run more than one kind of racket without the books catching fire.',
    contactKey: 'TOMMY',
    factionKey: 'OUTFIT',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'HIGH_RISK',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'OUTFIT', tier: 'CONNECTED' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'OUTFIT_THE_VIG' } },
    ],
    objectives: [
      { id: 'rackets', kind: 'UNIQUE_VALUES', description: 'Run 2 different rackets.', target: 2, params: { eventTypes: ['BUSINESS_RACKET'], field: 'racket' } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 3_500_000 },
      { kind: 'FACTION_STANDING', key: 'OUTFIT', amount: 30 },
    ],
    followUpKeys: ['OUTFIT_THE_COMMISSION'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  OUTFIT_THE_COMMISSION: {
    key: 'OUTFIT_THE_COMMISSION',
    title: 'The Commission',
    description: 'A seat at the table is earned at the register. Tommy wants to see the envelopes come in, week after week.',
    contactKey: 'TOMMY',
    factionKey: 'OUTFIT',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'KINGPIN_CONTRACT',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'OUTFIT', tier: 'INNER_CIRCLE' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'OUTFIT_THE_BOOKS' } },
    ],
    objectives: [
      { id: 'collect', kind: 'EVENT_COUNT', description: 'Collect from your businesses 10 times.', target: 10, params: { eventTypes: ['BUSINESS_COLLECT'] } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'FACTION_STANDING', key: 'OUTFIT', amount: 20 },
      { kind: 'COSMETIC_UNLOCK', key: 'outfit-seat-at-the-table' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  SAINTS_IRON_CONVOY: {
    key: 'SAINTS_IRON_CONVOY',
    title: 'Iron Convoy',
    description: 'Wheels rides with crews who bring the whole load home. Five clean runs and the club starts saving you a seat.',
    contactKey: 'WHEELS',
    factionKey: 'ROAD_SAINTS',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'HIGH_RISK',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'ROAD_SAINTS', tier: 'CONNECTED' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'SAINTS_LONG_HAUL' } },
    ],
    objectives: [
      { id: 'clean', kind: 'EVENT_COUNT', description: 'Bring 5 runs home with no incident.', target: 5, params: { eventTypes: ['RUN_RETURNED'], where: { incidents: [] } } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 3_500_000 },
      { kind: 'FACTION_STANDING', key: 'ROAD_SAINTS', amount: 30 },
    ],
    followUpKeys: ['SAINTS_EVERY_ROAD'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  SAINTS_EVERY_ROAD: {
    key: 'SAINTS_EVERY_ROAD',
    title: 'Every Road',
    description: 'The Saints patch goes to riders who have seen every city on the map from behind the wheel.',
    contactKey: 'WHEELS',
    factionKey: 'ROAD_SAINTS',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'KINGPIN_CONTRACT',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'ROAD_SAINTS', tier: 'INNER_CIRCLE' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'SAINTS_IRON_CONVOY' } },
    ],
    objectives: [
      { id: 'cities', kind: 'UNIQUE_VALUES', description: 'Bring runs home from 6 different cities.', target: 6, params: { eventTypes: ['RUN_RETURNED'], field: 'cities' } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'FACTION_STANDING', key: 'ROAD_SAINTS', amount: 20 },
      { kind: 'COSMETIC_UNLOCK', key: 'road-saints-full-patch' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  CARTEL_WHOLESALE: {
    key: 'CARTEL_WHOLESALE',
    title: 'Wholesale',
    description: 'Pip’s people want a cook who never runs dry. Five hundred units, and they start talking volume.',
    contactKey: 'PIP',
    factionKey: 'CARTEL_LINE',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'HIGH_RISK',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'CARTEL_LINE', tier: 'CONNECTED' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'CARTEL_KEEP_IT_MOVING' } },
    ],
    objectives: [
      { id: 'cook', kind: 'EVENT_SUM', description: 'Produce 500 product.', target: 500, params: { eventTypes: ['PRODUCE_CRACK'], field: 'product' } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 3_500_000 },
      { kind: 'FACTION_STANDING', key: 'CARTEL_LINE', amount: 30 },
    ],
    followUpKeys: ['CARTEL_THE_PIPELINE'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  CARTEL_THE_PIPELINE: {
    key: 'CARTEL_THE_PIPELINE',
    title: 'The Pipeline',
    description: 'The Line trusts a partner who moves it as fast as they make it. Pip wants to see fifteen hundred units come back across his counter.',
    contactKey: 'PIP',
    factionKey: 'CARTEL_LINE',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'KINGPIN_CONTRACT',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'CARTEL_LINE', tier: 'INNER_CIRCLE' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'CARTEL_WHOLESALE' } },
    ],
    objectives: [
      { id: 'sell', kind: 'EVENT_SUM', description: 'Sell 1,500 product to Pip.', target: 1_500, params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP' } } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'FACTION_STANDING', key: 'CARTEL_LINE', amount: 20 },
      { kind: 'COSMETIC_UNLOCK', key: 'cartel-line-the-pipeline' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  CIVIC_FRIENDS_IN_HIGH_PLACES: {
    key: 'CIVIC_FRIENDS_IN_HIGH_PLACES',
    title: 'Friends in High Places',
    description: 'One city’s officials are a convenience. Three cities’ are a network, and Civic Handshake only deals with networks.',
    contactKey: null,
    factionKey: 'CIVIC_HANDSHAKE',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'HIGH_RISK',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'CIVIC_HANDSHAKE', tier: 'CONNECTED' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'CIVIC_KEEP_THEM_SWEET' } },
    ],
    objectives: [
      { id: 'cities', kind: 'UNIQUE_VALUES', description: 'Put officials on your payroll in 3 different cities.', target: 3, params: { eventTypes: ['OFFICIAL_HIRED'], field: 'cityName' } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'FACTION_STANDING', key: 'CIVIC_HANDSHAKE', amount: 40 },
    ],
    followUpKeys: ['CIVIC_UNTOUCHABLE'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  CIVIC_UNTOUCHABLE: {
    key: 'CIVIC_UNTOUCHABLE',
    title: 'Untouchable',
    description: 'The people who matter stay on the payroll for good. Keep paying, week in and week out, and Civic Handshake stops asking who you are.',
    contactKey: null,
    factionKey: 'CIVIC_HANDSHAKE',
    type: 'SIDE',
    category: 'FACTION',
    difficulty: 'KINGPIN_CONTRACT',
    prerequisites: [
      { kind: 'FACTION_STANDING_AT_LEAST', params: { factionKey: 'CIVIC_HANDSHAKE', tier: 'INNER_CIRCLE' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'CIVIC_FRIENDS_IN_HIGH_PLACES' } },
    ],
    objectives: [
      { id: 'renew', kind: 'EVENT_COUNT', description: 'Keep officials on your payroll for 4 more weeks.', target: 4, params: { eventTypes: ['OFFICIAL_HIRED'], where: { renewed: true } } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'FACTION_STANDING', key: 'CIVIC_HANDSHAKE', amount: 20 },
      { kind: 'COSMETIC_UNLOCK', key: 'civic-handshake-untouchable' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },
} as const satisfies QuestDefinitionCatalog;

/** 1.4.0-E. The capstone titles. Earned once per account, worn on the profile. */
export const factionCapstoneCosmetics = {
  'kings-crown-of-the-block': {
    key: 'kings-crown-of-the-block',
    name: 'Crown of the Block',
    description: 'Reached the Kings’ Inner Circle and took five corners to prove it.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  'outfit-seat-at-the-table': {
    key: 'outfit-seat-at-the-table',
    name: 'Seat at the Table',
    description: 'Reached the Outfit’s Inner Circle and kept the envelopes coming.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  'road-saints-full-patch': {
    key: 'road-saints-full-patch',
    name: 'Full Patch',
    description: 'Reached Road Saints MC’s Inner Circle and rode every road home.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  'cartel-line-the-pipeline': {
    key: 'cartel-line-the-pipeline',
    name: 'The Pipeline',
    description: 'Reached the Cartel Line’s Inner Circle and moved it as fast as it was made.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  'civic-handshake-untouchable': {
    key: 'civic-handshake-untouchable',
    name: 'Untouchable',
    description: 'Reached Civic Handshake’s Inner Circle and kept the payroll paid.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
} as const satisfies QuestCosmeticCatalog;

const INTRODUCTIONS: Array<{ faction: FactionKey; key: string; title: string; description: string; meet: string }> = [
  { faction: 'KINGS', key: 'VIC_INTRO_KINGS', title: 'A Word with the Kings', description: 'Vic knows Mama King from before the blocks had names. For a fee, he will tell her you are worth a conversation.', meet: 'Work the street for 10 turns while Vic sets up the meet.' },
  { faction: 'OUTFIT', key: 'VIC_INTRO_OUTFIT', title: 'A Word with the Outfit', description: 'The Outfit does not take walk-ins. Vic can get you a chair across from Tommy, if you cover his time.', meet: 'Work the street for 10 turns while Vic sets up the meet.' },
  { faction: 'ROAD_SAINTS', key: 'VIC_INTRO_ROAD_SAINTS', title: 'A Word with the Saints', description: 'Wheels does not ride with strangers. Vic has a number for the clubhouse and a reason for them to pick up.', meet: 'Work the street for 10 turns while Vic sets up the meet.' },
  { faction: 'CARTEL_LINE', key: 'VIC_INTRO_CARTEL_LINE', title: 'A Word with the Line', description: 'Pip sells to anybody. The people behind Pip do not. Vic can put your name in front of them.', meet: 'Work the street for 10 turns while Vic sets up the meet.' },
  { faction: 'CIVIC_HANDSHAKE', key: 'VIC_INTRO_CIVIC_HANDSHAKE', title: 'A Word at City Hall', description: 'Civic Handshake has no door to knock on. Vic knows which clerk to buy lunch for.', meet: 'Work the street for 10 turns while Vic sets up the meet.' },
];

/**
 * 1.4.0-E. Vic's introductions. Vic is a broker, not a faction: for a fee he starts you at Known
 * with a faction you have no standing with yet. The claim pays the fee and the standing; the Job
 * itself pays nothing else. It never touches Inner Circle, so it can never open a locked one.
 */
export const vicIntroductions: QuestDefinitionCatalog = Object.fromEntries(INTRODUCTIONS.map(({ faction, key, title, description, meet }): [string, QuestDefinition] => [key, {
  key,
  title,
  description,
  contactKey: 'VIC',
  introduces: faction,
  fee: { netWorthShare: 0.002, minCents: 2_000_000 },
  type: 'SIDE',
  category: 'FACTION',
  difficulty: 'CONTRACT',
  prerequisites: [
    { kind: 'FACTION_STANDING_BELOW', params: { factionKey: faction, tier: 'KNOWN' } },
  ],
  objectives: [
    { id: 'meet', kind: 'SPEND_TURNS', description: meet, target: 10, params: { eventTypes: ['SCOUT', 'WORK_STREETS'] } },
  ],
  bonusObjectives: [],
  rewards: [],
  followUpKeys: [],
  repeatability: 'ONCE',
  expiresAfterMinutes: null,
  availability: {},
}]));
