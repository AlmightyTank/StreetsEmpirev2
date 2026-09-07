/**
 * Weapons. Section 34.
 *
 * `power` is unused in 0.1.0 - it exists so 0.2.0 combat does not need a
 * schema or ruleset redesign. Weapons never contribute to Classic net worth;
 * they only arm thugs, which is what thug happiness cares about.
 */

import type { Weapon, WeaponKey } from '../types.js';

export const weapons = {
  PISTOL: {
    field: 'pistols',
    name: 'Pistol',
    buyCents: 5_000,
    sellCents: 3_800,
    power: 1,
  },
  SHOTGUN: {
    field: 'shotguns',
    name: 'Shotgun',
    buyCents: 45_000,
    sellCents: 33_800,
    power: 4,
  },
  TEK9: {
    field: 'tek9s',
    name: 'Tek-9',
    buyCents: 125_000,
    sellCents: 93_800,
    power: 9,
  },
  AK47: {
    field: 'ak47s',
    name: 'AK-47',
    buyCents: 350_000,
    sellCents: 262_500,
    power: 22,
  },
} as const satisfies { [K in WeaponKey]: Weapon };
