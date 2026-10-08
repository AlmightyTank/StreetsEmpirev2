import { classicOgV14B2 } from '../classic-og-v1.4-b2/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.4.0-C — Sponsored Contracts.
 *
 * Every daily, weekly, city, Season and alliance contract is sponsored by the faction it helps:
 * its giver's faction, or, for work from Vic (who brokers for whoever's lane it is) and for the
 * market-driven city boards, the faction whose lane it is in. Ace's casino work and Ledger's law
 * work have no sponsor. A completed contract pays its sponsor standing, shown before you accept
 * it; an expired one pays nothing.
 *
 * The boards are still dealt from B2's shared per-round decks, so every player in a round sees
 * the same contracts. The lean only picks between two candidate sponsors (Vic's business and
 * boss-trip work, city sales and city trips), twice as likely to be one you are Known with.
 * Slots, windows, objectives, cash and favor rewards are exactly 1.4.0-B2's. See
 * docs/ROADMAP-1.4.0.md.
 */
export const classicOgV14C = {
  ...classicOgV14B2,
  meta: { id: 'classic-og-v1.4-c', version: '1.4.0-C', name: 'Classic OG - Sponsored Contracts' },
  contractSponsors: {
    standing: { DAILY: 2, WEEKLY: 6, CITY_CONTRACT: 1, SEASON: 20, ALLIANCE: 6 },
    lanes: {
      STREET: ['KINGS'],
      TURF: ['KINGS'],
      BLOCK_WAR: ['KINGS'],
      COMBAT: ['OUTFIT'],
      BUSINESS: ['OUTFIT', 'KINGS'],
      PRODUCT: ['CARTEL_LINE'],
      ECONOMY: ['CARTEL_LINE'],
      TRAVEL: ['ROAD_SAINTS'],
      CONVOY: ['ROAD_SAINTS'],
      // Flying the boss out goes through the airport, where customs is on Civic Handshake's payroll.
      BOSS_TRIP: ['ROAD_SAINTS', 'CIVIC_HANDSHAKE'],
      HEAT: ['CIVIC_HANDSHAKE'],
      CITY_SELL: ['CARTEL_LINE', 'ROAD_SAINTS'],
      CITY_TRIP: ['ROAD_SAINTS', 'CIVIC_HANDSHAKE'],
    },
    knownLean: 1,
  },
} as const satisfies Ruleset;
