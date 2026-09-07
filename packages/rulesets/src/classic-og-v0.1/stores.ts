import type { Store, StoreKey } from '../types.js';
import { weapons } from './weapons.js';

/**
 * Stores. Sections 32-36.
 *
 * Every price in the game lives here, in cents. A store item names the
 * RoundPlayer column it moves, so StoreService never needs a switch statement.
 */
export const stores = {
  CORNER: {
    slug: 'corner',
    name: 'Corner Store',
    blurb: 'Supplies. Keeps the girls stocked and the crew drinking.',
    items: {
      CONDOM: { name: 'Condoms', field: 'condoms', buyCents: 100, sellCents: null },
      MEDICINE: { name: 'Medicine', field: 'medicine', buyCents: 2_000, sellCents: null },
      BEER: { name: 'Beer', field: 'beer', buyCents: 200, sellCents: null },
    },
  },

  TOMMY: {
    slug: 'tommy',
    name: "Tek9 Tommy's",
    blurb: 'Muscle and hardware.',
    items: {
      THUG: { name: 'Thug', field: 'thugs', buyCents: 100_000, sellCents: null },
      PISTOL: {
        name: weapons.PISTOL.name,
        field: weapons.PISTOL.field,
        buyCents: weapons.PISTOL.buyCents,
        sellCents: weapons.PISTOL.sellCents,
      },
      SHOTGUN: {
        name: weapons.SHOTGUN.name,
        field: weapons.SHOTGUN.field,
        buyCents: weapons.SHOTGUN.buyCents,
        sellCents: weapons.SHOTGUN.sellCents,
      },
      TEK9: {
        unlockKey: 'TEK9',
        name: weapons.TEK9.name,
        field: weapons.TEK9.field,
        buyCents: weapons.TEK9.buyCents,
        sellCents: weapons.TEK9.sellCents,
      },
      AK47: {
        unlockKey: 'AK47',
        name: weapons.AK47.name,
        field: weapons.AK47.field,
        buyCents: weapons.AK47.buyCents,
        sellCents: weapons.AK47.sellCents,
      },
    },
  },

  CHARLIE: {
    slug: 'charlie',
    name: "Charlie's Chop Shop",
    blurb: 'Each Low-Rider can transport 6 Thugs.',
    items: {
      LOW_RIDER: {
        name: 'Low-Rider',
        field: 'lowRiders',
        buyCents: 500_000,
        sellCents: 300_000,
      },
    },
  },

  PIP: {
    slug: 'pip',
    name: "Pip's Deals on Wheels",
    blurb: 'Rock in, rock out. Selling at $3 preserves the net worth value.',
    items: {
      CRACK: { name: 'Crack', field: 'crack', buyCents: 1_000, sellCents: 300 },
    },
  },
} as const satisfies { [K in StoreKey]: Store };

/** Quick-fill buttons offered on every quantity input. Section 32. */
export const storeBulkHelpers: readonly number[] = [100, 1000];

/** Low-Rider capacity, shown as a hint before Travel and Drive-by exist. */
export const lowRiderThugCapacity = 6;
