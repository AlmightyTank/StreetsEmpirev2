import { classicOgV18E } from '../classic-og-v1.8-e/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { PermanentUnlockCatalog, QuestDefinition, QuestDefinitionCatalog, QuestObjectiveDefinition } from '../types.js';

/**
 * Quest Recipe Unlocks B — Pip's Cookhouse Ladder. A round starts with only the Crack
 * recipe. Each further recipe opens through one of Pip's jobs, and each job requires the
 * one before it: Party Favors (Ecstasy), Bulk Order (Meth), Green Thumb (Weed),
 * A Better Cut (Cocaine), Pip's Red Ledger (Heroin).
 *
 * BALANCE_APPROXIMATION. Objective sizes and cash follow Pip's existing side work;
 * Slice C tunes them with the recipes below.
 */

const RECIPES = [
  ['ECSTASY', 'Ecstasy'],
  ['METH', 'Meth'],
  ['WEED', 'Weed'],
  ['COCAINE', 'Cocaine'],
  ['HEROIN', 'Heroin'],
] as const;

export const recipeUnlocks: PermanentUnlockCatalog = Object.fromEntries(RECIPES.map(([product, name]) => {
  const key = `PRODUCT_${product}_RECIPE`;
  return [key, {
    key,
    name: `${name} Recipe`,
    description: `Pip's cookhouse makes ${name} for you for the rest of this round.`,
    category: 'PRODUCT',
    effect: { kind: 'PRODUCT_PRODUCTION_ACCESS', productKey: product },
  }];
}));

function cook(id: string, product: string, name: string, target: number): QuestObjectiveDefinition {
  return {
    id,
    kind: 'EVENT_SUM',
    description: `Produce ${target} ${name} after accepting the job.`,
    target,
    params: { eventTypes: ['PRODUCE_CRACK'], field: 'product', where: { productType: product } },
  };
}

function sell(id: string, product: string, name: string, target: number): QuestObjectiveDefinition {
  return {
    id,
    kind: 'EVENT_SUM',
    description: `Sell ${target} ${name} to Pip.`,
    target,
    params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP', product } },
  };
}

const after = (questKey: string) => ({ kind: 'QUEST_COMPLETED', params: { questKey } }) as const;

const base: QuestDefinitionCatalog = classicOgV18E.questDefinitions;
const oldPartyFavors = base.PIP_PARTY_FAVORS!;
const oldBulkOrder = base.PIP_BULK_ORDER!;

/** Rung 1. Party Favors used to cook Ecstasy; now it proves the Crack side and opens Ecstasy. */
const partyFavors: QuestDefinition = {
  ...oldPartyFavors,
  description: 'The club crowd wants Ecstasy. Pip will open that recipe to your cookhouse once you show him the Crack side runs clean.',
  prerequisites: [
    after('COOKHOUSE'),
    { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'PIP', points: 12 } },
  ],
  objectives: [
    cook('cook_crack', 'CRACK', 'Crack', 150),
    sell('sell_crack', 'CRACK', 'Crack', 100),
  ],
  bonusObjectives: [],
  // A recipe job pays no free stock, so the old 50 crack is gone.
  rewards: [
    ...oldPartyFavors.rewards.filter((reward) => reward.kind !== 'ITEM'),
    { kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_ECSTASY_RECIPE' },
  ],
};

/** Rung 2. Bulk Order used to cook Meth; now it runs two products and opens Meth. */
const bulkOrder: QuestDefinition = {
  ...oldBulkOrder,
  description: 'Pip has a customer who wants something stronger than rocks. Keep Ecstasy moving beside your Crack and he will trust you with Meth.',
  prerequisites: [after('PIP_PARTY_FAVORS')],
  objectives: [
    cook('cook_ecstasy', 'ECSTASY', 'Ecstasy', 100),
    sell('sell_ecstasy', 'ECSTASY', 'Ecstasy', 50),
  ],
  rewards: [
    ...oldBulkOrder.rewards,
    { kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_METH_RECIPE' },
  ],
};

function pipJob(input: Pick<QuestDefinition, 'key' | 'title' | 'description' | 'difficulty' | 'prerequisites' | 'objectives' | 'rewards'>): QuestDefinition {
  return {
    ...input,
    contactKey: 'PIP',
    type: 'SIDE',
    category: 'PRODUCT',
    bonusObjectives: [],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  };
}

export const cookhouseLadderQuests = defineQuestCatalog({
  ...base,
  PIP_PARTY_FAVORS: { ...partyFavors, followUpKeys: ['PIP_BULK_ORDER'] },
  PIP_BULK_ORDER: { ...bulkOrder, followUpKeys: ['PIP_GREEN_THUMB'] },
  PIP_GREEN_THUMB: pipJob({
    key: 'PIP_GREEN_THUMB',
    title: 'Green Thumb',
    description: 'Pip wants a steady earner that does not draw a crowd. Move Weed across his counter and he will open the Weed recipe.',
    difficulty: 'CONTRACT',
    prerequisites: [after('PIP_BULK_ORDER')],
    objectives: [sell('sell_weed', 'WEED', 'Weed', 150)],
    rewards: [
      { kind: 'CASH', amount: 15_000_00 },
      { kind: 'CONTACT_REP', key: 'PIP', amount: 15 },
      { kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_WEED_RECIPE' },
    ],
  }),
  PIP_A_BETTER_CUT: pipJob({
    key: 'PIP_A_BETTER_CUT',
    title: 'A Better Cut',
    description: 'Premium buyers want a seller with a record. Put real money across Pip\'s counter and he will open the Cocaine recipe.',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [after('PIP_GREEN_THUMB')],
    objectives: [
      sell('sell_meth', 'METH', 'Meth', 100),
      {
        id: 'sell_value',
        kind: 'EVENT_SUM',
        description: 'Sell $60,000 of product to Pip.',
        target: 60_000_00,
        params: { eventTypes: ['STORE_SELL'], field: 'totalCents', where: { storeKey: 'PIP' }, display: 'CURRENCY' },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 20_000_00 },
      { kind: 'CONTACT_REP', key: 'PIP', amount: 20 },
      { kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_COCAINE_RECIPE' },
    ],
  }),
  PIP_RED_LEDGER: pipJob({
    key: 'PIP_RED_LEDGER',
    title: 'Pip\'s Red Ledger',
    description: 'Pip keeps one page for the work he trusts to almost nobody. Fill a Cocaine contract from your own cookhouse and he will open the Heroin recipe.',
    difficulty: 'HIGH_RISK',
    prerequisites: [after('PIP_A_BETTER_CUT')],
    objectives: [
      cook('cook_cocaine', 'COCAINE', 'Cocaine', 40),
      sell('sell_cocaine', 'COCAINE', 'Cocaine', 40),
    ],
    rewards: [
      { kind: 'CASH', amount: 25_000_00 },
      { kind: 'CONTACT_REP', key: 'PIP', amount: 20 },
      { kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_HEROIN_RECIPE' },
    ],
  }),
});
