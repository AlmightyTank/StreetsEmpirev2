import { classicOgV23A } from '../classic-og-v2.3-a/index.js';
import { classicOgV14B2 } from '../classic-og-v1.4-b2/index.js';
import { CLASSIC_OG_V07G_HIDEOUT_V2 } from '../hideout-v2.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import { specialtyQuests } from '../classic-og-v1.6.5-e2/guided-campaign.js';
import { starterLeads } from './starter-leads.js';
import { starterContactArcs } from './contact-arcs.js';
import { referralArcs } from './referral-arcs.js';
import { commissionerArcs } from './commissioner-arcs.js';
import { rotatingContracts } from './rotating-contracts.js';
import type { QuestDefinition, QuestDefinitionCatalog } from '../types.js';
import type { Ruleset } from '../types.js';

const baseQuests = classicOgV23A.questDefinitions as QuestDefinitionCatalog;
/** Reuse the established contract cards so the current board has a full deck.
 * The v2.4-specific cards below extend this pool; historical ruleset catalogs
 * remain unchanged. */
const establishedRotatingContracts = Object.fromEntries(
  Object.entries(classicOgV14B2.questDefinitions)
    .filter(([, quest]) => quest.type === 'DAILY' || quest.type === 'WEEKLY'),
) as QuestDefinitionCatalog;
const graduationKey = 'PLANT_THE_FLAG';
const specialtyKeys = Object.keys(specialtyQuests);
const retiredTutorialKeys = new Set([
  'TOUR_FIRST_JOB',
  'TOUR_SCOUT',
  'TOUR_SUPPLIES',
  'TOUR_CREW',
  'TOUR_COOK',
  'TOUR_HIDEOUT',
  'TOUR_RAID',
]);
const retiredLinearKeys = new Set([
  'FIRST_NIGHT_OUT', 'FRESH_FACES', 'KEEPING_THEM_HAPPY', 'COOKHOUSE',
  'PAYDAY', 'HEAVY_HANDS', 'EYES_OPEN', 'COLLECTION_DAY', 'PACK_YOUR_BAGS',
]);

/** Existing side arcs referenced the retired chain. Keep those arcs available,
 * but make their gates point at real current-board evidence. */
const retiredQuestReplacement: Readonly<Record<string, string>> = {
  FIRST_NIGHT_OUT: 'BOARD_MAMA_FIRST_LOOK',
  FRESH_FACES: 'BOARD_TOMMY_MUSCLE',
  KEEPING_THEM_HAPPY: 'BOARD_PIP_FIRST_BATCH',
  COOKHOUSE: 'BOARD_PIP_FIRST_BATCH',
  PAYDAY: 'BOARD_MAMA_FIRST_LOOK',
  HEAVY_HANDS: 'BOARD_TOMMY_MUSCLE',
  EYES_OPEN: 'BOARD_MAMA_FIRST_LOOK',
  COLLECTION_DAY: 'BOARD_TOMMY_MUSCLE',
  PACK_YOUR_BAGS: 'BOARD_WHEELS_FIRST_RUN',
};

function migrateRetiredReferences(quest: QuestDefinition): QuestDefinition {
  const prerequisites = quest.prerequisites.map((prerequisite) => {
    const questKey = prerequisite.params?.questKey;
    const replacement = typeof questKey === 'string' ? retiredQuestReplacement[questKey] : undefined;
    return replacement
      ? { ...prerequisite, params: { ...prerequisite.params, questKey: replacement } }
      : prerequisite;
  });
  const followUpKeys = [...new Set(quest.followUpKeys.map((key) => retiredQuestReplacement[key] ?? key))]
    .filter((key) => key !== quest.key);
  return { ...quest, prerequisites, followUpKeys };
}

// The seven quest-board tutorial jobs were shipped before the chapter/tracker
// onboarding work. New 2.4 rounds use the current onboarding flow instead;
// historical rulesets retain their original catalogs and existing DB rows are
// never rewritten by this snapshot change.
const currentQuests = Object.fromEntries(
  Object.entries(baseQuests)
    .filter(([key]) => !retiredTutorialKeys.has(key) && !retiredLinearKeys.has(key))
    .map(([key, quest]) => [key, migrateRetiredReferences(quest)]),
) as QuestDefinitionCatalog;

const starterLeadFollowUps: Readonly<Record<string, string>> = {
  BOARD_MAMA_FIRST_LOOK: 'BOARD_MAMA_NIGHT_PULSE',
  BOARD_TOMMY_MUSCLE: 'BOARD_TOMMY_FIRST_ARMORY',
  BOARD_PIP_FIRST_BATCH: 'BOARD_PIP_FIRST_SALE',
  BOARD_WHEELS_FIRST_RUN: 'BOARD_WHEELS_RETURN_TICKET',
  BOARD_BLOCKS_MARK_CORNER: 'BOARD_BLOCKS_HOLD_THE_LINE',
};

const currentStarterLeads = Object.fromEntries(
  Object.entries(starterLeads).map(([key, quest]) => [key, {
    ...quest,
    followUpKeys: [starterLeadFollowUps[key]!],
  }]),
) as QuestDefinitionCatalog;

const currentContactArcs = {
  ...starterContactArcs,
} as QuestDefinitionCatalog;

/**
 * 2.4.0-A keeps the existing Quest Board and adds the already-authored
 * specialty branches to the current ruleset snapshot. Historical rulesets
 * retain their original catalogs; only newly opted-in 2.4 rounds see these
 * post-graduation choices.
 */
const questDefinitions = defineQuestCatalog({
  ...currentQuests,
  ...establishedRotatingContracts,
  [graduationKey]: {
    ...baseQuests[graduationKey]!,
    prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'BOARD_BLOCKS_MARK_CORNER' } }],
    followUpKeys: [...new Set([...(baseQuests[graduationKey]?.followUpKeys ?? []), ...specialtyKeys])],
    story: baseQuests[graduationKey]?.story ? {
      ...baseQuests[graduationKey].story,
      completed: 'The tutorial is complete. New specialty paths are waiting on the Quest Board; choose one or learn several at your own pace.',
    } : undefined,
  },
  ...currentStarterLeads,
  ...currentContactArcs,
  ...referralArcs,
  ...commissionerArcs,
  ...rotatingContracts,
  ...specialtyQuests,
});

/** 2.4.0-A. New rounds may opt in to the versioned territory reward catalog. */
export const classicOgV24A = {
  ...classicOgV23A,
  meta: { ...classicOgV23A.meta, id: 'classic-og-v2.4-a', version: '2.4.0-A', name: 'Classic OG - Territory Rewards' },
  // Carried on the ruleset so every ruleset spread from this one keeps Hideout v2.
  hideoutV2: CLASSIC_OG_V07G_HIDEOUT_V2,
  contacts: { ...classicOgV23A.contacts, COMMISSIONER: {
    key: 'COMMISSIONER', name: 'The Commissioner', shortName: 'The Commissioner',
    role: 'Records & Investigations', independent: 'He answers to the record, not to a street faction.',
    description: 'A principled law-focused contact who deals in heat, evidence, wanted status, protection, and investigations. He is not a friend, and he is not for sale.',
  } },
  questDefinitions,
  territoryPerks: { catalogVersion: 'territory-perks-v1', enabled: true, dailyYieldCapCentsPerMember: 25_000 },
  contractRotation: { perRoundDeck: true, freshCityBoards: true, cityJobs: true },
  cosmetics: {
    ...classicOgV23A.cosmetics,
    'territory-regional-governor': {
      key: 'territory-regional-governor', name: 'Regional Governor',
      description: 'Awarded for helping your alliance hold a region at round close.', kind: 'TITLE_BADGE', rarity: 'epic',
    },
    'territory-national-kingpin': {
      key: 'territory-national-kingpin', name: 'National Kingpin',
      description: 'Awarded for helping your alliance control every eligible region at round close.', kind: 'TITLE_BADGE', rarity: 'legendary',
    },
    'territory-national-kingpin-frame': {
      key: 'territory-national-kingpin-frame', name: 'Crowned Territory',
      description: 'An animated frame reserved for contributors to a National Kingpin alliance.', kind: 'PROFILE_FRAME', rarity: 'legendary', styleKey: 'territory-national-kingpin-frame',
    },
  },
  randomEncounters: {
    ...classicOgV23A.randomEncounters!,
    triggers: {
      ...classicOgV23A.randomEncounters!.triggers,
      SCOUT: {
        ...classicOgV23A.randomEncounters!.triggers.SCOUT!,
        entries: [
          ...classicOgV23A.randomEncounters!.triggers.SCOUT!.entries,
          {
            key: 'territory-chicago-armory-tip',
            title: 'Armory connection',
            text: 'A contact inside the Chicago armory points your crew toward a small supply cache.',
            tone: 'good',
            weight: 1,
            territory: { scope: 'CITY', key: 'chicago' },
            supplies: { beer: { min: 1, max: 2 }, medicine: { min: 1, max: 1 } },
          },
          {
            key: 'territory-safehouse-intelligence',
            title: 'Safehouse intelligence',
            text: 'The neighborhood safehouse shares a quiet route and a warning about the next patrol shift.',
            tone: 'good',
            weight: 1,
            territory: { scope: 'DISTRICT', key: 'WINO_SLUMS' },
            heat: { min: -2, max: -1 },
            supplies: { medicine: { min: 1, max: 2 } },
          },
          {
            key: 'territory-supply-line-opportunity',
            title: 'Supply-line opportunity',
            text: 'A Midwest runner can move a small shipment through your alliance territory.',
            tone: 'good',
            weight: 1,
            territory: { scope: 'REGION', key: 'midwest', minimumTier: 1 },
            supplies: { crack: { min: 1, max: 2 }, beer: { min: 1, max: 2 } },
          },
        ],
      },
      STORE: {
        ...classicOgV23A.randomEncounters!.triggers.STORE!,
        entries: [
          ...classicOgV23A.randomEncounters!.triggers.STORE!.entries,
          {
            key: 'territory-black-market-stock',
            title: 'Black-market stock',
            text: 'A trusted Chicago broker offers a small off-book bundle from the local territory supply.',
            tone: 'good',
            weight: 1,
            territory: { scope: 'CITY', key: 'chicago' },
            choices: [
              { key: 'take-medicine', label: 'Take the medicine', text: 'Accept a discreet medical bundle.', supplies: { medicine: { min: 2, max: 2 } } },
              { key: 'take-beer', label: 'Take the beer', text: 'Accept a small nightlife shipment.', supplies: { beer: { min: 2, max: 2 } } },
            ],
          },
        ],
      },
      TURF: {
        ...classicOgV23A.randomEncounters!.triggers.TURF!,
        entries: [
          ...classicOgV23A.randomEncounters!.triggers.TURF!.entries,
          {
            key: 'territory-regional-kingpin-contract',
            title: 'Regional Kingpin contract',
            text: 'A regional fixer offers a one-time contract to stabilize the Midwest supply route.',
            tone: 'neutral',
            weight: 1,
            territory: { scope: 'REGION', key: 'midwest', minimumTier: 2 },
            choices: [
              { key: 'secure-route', label: 'Secure the route', text: 'Spend the lead to strengthen your crew.', turns: { min: -1, max: -1 }, thugs: { min: 1, max: 1 } },
              { key: 'decline-contract', label: 'Pass', text: 'Keep your crew focused on the current fight.' },
            ],
          },
        ],
      },
    },
  },
} satisfies Ruleset;
