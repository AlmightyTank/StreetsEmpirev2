import type { CasinoVenueRules, Ruleset } from '../types.js';
import { classicOgV12E } from '../classic-og-v1.2-e/index.js';

const ALL_ROOMS = ['FULL_CASINO', 'PRIVATE_CLUB', 'UNDERGROUND', 'NIGHTLIFE'] as const;
const venues = classicOgV12E.casino.venues;

/** One venue with its 1.2.0-E identity and VIP room layered on the 1.2.0-A room. */
function venue(base: CasinoVenueRules, extra: Required<Pick<CasinoVenueRules, 'identity' | 'vipRoom'>>): CasinoVenueRules {
  return { ...base, ...extra };
}

/**
 * 1.2.0-E — High Rollers & City Identity.
 *
 * Rated play turns every charged wager into theoretical house win ("theo"). Theo
 * climbs a five-step status ladder, earns comps that can pay for Boss Trip hotel
 * nights, and opens each city's VIP room. Operating a Casino Front in a venue's
 * city also opens that room. VIP tables reuse the exact rules of their floor
 * counterparts and only raise the posted limits: status never changes odds.
 */
export const classicOgV12E2 = {
  ...classicOgV12E,
  meta: { id: 'classic-og-v1.2-e2', version: '1.2.0-E2', name: 'Classic OG - High Rollers & City Identity' },
  casino: {
    ...classicOgV12E.casino,
    venues: {
      'new-york-city': venue(venues['new-york-city'], {
        identity: { tagline: 'Cards, cash and a door that only opens from the inside.', signatureGame: 'POKER', accent: 'STEEL' },
        vipRoom: { name: 'The Penthouse Game', blurb: 'A standing game forty floors up. Nobody gets in on a first visit.', minTier: 'REGULAR', visitorMinBodyguards: 0 },
      }),
      detroit: venue(venues.detroit, {
        identity: { tagline: 'Dice off the back wall and nobody counting but the house.', signatureGame: 'STREET_DICE', accent: 'NEON' },
        vipRoom: { name: 'The Garage', blurb: 'A converted body shop where the big point games roll after midnight.', minTier: 'REGULAR', visitorMinBodyguards: 1 },
      }),
      'miami-beach': venue(venues['miami-beach'], {
        identity: { tagline: 'Bottle service, ocean air and a wheel that never stops.', signatureGame: 'ROULETTE', accent: 'OCEAN' },
        vipRoom: { name: 'Cabana Salon', blurb: 'Private cabanas over the pool with their own croupiers.', minTier: 'PREFERRED', visitorMinBodyguards: 0 },
      }),
      seattle: venue(venues.seattle, {
        identity: { tagline: 'Rain on the glass, quiet money at the felt.', signatureGame: 'BLACKJACK', accent: 'EMERALD' },
        vipRoom: { name: 'The Fern Room', blurb: 'A soundproofed salon where the regulars play for hours without a word.', minTier: 'PREFERRED', visitorMinBodyguards: 0 },
      }),
      'beverly-hills': venue(venues['beverly-hills'], {
        identity: { tagline: 'Old money, new money and nobody asking which.', signatureGame: 'BLACKJACK', accent: 'ROSE' },
        vipRoom: { name: 'The Vault', blurb: 'A former bank vault with one table and a list at the door.', minTier: 'HIGH_ROLLER', visitorMinBodyguards: 1 },
      }),
      'las-vegas': venue(venues['las-vegas'], {
        identity: { tagline: 'The biggest floor in the country and the brightest lights on it.', signatureGame: 'SLOTS', accent: 'GOLD' },
        vipRoom: { name: 'Empire Black Room', blurb: 'The highest limits in the country. Walk in with respect or do not walk in.', minTier: 'HIGH_ROLLER', visitorMinBodyguards: 2 },
      }),
      'los-angeles': venue(venues['los-angeles'], {
        identity: { tagline: 'A floor built to be seen, a skybox built not to be.', signatureGame: 'ROULETTE', accent: 'SUNSET' },
        vipRoom: { name: 'The Skybox', blurb: 'Glass booths above the floor for the people who own the floor.', minTier: 'PREFERRED', visitorMinBodyguards: 0 },
      }),
      atlanta: venue(venues.atlanta, {
        identity: { tagline: 'Road money and nightlife money, same table, same night.', signatureGame: 'STREET_DICE', accent: 'PEACH' },
        vipRoom: { name: 'The Magnolia Room', blurb: 'A members-only parlor behind the club where the stakes go up after two.', minTier: 'REGULAR', visitorMinBodyguards: 0 },
      }),
    },
    blackjack: {
      tables: [
        ...classicOgV12E.casino.blackjack.tables,
        {
          key: 'SALON_BLACKJACK',
          name: 'Salon Blackjack',
          blurb: 'The VIP room game. Same six-deck stand-on-soft-17 rules as Street Blackjack, bigger limits.',
          venueKinds: ALL_ROOMS,
          room: 'VIP',
          minBetCents: 50_000,
          maxBetCents: 5_000_000,
          betStepCents: 50_000,
          decks: 6,
          reshuffleAtRemainingCards: 78,
          dealerHitsSoft17: false,
          blackjackPayout: { numerator: 3, denominator: 2 },
          allowDoubleAfterSplit: true,
          maxSplitHands: 4,
          splitAcesOneCard: true,
        },
        {
          key: 'BLACK_ROOM_BLACKJACK',
          name: 'Black Room Blackjack',
          blurb: 'Empire High Limit rules with the ceiling taken off. Vegas Black Room only.',
          venueKinds: ['FULL_CASINO'],
          room: 'VIP',
          minBetCents: 500_000,
          maxBetCents: 10_000_000,
          betStepCents: 500_000,
          decks: 2,
          reshuffleAtRemainingCards: 34,
          dealerHitsSoft17: true,
          blackjackPayout: { numerator: 3, denominator: 2 },
          allowDoubleAfterSplit: true,
          maxSplitHands: 4,
          splitAcesOneCard: true,
        },
      ],
    },
    roulette: {
      tables: [
        ...classicOgV12E.casino.roulette.tables,
        {
          key: 'SALON_ROULETTE',
          name: 'Salon Roulette',
          blurb: 'Single-zero wheel in the VIP room. Same pockets and returns as European Roulette.',
          venueKinds: ALL_ROOMS,
          room: 'VIP',
          wheel: 'EUROPEAN',
          minBetCents: 10_000,
          maxBetCents: 5_000_000,
          betStepCents: 10_000,
          maxTotalBetCents: 25_000_000,
        },
        {
          key: 'BLACK_ROOM_ROULETTE',
          name: 'Black Room Roulette',
          blurb: 'The Empire wheel at Black Room limits.',
          venueKinds: ['FULL_CASINO'],
          room: 'VIP',
          wheel: 'EUROPEAN',
          minBetCents: 100_000,
          maxBetCents: 10_000_000,
          betStepCents: 100_000,
          maxTotalBetCents: 50_000_000,
        },
      ],
    },
    streetDice: {
      tables: [
        ...classicOgV12E.casino.streetDice.tables,
        {
          key: 'PRIVATE_DICE',
          name: 'Private Dice',
          blurb: 'The VIP room point game. Same pass-line and true-odds rules, bigger line limits.',
          venueKinds: ALL_ROOMS,
          room: 'VIP',
          minBetCents: 25_000,
          maxBetCents: 2_500_000,
          betStepCents: 25_000,
          maxOddsMultiple: 5,
        },
      ],
    },
    status: {
      tiers: [
        { key: 'WALK_IN', name: 'Walk-in', minTheoCents: 0, compRateBps: 0, maxBankrollCents: 100_000_000 },
        { key: 'REGULAR', name: 'Regular', minTheoCents: 25_000, compRateBps: 1_000, maxBankrollCents: 100_000_000 },
        { key: 'PREFERRED', name: 'Preferred', minTheoCents: 250_000, compRateBps: 1_500, maxBankrollCents: 250_000_000 },
        { key: 'HIGH_ROLLER', name: 'High Roller', minTheoCents: 2_500_000, compRateBps: 2_000, maxBankrollCents: 500_000_000 },
        { key: 'WHALE', name: 'Whale', minTheoCents: 15_000_000, compRateBps: 2_500, maxBankrollCents: 1_000_000_000 },
      ],
      ratingEdgeBps: {
        blackjackStandsSoft17: 50,
        blackjackHitsSoft17: 70,
        rouletteAmerican: 526,
        rouletteEuropean: 270,
        streetDiceLine: 141,
        streetDiceOdds: 0,
      },
      comps: { hotelExtensions: true },
      casinoFront: { minLevel: 1, grantsVipAccess: true, compBonusBps: 500 },
    },
  },
} as const satisfies Ruleset;
