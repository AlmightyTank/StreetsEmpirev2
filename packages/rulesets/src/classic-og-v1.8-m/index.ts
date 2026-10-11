import { classicOgV18L } from '../classic-og-v1.8-l/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { ProductEconomy, QuestDefinitionCatalog, Ruleset } from '../types.js';

/**
 * Quest Recipe Unlocks C. Every recipe, tuned with `npm run qa:recipes` (see
 * docs/RECIPE-BALANCE-1.8.0-M.md). Crack is unchanged. Weed, Cocaine and Heroin replace
 * the provisional 1.8.0-F recipes. Ecstasy and Meth cost more to cook: with full Pip
 * standing, a store-price racket, full market pressure and a top workshop with a Drug Lab,
 * the earlier prices let a unit be cooked and sold back at home for a profit, which
 * `recipeResaleLoops` now forbids.
 *   - Weed: steady output, the least Heat of any cooked product, modest value.
 *   - Ecstasy: a step up in value; where it sells best depends on the city.
 *   - Meth: high output, more Heat than Weed.
 *   - Cocaine: slow and costly, with the most Heat, and the most value a unit.
 *   - Heroin: limited output and the widest swings, best where its demand is strong.
 */
const production = {
  WEED: { perThugPerTurn: 0.6, ingredientCentsPerUnit: 420, variance: 0.15, minHappinessMultiplier: 0.25, heatPerUnit: 0.01 },
  ECSTASY: { ...classicOgV18L.products.ECSTASY.economy.production, ingredientCentsPerUnit: 1_700 },
  COCAINE: { perThugPerTurn: 0.06, ingredientCentsPerUnit: 2_800, variance: 0.2, minHappinessMultiplier: 0.25, heatPerUnit: 0.15 },
  METH: { ...classicOgV18L.products.METH.economy.production, ingredientCentsPerUnit: 800 },
  HEROIN: { perThugPerTurn: 0.25, ingredientCentsPerUnit: 850, variance: 0.3, minHappinessMultiplier: 0.25, heatPerUnit: 0.06 },
} as const satisfies Record<string, NonNullable<ProductEconomy['production']>>;

/** Quest Recipe Unlocks D. What each cook is like, in a line, before a player spends turns on it. */
const recipeIdentity = {
  CRACK: 'The starter: quick to cook, cheap, and no Heat.',
  WEED: 'Steady and quiet: plenty a turn, barely any Heat, modest value.',
  ECSTASY: 'A step up in value; where it sells best depends on the city.',
  COCAINE: 'Slow, costly and hot, but worth the most a unit.',
  METH: 'High output with real Heat behind it.',
  HEROIN: 'Limited output and the widest swings; strong where demand runs high.',
} as const;

const products = classicOgV18L.products;
const cook = <K extends keyof typeof production>(key: K) => ({
  ...products[key],
  economy: { ...products[key].economy, production: production[key] },
  recipeIdentity: recipeIdentity[key],
});

const base: QuestDefinitionCatalog = classicOgV18L.questDefinitions;
const betterCut = base.PIP_A_BETTER_CUT!;

/**
 * A Better Cut asked for $60,000 of sales to Pip. His buyback is below what any unit costs
 * to cook, so that alone lost a player about $40,000 against $20,000 paid. A premium mix
 * keeps the idea for about $800. `ladderPacing` checks every rung this way.
 */
const questDefinitions = defineQuestCatalog({
  ...base,
  PIP_A_BETTER_CUT: {
    ...betterCut,
    description: 'Premium buyers want a seller with a record. Keep Meth and Ecstasy moving across Pip\'s counter and he will open the Cocaine recipe.',
    objectives: [
      betterCut.objectives.find((objective) => objective.id === 'sell_meth')!,
      { id: 'sell_ecstasy', kind: 'EVENT_SUM', description: 'Sell 60 Ecstasy to Pip.', target: 60, params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP', product: 'ECSTASY' } } },
    ],
  },
});

/** 1.8.0-M — Recipe balance (Quest Recipe Unlocks C) on top of 1.8.0-L. */
export const classicOgV18M = {
  ...classicOgV18L,
  meta: {
    ...classicOgV18L.meta,
    id: 'classic-og-v1.8-m',
    version: '1.8.0-M',
    name: 'Classic OG - Recipe Balance',
  },
  products: {
    ...products,
    CRACK: { ...products.CRACK, recipeIdentity: recipeIdentity.CRACK },
    WEED: cook('WEED'),
    ECSTASY: cook('ECSTASY'),
    COCAINE: cook('COCAINE'),
    METH: cook('METH'),
    HEROIN: cook('HEROIN'),
  },
  questDefinitions,
} as const satisfies Ruleset;
