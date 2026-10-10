import { defineQuestCatalog } from '../quest-definitions.js';
import type { ContactKey, QuestDefinition, QuestDefinitionCatalog } from '../types.js';
import { classicOgV16H } from '../classic-og-v1.6-h/index.js';

type BranchQuestInput = {
  key: string;
  title: string;
  category: string;
  contactKey: ContactKey | null;
  lesson: string;
  actionHint: string;
  eventTypes: readonly string[];
  followUpKey?: string;
  target?: number;
  where?: Readonly<Record<string, string | number | boolean>>;
};

const branchQuest = (input: BranchQuestInput): QuestDefinition => ({
  key: input.key,
  title: input.title,
  description: input.lesson,
  contactKey: input.contactKey,
  type: 'STORY',
  category: input.category,
  difficulty: 'STREET_JOB',
  prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'PLANT_THE_FLAG' } }],
  objectives: [{
    id: 'try_feature',
    kind: 'EVENT_COUNT',
    description: input.actionHint,
    target: input.target ?? 1,
    params: { eventTypes: input.eventTypes, ...(input.where ? { where: input.where } : {}) },
  }],
  bonusObjectives: [],
  rewards: [{ kind: 'CASH', amount: 500000 }],
  story: {
    chapter: 'Choose your specialty',
    intro: `The city is open now. ${input.lesson}`,
    inProgress: input.actionHint,
    ready: 'You have a feel for this part of the operation. The deeper work is yours to choose.',
    completed: 'The first door is open. Follow the contact’s lead when you are ready to go deeper.',
    lesson: input.lesson,
    actionHint: input.actionHint,
  },
  followUpKeys: input.followUpKey ? [input.followUpKey] : [],
  repeatability: 'ONCE',
  expiresAfterMinutes: null,
  availability: {},
});

const specialtyQuests = {
  STREET_OPERATOR_PATH: branchQuest({
    key: 'STREET_OPERATOR_PATH', title: 'Street Operator', category: 'PRODUCT', contactKey: 'PIP',
    lesson: 'Build a street operation through production, product choices, supply policies and dealer crews.',
    actionHint: 'Produce one batch of any product.', eventTypes: ['PRODUCE_CRACK'], followUpKey: 'PIP_MOVE_THE_WEIGHT',
  }),
  BUSINESS_BUILDER_PATH: branchQuest({
    key: 'BUSINESS_BUILDER_PATH', title: 'Business Builder', category: 'BUSINESS', contactKey: null,
    lesson: 'Build a legitimate front, then manage staff, collections, property, upkeep and supply from the books.',
    actionHint: 'Build one business from the Business screen.', eventTypes: ['BUSINESS_BUILD'], followUpKey: 'OUTFIT_THE_BOOKS',
  }),
  CREW_BOSS_PATH: branchQuest({
    key: 'CREW_BOSS_PATH', title: 'Crew Boss', category: 'CREW', contactKey: 'TOMMY',
    lesson: 'Recruit, equip, train and recover your crew; roles and readiness shape what the crew can do.',
    actionHint: 'Buy one crew item from Tommy.', eventTypes: ['STORE_BUY'], where: { storeKey: 'TOMMY' }, followUpKey: 'TOMMY_STOCK_THE_CREW',
  }),
  ENFORCER_PATH: branchQuest({
    key: 'ENFORCER_PATH', title: 'Enforcer', category: 'COMBAT', contactKey: 'BLOCKS',
    lesson: 'Learn to read targets, protect territory and choose when a raid or block war is worth the risk.',
    actionHint: 'Recon one player before deciding whether to fight.', eventTypes: ['COMBAT_RECON'], followUpKey: 'BLOCKS_TAKE_SOMETHING',
  }),
  ROAD_BOSS_PATH: branchQuest({
    key: 'ROAD_BOSS_PATH', title: 'Road Boss', category: 'TRAVEL', contactKey: 'WHEELS',
    lesson: 'Use vehicles, city routes, runs, convoys, pickups, shipments and supply lanes to move an operation.',
    actionHint: 'Bring one intercity run home.', eventTypes: ['RUN_RETURNED'], followUpKey: 'WHEELS_ROAD_TEST',
  }),
  FIXER_PATH: branchQuest({
    key: 'FIXER_PATH', title: 'Fixer', category: 'LAW', contactKey: 'LEDGER',
    lesson: 'Understand Heat, city Cases, warrants, counsel, officials and informants before pressure stacks up.',
    actionHint: 'Retain a lawyer from the Law screen.', eventTypes: ['LAWYER_RETAINED'], followUpKey: 'LEDGER_RIGHT_TO_COUNSEL',
  }),
  UNDERWORLD_NETWORK_PATH: branchQuest({
    key: 'UNDERWORLD_NETWORK_PATH', title: 'Underworld Network', category: 'FACTION', contactKey: 'VIC',
    lesson: 'Build contact reputation, earn favors, choose faction standing and take on contracts, alliances and events.',
    actionHint: 'Accept one contact job from the Quest Board.', eventTypes: ['QUEST_ACCEPTED'], followUpKey: 'VIC_INTRO_CARTEL_LINE',
  }),
  HIGH_ROLLER_PATH: branchQuest({
    key: 'HIGH_ROLLER_PATH', title: 'High Roller', category: 'CASINO', contactKey: 'ACE',
    lesson: 'Explore casino games, rated play, comps, poker and venue status at a wager you are comfortable with.',
    actionHint: 'Place one casino wager at your chosen table minimum.', eventTypes: ['CASINO_WAGER'], followUpKey: 'ACE_FLOOR_TOUR',
  }),
  SUPPLY_BROKER_PATH: branchQuest({
    key: 'SUPPLY_BROKER_PATH', title: 'Supply Broker', category: 'SUPPLY', contactKey: 'PIP',
    lesson: 'Compare local supply, property, pickup logistics and international lanes before committing cash to a load.',
    actionHint: 'Receive one international supply lane shipment.', eventTypes: ['SUPPLY_LANE_ARRIVED'], followUpKey: 'CARTEL_THE_PIPELINE',
  }),
  CAREER_AND_COMMUNITY_PATH: branchQuest({
    key: 'CAREER_AND_COMMUNITY_PATH', title: 'Career & Community', category: 'CAREER', contactKey: null,
    lesson: 'Track your profile, career history, player progression, Street Pass, achievements, rankings and community events.',
    actionHint: 'Claim an available Street Pass reward.', eventTypes: ['STREET_PASS_CLAIMED'],
  }),
} as const satisfies QuestDefinitionCatalog;

const followUpGate = (quest: QuestDefinition, pathKey: string): QuestDefinition => ({
  ...quest,
  prerequisites: [
    ...quest.prerequisites,
    { kind: 'QUEST_COMPLETED', params: { questKey: pathKey } },
  ],
});

const oldQuests: QuestDefinitionCatalog = classicOgV16H.questDefinitions!;

export const guidedCampaignQuests = defineQuestCatalog({
  ...oldQuests,
  COLLECTION_DAY: {
    ...oldQuests.COLLECTION_DAY!,
    description: 'Use the recon report to make a considered raid attempt. The lesson counts any resolved attempt, win or loss.',
    story: {
      ...oldQuests.COLLECTION_DAY!.story!,
      inProgress: 'Tommy wants you to understand the whole raid report. Pick a target you understand and bring back the result, whatever it says.',
      lesson: 'Raids have real risk. Read recon, crew condition and weapon strength, then use the report to learn from the outcome.',
      actionHint: 'Use Combat to make one raid attempt after recon. You do not need to win to continue.',
    },
    objectives: [
      { id: 'raid_attempt', kind: 'EVENT_COUNT', description: 'Resolve one raid attempt.', target: 1, params: { eventTypes: ['RAID_ATTACK'] } },
    ],
  },
  PLANT_THE_FLAG: {
    ...oldQuests.PLANT_THE_FLAG!,
    title: 'First Empire',
    description: 'You have worked the block, built a crew, stocked and produced, earned, fought, traveled and claimed ground. Choose what kind of empire you want to build next.',
    story: {
      ...oldQuests.PLANT_THE_FLAG!.story!,
      chapter: 'Lesson 10: Your first empire',
      intro: 'Blocks studies the map, then looks at the operation behind it. "You learned the street, the crew, the market, the road and the ground. The rest of the city is yours to learn on your terms."',
      inProgress: 'Claim a block to finish the tour. After that, ten specialty paths open together. You can follow several; no choice locks the others.',
      ready: '"You have a foothold," Blocks says. "Now decide what kind of boss you want to be. Or learn every table in the house."',
      completed: 'The tutorial is complete. New contacts have left paths on your board: operations, business, crew, enforcement, roads, law, the underworld, supply and the wider career.',
      lesson: 'Turf anchors your local operation. The capstone opens optional paths through the remaining game systems; pursue any combination.',
      actionHint: 'Open Turf and successfully claim one city block. Then choose any specialty path on the Quest Board.',
    },
    followUpKeys: Object.keys(specialtyQuests),
  },
  ...specialtyQuests,
  PIP_MOVE_THE_WEIGHT: followUpGate(oldQuests.PIP_MOVE_THE_WEIGHT!, 'STREET_OPERATOR_PATH'),
  OUTFIT_THE_BOOKS: followUpGate(oldQuests.OUTFIT_THE_BOOKS!, 'BUSINESS_BUILDER_PATH'),
  TOMMY_STOCK_THE_CREW: followUpGate(oldQuests.TOMMY_STOCK_THE_CREW!, 'CREW_BOSS_PATH'),
  BLOCKS_TAKE_SOMETHING: followUpGate(oldQuests.BLOCKS_TAKE_SOMETHING!, 'ENFORCER_PATH'),
  WHEELS_ROAD_TEST: followUpGate(oldQuests.WHEELS_ROAD_TEST!, 'ROAD_BOSS_PATH'),
  LEDGER_RIGHT_TO_COUNSEL: followUpGate(oldQuests.LEDGER_RIGHT_TO_COUNSEL!, 'FIXER_PATH'),
  VIC_INTRO_CARTEL_LINE: followUpGate(oldQuests.VIC_INTRO_CARTEL_LINE!, 'UNDERWORLD_NETWORK_PATH'),
  ACE_FLOOR_TOUR: followUpGate(oldQuests.ACE_FLOOR_TOUR!, 'HIGH_ROLLER_PATH'),
  CARTEL_THE_PIPELINE: followUpGate(oldQuests.CARTEL_THE_PIPELINE!, 'SUPPLY_BROKER_PATH'),
});
