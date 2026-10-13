import { classicOgV18L } from '../classic-og-v1.8-l/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { ProductEconomy, QuestDefinitionCatalog, RandomEncounterEntryRules, RandomEncounterTrigger, RandomEncounterTriggerRules, Ruleset } from '../types.js';

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

const priorEncounters = classicOgV18L.randomEncounters!;

/**
 * Easter egg encounters. Each sits at weight 1 beside the ordinary entries, so
 * it turns up a few times a season for an active player. Which choice finds
 * which egg lives with the egg catalog (EASTER_EGG_ENCOUNTERS in
 * @streets/shared); the effects here are deliberately small.
 */
export const easterEggEncounters = {
  SCOUT: {
    key: 'egg-the-statue',
    title: 'The statue',
    text: 'There is a stone statue at the end of the alley, hands over its face like it is crying. You would swear it was not there yesterday. You glance at your phone, and when you look back up, it is closer.',
    tone: 'warn',
    weight: 1,
    choices: [
      { key: 'dont-blink', label: 'Don’t blink', text: 'You stare until your eyes burn. A bus roars past, and when it has gone, so has the statue.' },
      { key: 'run', label: 'Run', text: 'You run. Something touches your shoulder. You wake up on a bench across town with a roll of 1969 banknotes in your pocket.', cash: { minCents: 1_969, maxCents: 1_969 } },
      { key: 'take-a-photo', label: 'Take a photo', text: 'That is not how this works. The photo is just a smear, and somebody saw you photographing a statue at 3am.', heat: { min: 1, max: 1 } },
    ],
  },
  TRAVEL: {
    key: 'egg-the-briefcase',
    title: 'The briefcase',
    text: 'A black briefcase sits on the back seat of a car with its doors open and nobody around. The combination is 666. Of course it is.',
    tone: 'neutral',
    weight: 1,
    choices: [
      { key: 'open', label: 'Open it', text: 'It glows gold. You look for a long moment, then close it. Some things you do not talk about.' },
      { key: 'leave', label: 'Leave it', text: 'Whoever owns that case is not somebody you want looking for you. You keep driving.' },
    ],
  },
  PRODUCE: {
    key: 'egg-the-whistle',
    title: 'Whistling down the block',
    text: 'Somebody is whistling “The Farmer in the Dell” at the end of the block. The kids on the corner go quiet. Somebody says a name.',
    tone: 'warn',
    weight: 1,
    choices: [
      { key: 'get-off-the-corner', label: 'Get off the corner', text: 'You pull the crew inside and kill the lights. The whistling goes past. A man’s gotta have a code.', heat: { min: -1, max: -1 } },
      { key: 'stand-your-ground', label: 'Stand your ground', text: 'He takes the stash money without raising his voice. “You come at the king, you best not miss.”', cash: { minCents: -15_000, maxCents: -5_000 } },
    ],
  },
  TURF: {
    key: 'egg-the-offer',
    title: 'A reasonable man',
    text: 'The man who owns the corner store on your block will not sell, and he will not pay. Your consigliere suggests reasoning with him.',
    tone: 'neutral',
    weight: 1,
    choices: [
      { key: 'make-the-offer', label: 'Make him an offer', text: 'In the morning he finds something in his bed that changes his mind. He signs. Nobody on the block will meet your eye.', cash: { minCents: -2_500, maxCents: -2_500 }, heat: { min: 2, max: 2 } },
      { key: 'leave-the-gun', label: 'Leave it', text: 'Leave the gun, take the cannoli. You walk away and the block stays quiet.' },
    ],
  },
} as const satisfies Partial<Record<RandomEncounterTrigger, RandomEncounterEntryRules>>;

function withEgg(trigger: RandomEncounterTriggerRules, egg: RandomEncounterEntryRules): RandomEncounterTriggerRules {
  return { ...trigger, entries: [...trigger.entries, egg] };
}

const triggers = {
  ...priorEncounters.triggers,
  SCOUT: withEgg(priorEncounters.triggers.SCOUT!, easterEggEncounters.SCOUT),
  TRAVEL: withEgg(priorEncounters.triggers.TRAVEL!, easterEggEncounters.TRAVEL),
  PRODUCE: withEgg(priorEncounters.triggers.PRODUCE!, easterEggEncounters.PRODUCE),
  TURF: withEgg(priorEncounters.triggers.TURF!, easterEggEncounters.TURF),
} satisfies Partial<Record<RandomEncounterTrigger, RandomEncounterTriggerRules>>;

/** 1.8.0-M — Recipe balance (Quest Recipe Unlocks C) on top of 1.8.0-L, plus the Easter egg encounters. */
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
  randomEncounters: {
    ...priorEncounters,
    triggers,
  },
} as const satisfies Ruleset;
