import { describe, expect, it } from 'vitest';
import { classicOgV18E, classicOgV18F } from '@streets/rulesets';
import { productLoops, productRecipes } from '../calculations/product-economy.js';

describe('1.8.0-F provisional recipes', () => {
  it('gives every catalog product a recipe, so each ladder unlock opens a real cook', () => {
    expect(productRecipes(classicOgV18E).map((recipe) => recipe.product)).toEqual(['CRACK', 'ECSTASY', 'METH']);
    expect(productRecipes(classicOgV18F).map((recipe) => recipe.product).sort())
      .toEqual(['COCAINE', 'CRACK', 'ECSTASY', 'HEROIN', 'METH', 'WEED']);
  });

  it('keeps the shipped Crack, Ecstasy and Meth recipes unchanged', () => {
    const before = new Map(productRecipes(classicOgV18E).map((recipe) => [recipe.product, recipe]));
    for (const recipe of productRecipes(classicOgV18F)) {
      if (before.has(recipe.product)) expect(recipe, recipe.product).toEqual(before.get(recipe.product));
    }
  });

  it('adds no free money loop', () => {
    expect(productLoops(classicOgV18F)).toEqual([]);
  });

  it('gives the new recipes distinct identities', () => {
    const recipe = (product: string) => productRecipes(classicOgV18F).find((row) => row.product === product)!;
    // Weed is the steady, low-Heat cook; Cocaine is the slow one with the most Heat.
    expect(recipe('WEED').perThugPerTurn).toBeGreaterThan(recipe('METH').perThugPerTurn);
    expect(recipe('WEED').heatPerUnit).toBeLessThan(recipe('METH').heatPerUnit);
    expect(recipe('COCAINE').perThugPerTurn).toBeLessThan(recipe('ECSTASY').perThugPerTurn);
    expect(recipe('COCAINE').heatPerUnit).toBeGreaterThan(recipe('HEROIN').heatPerUnit);
  });
});
