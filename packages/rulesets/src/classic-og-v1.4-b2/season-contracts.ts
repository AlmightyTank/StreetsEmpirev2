import type {
  QuestDefinition,
  QuestDifficulty,
  QuestObjectiveDefinition,
  QuestRewardDefinition,
} from '../types.js';

interface SeasonInput {
  key: string;
  title: string;
  description: string;
  contactKey: string;
  category: string;
  difficulty: QuestDifficulty;
  objective: QuestObjectiveDefinition;
  rewards: readonly QuestRewardDefinition[];
}

function season(input: SeasonInput): QuestDefinition {
  return {
    key: input.key,
    title: input.title,
    description: input.description,
    contactKey: input.contactKey,
    type: 'SEASON',
    category: input.category,
    difficulty: input.difficulty,
    prerequisites: [],
    objectives: [input.objective],
    bonusObjectives: [],
    rewards: [...input.rewards, { kind: 'CONTACT_REP', key: input.contactKey, amount: 25 }],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: { rotationPool: 'SEASON_CONTRACTS' },
  };
}

/**
 * 1.4.0-B2 Season board. Each round deals three of these from its own deck, so a new
 * game gets a different set. They run the whole round, sit outside the active-job
 * limit and can be finished once.
 */
export const seasonContracts = {
  SEASON_STREET_EMPIRE: season({
    key: 'SEASON_STREET_EMPIRE',
    title: 'Street Empire',
    description: 'Mama wants this season remembered as the one your crew owned the street.',
    contactKey: 'MAMA_KING',
    category: 'STREET',
    difficulty: 'KINGPIN_CONTRACT',
    objective: {
      id: 'season_street_cash',
      kind: 'EARN_CASH',
      description: 'Earn $2,000,000 from street work or production this season.',
      target: 200_000_000,
      params: { eventTypes: ['SCOUT', 'WORK_STREETS', 'PRODUCE_CRACK'] },
    },
    rewards: [
      { kind: 'CASH', amount: 12_000_000 },
      { kind: 'FAVOR_ITEM', key: 'MAMA_ADVICE', amount: 3 },
    ],
  }),

  SEASON_CARTEL_VOLUME: season({
    key: 'SEASON_CARTEL_VOLUME',
    title: 'Cartel Volume',
    description: 'The people behind Pip are watching whose product moves. Make sure it is yours.',
    contactKey: 'PIP',
    category: 'PRODUCT',
    difficulty: 'KINGPIN_CONTRACT',
    objective: {
      id: 'season_units',
      kind: 'EVENT_SUM',
      description: 'Sell 5,000 units of product to Pip this season.',
      target: 5_000,
      params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP' } },
    },
    rewards: [
      { kind: 'CASH', amount: 12_000_000 },
      { kind: 'FAVOR_ITEM', key: 'PIP_CONNECTION', amount: 3 },
    ],
  }),

  SEASON_WAR_RECORD: season({
    key: 'SEASON_WAR_RECORD',
    title: 'War Record',
    description: 'Tommy keeps a book of who won what. He wants your name on a lot of pages.',
    contactKey: 'TOMMY',
    category: 'COMBAT',
    difficulty: 'KINGPIN_CONTRACT',
    objective: {
      id: 'season_wins',
      kind: 'WIN_EVENTS',
      description: 'Win 20 raids, drive-bys or turf pushes this season.',
      target: 20,
      params: { eventTypes: ['RAID_ATTACK', 'DRIVE_BY_ATTACK', 'TURF_PUSH_ATTACK'] },
    },
    rewards: [
      { kind: 'CASH', amount: 15_000_000 },
      { kind: 'FAVOR_ITEM', key: 'TOMMY_VOUCHER', amount: 3 },
    ],
  }),

  SEASON_ROAD_EMPIRE: season({
    key: 'SEASON_ROAD_EMPIRE',
    title: 'Road Empire',
    description: 'Wheels wants every trucker on the interstate to know your plates.',
    contactKey: 'WHEELS',
    category: 'TRAVEL',
    difficulty: 'KINGPIN_CONTRACT',
    objective: {
      id: 'season_runs',
      kind: 'EVENT_COUNT',
      description: 'Bring 20 intercity runs home this season.',
      target: 20,
      params: { eventTypes: ['RUN_RETURNED'] },
    },
    rewards: [
      { kind: 'CASH', amount: 12_000_000 },
      { kind: 'ITEM', key: 'lowRiders', amount: 3 },
    ],
  }),

  SEASON_COAST_TO_COAST: season({
    key: 'SEASON_COAST_TO_COAST',
    title: 'Coast to Coast',
    description: 'Wheels says a real operation has a contact in every city on the map.',
    contactKey: 'WHEELS',
    category: 'TRAVEL',
    difficulty: 'KINGPIN_CONTRACT',
    objective: {
      id: 'season_cities',
      kind: 'UNIQUE_VALUES',
      description: 'Visit 7 different cities on returned runs this season.',
      target: 7,
      params: { eventTypes: ['RUN_RETURNED'], field: 'cities' },
    },
    rewards: [
      { kind: 'CASH', amount: 10_000_000 },
      { kind: 'ITEM', key: 'lowRiders', amount: 2 },
    ],
  }),

  SEASON_CITY_MAP: season({
    key: 'SEASON_CITY_MAP',
    title: 'City Map',
    description: 'Blocks wants to color in the map. Every block you take is another one he can point at.',
    contactKey: 'BLOCKS',
    category: 'TURF',
    difficulty: 'KINGPIN_CONTRACT',
    objective: {
      id: 'season_claims',
      kind: 'WIN_EVENTS',
      description: 'Successfully claim 15 city blocks this season.',
      target: 15,
      params: { eventTypes: ['TURF_CLAIM'] },
    },
    rewards: [
      { kind: 'CASH', amount: 12_000_000 },
      { kind: 'FAVOR_ITEM', key: 'DOCTOR_FAVOR', amount: 2 },
    ],
  }),

  SEASON_WHALE: season({
    key: 'SEASON_WHALE',
    title: 'Whale',
    description: 'Ace saves the best suite for the players the pit bosses know by name.',
    contactKey: 'ACE',
    category: 'CASINO',
    difficulty: 'KINGPIN_CONTRACT',
    objective: {
      id: 'season_wagers',
      kind: 'EVENT_COUNT',
      description: 'Place 300 casino wagers this season.',
      target: 300,
      params: { eventTypes: ['CASINO_WAGER'] },
    },
    rewards: [{ kind: 'CASH', amount: 12_000_000 }],
  }),

  SEASON_FRONT_OFFICE: season({
    key: 'SEASON_FRONT_OFFICE',
    title: 'Front Office',
    description: 'Vic wants the fronts to look so legitimate the tax man sends a thank-you card.',
    contactKey: 'VIC',
    category: 'BUSINESS',
    difficulty: 'KINGPIN_CONTRACT',
    objective: {
      id: 'season_collect',
      kind: 'EVENT_SUM',
      description: 'Collect $1,000,000 from your businesses this season.',
      target: 100_000_000,
      params: { eventTypes: ['BUSINESS_COLLECT'], field: 'collectedCents', display: 'CURRENCY' },
    },
    rewards: [{ kind: 'CASH', amount: 15_000_000 }],
  }),

  SEASON_CLEAN_BOOKS: season({
    key: 'SEASON_CLEAN_BOOKS',
    title: 'Clean Books',
    description: 'Ledger says anyone can get noticed. The ones who last are the ones who make the police lose interest.',
    contactKey: 'LEDGER',
    category: 'LAW',
    difficulty: 'KINGPIN_CONTRACT',
    objective: {
      id: 'season_cooled',
      kind: 'EVENT_COUNT',
      description: 'Let a city’s Case cool down 5 times this season.',
      target: 5,
      params: { eventTypes: ['CASE_COOLED'] },
    },
    rewards: [
      { kind: 'CASH', amount: 10_000_000 },
      { kind: 'FAVOR_ITEM', key: 'BURNER_PHONE', amount: 2 },
    ],
  }),
} as const;
