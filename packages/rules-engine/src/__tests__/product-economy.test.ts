import { describe, expect, it } from 'vitest';
import { classicOgV04C, classicOgV04D, type Ruleset } from '@streets/rulesets';
import { calculateNetWorthCents } from '../calculations/net-worth.js';
import {
  calculateProductTrade,
  productLoops,
  productNetWorthCents,
  productRecipes,
  productStashHint,
  settleProductShelf,
  splitProductUnits,
} from '../calculations/product-economy.js';
import { calculateProduce } from '../calculations/actions.js';
import { StoreTradeError } from '../calculations/stores.js';

const weed = classicOgV04D.products.WEED.economy;

describe('0.4.0-D product economy gate', () => {
  it('has no free money loop in the shipped ruleset', () => {
    expect(productLoops(classicOgV04D)).toEqual([]);
  });

  it('catches every kind of loop', () => {
    const broken = {
      ...classicOgV04D,
      products: {
        ...classicOgV04D.products,
        WEED: { ...classicOgV04D.products.WEED, economy: { ...weed, netWorthCents: 900, pip: { ...weed.pip, sellCents: 900 } } },
        METH: { ...classicOgV04D.products.METH, economy: { ...classicOgV04D.products.METH.economy, production: { ...classicOgV04D.products.METH.economy.production, ingredientCentsPerUnit: 100 } } },
      },
    } as Ruleset;
    expect(productLoops(broken)).toEqual([
      'Weed: Pip buys back at or above his price.',
      'Meth: cooking to sell makes money.',
      'Meth: cooking raises net worth for less than it costs.',
    ]);
  });
});

describe('product net worth', () => {
  const player = { cashCents: 0n, whores: 0, thugs: 0, lowRiders: 0, medicine: 0, crack: 10, condoms: 0, beer: 0, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };

  it('values every non-crack product at its ruleset value, in integer cents', () => {
    const products = { WEED: 7, COCAINE: 3, CRACK: 999 };
    expect(productNetWorthCents(products, classicOgV04D)).toBe(7n * 240n + 3n * 1_200n);
    expect(calculateNetWorthCents({ ...player, products }, classicOgV04D) - calculateNetWorthCents(player, classicOgV04D)).toBe(7n * 240n + 3n * 1_200n);
  });

  it('adds nothing before 0.4.0-D', () => {
    expect(calculateNetWorthCents({ ...player, products: { WEED: 1_000 } }, classicOgV04C)).toBe(calculateNetWorthCents(player, classicOgV04C));
  });
});

describe("Pip's product counter", () => {
  const base = { ruleset: classicOgV04D, product: 'WEED', owned: 0, cashCents: 1_000_000n, shelfStock: 400 };

  it('prices whole orders and takes buys off the shelf', () => {
    expect(calculateProductTrade({ ...base, direction: 'buy', quantity: 25 })).toMatchObject({ unitCents: 800, totalCents: 20_000n, cashChangeCents: -20_000n, quantityChange: 25, stockTaken: 25 });
    expect(calculateProductTrade({ ...base, owned: 30, direction: 'sell', quantity: 30, shelfStock: 0 })).toMatchObject({ totalCents: 7_200n, quantityChange: -30, stockTaken: 0 });
  });

  it('accepts a player-specific discounted buy quote without changing sell prices', () => {
    expect(calculateProductTrade({ ...base, direction: 'buy', quantity: 10, buyUnitCents: 720 }))
      .toMatchObject({ unitCents: 720, totalCents: 7_200n, cashChangeCents: -7_200n });
    expect(calculateProductTrade({ ...base, owned: 10, direction: 'sell', quantity: 10, buyUnitCents: 720 }))
      .toMatchObject({ unitCents: 240, totalCents: 2_400n, cashChangeCents: 2_400n });
  });

  it('never lets a discounted buy quote fall to or below Pip\'s buyback', () => {
    expect(calculateProductTrade({ ...base, direction: 'buy', quantity: 1, buyUnitCents: 1 }).unitCents)
      .toBe(weed.pip.sellCents + 1);
  });

  it('refuses what the shelf, the cash or the stash cannot cover', () => {
    const code = (fn: () => unknown) => { try { fn(); } catch (error) { return (error as StoreTradeError).code; } return null; };
    expect(code(() => calculateProductTrade({ ...base, direction: 'buy', quantity: 401 }))).toBe('OUT_OF_STOCK');
    expect(code(() => calculateProductTrade({ ...base, cashCents: 799n, direction: 'buy', quantity: 1 }))).toBe('NOT_ENOUGH_CASH');
    expect(code(() => calculateProductTrade({ ...base, direction: 'sell', quantity: 1 }))).toBe('NOT_ENOUGH_ITEMS');
    expect(code(() => calculateProductTrade({ ...base, product: 'CRACK', direction: 'buy', quantity: 1 }))).toBe('UNKNOWN_ITEM');
  });

  it('starts a shelf full and refills it on the clock', () => {
    const now = new Date('2026-09-17T12:00:00Z');
    expect(settleProductShelf(null, weed, now)).toMatchObject({ stock: 400, changed: true });
    const later = new Date(now.getTime() + 31 * 60_000);
    expect(settleProductShelf({ stock: 0, stockAt: now }, weed, later)).toMatchObject({ stock: 400 });
    expect(settleProductShelf({ stock: 0, stockAt: now }, weed, new Date(now.getTime() + 29 * 60_000))).toMatchObject({ stock: 0 });
  });
});

describe('Produce Product recipes', () => {
  it('cooks crack on every round and Meth and Ecstasy on 0.4.0-D, never Cocaine', () => {
    expect(productRecipes(classicOgV04C).map((recipe) => recipe.product)).toEqual(['CRACK']);
    expect(productRecipes(classicOgV04D).map((recipe) => recipe.product)).toEqual(['CRACK', 'ECSTASY', 'METH']);
  });

  it('cooks at the recipe rate and charges its ingredients', () => {
    const meth = productRecipes(classicOgV04D).find((recipe) => recipe.product === 'METH')!;
    const player = { whores: 0, thugs: 40, condoms: 0, crack: 0, beer: 0, medicine: 0, whoreHappiness: 100, thugHappiness: 100 };
    const outcome = calculateProduce({ player, turns: 10, ruleset: classicOgV04D, clientCapacity: 100, payoutPercent: 50, cashCents: 100_000_000n, recipe: meth, rng: () => 0.5 });
    expect(outcome.crackProduced).toBe(Math.round(40 * meth.perThugPerTurn * 10));
    expect(outcome.ingredientCents).toBe(BigInt(outcome.crackProduced * meth.ingredientCentsPerUnit));
  });
});

describe('product loot and intel', () => {
  it('splits exactly the units taken, never more than a product holds', () => {
    for (const [stash, units] of [
      [{ CRACK: 100, WEED: 50, COCAINE: 1 }, 60],
      [{ CRACK: 3, HEROIN: 3, METH: 3 }, 4],
      [{ ECSTASY: 5 }, 50],
      [{}, 10],
    ] as const) {
      const split = splitProductUnits(stash, units, classicOgV04D);
      const total = Object.values(stash).reduce((sum, count) => sum + count, 0);
      expect(Object.values(split).reduce((sum, count) => sum + count, 0)).toBe(Math.min(units, total));
      for (const [key, count] of Object.entries(split)) expect(count).toBeLessThanOrEqual((stash as Record<string, number>)[key]!);
    }
    expect(splitProductUnits({ CRACK: 100, WEED: 50 }, 30, classicOgV04D)).toEqual({ CRACK: 20, WEED: 10 });
  });

  it('reads a stash as a level and its main product, never a count', () => {
    expect(productStashHint({}, 10, classicOgV04D)).toEqual({ level: 'none', primary: null });
    expect(productStashHint({ CRACK: 5 }, 10, classicOgV04D)).toEqual({ level: 'light', primary: 'Crack' });
    expect(productStashHint({ CRACK: 5, COCAINE: 30 }, 10, classicOgV04D)).toEqual({ level: 'stocked', primary: 'Cocaine' });
    expect(productStashHint({ WEED: 100 }, 10, classicOgV04D).level).toBe('heavy');
  });
});
