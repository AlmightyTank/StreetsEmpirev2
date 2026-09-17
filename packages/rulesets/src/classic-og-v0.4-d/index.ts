import { classicOgV04C } from '../classic-og-v0.4-c/index.js';
import type { ProductEconomy, Ruleset } from '../types.js';

/**
 * 0.4.0-D keeps 0.4.0-C balance and turns products into an economy: Pip deals
 * every product on its own shelf, Produce Product cooks Crack, Meth or Ecstasy,
 * raids and drug runs take a mix of products, recon reads a stash level, and
 * every product counts toward net worth.
 *
 * BALANCE_APPROXIMATION. Pip's prices sit at 0.4.0-C's reference costs. Three rules
 * keep product from being a money loop, and `productLoops` in the rules engine
 * checks all of them:
 *   - Pip always buys back for less than he sells.
 *   - Net worth values a unit at no more than Pip pays for it.
 *   - Ingredients cost at least what Pip pays, so cooking to sell loses money.
 */
const economy = {
  WEED: {
    netWorthCents: 240,
    pip: { buyCents: 800, sellCents: 240, restock: { cap: 400, perInterval: 400, intervalMinutes: 30 } },
    production: null,
  },
  // Costly to cook and slow, but each unit is worth the most of anything you can make.
  ECSTASY: {
    netWorthCents: 900,
    pip: { buyCents: 3_000, sellCents: 900, restock: { cap: 150, perInterval: 150, intervalMinutes: 30 } },
    production: { perThugPerTurn: 0.15, ingredientCentsPerUnit: 1_500, variance: 0.2, minHappinessMultiplier: 0.25, heatPerUnit: 0.1 },
  },
  // Bought, stolen or imported. Never cooked.
  COCAINE: {
    netWorthCents: 1_200,
    pip: { buyCents: 4_000, sellCents: 1_200, restock: { cap: 80, perInterval: 80, intervalMinutes: 60 } },
    production: null,
  },
  // A moderate cook with high output, and it draws attention.
  METH: {
    netWorthCents: 450,
    pip: { buyCents: 1_500, sellCents: 450, restock: { cap: 200, perInterval: 200, intervalMinutes: 30 } },
    production: { perThugPerTurn: 0.4, ingredientCentsPerUnit: 700, variance: 0.2, minHappinessMultiplier: 0.25, heatPerUnit: 0.05 },
  },
  HEROIN: {
    netWorthCents: 450,
    pip: { buyCents: 1_500, sellCents: 450, restock: { cap: 100, perInterval: 100, intervalMinutes: 60 } },
    production: null,
  },
} as const satisfies Record<string, ProductEconomy>;

const products = {
  ...classicOgV04C.products,
  WEED: { ...classicOgV04C.products.WEED, economy: economy.WEED },
  ECSTASY: { ...classicOgV04C.products.ECSTASY, economy: economy.ECSTASY },
  COCAINE: { ...classicOgV04C.products.COCAINE, economy: economy.COCAINE },
  METH: { ...classicOgV04C.products.METH, economy: economy.METH },
  HEROIN: { ...classicOgV04C.products.HEROIN, economy: economy.HEROIN },
};

export const classicOgV04D = {
  ...classicOgV04C,
  meta: { id: 'classic-og-v0.4-d', version: '0.4.0-D', name: 'Classic OG - Product Economy' },
  products,
  productEconomy: {
    intel: { lightBelowPerWhore: 1, heavyFromPerWhore: 5 },
  },
} as const satisfies Ruleset;
