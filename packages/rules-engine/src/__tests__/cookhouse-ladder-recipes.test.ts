import { describe, expect, it } from 'vitest';
import { classicOgV18E, classicOgV18F, classicOgV18M } from '@streets/rulesets';
import { productLoops, productRecipes } from '../calculations/product-economy.js';

const recipe = (product: string) => productRecipes(classicOgV18M).find((row) => row.product === product)!;

describe('cookhouse ladder recipes', () => {
  it('gives every catalog product a recipe from 1.8.0-F, so each ladder unlock opens a real cook', () => {
    expect(productRecipes(classicOgV18E).map((row) => row.product)).toEqual(['CRACK', 'ECSTASY', 'METH']);
    for (const ruleset of [classicOgV18F, classicOgV18M]) {
      expect(productRecipes(ruleset).map((row) => row.product).sort(), ruleset.meta.id)
        .toEqual(['COCAINE', 'CRACK', 'ECSTASY', 'HEROIN', 'METH', 'WEED']);
      expect(productLoops(ruleset), ruleset.meta.id).toEqual([]);
    }
  });

  it('keeps Crack as shipped in 1.8.0-M and only raises the Ecstasy and Meth ingredient cost', () => {
    const before = new Map(productRecipes(classicOgV18E).map((row) => [row.product, row]));
    expect(recipe('CRACK')).toEqual(before.get('CRACK'));
    expect(recipe('ECSTASY')).toEqual({ ...before.get('ECSTASY'), ingredientCentsPerUnit: 1_700 });
    expect(recipe('METH')).toEqual({ ...before.get('METH'), ingredientCentsPerUnit: 800 });
  });

  it('leaves the shipped 1.8.0-F provisional recipes as they were', () => {
    const shipped = new Map(productRecipes(classicOgV18F).map((row) => [row.product, row]));
    expect(shipped.get('WEED')).toMatchObject({ perThugPerTurn: 0.6, ingredientCentsPerUnit: 300, heatPerUnit: 0.02 });
    expect(shipped.get('COCAINE')).toMatchObject({ perThugPerTurn: 0.1, ingredientCentsPerUnit: 2_000, heatPerUnit: 0.15 });
    expect(shipped.get('HEROIN')).toMatchObject({ perThugPerTurn: 0.2, ingredientCentsPerUnit: 900, heatPerUnit: 0.12 });
    expect(shipped.get('ECSTASY')!.ingredientCentsPerUnit).toBe(1_500);
  });

  it('gives each 1.8.0-M recipe its identity', () => {
    // Weed: steady and the least Heat of anything cooked.
    expect(recipe('WEED').variance).toBeLessThan(recipe('METH').variance);
    expect(recipe('WEED').heatPerUnit).toBeLessThan(Math.min(recipe('METH').heatPerUnit, recipe('HEROIN').heatPerUnit, recipe('ECSTASY').heatPerUnit));
    // Meth: high output with more Heat than Weed.
    expect(recipe('METH').perThugPerTurn).toBeGreaterThan(recipe('ECSTASY').perThugPerTurn);
    // Cocaine: the slowest, dearest cook with the most Heat.
    for (const other of ['CRACK', 'WEED', 'ECSTASY', 'METH', 'HEROIN']) {
      expect(recipe('COCAINE').perThugPerTurn, other).toBeLessThan(recipe(other).perThugPerTurn);
      expect(recipe('COCAINE').ingredientCentsPerUnit, other).toBeGreaterThan(recipe(other).ingredientCentsPerUnit);
      expect(recipe('COCAINE').heatPerUnit, other).toBeGreaterThan(recipe(other).heatPerUnit);
    }
    // Heroin: limited output and the widest swings.
    expect(recipe('HEROIN').perThugPerTurn).toBeLessThan(recipe('METH').perThugPerTurn);
    for (const other of ['CRACK', 'WEED', 'ECSTASY', 'COCAINE', 'METH']) expect(recipe('HEROIN').variance, other).toBeGreaterThan(recipe(other).variance);
  });
});
