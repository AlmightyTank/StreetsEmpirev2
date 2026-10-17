import { classicOgV18S } from '../classic-og-v1.8-s/index.js';
import type { Ruleset } from '../types.js';

/** 3.0-A exposes existing city holdings without introducing an economic modifier. */
export const classicOgV30A = {
  ...classicOgV18S,
  meta: { id: 'classic-og-v3.0-a', version: '3.0.0-A', name: 'Classic OG - Empire Holdings' },
  cityHoldings: { modifiers: { dealerSalesPace: 1, demand: 1, upkeep: 1 } },
} satisfies Ruleset;

/** Always gate holding reads by the round's loaded ruleset, never the current deployment version. */
export function cityHoldingsEnabled(ruleset: Ruleset): boolean {
  return ruleset.cityHoldings !== undefined;
}
