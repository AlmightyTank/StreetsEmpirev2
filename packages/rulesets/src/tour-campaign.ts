import { defineQuestCatalog } from './quest-definitions.js';
import type { ContactKey, QuestDefinition, QuestDefinitionCatalog } from './types.js';

type TourQuestInput = {
  key: string;
  title: string;
  category: string;
  contactKey: ContactKey;
  chapter: string;
  lesson: string;
  actionHint: string;
  objectiveId: string;
  objectiveKind: 'EVENT_COUNT' | 'RECRUIT_CREW';
  objectiveDescription: string;
  eventTypes: readonly string[];
  target?: number;
  crew?: 'THUGS';
  prerequisiteKey?: string;
  followUpKey?: string;
  cashCents: number;
  repAmount?: number;
};

const tourQuest = (input: TourQuestInput): QuestDefinition => ({
  key: input.key,
  title: input.title,
  description: input.lesson,
  contactKey: input.contactKey,
  type: 'STORY',
  category: input.category,
  difficulty: 'STREET_JOB',
  prerequisites: input.prerequisiteKey
    ? [{ kind: 'QUEST_COMPLETED', params: { questKey: input.prerequisiteKey } }]
    : [],
  objectives: [{
    id: input.objectiveId,
    kind: input.objectiveKind,
    description: input.objectiveDescription,
    target: input.target ?? 1,
    params: {
      eventTypes: [...input.eventTypes],
      ...(input.objectiveKind === 'RECRUIT_CREW' ? { crew: input.crew ?? 'THUGS' } : {}),
    },
  }],
  bonusObjectives: [],
  rewards: [
    { kind: 'CASH', amount: input.cashCents },
    ...(input.repAmount ? [{ kind: 'CONTACT_REP' as const, key: input.contactKey, amount: input.repAmount }] : []),
  ],
  story: {
    chapter: input.chapter,
    intro: input.lesson,
    inProgress: input.actionHint,
    ready: 'That step is done. Claim this job to unlock the next one.',
    completed: 'Claimed. The next step of the tour is on your board.',
    lesson: input.lesson,
    actionHint: input.actionHint,
  },
  followUpKeys: input.followUpKey ? [input.followUpKey] : [],
  repeatability: 'ONCE',
  expiresAfterMinutes: null,
  availability: {},
});

/**
 * Guided walkthrough tour: seven ordered core-loop jobs. Claiming each job
 * unlocks the next; every reward is round-scoped cash (plus a little contact
 * rep), never a permanent advantage. The raid job counts any resolved
 * attempt, win or loss, so losing never strands the player.
 */
export const tourCampaignQuests = defineQuestCatalog({
  TOUR_FIRST_JOB: tourQuest({
    key: 'TOUR_FIRST_JOB', title: 'First Job', category: 'STREET', contactKey: 'MAMA_KING',
    chapter: 'Tour 1 of 7: First Job',
    lesson: 'Mama points at the board. Jobs pay for real work: take one, do it, claim it.',
    actionHint: 'Open Jobs and accept any contact job. Accepting this job counts.',
    objectiveId: 'accept_job', objectiveKind: 'EVENT_COUNT',
    objectiveDescription: 'Accept one contact job from the Quest Board.',
    eventTypes: ['QUEST_ACCEPTED'],
    followUpKey: 'TOUR_SCOUT', cashCents: 100_000, repAmount: 5,
  }),
  TOUR_SCOUT: tourQuest({
    key: 'TOUR_SCOUT', title: 'Work the Block', category: 'STREET', contactKey: 'MAMA_KING',
    chapter: 'Tour 2 of 7: Work the Block',
    lesson: 'Scouting sends the crew to work a district for turns. It brings cash and sometimes recruits.',
    actionHint: 'Open Scout, pick a district, and spend turns working it.',
    objectiveId: 'scout_once', objectiveKind: 'EVENT_COUNT',
    objectiveDescription: 'Scout a district once.',
    eventTypes: ['SCOUT'],
    prerequisiteKey: 'TOUR_FIRST_JOB', followUpKey: 'TOUR_SUPPLIES', cashCents: 150_000, repAmount: 5,
  }),
  TOUR_SUPPLIES: tourQuest({
    key: 'TOUR_SUPPLIES', title: 'Stock the Shelves', category: 'SUPPLY', contactKey: 'PIP',
    chapter: 'Tour 3 of 7: Stock the Shelves',
    lesson: 'Condoms keep the girls working and every thug wants a beer. Shelves restock on their own clock.',
    actionHint: 'Open Stores and buy condoms and beer.',
    objectiveId: 'buy_supplies', objectiveKind: 'EVENT_COUNT',
    objectiveDescription: 'Complete two store buys (condoms and beer).',
    eventTypes: ['STORE_BUY'], target: 2,
    prerequisiteKey: 'TOUR_SCOUT', followUpKey: 'TOUR_CREW', cashCents: 150_000, repAmount: 5,
  }),
  TOUR_CREW: tourQuest({
    key: 'TOUR_CREW', title: 'Grow the Crew', category: 'CREW', contactKey: 'TOMMY',
    chapter: 'Tour 4 of 7: Grow the Crew',
    lesson: 'Thugs cover the street and fight. Scouting finds recruits, or hire muscle at the store.',
    actionHint: 'Scout until a thug joins, or hire one from the store.',
    objectiveId: 'gain_thug', objectiveKind: 'RECRUIT_CREW',
    objectiveDescription: 'Gain one thug through scouting.',
    eventTypes: ['SCOUT'], crew: 'THUGS',
    prerequisiteKey: 'TOUR_SUPPLIES', followUpKey: 'TOUR_COOK', cashCents: 200_000, repAmount: 5,
  }),
  TOUR_COOK: tourQuest({
    key: 'TOUR_COOK', title: 'Cook Your Own', category: 'PRODUCT', contactKey: 'PIP',
    chapter: 'Tour 5 of 7: Cook Your Own',
    lesson: 'Producing spends turns and ingredients to cook product instead of buying it. Product feeds the crew and sells, but draws Heat.',
    actionHint: 'Open Produce and cook a batch.',
    objectiveId: 'cook_once', objectiveKind: 'EVENT_COUNT',
    objectiveDescription: 'Produce one batch of product.',
    eventTypes: ['PRODUCE_CRACK'],
    prerequisiteKey: 'TOUR_CREW', followUpKey: 'TOUR_HIDEOUT', cashCents: 200_000, repAmount: 5,
  }),
  TOUR_HIDEOUT: tourQuest({
    key: 'TOUR_HIDEOUT', title: 'Build the Base', category: 'HIDEOUT', contactKey: 'MAMA_KING',
    chapter: 'Tour 6 of 7: Build the Base',
    lesson: 'The hideout is this season’s base. Rooms buy small, capped buffs: the Safe Room protects cash, the Workshop helps production.',
    actionHint: 'Open the Hideout and upgrade the Safe Room or Workshop once.',
    objectiveId: 'upgrade_once', objectiveKind: 'EVENT_COUNT',
    objectiveDescription: 'Upgrade one hideout room.',
    eventTypes: ['HIDEOUT_UPGRADE'],
    prerequisiteKey: 'TOUR_COOK', followUpKey: 'TOUR_RAID', cashCents: 250_000, repAmount: 5,
  }),
  TOUR_RAID: tourQuest({
    key: 'TOUR_RAID', title: 'Take a Shot', category: 'COMBAT', contactKey: 'TOMMY',
    chapter: 'Tour 7 of 7: Take a Shot',
    lesson: 'Raids take from other players. Recon shows what a target holds, and any resolved attempt teaches something. You do not need to win.',
    actionHint: 'Open Combat, recon a same-city target, then resolve one raid attempt.',
    objectiveId: 'raid_attempt', objectiveKind: 'EVENT_COUNT',
    objectiveDescription: 'Resolve one raid attempt (win or loss).',
    eventTypes: ['RAID_ATTACK'],
    prerequisiteKey: 'TOUR_HIDEOUT', cashCents: 500_000, repAmount: 10,
  }),
} as const satisfies QuestDefinitionCatalog);
