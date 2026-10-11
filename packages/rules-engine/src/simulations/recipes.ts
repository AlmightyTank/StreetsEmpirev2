import { hideoutV2For, type Ruleset } from '@streets/rulesets';
import { bribeCentsPerPoint } from '../calculations/heat.js';
import { dealerDemand, dealerPace, dealerPressure, dealerRules, dealerStreetPriceCents } from '../calculations/dealers.js';
import { productLoops, productRecipes, recipeResaleLoops, type ProductRecipe } from '../calculations/product-economy.js';

/**
 * Quest Recipe Unlocks C. What each recipe earns a day, cooked at home and moved by the
 * home city's dealer crews, across cities, crew sizes and workshop boosts. Expected values,
 * no dice: happiness and variance average to one, so differences come from the rules.
 *
 * The day: the crew cooks only what its dealers can sell (a player has no use for more),
 * capped by the thugs' turns. Dealers are new (Rookie cut) and work an ordinary district.
 * Heat up to the share of the day's decay left for cooking is free; past it, a unit is
 * cooked only if its margin pays the bribe for its Heat at the player's net worth, and
 * then the excess is bought down at that price. Dealer wages are the same for every product,
 * so they are left out of the ranking; ingredients are paid on base units only, as the
 * workshop's bonus units cost nothing.
 */

export interface RecipeScenario {
  readonly key: string;
  readonly label: string;
  readonly thugs: number;
  readonly dealers: number;
  readonly workshopLevel: number;
  readonly drugLab: boolean;
  /** Turns a day the player spends producing. */
  readonly turnsPerDay: number;
  readonly netWorthCents: number;
}

/** Three stages of an operation: a new crew, a growing one, and a large boosted one. */
export const RECIPE_SCENARIOS: readonly RecipeScenario[] = [
  { key: 'START', label: 'Street start: 25 thugs, 2 dealers, no workshop', thugs: 25, dealers: 2, workshopLevel: 0, drugLab: false, turnsPerDay: 144, netWorthCents: 10_000_000 },
  { key: 'GROWING', label: 'Growing: 80 thugs, one 6-dealer crew, workshop 2', thugs: 80, dealers: 6, workshopLevel: 2, drugLab: false, turnsPerDay: 288, netWorthCents: 100_000_000 },
  { key: 'ESTABLISHED', label: 'Established: 250 thugs, three full crews, workshop 5 and Drug Lab', thugs: 250, dealers: 18, workshopLevel: 5, drugLab: true, turnsPerDay: 288, netWorthCents: 1_000_000_000 },
];

export interface RecipeDay {
  readonly product: string;
  readonly name: string;
  /** Units the thugs could cook a day, bonus included. */
  readonly cookCapacity: number;
  /** Units the dealers sell a day. */
  readonly dealerCapacity: number;
  readonly sold: number;
  readonly incomeCents: number;
  readonly ingredientCents: number;
  readonly heat: number;
  readonly heatCostCents: number;
  readonly profitCents: number;
}

/** The share of a day's Heat decay left for cooking; the rest covers the street work. */
const COOKING_DECAY_SHARE = 0.5;
const DAY_MINUTES = 24 * 60;

export function recipeDay(ruleset: Ruleset, scenario: RecipeScenario, city: string, recipe: ProductRecipe): RecipeDay | null {
  const rules = dealerRules(ruleset);
  if (!rules) return null;
  const street = dealerStreetPriceCents(ruleset, rules, city, recipe.product);
  if (!street) return null;
  const hideout = hideoutV2For(ruleset)?.workshop;
  const efficiency = hideout?.ingredientEfficiencyPercentByWorkshopLevel[scenario.workshopLevel] ?? 0;
  const bonus = (hideout?.outputBonusPercentByWorkshopLevel[scenario.workshopLevel] ?? 0)
    + (scenario.drugLab ? hideoutV2For(ruleset)?.specializationEffects?.workshop.drugLabOutputBonusPercent ?? 0 : 0);
  const modifier = ruleset.cities?.[city]?.modifiers.crack ?? 1;

  const cookCapacity = Math.floor(scenario.thugs * recipe.perThugPerTurn * modifier * scenario.turnsPerDay * (100 + bonus) / 100);
  const pace = dealerPace({
    rules,
    demand: dealerDemand(ruleset, city, recipe.product),
    district: 'URBAN_GHETTO',
    dealers: Array(scenario.dealers).fill(0),
    priceCents: street,
    streetPriceCents: street,
    pressure: dealerPressure(ruleset, city),
  });
  const dealerCapacity = Math.floor(pace.unitsPerHour * 24);
  const unitIngredient = Math.max(1, Math.floor(recipe.ingredientCentsPerUnit * (100 - efficiency) / 100));
  // Past the Heat the day's decay covers, a unit is worth cooking only if it pays its bribe.
  // A round without Heat rules never charges for it.
  const freeHeat = ruleset.heat ? ruleset.heat.decayPerInterval * DAY_MINUTES / ruleset.turns.intervalMinutes * COOKING_DECAY_SHARE : Infinity;
  const bribe = ruleset.heat ? Number(bribeCentsPerPoint(BigInt(scenario.netWorthCents), ruleset.heat)) : 0;
  const margin = street * (100 - pace.cutPercent) / 100 - unitIngredient * 100 / (100 + bonus);
  const coolUnits = recipe.heatPerUnit > 0 ? Math.floor(freeHeat / recipe.heatPerUnit) : Infinity;
  const cap = margin > recipe.heatPerUnit * bribe ? Infinity : coolUnits;
  const sold = Math.min(cookCapacity, dealerCapacity, cap);
  const baseUnits = Math.ceil(sold * 100 / (100 + bonus));
  const incomeCents = Math.floor(sold * street * (100 - pace.cutPercent) / 100);
  const ingredientCents = baseUnits * unitIngredient;
  const heat = sold * recipe.heatPerUnit;
  const heatCostCents = Math.max(0, heat - freeHeat) * bribe;
  return {
    product: recipe.product,
    name: recipe.name,
    cookCapacity,
    dealerCapacity,
    sold,
    incomeCents,
    ingredientCents,
    heat,
    heatCostCents: Math.round(heatCostCents),
    profitCents: Math.round(incomeCents - ingredientCents - heatCostCents),
  };
}

export interface RecipeBalanceRow {
  readonly scenario: RecipeScenario;
  readonly city: string;
  readonly days: readonly RecipeDay[];
  /** The product that earns the most here. */
  readonly best: string;
}

export interface RecipeBalance {
  readonly rows: readonly RecipeBalanceRow[];
  /** How many rows each product wins. */
  readonly wins: Readonly<Record<string, number>>;
  /** Rows where each product earns at least `VIABLE_SHARE` of the best. */
  readonly viable: Readonly<Record<string, number>>;
  readonly problems: readonly string[];
}

/** A product within this share of the best earner in a situation is a real choice there. */
export const VIABLE_SHARE = 0.85;
/** No product may be the best earner in more than this share of situations. */
export const MAX_WIN_SHARE = 0.5;

/**
 * The Slice C gate. Every recipe must be a real choice somewhere and none the best almost
 * everywhere; Crack alone must pay at the start; no recipe is a cash loop at Pip's counter.
 */
export function recipeBalance(ruleset: Ruleset, scenarios: readonly RecipeScenario[] = RECIPE_SCENARIOS): RecipeBalance {
  const recipes = productRecipes(ruleset);
  const cities = Object.keys(ruleset.cities ?? {});
  const rows: RecipeBalanceRow[] = [];
  const wins: Record<string, number> = Object.fromEntries(recipes.map((recipe) => [recipe.product, 0]));
  const viable: Record<string, number> = Object.fromEntries(recipes.map((recipe) => [recipe.product, 0]));
  const problems: string[] = [...productLoops(ruleset), ...recipeResaleLoops(ruleset)];

  for (const scenario of scenarios) {
    for (const city of cities) {
      const days = recipes.flatMap((recipe) => recipeDay(ruleset, scenario, city, recipe) ?? []);
      if (!days.length) continue;
      const top = days.reduce((best, day) => (day.profitCents > best.profitCents ? day : best));
      rows.push({ scenario, city, days, best: top.product });
      wins[top.product] = (wins[top.product] ?? 0) + 1;
      for (const day of days) if (top.profitCents > 0 && day.profitCents >= top.profitCents * VIABLE_SHARE) viable[day.product] = (viable[day.product] ?? 0) + 1;
      const crack = days.find((day) => day.product === 'CRACK');
      if (scenario.key === 'START' && (!crack || crack.profitCents <= 0)) problems.push(`Crack alone loses money starting in ${city}.`);
    }
  }
  for (const recipe of recipes) {
    if (!viable[recipe.product]) problems.push(`${recipe.name} is never within ${Math.round(VIABLE_SHARE * 100)}% of the best earner.`);
    if ((wins[recipe.product] ?? 0) > rows.length * MAX_WIN_SHARE) problems.push(`${recipe.name} is the best earner in ${wins[recipe.product]} of ${rows.length} situations.`);
  }
  return { rows, wins, viable, problems };
}

// --- the ladder's pace ------------------------------------------------------------

export interface LadderRung {
  readonly questKey: string;
  readonly title: string;
  /** The recipe the job opens. */
  readonly opens: string;
  readonly thugs: number;
  /** Turns of production the job's cooking takes with `thugs`. */
  readonly cookTurns: number;
  /** Ingredients for the cooking, plus what the Pip sales lose against what the units cost. */
  readonly costCents: number;
  readonly rewardCents: number;
}

/** Thugs a player can be expected to have at each rung, from the tutorial's 10 upward. */
export const LADDER_THUGS: readonly number[] = [15, 25, 40, 60, 80];
/** A rung's cooking should fit in one day of turn regeneration. */
const DAY_OF_TURNS = (ruleset: Ruleset) => DAY_MINUTES / ruleset.turns.intervalMinutes * ruleset.turns.amountPerInterval;

/**
 * The recipe ladder in order, costed for a player at that stage. A unit sold to Pip costs
 * what it costs to cook if the recipe is already open, else the cheapest supplier or Pip's
 * own price; a dollar target is met with whichever open recipe loses least a dollar.
 */
export function ladderPacing(ruleset: Ruleset): { rungs: LadderRung[]; problems: string[] } {
  const quests = Object.values(ruleset.questDefinitions ?? {});
  const unlocks = ruleset.permanentUnlocks ?? {};
  const recipes = new Map(productRecipes(ruleset).map((recipe) => [recipe.product, recipe]));
  const opens = (quest: (typeof quests)[number]) => quest.rewards.flatMap((reward) => {
    const effect = reward.kind === 'PERMANENT_UNLOCK' && reward.key ? unlocks[reward.key]?.effect : undefined;
    return effect?.kind === 'PRODUCT_PRODUCTION_ACCESS' ? [effect.productKey] : [];
  })[0];
  const ladder = quests.filter((quest) => opens(quest));
  // Order the rungs by their prerequisites: each one requires the rung before it.
  const ordered: typeof ladder = [];
  while (ordered.length < ladder.length) {
    const next = ladder.find((quest) => !ordered.includes(quest)
      && quest.prerequisites.every((row) => row.kind !== 'QUEST_COMPLETED' || !ladder.some((rung) => rung.key === row.params?.questKey) || ordered.some((rung) => rung.key === row.params?.questKey)));
    if (!next) break;
    ordered.push(next);
  }

  const cookable = new Set(['CRACK']);
  const pipSell = (product: string) => product === 'CRACK' ? ruleset.stores.PIP.items.CRACK?.sellCents ?? 0 : ruleset.products?.[product]?.economy?.pip?.sellCents ?? 0;
  const pipBuy = (product: string) => product === 'CRACK' ? ruleset.stores.PIP.items.CRACK?.buyCents ?? Infinity : ruleset.products?.[product]?.economy?.pip?.buyCents ?? Infinity;
  const supplier = (product: string) => Math.min(Infinity, ...(ruleset.supplyNetwork?.suppliers ?? []).flatMap((row) => row.offers[product] ? [row.offers[product]!.unitCostCents] : []));
  const unitCost = (product: string) => cookable.has(product) ? recipes.get(product)!.ingredientCentsPerUnit : Math.min(supplier(product), pipBuy(product));

  const rungs: LadderRung[] = [];
  const problems: string[] = [];
  ordered.forEach((quest, index) => {
    const thugs = LADDER_THUGS[Math.min(index, LADDER_THUGS.length - 1)]!;
    let cookTurns = 0;
    let costCents = 0;
    for (const objective of quest.objectives) {
      const params = objective.params ?? {};
      const events = Array.isArray(params.eventTypes) ? params.eventTypes : [];
      const where = (params.where ?? {}) as Record<string, unknown>;
      if (events.includes('PRODUCE_CRACK') && typeof where.productType === 'string') {
        const recipe = recipes.get(where.productType)!;
        cookTurns += objective.target / (thugs * recipe.perThugPerTurn);
        costCents += objective.target * recipe.ingredientCentsPerUnit;
      } else if (events.includes('STORE_SELL') && params.field === 'quantity' && typeof where.product === 'string') {
        costCents += objective.target * Math.max(0, unitCost(where.product) - pipSell(where.product));
      } else if (events.includes('STORE_SELL') && params.field === 'totalCents') {
        const lossPerDollar = Math.min(...[...cookable].map((product) => Math.max(0, unitCost(product) - pipSell(product)) / Math.max(1, pipSell(product))));
        costCents += objective.target * lossPerDollar;
      }
    }
    const rewardCents = quest.rewards.reduce((sum, reward) => sum + (reward.kind === 'CASH' ? reward.amount ?? 0 : 0), 0);
    const rung = { questKey: quest.key, title: quest.title, opens: opens(quest)!, thugs, cookTurns: Math.ceil(cookTurns), costCents: Math.round(costCents), rewardCents };
    rungs.push(rung);
    if (rung.costCents > rung.rewardCents) problems.push(`${quest.title} costs more to finish than it pays.`);
    if (rung.cookTurns > DAY_OF_TURNS(ruleset)) problems.push(`${quest.title} takes more than a day of turns to cook.`);
    cookable.add(rung.opens);
  });
  if (ordered.length < ladder.length) problems.push('The recipe jobs do not form one ladder.');
  return { rungs, problems };
}
