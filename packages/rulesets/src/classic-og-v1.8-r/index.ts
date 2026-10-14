import { classicOgV18Q } from '../classic-og-v1.8-q/index.js';
import { COMEDY_COSMETICS } from '../hidden-streets-cosmetics.js';
import { defineQuestCatalog, questCosmeticProblems } from '../quest-definitions.js';
import type {
  QuestCosmeticCatalog,
  QuestDefinitionCatalog,
  RandomEncounterEntryRules,
  RandomEncounterTrigger,
  RandomEncounterTriggerRules,
  Ruleset,
} from '../types.js';

const cosmetics = {
  ...classicOgV18Q.cosmetics!,
  ...COMEDY_COSMETICS,
} as const satisfies QuestCosmeticCatalog;

const priorEncounters = classicOgV18Q.randomEncounters!;

function withEntries(
  trigger: RandomEncounterTriggerRules,
  entries: readonly RandomEncounterEntryRules[],
): RandomEncounterTriggerRules {
  return { ...trigger, entries: [...trigger.entries, ...entries] };
}

const comedyEncounters = {
  SCOUT: [
    {
      key: 'scout-tin-can-golfer',
      title: 'The Tin-Can Golfer',
      text: 'A furious local is driving dented cans down an empty lot and calling every bounce a course hazard.',
      tone: 'neutral',
      weight: 2,
      choices: [
        { key: 'spot-the-line', label: 'Spot the line', text: 'You call the safest shot and win a grudging tip.', cash: { minCents: 2_500, maxCents: 9_000 } },
        { key: 'quiet-the-slice', label: 'Quiet the slice', text: 'You talk him down before the neighbors call badges.', heat: { min: -1, max: -1 } },
        { key: 'keep-your-head-down', label: 'Keep your head down', text: 'You leave the lot with only a whistle past your ear.' },
      ],
    },
    {
      key: 'scout-junkyard-meteorite',
      title: 'The Junkyard Star',
      text: 'A junkyard regular swears the smoking hunk of scrap in his hand fell from the sky last night.',
      tone: 'neutral',
      weight: 2,
      choices: [
        { key: 'buy-the-story', label: 'Buy the story', text: 'You pay for the tale and get a lead tucked inside it.', cash: { minCents: -4_000, maxCents: -1_000 } },
        { key: 'test-the-rock', label: 'Test the rock', text: 'A magnet, a grin, and a bet turn into pocket cash.', cash: { minCents: 3_000, maxCents: 11_000 } },
        { key: 'leave-it-glowing', label: 'Leave it glowing', text: 'Some mysteries belong in the scrap pile.' },
      ],
    },
    {
      key: 'scout-block-matriarch',
      title: 'The Block Matriarch',
      text: 'A sharp-eyed neighborhood elder clocks every car, every rumor, and every bad lie on the block.',
      tone: 'good',
      weight: 2,
      choices: [
        { key: 'carry-groceries', label: 'Carry groceries', text: 'She rewards manners with an address and a warning.', heat: { min: -1, max: -1 } },
        { key: 'hear-the-lecture', label: 'Hear the lecture', text: 'The lecture is long. The envelope at the end is useful.', cash: { minCents: 2_000, maxCents: 7_500 } },
        { key: 'nod-politely', label: 'Nod politely', text: 'You survive the look and move along.' },
      ],
    },
  ] satisfies readonly RandomEncounterEntryRules[],
  STORE: [
    {
      key: 'store-regional-management',
      title: 'Regional Management',
      text: 'A clipboard-toting consultant mistakes the counter for a branch office and demands action items.',
      tone: 'neutral',
      weight: 2,
      choices: [
        { key: 'file-the-memo', label: 'File the memo', text: 'The memo becomes a coupon once nobody is looking.', cash: { minCents: 2_500, maxCents: 8_500 } },
        { key: 'stall-the-audit', label: 'Stall the audit', text: 'You turn the audit into a waiting-room story and cool the room down.', heat: { min: -1, max: -1 } },
        { key: 'decline-synergy', label: 'Decline synergy', text: 'You decline three buzzwords and keep shopping.' },
      ],
    },
  ] satisfies readonly RandomEncounterEntryRules[],
} as const satisfies Partial<Record<RandomEncounterTrigger, readonly RandomEncounterEntryRules[]>>;

const randomEncounters = {
  ...priorEncounters,
  triggers: {
    ...priorEncounters.triggers,
    SCOUT: withEntries(priorEncounters.triggers.SCOUT!, comedyEncounters.SCOUT),
    STORE: withEntries(priorEncounters.triggers.STORE!, comedyEncounters.STORE),
  },
} as const;

const base = classicOgV18Q.questDefinitions as QuestDefinitionCatalog;

const comedySecrets = {
  SECRET_TRAVELING_SAMPLE_CASE: {
    key: 'SECRET_TRAVELING_SAMPLE_CASE',
    title: 'The Sample Case',
    description: 'The roadside pitch was funny until the receipts started matching other stops. Follow the sample case and figure out who is really selling what.',
    contactKey: 'WHEELS',
    type: 'SECRET',
    category: 'COMEDY',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [],
    objectives: [
      { id: 'road_returns', kind: 'EVENT_COUNT', description: 'Bring 2 intercity runs home after finding the sample case.', target: 2, params: { eventTypes: ['RUN_RETURNED'] } },
      { id: 'road_turns', kind: 'EVENT_SUM', description: 'Log 12 turns of road time while chasing the case.', target: 12, params: { eventTypes: ['RUN_RETURNED'], field: 'turnsSpent' } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 2_500_000 },
      { kind: 'FAVOR_ITEM', key: 'BURNER_PHONE', amount: 1 },
      { kind: 'COSMETIC_UNLOCK', key: 'comedy-roadshow-badge' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      hidden: true,
      secretTrigger: { kind: 'ACTIVITY_COUNT', eventTypes: ['RUN_LAUNCHED'], where: { 'encounter.key': 'travel-traveling-salesman' }, target: 1 },
      secretContent: { family: 'COMEDY', discoveryTier: 'OBVIOUS', clueMilestones: ['road_returns', 'road_turns'], cooldownMinutes: 1_440 },
    },
  },
  SECRET_TIN_CAN_GOLFER: {
    key: 'SECRET_TIN_CAN_GOLFER',
    title: 'The Tin-Can Course',
    description: 'The angry golfer’s lot has a pattern: every dented can points toward a side bet, a missing club, and somebody laughing too loudly.',
    contactKey: 'ACE',
    type: 'SECRET',
    category: 'COMEDY',
    difficulty: 'STREET_JOB',
    prerequisites: [],
    objectives: [
      { id: 'read_the_lot', kind: 'EVENT_COUNT', description: 'Scout twice after hearing about the tin-can course.', target: 2, params: { eventTypes: ['SCOUT'] } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 1_750_000 },
      { kind: 'CONTACT_REP', key: 'ACE', amount: 10 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      hidden: true,
      secretTrigger: { kind: 'ACTIVITY_COUNT', eventTypes: ['SCOUT'], where: { 'encounter.key': 'scout-tin-can-golfer' }, target: 1 },
      secretContent: { family: 'COMEDY', discoveryTier: 'OBVIOUS', clueMilestones: ['read_the_lot'], cooldownMinutes: 720 },
    },
  },
  SECRET_JUNKYARD_STAR: {
    key: 'SECRET_JUNKYARD_STAR',
    title: 'The Junkyard Star',
    description: 'A scrap-yard tall tale keeps getting bigger. Sort the metal from the myth before the whole block starts selling rocks from the alley.',
    contactKey: 'TOMMY',
    type: 'SECRET',
    category: 'COMEDY',
    difficulty: 'STREET_JOB',
    prerequisites: [],
    objectives: [
      { id: 'scrap_followup', kind: 'EVENT_COUNT', description: 'Scout 2 more times while checking the junkyard story.', target: 2, params: { eventTypes: ['SCOUT'] } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 2_000_000 },
      { kind: 'FAVOR_ITEM', key: 'TOMMY_VOUCHER', amount: 1 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      hidden: true,
      secretTrigger: { kind: 'ACTIVITY_COUNT', eventTypes: ['SCOUT'], where: { 'encounter.key': 'scout-junkyard-meteorite' }, target: 1 },
      secretContent: { family: 'COMEDY', discoveryTier: 'HIDDEN', clueMilestones: ['scrap_followup'], cooldownMinutes: 720 },
    },
  },
  SECRET_BLOCK_MATRIARCH: {
    key: 'SECRET_BLOCK_MATRIARCH',
    title: 'A Word from the Porch',
    description: 'The block matriarch knows who is late, who is lying, and which joke is hiding a warning. Prove you can listen before you act.',
    contactKey: 'MAMA_KING',
    type: 'SECRET',
    category: 'COMEDY',
    difficulty: 'STREET_JOB',
    prerequisites: [],
    objectives: [
      { id: 'porch_rounds', kind: 'EVENT_COUNT', description: 'Work the streets or scout 3 times after the porch warning.', target: 3, params: { eventTypes: ['SCOUT', 'WORK_STREETS'] } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 2_250_000 },
      { kind: 'FAVOR_ITEM', key: 'MAMA_ADVICE', amount: 1 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      hidden: true,
      secretTrigger: { kind: 'ACTIVITY_COUNT', eventTypes: ['SCOUT'], where: { 'encounter.key': 'scout-block-matriarch' }, target: 1 },
      secretContent: { family: 'COMEDY', discoveryTier: 'OBVIOUS', clueMilestones: ['porch_rounds'], cooldownMinutes: 720 },
    },
  },
  SECRET_REGIONAL_MANAGEMENT: {
    key: 'SECRET_REGIONAL_MANAGEMENT',
    title: 'Regional Management',
    description: 'The consultant’s clipboard contains more than buzzwords. Follow the action items through the store counters and find the joke in the paperwork.',
    contactKey: 'LEDGER',
    type: 'SECRET',
    category: 'COMEDY',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [],
    objectives: [
      { id: 'counter_errands', kind: 'EVENT_COUNT', description: 'Complete 3 store buys or sells while following the memo trail.', target: 3, params: { eventTypes: ['STORE_BUY', 'STORE_SELL'] } },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 2_500_000 },
      { kind: 'CONTACT_REP', key: 'LEDGER', amount: 10 },
      { kind: 'COSMETIC_UNLOCK', key: 'comedy-roadshow-frame' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      hidden: true,
      secretTrigger: { kind: 'ACTIVITY_COUNT', eventTypes: ['STORE_BUY', 'STORE_SELL'], where: { 'encounter.key': 'store-regional-management' }, target: 1 },
      secretContent: { family: 'COMEDY', discoveryTier: 'HIDDEN', clueMilestones: ['counter_errands'], cooldownMinutes: 1_440 },
    },
  },
} as const satisfies QuestDefinitionCatalog;

const questDefinitions = defineQuestCatalog({
  ...base,
  ...comedySecrets,
});

const cosmeticProblems = questCosmeticProblems(questDefinitions, cosmetics);
if (cosmeticProblems.length) {
  throw new Error(`Invalid quest cosmetic rewards:\n- ${cosmeticProblems.join('\n- ')}`);
}

export const classicOgV18R = {
  ...classicOgV18Q,
  meta: {
    ...classicOgV18Q.meta,
    id: 'classic-og-v1.8-r',
    version: '1.8.0-R',
    name: 'Classic OG - Hidden Streets Comedy',
  },
  cosmetics,
  randomEncounters,
  questDefinitions,
} as const satisfies Ruleset;
