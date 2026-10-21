import type {
  QuestDefinition,
  QuestDefinitionCatalog,
  QuestDifficulty,
  QuestObjectiveDefinition,
  QuestRewardDefinition,
} from '../types.js';

interface ContractInput {
  key: string;
  title: string;
  description: string;
  contactKey: string;
  category: string;
  difficulty: QuestDifficulty;
  objective: QuestObjectiveDefinition;
  rewards: readonly QuestRewardDefinition[];
  story: NonNullable<QuestDefinition['story']>;
}

function contract(input: ContractInput, type: 'DAILY' | 'WEEKLY'): QuestDefinition {
  const isDaily = type === 'DAILY';
  return {
    key: input.key,
    title: input.title,
    description: input.description,
    contactKey: input.contactKey,
    type,
    category: input.category,
    difficulty: input.difficulty,
    prerequisites: [],
    objectives: [input.objective],
    bonusObjectives: [],
    rewards: [...input.rewards, { kind: 'CONTACT_REP', key: input.contactKey, amount: isDaily ? 2 : 10 }],
    story: input.story,
    followUpKeys: [],
    repeatability: type,
    expiresAfterMinutes: null,
    availability: { rotationPool: isDaily ? 'DAILY_CONTRACTS' : 'WEEKLY_CONTRACTS' },
  };
}

const daily = (input: ContractInput) => contract(input, 'DAILY');
const weekly = (input: ContractInput) => contract(input, 'WEEKLY');

/** Slice 5: current-v2.4 rotating work for the shared Quest Board. */
const authoredRotatingContracts = {
  DAILY_MAMA_NIGHT_WATCH: daily({
    key: 'DAILY_MAMA_NIGHT_WATCH', title: 'Night Watch',
    description: 'Mama wants one district watched before sunrise. Keep the crew moving long enough to learn which faces belong to the block today.',
    contactKey: 'MAMA_KING', category: 'STREET', difficulty: 'STREET_JOB',
    objective: { id: 'watch_turns', kind: 'SPEND_TURNS', description: 'Spend 8 Scout turns in any district.', target: 8, params: { eventTypes: ['SCOUT'] } },
    rewards: [{ kind: 'CASH', amount: 75000 }],
    story: {
      chapter: 'Rotating work: the daily board',
      intro: 'Mama leaves a thermos on the hood. “The block changes every night. Watch it long enough to notice what moved.”',
      inProgress: 'Spend 8 turns scouting any district. Resolve the trips; a plan that never reaches the street is not a report.',
      ready: 'Mama studies the route marks. “You did not just count corners. You learned which ones were awake.”',
      completed: 'The report goes into Mama’s drawer with the date on it. Tomorrow’s map will not look the same.',
      lesson: 'Daily contracts are short assignments drawn from the same authoritative activity ledger as story jobs.',
      actionHint: 'Open Scout and spend 8 turns in any district.',
    },
  }),

  DAILY_PIP_MOVE_PACKAGE: daily({
    key: 'DAILY_PIP_MOVE_PACKAGE', title: 'Move a Package',
    description: 'Pip has a buyer who will not wait for a perfect market. Move 10 units through his counter before the opportunity turns into somebody else’s sale.',
    contactKey: 'PIP', category: 'PRODUCT', difficulty: 'STREET_JOB',
    objective: { id: 'move_product', kind: 'EVENT_SUM', description: 'Sell 10 units through Pip’s market.', target: 10, params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP' } } },
    rewards: [{ kind: 'CASH', amount: 100000 }],
    story: {
      chapter: 'Rotating work: the daily board',
      intro: 'Pip folds an order slip into a smaller square. “The buyer is real, the clock is real, and neither cares what your excuses cost.”',
      inProgress: 'Sell 10 units through Pip’s market. The server-recorded sale is the receipt; promises and unsent stock do not count.',
      ready: 'Pip counts the units and nods once. “A small order done clean is worth more than a big order that makes noise.”',
      completed: 'The order slip disappears into Pip’s ledger. He has another buyer tomorrow, if the market still trusts you.',
      lesson: 'Selling uses canonical inventory and creates a real market activity; the board never completes from a client-side basket alone.',
      actionHint: 'Open Pip’s market and sell 10 units.',
    },
  }),

  DAILY_COMMISSIONER_OPEN_CASE: daily({
    key: 'DAILY_COMMISSIONER_OPEN_CASE', title: 'Read the Room',
    description: 'The Commissioner wants a current measure of the city’s attention. Let one Case stage rise, then read what the record says before someone else writes it for you.',
    contactKey: 'COMMISSIONER', category: 'LAW', difficulty: 'CONTRACT',
    objective: { id: 'open_case', kind: 'EVENT_COUNT', description: 'Raise a Case stage in any city.', target: 1, params: { eventTypes: ['CASE_STAGE_UP'] } },
    rewards: [{ kind: 'CASH', amount: 125000 }],
    story: {
      chapter: 'Rotating work: the daily board',
      intro: 'The Commissioner leaves the folder open. “Attention is a resource. Spend it without reading the bill and you will pay twice.”',
      inProgress: 'Raise a Case stage through normal play, then review the city record. The Case system decides what counts as attention.',
      ready: 'He marks the date in the margin. “Now you know where the city is looking. That knowledge is worth more than panic.”',
      completed: 'The folder returns to the cabinet. It will be there tomorrow, whether you want it or not.',
      lesson: 'Heat and wanted status are tracked by the existing per-city Case system, not by a quest-only counter.',
      actionHint: 'Work a city until its Case stage rises, then review the Case panel.',
    },
  }),

  WEEKLY_MAMA_NEW_FACES: weekly({
    key: 'WEEKLY_MAMA_NEW_FACES', title: 'Names Worth Keeping',
    description: 'Mama needs a fuller read on the neighborhood. Bring back five new faces from resolved Scout trips and show her you can grow a crew without treating people like numbers.',
    contactKey: 'MAMA_KING', category: 'STREET', difficulty: 'CONTRACT',
    objective: { id: 'new_faces', kind: 'RECRUIT_CREW', description: 'Recruit 5 hoes from resolved Scout trips.', target: 5, params: { eventTypes: ['SCOUT'], crew: 'WHORES' } },
    rewards: [{ kind: 'CASH', amount: 350000 }],
    story: {
      chapter: 'Rotating work: the weekly board',
      intro: 'Mama spreads five blank lines across the table. “A week is long enough to learn who keeps showing up.”',
      inProgress: 'Resolve Scout trips until five hoes join the operation. Unresolved plans and starting crew do not fill a new line.',
      ready: 'Mama reads the names aloud. “You brought back people, not inventory. That is why this report matters.”',
      completed: 'The sheet is filed under the neighborhood, not your name. The crew has a history now.',
      lesson: 'Weekly contracts ask for a meaningful pattern of play while remaining repeatable through the normal board rotation.',
      actionHint: 'Resolve Scout trips until 5 hoes have joined the crew.',
    },
  }),

  WEEKLY_WHEELS_RETURN_TICKETS: weekly({
    key: 'WEEKLY_WHEELS_RETURN_TICKETS', title: 'Return Tickets',
    description: 'Wheels wants proof that your routes are more than one lucky departure. Bring two intercity runs home this week, with the returned-run ledger intact.',
    contactKey: 'WHEELS', category: 'TRAVEL', difficulty: 'CONTRACT',
    objective: { id: 'returned_runs', kind: 'EVENT_COUNT', description: 'Complete 2 intercity runs and bring them home.', target: 2, params: { eventTypes: ['RUN_RETURNED'] } },
    rewards: [{ kind: 'CASH', amount: 450000 }],
    story: {
      chapter: 'Rotating work: the weekly board',
      intro: 'Wheels circles two dates on the route map. “Leaving is a plan. Coming back is a business.”',
      inProgress: 'Complete and return two valid intercity runs. The server-recorded return is the only receipt that matters.',
      ready: 'Wheels compares the departure and return marks. “Two routes home. Now I can show you the roads that do not forgive mistakes.”',
      completed: 'The map gets two new lines. Your operation has learned how to leave without disappearing.',
      lesson: 'Travel contracts follow resolved run events, so launch, route, and return remain one authoritative flow.',
      actionHint: 'Use Travel to complete and return 2 intercity runs.',
    },
  }),

  WEEKLY_TOMMY_ARMORY_COUNT: weekly({
    key: 'WEEKLY_TOMMY_ARMORY_COUNT', title: 'Keep the Armory Busy',
    description: 'Tommy has a shipment to justify and a reputation to maintain. Buy three pistols from his armory this week; if the crew is growing, the shelves should show it.',
    contactKey: 'TOMMY', category: 'COMBAT', difficulty: 'CONTRACT',
    objective: { id: 'armory_buy', kind: 'EVENT_SUM', description: 'Buy 3 pistols from Tommy.', target: 3, params: { eventTypes: ['STORE_BUY'], field: 'quantity', where: { storeKey: 'TOMMY', itemKey: 'PISTOL' } } },
    rewards: [{ kind: 'CASH', amount: 500000 }],
    story: {
      chapter: 'Rotating work: the weekly board',
      intro: 'Tommy checks the lock on the armory case. “A weapon bought is a decision made. Three decisions tells me you are building, not browsing.”',
      inProgress: 'Buy three pistols from Tommy’s store. The purchase must resolve through the store ledger; browsing the shelf is not an order.',
      ready: 'Tommy checks the inventory marks. “You bought what the crew can carry. That is better than buying what the ego wants.”',
      completed: 'The shipment is entered under your crew name. Tommy’s next call will include a different price sheet.',
      lesson: 'Weekly equipment work tracks canonical store purchases, while crew fit and armed capacity remain separate systems.',
      actionHint: 'Open Tommy’s armory and buy 3 pistols.',
    },
  }),
} satisfies QuestDefinitionCatalog;

/**
 * The board has three daily slots. The deck keeps cards separated by roughly
 * half a pool, so a 30-day round needs 180 daily cards before a card can
 * return, regardless of where the round starts inside the deck. These
 * lightweight contract variants use the
 * same authoritative actions as the authored cards above, but give the deck
 * enough breadth for a full round.
 */
const generatedDailyTemplates: readonly {
  contactKey: string;
  category: string;
  title: readonly string[];
  objective: (index: number) => QuestObjectiveDefinition;
}[] = [
  { contactKey: 'MAMA_KING', category: 'STREET', title: ['Dawn Route', 'Night Census', 'Quiet Corners'], objective: (i) => ({ id: 'scout_turns', kind: 'SPEND_TURNS', description: 'Spend 6 Scout turns in any district.', target: 6, params: { eventTypes: ['SCOUT'] } }) },
  { contactKey: 'MAMA_KING', category: 'STREET', title: ['Fresh Faces', 'Open Doors', 'New Names'], objective: (i) => ({ id: 'scout_recruits', kind: 'RECRUIT_CREW', description: 'Recruit 2 hoes from resolved Scout trips.', target: 2, params: { eventTypes: ['SCOUT'], crew: 'WHORES' } }) },
  { contactKey: 'MAMA_KING', category: 'STREET', title: ['Muscle Count', 'Hands on Deck', 'Hold the Block'], objective: (i) => ({ id: 'scout_thugs', kind: 'RECRUIT_CREW', description: 'Recruit 1 thug from a resolved Scout trip.', target: 1, params: { eventTypes: ['SCOUT'], crew: 'THUGS' } }) },
  { contactKey: 'PIP', category: 'PRODUCT', title: ['Small Handoff', 'Clean Counter', 'Market Day'], objective: (i) => ({ id: 'sell_units', kind: 'EVENT_SUM', description: 'Sell 5 units through Pip’s market.', target: 5, params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP' } } }) },
  { contactKey: 'PIP', category: 'PRODUCT', title: ['Keep the Stove Warm', 'Batch Work', 'Product on Time'], objective: (i) => ({ id: 'produce_batch', kind: 'EVENT_SUM', description: 'Produce 25 units of product.', target: 25, params: { eventTypes: ['PRODUCE_CRACK'], field: 'product' } }) },
  { contactKey: 'TOMMY', category: 'COMBAT', title: ['Shelf Check', 'Loaded Case', 'Armory Business'], objective: (i) => ({ id: 'buy_pistols', kind: 'EVENT_SUM', description: 'Buy 1 pistol from Tommy.', target: 1, params: { eventTypes: ['STORE_BUY'], field: 'quantity', where: { storeKey: 'TOMMY', itemKey: 'PISTOL' } } }) },
  { contactKey: 'TOMMY', category: 'COMBAT', title: ['Read the Block', 'Quiet Recon', 'Know the Room'], objective: (i) => ({ id: 'recon', kind: 'EVENT_COUNT', description: 'Complete 1 recon report.', target: 1, params: { eventTypes: ['COMBAT_RECON'] } }) },
  { contactKey: 'WHEELS', category: 'TRAVEL', title: ['Back Before Dark', 'Return Route', 'Road Receipt'], objective: (i) => ({ id: 'return_run', kind: 'EVENT_COUNT', description: 'Bring 1 intercity run home.', target: 1, params: { eventTypes: ['RUN_RETURNED'] } }) },
  { contactKey: 'BLOCKS', category: 'TURF', title: ['Visible Presence', 'Post and Hold', 'Corner Shift'], objective: (i) => ({ id: 'post_thugs', kind: 'EVENT_SUM', description: 'Post 2 thugs on held turf.', target: 2, params: { eventTypes: ['TURF_POST'], field: 'thugs' } }) },
  { contactKey: 'COMMISSIONER', category: 'LAW', title: ['Fresh Ink', 'Attention Paid', 'Case Mark'], objective: (i) => ({ id: 'case_stage', kind: 'EVENT_COUNT', description: 'Raise a Case stage in any city.', target: 1, params: { eventTypes: ['CASE_STAGE_UP'] } }) },
  { contactKey: 'COMMISSIONER', category: 'LAW', title: ['Quiet Interval', 'Let It Cool', 'No New Pages'], objective: (i) => ({ id: 'case_cool', kind: 'EVENT_COUNT', description: 'Let a Case cool by one stage.', target: 1, params: { eventTypes: ['CASE_COOLED'] } }) },
  { contactKey: 'COMMISSIONER', category: 'LAW', title: ['The Tip Line', 'Margin Note', 'Useful Name'], objective: (i) => ({ id: 'informant_tip', kind: 'EVENT_COUNT', description: 'Buy one informant tip.', target: 1, params: { eventTypes: ['INFORMANT_TIP'] } }) },
];

const generatedDailyContracts: QuestDefinitionCatalog = Object.fromEntries(
  Array.from({ length: 141 }, (_, offset) => {
    const index = offset + 1;
    const template = generatedDailyTemplates[offset % generatedDailyTemplates.length]!;
    const title = `${template.title[offset % template.title.length]!} · ${String(index).padStart(2, '0')}`;
    const key = `DAILY_ROTATING_FIELD_${String(index).padStart(2, '0')}`;
    return [key, daily({
      key,
      title,
      description: `${title} is a short assignment for ${template.contactKey}. Complete the recorded action before the board turns over, and leave a receipt the contact can verify.`,
      contactKey: template.contactKey,
      category: template.category,
      difficulty: 'STREET_JOB',
      objective: template.objective(index),
      rewards: [{ kind: 'CASH', amount: 60000 + (index * 1000) }],
      story: {
        chapter: 'Rotating work: the daily board',
        intro: `${template.contactKey} leaves a fresh assignment on the board. “Do the work clean and leave the ledger to speak.”`,
        inProgress: 'Complete the exact action shown in the objective. Only an authoritative server result counts toward the contract.',
        ready: 'The receipt is in the ledger. The contact has nothing to take on faith.',
        completed: 'The assignment is filed with today’s work. Tomorrow brings a different card and a different problem.',
        lesson: 'Rotating contracts reward ordinary play without adding a separate progression system.',
        actionHint: 'Complete the objective shown on this contract before the daily board resets.',
      },
    })];
  }),
);

export const rotatingContracts = {
  ...authoredRotatingContracts,
  ...generatedDailyContracts,
} satisfies QuestDefinitionCatalog;
