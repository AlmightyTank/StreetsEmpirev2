/**
 * Weapons. Section 34.
 *
 * `power` is unused in 0.1.0 - it exists so 0.2.0 combat does not need a
 * schema or ruleset redesign. Weapons never contribute to Classic net worth;
 * they only arm thugs, which is what thug happiness cares about.
 *
 * BALANCE_APPROXIMATION - the restock limits below.
 *
 * Happiness counts an armed thug, not what he is holding, so the heavy guns
 * buy nothing a pistol does not. Their whole value is that they are hard to
 * get, and cash alone stops being hard to get by the second week. So Tommy is
 * limited by supply rather than by price: a crate arrives on the gun's own
 * clock and fills the shelf, and the better the gun the longer that wait.
 *
 *   Pistol   50 per 1h      the gun you actually arm a crew with
 *   Shotgun   5 per 2h      a stack you can build up over a day
 *   Tek-9     3 per 6h      twelve a day, and only after the favor
 *   AK-47     2 per 12h     the wall of them takes the whole round
 *
 * The tier lives in the wait, not in the size of the crate. Every shelf in
 * this ruleset restocks in full - see the corner store - so what separates an
 * AK-47 from a shotgun is that Tommy can only get them once a day.
 *
 * The pistol's shelf is the one sized not to bite. Thug happiness wants one
 * weapon per thug, so a cheap gun that ran short would put a ceiling on
 * happiness itself. 1,200 a day against a busiest-day recruitment of about 63
 * thugs is comfortably more than what hiring can consume - the shelf is there
 * to bound the item, not to ration it.
 *
 * Hiring cannot outrun it either: Tommy sells ten thugs an hour, so the most
 * a crew can grow in a day is well inside a day of pistols.
 *
 * Tommy buys back at 70% of what he charges. That number is load-bearing: a
 * weapon is worth its sell price in net worth, and cash is worth 75 cents on
 * the dollar, so a spread tighter than 25% would make buying guns a way to
 * mint net worth out of cash. See `economy.netWorth`.
 *
 * The cap is what makes the wait matter. Without it a player who ignored
 * Tommy for a week could walk in and clear a round's worth of shelf in one
 * click, which is the opposite of scarcity - so a crate is a crate however
 * long you stayed away, and the rest of the round's supply only exists if you
 * keep coming back.
 */

import type { Weapon, WeaponKey } from '../types.js';

export const weapons = {
  PISTOL: {
    field: 'pistols',
    name: 'Pistol',
    buyCents: 5_000,
    sellCents: 3_500,
    power: 1,
    restock: {
      cap: 50,
      perInterval: 50,
      intervalMinutes: 60,
      stockField: 'pistolStock',
      stockAtField: 'pistolStockAt',
    },
  },
  SHOTGUN: {
    field: 'shotguns',
    name: 'Shotgun',
    buyCents: 45_000,
    sellCents: 31_500,
    power: 4,
    restock: {
      cap: 5,
      perInterval: 5,
      intervalMinutes: 120,
      stockField: 'shotgunStock',
      stockAtField: 'shotgunStockAt',
    },
  },
  TEK9: {
    field: 'tek9s',
    name: 'Tek-9',
    buyCents: 125_000,
    sellCents: 87_500,
    power: 9,
    restock: {
      cap: 3,
      perInterval: 3,
      intervalMinutes: 360,
      stockField: 'tek9Stock',
      stockAtField: 'tek9StockAt',
    },
  },
  AK47: {
    field: 'ak47s',
    name: 'AK-47',
    buyCents: 350_000,
    sellCents: 245_000,
    power: 22,
    restock: {
      cap: 2,
      perInterval: 2,
      intervalMinutes: 720,
      stockField: 'ak47Stock',
      stockAtField: 'ak47StockAt',
    },
  },
} as const satisfies { [K in WeaponKey]: Weapon };
