import { classicOgV04D } from '../classic-og-v0.4-d/index.js';
import type { ProductEffects, Ruleset } from '../types.js';

/**
 * 0.4.0-E keeps 0.4.0-D balance and closes 0.4.0: thugs can take product into a
 * fight. A RAID policy supplies the squad a player sends (raids, drive-bys and
 * special raids); a DEFENSE policy supplies the crew that holds their block.
 * Neither burns anything until the player sets it.
 *
 * BALANCE_APPROXIMATION, set against `runCombatProductSimulation`
 * (docs/COMBAT-PRODUCTS-0.4.0-E.md). Combat turns on a narrow threshold (home
 * advantage x1.1, rolls +/-10%), so every strength effect stays within a few
 * percent: product tips a close fight, it never decides a lopsided one.
 */
const combat = {
  // Dependable, a touch sharper both ways.
  CRACK: { attack: 1.015, defense: 1.015, wounds: 1 },
  // Calm crews hold ground and get hurt less, but lose their edge going in.
  WEED: { attack: 0.97, defense: 1.03, wounds: 0.9 },
  // No use in a fight.
  ECSTASY: { attack: 1, defense: 0.98, wounds: 1.1 },
  // The best attacking product.
  COCAINE: { attack: 1.05, defense: 1, wounds: 1.05 },
  // Protection: the best defending product, with incidents.
  METH: { attack: 1.03, defense: 1.05, wounds: 1.2 },
  // Keeps a hurt crew standing: far fewer wounds, slower going in.
  HEROIN: { attack: 0.96, defense: 1.01, wounds: 0.7 },
} as const satisfies Record<string, NonNullable<ProductEffects['combat']>>;

const products = Object.fromEntries(
  Object.entries(classicOgV04D.products).map(([key, product]) => [key, { ...product, effects: { ...product.effects, combat: combat[key as keyof typeof combat] } }]),
) as { [K in keyof typeof classicOgV04D.products]: (typeof classicOgV04D.products)[K] & { effects: (typeof classicOgV04D.products)[K]['effects'] & { combat: (typeof combat)[K] } } };

export const classicOgV04E = {
  ...classicOgV04D,
  meta: { id: 'classic-og-v0.4-e', version: '0.4.0-E', name: 'Classic OG - Products & Vice' },
  products,
  combatSupply: {
    // A 40-thug squad burns 10 units a fight.
    productPerThugPerFight: 0.25,
  },
} as const satisfies Ruleset;
