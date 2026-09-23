import type { FavorCatalog } from '../types.js';
import { classicOgV07V } from '../classic-og-v0.7-v/index.js';

const baseFavors = classicOgV07V.favors ?? {};

/**
 * Phase Y-B broadens Legendary favors beyond percentage boosts.
 *
 * These three markers deliberately hook into existing successful actions:
 * Heat bribes, run launches and local turf claims. The single-use engine keeps
 * their arm/disarm/idempotency/kill-switch behavior identical to earlier favors.
 */
export const favorCatalog = {
  ...baseFavors,

  WHEELS_OPEN_ROAD: {
    key: 'WHEELS_OPEN_ROAD',
    name: 'Open Road',
    description: 'Legendary · Arm it, then your next successful intercity run launch skips the outbound police road-stop roll. The return road and town police still apply.',
    contactKey: 'WHEELS',
    rarity: 'LEGENDARY',
    activation: { kind: 'SINGLE_USE', category: 'UNDERWORLD' },
    effect: { kind: 'CLEAR_FIRST_ROAD_STOP' },
  },

  VIC_CLEAN_SLATE_FAVOR: {
    key: 'VIC_CLEAN_SLATE_FAVOR',
    name: 'Clean Slate',
    description: 'Legendary · Arm it, then your next successful Heat bribe costs $0. You choose how much current Heat to erase with that one envelope.',
    contactKey: 'VIC',
    rarity: 'LEGENDARY',
    activation: { kind: 'SINGLE_USE', category: 'STREET' },
    effect: { kind: 'FREE_HEAT_BRIBE' },
  },

  BLOCKS_STAND_DOWN: {
    key: 'BLOCKS_STAND_DOWN',
    name: 'Stand Down',
    description: 'Legendary · Arm it, then the locals stand aside on your next otherwise-valid unheld turf claim. Presence, crew minimums, guns, turn cost and turf caps still apply.',
    contactKey: 'BLOCKS',
    rarity: 'LEGENDARY',
    activation: { kind: 'SINGLE_USE', category: 'MUSCLE' },
    effect: { kind: 'LOCAL_TURF_STANDDOWN' },
  },
} as const satisfies FavorCatalog;
