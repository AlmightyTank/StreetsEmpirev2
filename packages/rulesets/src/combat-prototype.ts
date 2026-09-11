import { classicOgV01 } from './classic-og-v0.1/index.js';
import type { Weapon, WeaponKey } from './types.js';

/** Experimental 0.2.0-A inputs, deliberately outside the live ruleset registry. */
export interface CombatModel {
  readonly version: string;
  readonly weapons: Readonly<Record<WeaponKey, Weapon>>;
  readonly squadCap: number;
  readonly turnCost: number;
  readonly strength: {
    readonly perThug: number;
    readonly weaponPowerExponent: number;
    readonly moraleFloor: number;
    readonly defenseMultiplier: number;
    readonly variance: number;
  };
  readonly wounds: {
    readonly winnerFraction: number;
    readonly loserFraction: number;
    readonly maxFraction: number;
    readonly recoveryMinutes: number;
  };
  readonly loot: {
    readonly protectedCashCents: number;
    readonly exposedCashPercent: number;
    readonly perFitAttackerCents: number;
  };
}

/**
 * BALANCE_APPROXIMATION: every value below is a simulation candidate.
 * A is a model revision, not a ruleset a live round can select.
 * Keep the existing gun powers; soften their combat effect so a 22-power
 * AK does not make its holder worth 22 pistol-equipped thugs.
 */
export const combatPrototype = {
  version: '0.2.0-A.1',
  weapons: classicOgV01.weapons,
  squadCap: 100,
  turnCost: 10,
  strength: {
    perThug: 1,
    weaponPowerExponent: 0.5,
    moraleFloor: 0.75,
    defenseMultiplier: 1.1,
    variance: 0.1,
  },
  wounds: {
    winnerFraction: 0.02,
    loserFraction: 0.08,
    maxFraction: 0.1,
    recoveryMinutes: 120,
  },
  loot: {
    protectedCashCents: 500_000,
    exposedCashPercent: 5,
    perFitAttackerCents: 10_000,
  },
} as const satisfies CombatModel;
