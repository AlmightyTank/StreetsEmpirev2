import type { Store, StoreKey } from '../types.js';
import { weapons } from './weapons.js';

/**
 * Stores. Sections 32-36.
 *
 * Every price in the game lives here, in cents. A store item names the
 * RoundPlayer column it moves, so StoreService never needs a switch statement.
 */
export const stores = {
  /**
   * Supplies. Sections 32-33.
   *
   * BALANCE_APPROXIMATION - the shelf limits here.
   *
   * These are upkeep, not trophies. The shelf refills in full every hour
   * rather than trickling, so the cap is the delivery: a truck arrives, the
   * shelf is stocked, and what you did not take is not banked. Being away ten
   * hours gets you the same shelf as being away one.
   *
   * The caps are sized against what an empire actually wants on hand, not
   * against a round's worth of hoarding. Recruiting flat out for 28 days
   * reaches roughly 374 whores, who want 5 condoms each:
   *
   *   condoms   2,000 shelf   vs ~1,872 wanted on hand, ~450 burned an hour
   *   beer      5,000 shelf   vs a few hundred thugs wanting one each
   *   medicine    500 shelf   vs dozens of infections on a bad night
   *
   * So the hourly delivery always outruns the hourly burn, while the shelf
   * itself is only just big enough for the largest crew the round can grow.
   * That ordering is deliberate: condoms and beer hold happiness up and
   * medicine is the only cure for an infection, so a player who cannot buy
   * them is in a spiral cash cannot fix - a far worse failure than a rich
   * player over-stocking.
   */
  CORNER: {
    slug: 'corner',
    keeper: 'The clerk',
    name: 'Corner Store',
    blurb: 'Supplies. Keeps the girls stocked and the crew drinking.',
    items: {
      CONDOM: {
        name: 'Condoms',
        field: 'condoms',
        buyCents: 100,
        sellCents: null,
        restock: {
          cap: 2_000,
          perInterval: 2_000,
          intervalMinutes: 60,
          stockField: 'condomStock',
          stockAtField: 'condomStockAt',
        },
      },
      MEDICINE: {
        name: 'Medicine',
        field: 'medicine',
        buyCents: 2_000,
        sellCents: null,
        // An infection takes one, and the per-action cap keeps even a
        // disastrous night in the dozens, so 500 an hour is never the thing
        // standing between a player and a cure.
        restock: {
          cap: 500,
          perInterval: 500,
          intervalMinutes: 60,
          stockField: 'medicineStock',
          stockAtField: 'medicineStockAt',
        },
      },
      BEER: {
        name: 'Beer',
        field: 'beer',
        buyCents: 200,
        sellCents: null,
        restock: {
          cap: 5_000,
          perInterval: 5_000,
          intervalMinutes: 60,
          stockField: 'beerStock',
          stockAtField: 'beerStockAt',
        },
      },
    },
  },

  TOMMY: {
    slug: 'tommy',
    keeper: 'Tommy',
    name: "Tek9 Tommy's",
    blurb: 'Muscle and hardware. The heavy guns come in on Tommy’s schedule, not yours.',
    items: {
      THUG: {
        name: 'Thug',
        field: 'thugs',
        buyCents: 100_000,
        sellCents: null,
        /**
         * BALANCE_APPROXIMATION. Five an hour - 120 a day against the ~18 a
         * day the best district recruits.
         *
         * Hiring is the one purchase that is net-worth-neutral: $1,000 of
         * cash is $750 of net worth and a thug is worth $750, so without a
         * limit a late-round fortune would convert into an army in a single
         * click. The shelf makes building a crew take days of either
         * recruiting or paying, which is the shape the round wants.
         *
         * It still leaves buying far faster than scouting, so cash keeps its
         * advantage - it just cannot skip the clock.
         */
        restock: {
          cap: 5,
          perInterval: 5,
          intervalMinutes: 60,
          stockField: 'thugStock',
          stockAtField: 'thugStockAt',
        },
      },
      PISTOL: {
        name: weapons.PISTOL.name,
        field: weapons.PISTOL.field,
        buyCents: weapons.PISTOL.buyCents,
        sellCents: weapons.PISTOL.sellCents,
        restock: weapons.PISTOL.restock,
      },
      SHOTGUN: {
        unlockKey: 'SHOTGUN',
        name: weapons.SHOTGUN.name,
        field: weapons.SHOTGUN.field,
        buyCents: weapons.SHOTGUN.buyCents,
        sellCents: weapons.SHOTGUN.sellCents,
        restock: weapons.SHOTGUN.restock,
      },
      TEK9: {
        unlockKey: 'TEK9',
        name: weapons.TEK9.name,
        field: weapons.TEK9.field,
        buyCents: weapons.TEK9.buyCents,
        sellCents: weapons.TEK9.sellCents,
        restock: weapons.TEK9.restock,
      },
      AK47: {
        unlockKey: 'AK47',
        name: weapons.AK47.name,
        field: weapons.AK47.field,
        buyCents: weapons.AK47.buyCents,
        sellCents: weapons.AK47.sellCents,
        restock: weapons.AK47.restock,
      },
    },
  },

  CHARLIE: {
    slug: 'charlie',
    keeper: 'Charlie',
    name: "Charlie's Chop Shop",
    blurb: 'Each Low-Rider can transport 6 Thugs. Charlie builds them one at a time.',
    items: {
      LOW_RIDER: {
        name: 'Low-Rider',
        field: 'lowRiders',
        buyCents: 500_000,
        sellCents: 300_000,
        /**
         * BALANCE_APPROXIMATION. A chop shop is one man and a lift, so a
         * fleet is something you build across days rather than buy in a
         * click - the same reasoning as Tommy's hardware, and the same
         * shape: a batch of three every eight hours, not a trickle.
         *
         * Between the shotgun's four hours and the Tek-9's twelve: a car is
         * more work to put together than a gun is to source, and at six
         * thugs a car the fleet you need arrives over a couple of days.
         */
        restock: {
          cap: 3,
          perInterval: 3,
          intervalMinutes: 480,
          stockField: 'lowRiderStock',
          stockAtField: 'lowRiderStockAt',
        },
      },
    },
  },

  /**
   * Pip's. Sections 32-33.
   *
   * BALANCE_APPROXIMATION - the shelf limit here, and it is the one shelf in
   * the game that is meant to stop being enough.
   *
   * Crack is the only supply with a second source: you can cook it for $5 or
   * buy it from Pip for $10. That changes what a limit is allowed to do here.
   * Everywhere else a shelf must always outrun demand, because being unable
   * to buy is a spiral cash cannot fix. Crack has a way out, so Pip's shelf
   * can be sized to run out on purpose.
   *
   *   500 an hour outpaces what even an 833-whore crew burns, so nobody is
   *   ever starved of rocks outright - but it only fully stocks the 2-per-
   *   whore the happiness formula wants up to about 250 whores, which a
   *   player recruiting hard passes around the middle of a round.
   *
   * So Pip carries you through the first half, and after that cooking has to
   * become the main line. That is the job Produce Crack was missing: not a
   * cheaper way to buy rocks, but the only way to supply a large stable.
   */
  PIP: {
    slug: 'pip',
    keeper: 'Pip',
    name: "Pip's Deals on Wheels",
    blurb: 'Rock in, rock out. Selling at $3 preserves the net worth value.',
    items: {
      CRACK: {
        name: 'Crack',
        field: 'crack',
        buyCents: 1_000,
        sellCents: 300,
        // Buying only. Selling never touches a shelf, so a player can always
        // dump stock however much Pip has on the counter.
        restock: {
          cap: 500,
          perInterval: 500,
          intervalMinutes: 60,
          stockField: 'crackStock',
          stockAtField: 'crackStockAt',
        },
      },
    },
  },
} as const satisfies { [K in StoreKey]: Store };

/**
 * Quick-add buttons offered on every quantity input. Section 32.
 *
 * These ADD to the box rather than replacing it, so the ladder needs a fine
 * bottom rung as well as a coarse top one - buying 3 medicine is as ordinary
 * as buying 5,000 condoms. Steps larger than what the player can afford (or
 * spend) are hidden rather than clamped.
 */
export const storeBulkHelpers: readonly number[] = [1, 10, 100, 1000];

/** Low-Rider capacity, shown as a hint before Travel and Drive-by exist. */
export const lowRiderThugCapacity = 6;
