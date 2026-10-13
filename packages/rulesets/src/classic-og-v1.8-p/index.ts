import { classicOgV18O } from '../classic-og-v1.8-o/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type {
  QuestDefinitionCatalog,
  RandomEncounterEntryRules,
  RandomEncounterTrigger,
  RandomEncounterTriggerRules,
  Ruleset,
} from '../types.js';

const priorEncounters = classicOgV18O.randomEncounters!;

/**
 * Hidden Streets Slice B — first playable vertical slice (beta demonstrators).
 *
 * - The Traveling Salesman (TRAVEL): an original comedic road salesman with
 *   three choices and a clear receipt. No film likeness, lines, or names.
 * - The Colorful Van (SCOUT): an original mystery van whose paw-print trail
 *   points at the Blackwood estate. Seeing it plants the clue that reveals
 *   SECRET_BLACKWOOD_GATE (the SCOUT activity payload carries
 *   `encounter.key`, which the secret trigger matches).
 *
 * Both entries ride the existing encounter settlement (capped effects,
 * 24h pending choices, per-key cooldowns, first-class receipts) and render
 * through the existing generic pending-encounter UI, so there is no new
 * client surface and no client-side awarding.
 */
export const hiddenStreetsSliceBEncounters = {
  TRAVEL: {
    key: 'travel-traveling-salesman',
    title: 'The Traveling Salesman',
    text: 'A sweaty, cheerful salesman in a wrinkled suit flags down the convoy beside a station wagon full of sample cases. He is three states from home, out of gas money, and absolutely certain your crew needs premium brake pads.',
    tone: 'neutral',
    weight: 3,
    choices: [
      {
        key: 'buy-sample-case',
        label: 'Buy a sample case',
        text: 'Overpay for a case of brake pads you do not need, just to see him light up.',
        cash: { minCents: -5_000, maxCents: -5_000 },
      },
      {
        key: 'trade-road-stories',
        label: 'Trade road stories',
        text: 'Swap tall tales for an hour. He buys the coffee and talks you past a speed trap.',
        heat: { min: -1, max: -1 },
      },
      {
        key: 'roll-on',
        label: 'Roll on',
        text: 'Wish him luck and keep driving.',
      },
    ],
  },
  SCOUT: {
    key: 'scout-colorful-van',
    title: 'The Colorful Van',
    text: 'A van painted in big flowers sits crooked at the curb, engine ticking as it cools. Strange paw prints circle it twice, then wander toward the old Blackwood estate on the hill. A folded note under the wiper reads: THE MANOR KEEPS WHAT IT CATCHES.',
    tone: 'neutral',
    weight: 3,
    choices: [
      {
        key: 'follow-tracks',
        label: 'Follow the tracks',
        text: 'Trail the paw prints to the estate gate and pocket a strange iron key you find in the dirt.',
        cash: { minCents: 2_500, maxCents: 8_000 },
      },
      {
        key: 'study-the-note',
        label: 'Study the note',
        text: 'Copy the note word for word. Somebody went to trouble to warn whoever reads it.',
        heat: { min: -1, max: -1 },
      },
      {
        key: 'leave-the-van',
        label: 'Leave it alone',
        text: 'Back away slow. Vans like that have owners, and owners have questions.',
      },
    ],
  },
} as const satisfies Partial<Record<RandomEncounterTrigger, RandomEncounterEntryRules>>;

function withEntry(trigger: RandomEncounterTriggerRules, entry: RandomEncounterEntryRules): RandomEncounterTriggerRules {
  return { ...trigger, entries: [...trigger.entries, entry] };
}

const triggers = {
  ...priorEncounters.triggers,
  TRAVEL: withEntry(priorEncounters.triggers.TRAVEL!, hiddenStreetsSliceBEncounters.TRAVEL),
  SCOUT: withEntry(priorEncounters.triggers.SCOUT!, hiddenStreetsSliceBEncounters.SCOUT),
} satisfies Partial<Record<RandomEncounterTrigger, RandomEncounterTriggerRules>>;

const base: QuestDefinitionCatalog = classicOgV18O.questDefinitions;

/**
 * Blackwood Manor opening. Revealed by meeting the Colorful Van: the SCOUT
 * activity payload carries `encounter.key`, so one scout that offers the van
 * satisfies this trigger on the next quest sync. Per-round story state in
 * PlayerQuest; no permanent progression hidden behind it.
 */
const questDefinitions = defineQuestCatalog({
  ...base,
  SECRET_BLACKWOOD_GATE: {
    key: 'SECRET_BLACKWOOD_GATE',
    title: 'Blackwood Gate',
    description: 'The paw prints end at an iron gate and an iron key you cannot explain. Somebody wants the Blackwood estate noticed. Walk the streets around it and learn what the manor keeps.',
    contactKey: null,
    type: 'SECRET',
    category: 'STREET',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [],
    objectives: [
      {
        id: 'trace_steps',
        kind: 'EVENT_COUNT',
        description: 'Scout 3 times while the trail is warm.',
        target: 3,
        params: { eventTypes: ['SCOUT'] },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 3_000_000 },
      { kind: 'FAVOR_ITEM', key: 'BURNER_PHONE', amount: 1 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      hidden: true,
      secretTrigger: {
        kind: 'ACTIVITY_COUNT',
        eventTypes: ['SCOUT'],
        where: { 'encounter.key': 'scout-colorful-van' },
        target: 1,
      },
      secretContent: {
        family: 'BLACKWOOD',
        discoveryTier: 'HIDDEN',
        clueMilestones: ['trace_steps'],
      },
    },
  },
});

/** 1.8.0-P — Hidden Streets Slice B: Traveling Salesman, Colorful Van, Blackwood Gate. */
export const classicOgV18P = {
  ...classicOgV18O,
  meta: {
    ...classicOgV18O.meta,
    id: 'classic-og-v1.8-p',
    version: '1.8.0-P',
    name: 'Classic OG - Hidden Streets Slice B',
  },
  questDefinitions,
  randomEncounters: {
    ...priorEncounters,
    triggers,
  },
} as const satisfies Ruleset;
