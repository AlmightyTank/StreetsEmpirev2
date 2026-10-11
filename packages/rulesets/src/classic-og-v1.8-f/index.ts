import { classicOgV18E } from '../classic-og-v1.8-e/index.js';
import type { ProductEconomy, Ruleset } from '../types.js';
import { cookhouseLadderQuests, recipeUnlocks } from './cookhouse-ladder.js';

/**
 * Weed, Cocaine and Heroin had no recipe before this ruleset. BALANCE_APPROXIMATION:
 * provisional values for Slice C to tune. Each keeps ingredients at or above what Pip
 * pays and what the unit adds to net worth, so `productLoops` still finds no cash loop.
 *   - Weed: steady output, little Heat, modest value.
 *   - Cocaine: slow and costly, with the most Heat per unit.
 *   - Heroin: limited output, wide variance, sharp Heat.
 */
const provisionalProduction = {
  WEED: { perThugPerTurn: 0.6, ingredientCentsPerUnit: 300, variance: 0.15, minHappinessMultiplier: 0.25, heatPerUnit: 0.02 },
  COCAINE: { perThugPerTurn: 0.1, ingredientCentsPerUnit: 2_000, variance: 0.2, minHappinessMultiplier: 0.25, heatPerUnit: 0.15 },
  HEROIN: { perThugPerTurn: 0.2, ingredientCentsPerUnit: 900, variance: 0.3, minHappinessMultiplier: 0.25, heatPerUnit: 0.12 },
} as const satisfies Record<string, NonNullable<ProductEconomy['production']>>;

const products = classicOgV18E.products;

/**
 * 1.8.0-F — Pip's Cookhouse Ladder (Quest Recipe Unlocks B). A new round cooks only
 * Crack; Ecstasy, Meth, Weed, Cocaine and Heroin each open through one of Pip's jobs,
 * in that order. Purchase access at Pip is unchanged and stays a separate unlock.
 */
export const classicOgV18F = {
  ...classicOgV18E,
  meta: { id: 'classic-og-v1.8-f', version: '1.8.0-F', name: 'Classic OG - Cookhouse Ladder' },
  products: {
    ...products,
    WEED: { ...products.WEED, economy: { ...products.WEED.economy, production: provisionalProduction.WEED } },
    COCAINE: { ...products.COCAINE, economy: { ...products.COCAINE.economy, production: provisionalProduction.COCAINE } },
    HEROIN: { ...products.HEROIN, economy: { ...products.HEROIN.economy, production: provisionalProduction.HEROIN } },
  },
  permanentUnlocks: { ...classicOgV18E.permanentUnlocks, ...recipeUnlocks },
  questDefinitions: cookhouseLadderQuests,
} as const satisfies Ruleset;
