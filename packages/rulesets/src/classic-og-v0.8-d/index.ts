import { classicOgV08C } from '../classic-og-v0.8-c/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.8.0-D: Trader Relationship foundation.
 *
 * D keeps the dynamic store economy from C and adds modest, ruleset-defined
 * relationship perks. The best reached perk applies; tiers do not stack.
 */
export const classicOgV08D = {
  ...classicOgV08C,
  meta: {
    id: 'classic-og-v0.8-d',
    version: '0.8.0-D',
    name: 'Classic OG - Trader Relationships',
  },
  storeEconomy: {
    ...classicOgV08C.storeEconomy,
    traderPerks: {
      CORNER: [
        { at: 25, label: 'Regular supply discount', description: 'Corner cuts a little off street supplies.', buyDiscountPercent: 3 },
        { at: 50, label: 'Back-room case rate', description: 'Bulk street supplies come a little cheaper.', buyDiscountPercent: 5 },
      ],
      TOMMY: [
        { at: 25, label: 'Known face rack price', description: 'Tommy trims the price on muscle and hardware.', buyDiscountPercent: 2 },
        { at: 50, label: 'Under-counter rate', description: 'Tommy gives you his steadier rack price.', buyDiscountPercent: 4 },
      ],
      CHARLIE: [
        { at: 25, label: 'Garage rate', description: 'Charlie takes a little less on rides.', buyDiscountPercent: 2 },
        { at: 50, label: 'Fleet customer', description: 'Charlie prices rides like he expects you back.', buyDiscountPercent: 4 },
      ],
      PIP: [
        { at: 25, label: 'Better buyback', description: 'Pip pays a little more when you sell product back.', sellBonusPercent: 3 },
        { at: 50, label: 'Counter regular', description: 'Pip improves both sides of his product counter.', buyDiscountPercent: 2, sellBonusPercent: 5 },
      ],
    },
  },
} as const satisfies Ruleset;
