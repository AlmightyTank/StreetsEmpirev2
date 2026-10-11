import { describe, expect, it } from 'vitest';
import { classicOgV18E, classicOgV18F, classicOgV18M, type Ruleset } from '@streets/rulesets';
import { productRecipes, recipeResale, recipeResaleLoops } from '../calculations/product-economy.js';
import { RECIPE_SCENARIOS, bestCookSupply, ladderPacing, productionFavorPercent, recipeBalance, recipeDay } from '../simulations/recipes.js';

function withProduction(ruleset: Ruleset, product: string, change: Record<string, number>): Ruleset {
  const row = ruleset.products![product]!;
  return {
    ...ruleset,
    products: { ...ruleset.products, [product]: { ...row, economy: { ...row.economy!, production: { ...row.economy!.production!, ...change } } } },
  } as Ruleset;
}

describe('Quest Recipe Unlocks C: no cook-and-sell-back loop', () => {
  it('finds the 1.8.0-E Ecstasy and Meth loop with every bonus stacked', () => {
    expect(recipeResaleLoops(classicOgV18E).map((problem) => problem.split(':')[0])).toEqual(['Ecstasy', 'Meth']);
  });

  it('finds the same loop in the provisional 1.8.0-F recipes, which 1.8.0-M replaces', () => {
    expect(recipeResaleLoops(classicOgV18F).map((problem) => problem.split(':')[0])).toEqual(['Weed', 'Ecstasy', 'Cocaine', 'Meth']);
  });

  it('keeps every 1.8.0-M recipe above what Pip can pay at home', () => {
    expect(recipeResaleLoops(classicOgV18M)).toEqual([]);
    for (const row of recipeResale(classicOgV18M)) expect(row.cheapestCookCents, row.product).toBeGreaterThanOrEqual(row.bestBuybackCents);
  });

  it('stacks standing, the Ecstasy racket and market pressure on the buyback', () => {
    const ecstasy = recipeResale(classicOgV18M).find((row) => row.product === 'ECSTASY')!;
    // 900c x 1.25 pressure, then +5% standing and +8% racket.
    expect(ecstasy.bestBuybackCents).toBe(Math.floor(1125 * 1.13));
    // 1,700c less the top workshop's 8%, spread over the 20% bonus output.
    expect(ecstasy.cheapestCookCents).toBe(Math.floor(Math.floor(1700 * 0.92) / 1.2));
  });

  it('catches a recipe cheap enough to sell back', () => {
    expect(recipeResaleLoops(withProduction(classicOgV18M, 'WEED', { ingredientCentsPerUnit: 300 }))).toEqual([
      expect.stringMatching(/^Weed: /),
    ]);
  });
});

describe('Quest Recipe Unlocks C: every recipe is a real choice', () => {
  it('passes the balance gate for 1.8.0-M', () => {
    const balance = recipeBalance(classicOgV18M);
    expect(balance.problems).toEqual([]);
    for (const recipe of productRecipes(classicOgV18M)) expect(balance.viable[recipe.product], recipe.product).toBeGreaterThan(0);
    expect(new Set(balance.rows.map((row) => row.best)).size).toBeGreaterThanOrEqual(5);
  });

  it('fails a recipe that dominates, and one that is never worth cooking', () => {
    const strong = recipeBalance(withProduction(classicOgV18M, 'COCAINE', { perThugPerTurn: 0.5, heatPerUnit: 0 }));
    expect(strong.problems).toContainEqual(expect.stringMatching(/^Cocaine is the best earner in/));
    const weak = recipeBalance(withProduction(classicOgV18M, 'HEROIN', { ingredientCentsPerUnit: 2_500 }));
    expect(weak.problems).toContainEqual(expect.stringMatching(/^Heroin is never within/));
  });

  it('pays with Crack alone at the start in every city', () => {
    const start = RECIPE_SCENARIOS.find((scenario) => scenario.key === 'START')!;
    const crack = productRecipes(classicOgV18M).find((recipe) => recipe.product === 'CRACK')!;
    for (const city of Object.keys(classicOgV18M.cities)) expect(recipeDay(classicOgV18M, start, city, crack)!.profitCents, city).toBeGreaterThan(0);
  });

  it('never cooks past the Heat a unit cannot pay for', () => {
    const established = RECIPE_SCENARIOS.find((scenario) => scenario.key === 'ESTABLISHED')!;
    const cocaine = productRecipes(classicOgV18M).find((recipe) => recipe.product === 'COCAINE')!;
    const day = recipeDay(classicOgV18M, established, 'san-francisco', cocaine)!;
    expect(day.heatCostCents).toBe(0);
    expect(day.sold).toBeLessThan(day.dealerCapacity);
  });
});

describe('Quest Recipe Unlocks C: the ladder pays its way', () => {
  it('runs the five rungs in order, each within a day of turns and paying more than it costs', () => {
    const { rungs, problems } = ladderPacing(classicOgV18M);
    expect(problems).toEqual([]);
    expect(rungs.map((rung) => rung.opens)).toEqual(['ECSTASY', 'METH', 'WEED', 'COCAINE', 'HEROIN']);
    for (const rung of rungs) expect(rung.costCents, rung.questKey).toBeLessThan(rung.rewardCents);
  });

  it('flags a rung whose Pip sales lose more than it pays', () => {
    const quests = classicOgV18M.questDefinitions;
    const ruleset = {
      ...classicOgV18M,
      questDefinitions: {
        ...quests,
        PIP_A_BETTER_CUT: {
          ...quests.PIP_A_BETTER_CUT!,
          objectives: [{ id: 'sell_value', kind: 'EVENT_SUM', description: 'Sell $60,000 of product to Pip.', target: 6_000_000, params: { eventTypes: ['STORE_SELL'], field: 'totalCents', where: { storeKey: 'PIP' } } }],
        },
      },
    } as Ruleset;
    expect(ladderPacing(ruleset).problems).toEqual(['A Better Cut costs more to finish than it pays.']);
  });
});

describe('Quest Recipe Unlocks E: favors and crew supply', () => {
  it('reads the production favor and the best cook supply from the ruleset', () => {
    expect(productionFavorPercent(classicOgV18M)).toBe(20);
    expect(bestCookSupply(classicOgV18M)).toBe(1.6);
  });

  it('charges ingredients on every unit a favor or a fed crew adds', () => {
    const start = RECIPE_SCENARIOS.find((scenario) => scenario.key === 'START')!;
    const cocaine = productRecipes(classicOgV18M).find((recipe) => recipe.product === 'COCAINE')!;
    const plain = recipeDay(classicOgV18M, start, 'san-francisco', cocaine)!;
    const boosted = recipeDay(classicOgV18M, { ...start, favorOutputPercent: 20, cookSupplyMultiplier: 1.6 }, 'san-francisco', cocaine)!;
    expect(boosted.cookCapacity).toBeGreaterThan(plain.cookCapacity);
    expect(boosted.ingredientCents / boosted.sold).toBeCloseTo(plain.ingredientCents / plain.sold, 0);
  });

  it('keeps the balance gate with the favor, a fed crew, and both', () => {
    for (const change of [{ favorOutputPercent: 20 }, { cookSupplyMultiplier: 1.6 }, { favorOutputPercent: 20, cookSupplyMultiplier: 1.6 }]) {
      expect(recipeBalance(classicOgV18M, RECIPE_SCENARIOS.map((scenario) => ({ ...scenario, ...change }))).problems, JSON.stringify(change)).toEqual([]);
    }
  });
});
