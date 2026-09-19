import { classicOgV05C } from '../classic-og-v0.5-c/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.5.0-D lets a crew move house. Everything goes: the stable, the stock, the cars,
 * the hideout and the Heat. The move costs a fee priced on net worth and a stretch on
 * the road in which nothing happens but the truck, and the crew stays a target in the
 * old city until it arrives.
 *
 * It also switches on each city's living rules for the people who live there: the
 * district pay and store prices every city character already carried, and Pip's home
 * counter at the city's own prices and usual supply. What Pip pays you back stays at
 * his base price everywhere, so cooking to sell still never pays.
 *
 * BALANCE_APPROXIMATION: the fee and downtime are set so a move is a decision, not a
 * habit ("a night on the road, once a day at most").
 */
export const classicOgV05D = {
  ...classicOgV05C,
  meta: { id: 'classic-og-v0.5-d', version: '0.5.0-D', name: 'Classic OG - Travel' },
  travel: {
    ...classicOgV05C.travel,
    relocation: {
      feeFloorCents: 2_500_000,
      feeNetWorthFraction: 0.05,
      // Six hours on the road: a night.
      downtimeMinutes: 360,
      cooldownHours: 24,
      cutoffHours: 24,
    },
  },
} as const satisfies Ruleset;
