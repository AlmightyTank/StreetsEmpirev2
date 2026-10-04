import type {
  QuestDefinition,
  QuestDifficulty,
  QuestObjectiveDefinition,
  QuestRewardDefinition,
} from '../types.js';

interface WeeklyInput {
  key: string;
  title: string;
  description: string;
  contactKey: string;
  category: string;
  difficulty: QuestDifficulty;
  objective: QuestObjectiveDefinition;
  rewards: readonly QuestRewardDefinition[];
}

function weekly(input: WeeklyInput): QuestDefinition {
  return {
    key: input.key,
    title: input.title,
    description: input.description,
    contactKey: input.contactKey,
    type: 'WEEKLY',
    category: input.category,
    difficulty: input.difficulty,
    prerequisites: [],
    objectives: [input.objective],
    bonusObjectives: [],
    rewards: [...input.rewards, { kind: 'CONTACT_REP', key: input.contactKey, amount: 10 }],
    followUpKeys: [],
    repeatability: 'WEEKLY',
    expiresAfterMinutes: null,
    availability: { rotationPool: 'WEEKLY_CONTRACTS' },
  };
}

/**
 * 1.4.0-A2: ten more weekly contracts. With the six from 0.7-O the pool holds
 * sixteen, so a two-slot board runs eight weeks before any contract comes back.
 */
export const moreWeeklyContracts = {
  WEEKLY_COOKHOUSE_KING: weekly({
    key: 'WEEKLY_COOKHOUSE_KING',
    title: 'Cookhouse King',
    description: 'Pip wants a week where the stove never goes cold.',
    contactKey: 'PIP',
    category: 'PRODUCT',
    difficulty: 'SERIOUS_BUSINESS',
    objective: {
      id: 'produce_week',
      kind: 'EVENT_SUM',
      description: 'Produce 1,500 units of product.',
      target: 1_500,
      params: { eventTypes: ['PRODUCE_CRACK'], field: 'product' },
    },
    rewards: [
      { kind: 'CASH', amount: 5_000_000 },
      { kind: 'FAVOR_ITEM', key: 'COOKHOUSE_RUSH', amount: 2 },
    ],
  }),

  WEEKLY_WHOLESALE: weekly({
    key: 'WEEKLY_WHOLESALE',
    title: 'Wholesale',
    description: 'Forget the corner. Pip wants to see you moving weight by the crate.',
    contactKey: 'PIP',
    category: 'ECONOMY',
    difficulty: 'SERIOUS_BUSINESS',
    objective: {
      id: 'sell_units',
      kind: 'EVENT_SUM',
      description: 'Sell 1,000 units of product to Pip.',
      target: 1_000,
      params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP' } },
    },
    rewards: [
      { kind: 'CASH', amount: 5_000_000 },
      { kind: 'FAVOR_ITEM', key: 'PIP_CONNECTION', amount: 1 },
    ],
  }),

  WEEKLY_RECRUITER: weekly({
    key: 'WEEKLY_RECRUITER',
    title: 'Recruiter',
    description: 'Mama is building something bigger. She needs people, and she needs them this week.',
    contactKey: 'MAMA_KING',
    category: 'STREET',
    difficulty: 'SERIOUS_BUSINESS',
    objective: {
      id: 'recruit_week',
      kind: 'RECRUIT_CREW',
      description: 'Recruit 40 hoes or thugs from Scout trips.',
      target: 40,
      params: { eventTypes: ['SCOUT'], crew: 'ANY' },
    },
    rewards: [
      { kind: 'CASH', amount: 4_000_000 },
      { kind: 'FAVOR_ITEM', key: 'MAMA_ADVICE', amount: 1 },
    ],
  }),

  WEEKLY_NIGHT_OWL: weekly({
    key: 'WEEKLY_NIGHT_OWL',
    title: 'Night Owl',
    description: 'The Nightclub never closes, and Mama wants your crew there every night it is open.',
    contactKey: 'MAMA_KING',
    category: 'STREET',
    difficulty: 'SERIOUS_BUSINESS',
    objective: {
      id: 'nightclub_week',
      kind: 'SPEND_TURNS',
      description: 'Spend 150 Scout turns in the Nightclub.',
      target: 150,
      params: { eventTypes: ['SCOUT'], where: { districtKey: 'NIGHTCLUB' } },
    },
    rewards: [
      { kind: 'CASH', amount: 4_000_000 },
      { kind: 'FAVOR_ITEM', key: 'STREET_FRENZY', amount: 1 },
    ],
  }),

  WEEKLY_ARMORY: weekly({
    key: 'WEEKLY_ARMORY',
    title: 'Armory',
    description: 'Tommy is clearing the back room for a new shipment. Buy enough that he notices.',
    contactKey: 'TOMMY',
    category: 'COMBAT',
    difficulty: 'SERIOUS_BUSINESS',
    objective: {
      id: 'buy_weapons_week',
      kind: 'EVENT_SUM',
      description: 'Buy 25 weapons from Tommy.',
      target: 25,
      params: { eventTypes: ['STORE_BUY'], field: 'quantity', where: { storeKey: 'TOMMY' } },
    },
    rewards: [
      { kind: 'CASH', amount: 4_000_000 },
      { kind: 'FAVOR_ITEM', key: 'FIELD_MEDIC', amount: 1 },
    ],
  }),

  WEEKLY_INTEL_NETWORK: weekly({
    key: 'WEEKLY_INTEL_NETWORK',
    title: 'Intel Network',
    description: 'Tommy wants a file on everyone worth hitting. Keep the reports coming all week.',
    contactKey: 'TOMMY',
    category: 'COMBAT',
    difficulty: 'SERIOUS_BUSINESS',
    objective: {
      id: 'recon_week',
      kind: 'EVENT_COUNT',
      description: 'Complete 10 Recons.',
      target: 10,
      params: { eventTypes: ['COMBAT_RECON'] },
    },
    rewards: [
      { kind: 'CASH', amount: 3_000_000 },
      { kind: 'FAVOR_ITEM', key: 'BURNER_PHONE', amount: 2 },
    ],
  }),

  WEEKLY_CONVOY_BOSS: weekly({
    key: 'WEEKLY_CONVOY_BOSS',
    title: 'Convoy Boss',
    description: 'Wheels wants the road to see your crew coming and decide to wave you through.',
    contactKey: 'WHEELS',
    category: 'TRAVEL',
    difficulty: 'SERIOUS_BUSINESS',
    objective: {
      id: 'escorts_week',
      kind: 'EVENT_SUM',
      description: 'Launch runs carrying a total of 60 escort thugs.',
      target: 60,
      params: { eventTypes: ['RUN_LAUNCHED'], field: 'escortThugs' },
    },
    rewards: [
      { kind: 'CASH', amount: 4_000_000 },
      { kind: 'ITEM', key: 'lowRiders', amount: 1 },
    ],
  }),

  WEEKLY_EXPANSION: weekly({
    key: 'WEEKLY_EXPANSION',
    title: 'Expansion',
    description: 'Blocks says one block is a hobby. Five is a map.',
    contactKey: 'BLOCKS',
    category: 'TURF',
    difficulty: 'HIGH_RISK',
    objective: {
      id: 'claim_week',
      kind: 'WIN_EVENTS',
      description: 'Successfully claim 5 city blocks.',
      target: 5,
      params: { eventTypes: ['TURF_CLAIM'] },
    },
    rewards: [
      { kind: 'CASH', amount: 5_000_000 },
      { kind: 'FAVOR_ITEM', key: 'DOCTOR_FAVOR', amount: 1 },
    ],
  }),

  WEEKLY_HIGH_ROLLER: weekly({
    key: 'WEEKLY_HIGH_ROLLER',
    title: 'High Roller',
    description: 'Ace has a seat saved for players who come back. Come back a lot.',
    contactKey: 'ACE',
    category: 'CASINO',
    difficulty: 'SERIOUS_BUSINESS',
    objective: {
      id: 'wagers_week',
      kind: 'EVENT_COUNT',
      description: 'Place 75 casino wagers.',
      target: 75,
      params: { eventTypes: ['CASINO_WAGER'] },
    },
    rewards: [{ kind: 'CASH', amount: 3_000_000 }],
  }),

  WEEKLY_PAYROLL: weekly({
    key: 'WEEKLY_PAYROLL',
    title: 'Payroll',
    description: 'Vic says the police are just another vendor. Pay them on schedule all week.',
    contactKey: 'VIC',
    category: 'HEAT',
    difficulty: 'SERIOUS_BUSINESS',
    objective: {
      id: 'bribes_week',
      kind: 'EVENT_COUNT',
      description: 'Make 5 successful Heat bribes.',
      target: 5,
      params: { eventTypes: ['HEAT_BRIBE'] },
    },
    rewards: [{ kind: 'CASH', amount: 4_000_000 }],
  }),
} as const;
