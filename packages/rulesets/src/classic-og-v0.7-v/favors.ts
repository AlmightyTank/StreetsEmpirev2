import type { FavorCatalog } from '../types.js';
import { classicOgV07U } from '../classic-og-v0.7-u/index.js';

const baseFavors = classicOgV07U.favors ?? {};

/**
 * Phase Y-A Legendary favors.
 *
 * Legendary is a catalog rarity, not a second activation engine. These favors
 * deliberately reuse the existing timed/single-use primitives so category
 * locks, idempotency, Phase X content switches and normal action transactions
 * continue to be authoritative.
 */
export const favorCatalog = {
  ...baseFavors,

  GHOST_NETWORK: {
    key: 'GHOST_NETWORK',
    name: 'Ghost Network',
    description: 'Legendary · For 5 minutes: +50% Scout income and +30% Scout recruitment. Mama only hands this marker out once you have proved the whole street can move for you.',
    contactKey: 'MAMA_KING',
    rarity: 'LEGENDARY',
    activation: { kind: 'TIMED', category: 'STREET', durationMinutes: 5 },
    effect: { kind: 'SCOUT_BOOST', incomePercent: 50, recruitmentPercent: 30 },
  },

  PIP_BLACK_BOOK: {
    key: 'PIP_BLACK_BOOK',
    name: "Pip's Black Book",
    description: 'Legendary · For 5 minutes: 25% off eligible product purchases at Pip’s counter. The normal anti-arbitrage price floor still applies.',
    contactKey: 'PIP',
    rarity: 'LEGENDARY',
    activation: { kind: 'TIMED', category: 'UNDERWORLD', durationMinutes: 5 },
    effect: { kind: 'PIP_BUY_DISCOUNT', discountPercent: 25 },
  },

  TOMMY_WAR_CHEST: {
    key: 'TOMMY_WAR_CHEST',
    name: "Tommy's War Chest",
    description: 'Legendary · Arm it, then your next eligible Tommy weapon order gets 35% off. It is consumed only after that purchase succeeds.',
    contactKey: 'TOMMY',
    rarity: 'LEGENDARY',
    activation: { kind: 'SINGLE_USE', category: 'MUSCLE' },
    effect: {
      kind: 'STORE_BUY_DISCOUNT',
      storeKey: 'TOMMY',
      itemKeys: ['PISTOL', 'SHOTGUN', 'TEK9', 'AK47'],
      discountPercent: 35,
    },
  },
} as const satisfies FavorCatalog;
