import type {
  QuestDefinition,
  QuestDifficulty,
  QuestObjectiveDefinition,
  QuestRewardDefinition,
} from '../types.js';

interface DailyInput {
  key: string;
  title: string;
  description: string;
  contactKey: string;
  category: string;
  difficulty: QuestDifficulty;
  objective: QuestObjectiveDefinition;
  rewards: readonly QuestRewardDefinition[];
}

function daily(input: DailyInput): QuestDefinition {
  return {
    key: input.key,
    title: input.title,
    description: input.description,
    contactKey: input.contactKey,
    type: 'DAILY',
    category: input.category,
    difficulty: input.difficulty,
    prerequisites: [],
    objectives: [input.objective],
    bonusObjectives: [],
    rewards: [...input.rewards, { kind: 'CONTACT_REP', key: input.contactKey, amount: 2 }],
    followUpKeys: [],
    repeatability: 'DAILY',
    expiresAfterMinutes: null,
    availability: { rotationPool: 'DAILY_CONTRACTS' },
  };
}

/**
 * 1.4.0-A2: twenty-eight more daily contracts. With the eight from 0.7-N the pool
 * holds thirty-six, so a three-slot board runs twelve days before any contract
 * comes back. Six of them cover systems no contract tracked before: businesses,
 * block wars, convoys, boss trips, boss hits and outposts.
 */
export const moreDailyContracts = {
  DAILY_NIGHTCLUB_ROUNDS: daily({
    key: 'DAILY_NIGHTCLUB_ROUNDS',
    title: 'Nightclub Rounds',
    description: 'Mama wants the crew seen where the money comes out at night.',
    contactKey: 'MAMA_KING',
    category: 'STREET',
    difficulty: 'STREET_JOB',
    objective: {
      id: 'nightclub_turns',
      kind: 'SPEND_TURNS',
      description: 'Spend 15 Scout turns in the Nightclub.',
      target: 15,
      params: { eventTypes: ['SCOUT'], where: { districtKey: 'NIGHTCLUB' } },
    },
    rewards: [{ kind: 'CASH', amount: 900_000 }],
  }),

  DAILY_NEW_FACES: daily({
    key: 'DAILY_NEW_FACES',
    title: 'New Faces',
    description: 'A few girls are looking for someone who keeps them safe. Mama says go find them.',
    contactKey: 'MAMA_KING',
    category: 'STREET',
    difficulty: 'STREET_JOB',
    objective: {
      id: 'recruit_hoes',
      kind: 'RECRUIT_CREW',
      description: 'Recruit 5 hoes from Scout trips.',
      target: 5,
      params: { eventTypes: ['SCOUT'], crew: 'WHORES' },
    },
    rewards: [{ kind: 'ITEM', key: 'condoms', amount: 300 }],
  }),

  DAILY_BIG_TAKE: daily({
    key: 'DAILY_BIG_TAKE',
    title: 'Big Take',
    description: 'Mama wants a day the crew talks about. Make the street pay twice what it usually does.',
    contactKey: 'MAMA_KING',
    category: 'STREET',
    difficulty: 'CONTRACT',
    objective: {
      id: 'earn_big',
      kind: 'EARN_CASH',
      description: 'Earn $50,000 from street work or production.',
      target: 5_000_000,
      params: { eventTypes: ['SCOUT', 'WORK_STREETS', 'PRODUCE_CRACK'] },
    },
    rewards: [{ kind: 'CASH', amount: 1_500_000 }],
  }),

  DAILY_MUSCLE_UP: daily({
    key: 'DAILY_MUSCLE_UP',
    title: 'Muscle Up',
    description: 'Blocks says a corner is only yours while there are enough hands to hold it.',
    contactKey: 'BLOCKS',
    category: 'STREET',
    difficulty: 'STREET_JOB',
    objective: {
      id: 'recruit_thugs',
      kind: 'RECRUIT_CREW',
      description: 'Recruit 3 thugs from Scout trips.',
      target: 3,
      params: { eventTypes: ['SCOUT'], crew: 'THUGS' },
    },
    rewards: [
      { kind: 'CASH', amount: 500_000 },
      { kind: 'ITEM', key: 'beer', amount: 100 },
    ],
  }),

  DAILY_CRACK_BATCH: daily({
    key: 'DAILY_CRACK_BATCH',
    title: 'Crack Batch',
    description: 'Pip is short on rock. Cook him a batch before the counter opens tomorrow.',
    contactKey: 'PIP',
    category: 'PRODUCT',
    difficulty: 'STREET_JOB',
    objective: {
      id: 'cook_crack',
      kind: 'EVENT_SUM',
      description: 'Produce 75 crack.',
      target: 75,
      params: { eventTypes: ['PRODUCE_CRACK'], field: 'product', where: { productType: 'CRACK' } },
    },
    rewards: [{ kind: 'CASH', amount: 1_000_000 }],
  }),

  DAILY_METH_COOK: daily({
    key: 'DAILY_METH_COOK',
    title: 'Meth Cook',
    description: 'A trucker crew put in an order with Pip. They want it today.',
    contactKey: 'PIP',
    category: 'PRODUCT',
    difficulty: 'CONTRACT',
    objective: {
      id: 'cook_meth',
      kind: 'EVENT_SUM',
      description: 'Produce 50 Meth.',
      target: 50,
      params: { eventTypes: ['PRODUCE_CRACK'], field: 'product', where: { productType: 'METH' } },
    },
    rewards: [{ kind: 'CASH', amount: 1_250_000 }],
  }),

  DAILY_PARTY_PACK: daily({
    key: 'DAILY_PARTY_PACK',
    title: 'Party Pack',
    description: 'There is a warehouse party tonight and Pip promised the promoter a delivery.',
    contactKey: 'PIP',
    category: 'PRODUCT',
    difficulty: 'CONTRACT',
    objective: {
      id: 'cook_ecstasy',
      kind: 'EVENT_SUM',
      description: 'Produce 50 Ecstasy.',
      target: 50,
      params: { eventTypes: ['PRODUCE_CRACK'], field: 'product', where: { productType: 'ECSTASY' } },
    },
    rewards: [{ kind: 'CASH', amount: 1_250_000 }],
  }),

  DAILY_GREEN_DAY: daily({
    key: 'DAILY_GREEN_DAY',
    title: 'Green Day',
    description: 'Pip has college buyers lined up. He needs weed on the shelf, not excuses.',
    contactKey: 'PIP',
    category: 'PRODUCT',
    difficulty: 'STREET_JOB',
    objective: {
      id: 'sell_weed',
      kind: 'EVENT_SUM',
      description: 'Sell 50 Weed to Pip.',
      target: 50,
      params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP', product: 'WEED' } },
    },
    rewards: [{ kind: 'CASH', amount: 1_000_000 }],
  }),

  DAILY_COUNTER_CASH: daily({
    key: 'DAILY_COUNTER_CASH',
    title: 'Counter Cash',
    description: 'Pip counts dollars, not units. Put real money across his counter today.',
    contactKey: 'PIP',
    category: 'ECONOMY',
    difficulty: 'CONTRACT',
    objective: {
      id: 'sell_value',
      kind: 'EVENT_SUM',
      description: 'Sell $40,000 of product to Pip.',
      target: 4_000_000,
      params: { eventTypes: ['STORE_SELL'], field: 'totalCents', where: { storeKey: 'PIP' }, display: 'CURRENCY' },
    },
    rewards: [{ kind: 'CASH', amount: 1_250_000 }],
  }),

  DAILY_IRON_ORDER: daily({
    key: 'DAILY_IRON_ORDER',
    title: 'Iron Order',
    description: 'Tommy has a crate in the back that needs to move before the next delivery lands.',
    contactKey: 'TOMMY',
    category: 'COMBAT',
    difficulty: 'STREET_JOB',
    objective: {
      id: 'buy_weapons',
      kind: 'EVENT_SUM',
      description: 'Buy 2 weapons from Tommy.',
      target: 2,
      params: { eventTypes: ['STORE_BUY'], field: 'quantity', where: { storeKey: 'TOMMY' } },
    },
    rewards: [{ kind: 'CASH', amount: 750_000 }],
  }),

  DAILY_SHAKEDOWN: daily({
    key: 'DAILY_SHAKEDOWN',
    title: 'Shakedown',
    description: 'Somebody owes Tommy and stopped picking up the phone. Go collect.',
    contactKey: 'TOMMY',
    category: 'COMBAT',
    difficulty: 'HIGH_RISK',
    objective: {
      id: 'win_raid',
      kind: 'WIN_EVENTS',
      description: 'Win 1 raid.',
      target: 1,
      params: { eventTypes: ['RAID_ATTACK'] },
    },
    rewards: [{ kind: 'CASH', amount: 1_500_000 }],
  }),

  DAILY_ROLL_THROUGH: daily({
    key: 'DAILY_ROLL_THROUGH',
    title: 'Roll Through',
    description: 'Tommy wants a message sent, loud and quick.',
    contactKey: 'TOMMY',
    category: 'COMBAT',
    difficulty: 'HIGH_RISK',
    objective: {
      id: 'win_drive_by',
      kind: 'WIN_EVENTS',
      description: 'Win 1 drive-by.',
      target: 1,
      params: { eventTypes: ['DRIVE_BY_ATTACK'] },
    },
    rewards: [{ kind: 'CASH', amount: 1_250_000 }],
  }),

  DAILY_BIG_PICTURE: daily({
    key: 'DAILY_BIG_PICTURE',
    title: 'Big Picture',
    description: 'One report is a rumor. Tommy wants three before he believes anything.',
    contactKey: 'TOMMY',
    category: 'COMBAT',
    difficulty: 'CONTRACT',
    objective: {
      id: 'recon_three',
      kind: 'EVENT_COUNT',
      description: 'Complete 3 Recons.',
      target: 3,
      params: { eventTypes: ['COMBAT_RECON'] },
    },
    rewards: [{ kind: 'CASH', amount: 1_000_000 }],
  }),

  DAILY_HOMECOMING: daily({
    key: 'DAILY_HOMECOMING',
    title: 'Homecoming',
    description: 'Wheels only gets paid when the car comes back. Bring one home.',
    contactKey: 'WHEELS',
    category: 'TRAVEL',
    difficulty: 'CONTRACT',
    objective: {
      id: 'return_run',
      kind: 'EVENT_COUNT',
      description: 'Bring 1 intercity run home.',
      target: 1,
      params: { eventTypes: ['RUN_RETURNED'] },
    },
    rewards: [{ kind: 'CASH', amount: 1_250_000 }],
  }),

  DAILY_ESCORT_DUTY: daily({
    key: 'DAILY_ESCORT_DUTY',
    title: 'Escort Duty',
    description: 'The highway got rough this week. Wheels wants real muscle riding along.',
    contactKey: 'WHEELS',
    category: 'TRAVEL',
    difficulty: 'CONTRACT',
    objective: {
      id: 'escort_thugs',
      kind: 'EVENT_SUM',
      description: 'Launch runs carrying a total of 10 escort thugs.',
      target: 10,
      params: { eventTypes: ['RUN_LAUNCHED'], field: 'escortThugs' },
    },
    rewards: [{ kind: 'CASH', amount: 1_000_000 }],
  }),

  DAILY_CLEAN_ROAD: daily({
    key: 'DAILY_CLEAN_ROAD',
    title: 'Clean Road',
    description: 'No stops, no flashing lights, no stories. Wheels wants one quiet trip.',
    contactKey: 'WHEELS',
    category: 'TRAVEL',
    difficulty: 'CONTRACT',
    objective: {
      id: 'quiet_return',
      kind: 'EVENT_COUNT',
      description: 'Bring 1 run home without a road incident.',
      target: 1,
      params: { eventTypes: ['RUN_RETURNED'], where: { incidents: [] } },
    },
    rewards: [{ kind: 'CASH', amount: 1_500_000 }],
  }),

  DAILY_COOL_DOWN: daily({
    key: 'DAILY_COOL_DOWN',
    title: 'Cool Down',
    description: 'Vic knows which desk sergeant takes envelopes today. Use him while he is there.',
    contactKey: 'VIC',
    category: 'HEAT',
    difficulty: 'STREET_JOB',
    objective: {
      id: 'bribe_heat',
      kind: 'EVENT_SUM',
      description: 'Bribe away 5 Heat.',
      target: 5,
      params: { eventTypes: ['HEAT_BRIBE'], field: 'points' },
    },
    rewards: [{ kind: 'CASH', amount: 750_000 }],
  }),

  DAILY_FLAG_DAY: daily({
    key: 'DAILY_FLAG_DAY',
    title: 'Flag Day',
    description: 'Blocks has his eye on an empty block. Put your name on it before somebody else does.',
    contactKey: 'BLOCKS',
    category: 'TURF',
    difficulty: 'CONTRACT',
    objective: {
      id: 'claim_block',
      kind: 'WIN_EVENTS',
      description: 'Successfully claim 1 city block.',
      target: 1,
      params: { eventTypes: ['TURF_CLAIM'] },
    },
    rewards: [{ kind: 'CASH', amount: 1_250_000 }],
  }),

  DAILY_PUSH_BACK: daily({
    key: 'DAILY_PUSH_BACK',
    title: 'Push Back',
    description: 'A rival crew got comfortable on a block Blocks wants. Make them uncomfortable.',
    contactKey: 'BLOCKS',
    category: 'TURF',
    difficulty: 'HIGH_RISK',
    objective: {
      id: 'win_push',
      kind: 'WIN_EVENTS',
      description: 'Win 1 turf push as the attacker.',
      target: 1,
      params: { eventTypes: ['TURF_PUSH_ATTACK'] },
    },
    rewards: [{ kind: 'CASH', amount: 1_500_000 }],
  }),

  DAILY_HOUSE_MONEY: daily({
    key: 'DAILY_HOUSE_MONEY',
    title: 'House Money',
    description: 'Ace likes a familiar face on the floor. Sit down and play a while.',
    contactKey: 'ACE',
    category: 'CASINO',
    difficulty: 'STREET_JOB',
    objective: {
      id: 'place_wagers',
      kind: 'EVENT_COUNT',
      description: 'Place 10 casino wagers.',
      target: 10,
      params: { eventTypes: ['CASINO_WAGER'] },
    },
    rewards: [{ kind: 'CASH', amount: 750_000 }],
  }),

  DAILY_TABLE_HOP: daily({
    key: 'DAILY_TABLE_HOP',
    title: 'Table Hop',
    description: 'Ace wants the pit bosses to know you are not a one-game tourist.',
    contactKey: 'ACE',
    category: 'CASINO',
    difficulty: 'STREET_JOB',
    objective: {
      id: 'different_games',
      kind: 'UNIQUE_VALUES',
      description: 'Wager on 3 different casino games.',
      target: 3,
      params: { eventTypes: ['CASINO_WAGER'], field: 'game' },
    },
    rewards: [{ kind: 'CASH', amount: 1_000_000 }],
  }),

  DAILY_EAR_TO_THE_GROUND: daily({
    key: 'DAILY_EAR_TO_THE_GROUND',
    title: 'Ear to the Ground',
    description: 'Ledger says the smart ones pay to hear what the police already know.',
    contactKey: 'LEDGER',
    category: 'LAW',
    difficulty: 'STREET_JOB',
    objective: {
      id: 'informant_tip',
      kind: 'EVENT_COUNT',
      description: 'Buy 1 tip from an informant.',
      target: 1,
      params: { eventTypes: ['INFORMANT_TIP'] },
    },
    rewards: [{ kind: 'CASH', amount: 750_000 }],
  }),

  DAILY_REGISTER_RUN: daily({
    key: 'DAILY_REGISTER_RUN',
    title: 'Register Run',
    description: 'Vic wants to see the fronts paying, not just standing there with the lights on.',
    contactKey: 'VIC',
    category: 'BUSINESS',
    difficulty: 'STREET_JOB',
    objective: {
      id: 'collect_registers',
      kind: 'EVENT_SUM',
      description: 'Collect $20,000 from your businesses.',
      target: 2_000_000,
      params: { eventTypes: ['BUSINESS_COLLECT'], field: 'collectedCents', display: 'CURRENCY' },
    },
    rewards: [{ kind: 'CASH', amount: 1_000_000 }],
  }),

  DAILY_SIEGE_LINE: daily({
    key: 'DAILY_SIEGE_LINE',
    title: 'Siege Line',
    description: 'There is a block war on and Blocks wants your crew on the line, whichever side of it you are on.',
    contactKey: 'BLOCKS',
    category: 'BLOCK_WAR',
    difficulty: 'HIGH_RISK',
    objective: {
      id: 'war_fight',
      kind: 'EVENT_COUNT',
      description: 'Fight in 1 block war assault.',
      target: 1,
      params: { eventTypes: ['BLOCK_WAR_FIGHT'] },
    },
    rewards: [{ kind: 'CASH', amount: 1_500_000 }],
  }),

  DAILY_TAIL_JOB: daily({
    key: 'DAILY_TAIL_JOB',
    title: 'Tail Job',
    description: 'A rival has a convoy on the interstate. Wheels knows which exit it takes.',
    contactKey: 'WHEELS',
    category: 'CONVOY',
    difficulty: 'HIGH_RISK',
    objective: {
      id: 'win_convoy',
      kind: 'WIN_EVENTS',
      description: 'Win 1 convoy hit.',
      target: 1,
      params: { eventTypes: ['CONVOY_ATTACK'] },
    },
    rewards: [{ kind: 'CASH', amount: 1_500_000 }],
  }),

  DAILY_FLY_OUT: daily({
    key: 'DAILY_FLY_OUT',
    title: 'Fly Out',
    description: 'Vic says some business only gets done face to face. Get on a plane.',
    contactKey: 'VIC',
    category: 'BOSS_TRIP',
    difficulty: 'CONTRACT',
    objective: {
      id: 'trip_home',
      kind: 'EVENT_COUNT',
      description: 'Take a trip to another city and fly home.',
      target: 1,
      params: { eventTypes: ['TRIP_RETURNED'] },
    },
    rewards: [{ kind: 'CASH', amount: 1_250_000 }],
  }),

  DAILY_WALK_THE_OUTPOST: daily({
    key: 'DAILY_WALK_THE_OUTPOST',
    title: 'Walk the Outpost',
    description: 'Blocks says an outpost the boss never visits is an outpost somebody else will take.',
    contactKey: 'BLOCKS',
    category: 'BOSS_TRIP',
    difficulty: 'CONTRACT',
    objective: {
      id: 'outpost_visit',
      kind: 'EVENT_COUNT',
      description: 'Visit 1 of your outposts while the boss is in town.',
      target: 1,
      params: { eventTypes: ['OUTPOST_VISIT'] },
    },
    rewards: [{ kind: 'CASH', amount: 1_000_000 }],
  }),

  DAILY_BOSS_HUNT: daily({
    key: 'DAILY_BOSS_HUNT',
    title: 'Boss Hunt',
    description: 'A rival boss is out of town with a thin crew. Tommy says that is an invitation.',
    contactKey: 'TOMMY',
    category: 'BOSS_TRIP',
    difficulty: 'HIGH_RISK',
    objective: {
      id: 'boss_hit',
      kind: 'EVENT_COUNT',
      description: 'Land 1 boss hit on a rival who is away from home.',
      target: 1,
      params: { eventTypes: ['BOSS_HIT_ATTACK'], where: { escaped: false, held: false } },
    },
    rewards: [{ kind: 'CASH', amount: 1_500_000 }],
  }),
} as const;
