import type {
  CasinoBlackjackTableRules,
  CasinoRouletteTableRules,
  CasinoRules,
  CasinoSlotMachineRules,
  CasinoStatusRules,
  CasinoStatusTierKey,
  CasinoStatusTierRules,
  CasinoVenueRules,
} from '@streets/rulesets';
import { effectiveSlotRtpBps } from './slots.js';

/**
 * 1.2.0-E — High Rollers.
 *
 * Rated play is measured in theoretical house win ("theo"): the posted wager times
 * the game's pinned house edge. It never looks at what a wager actually won or lost,
 * so a lucky night and an unlucky night at the same stakes rate the same, and status
 * cannot be farmed with zero-edge bets.
 *
 * Theo and comps are accumulated as "basis" values in cents x basis points so that
 * many small wagers never lose their fractional cents to rounding. Whole cents are
 * the basis divided by 10,000, rounded down.
 *
 * Nothing in this module is an input to any game's RNG, shuffle, roll or payout.
 */

export const CASINO_BASIS_PER_CENT = 10_000n;

export interface CasinoTierPosition {
  tier: CasinoStatusTierRules;
  index: number;
  next: CasinoStatusTierRules | null;
  /** Progress from this tier to the next, 0..10,000. 10,000 at the top tier. */
  progressBps: number;
}

/** Tiers in ascending threshold order. The first tier must start at zero theo. */
export function casinoStatusTiers(status: CasinoStatusRules): readonly CasinoStatusTierRules[] {
  const tiers = [...status.tiers].sort((left, right) => left.minTheoCents - right.minTheoCents);
  if (!tiers.length || tiers[0]!.minTheoCents !== 0) {
    throw new Error('Casino status needs a tier that starts at zero theo.');
  }
  return tiers;
}

export function casinoStatusTier(status: CasinoStatusRules, theoCents: bigint): CasinoTierPosition {
  const tiers = casinoStatusTiers(status);
  let index = 0;
  for (let candidate = 0; candidate < tiers.length; candidate++) {
    if (theoCents >= BigInt(tiers[candidate]!.minTheoCents)) index = candidate;
  }
  const tier = tiers[index]!;
  const next = tiers[index + 1] ?? null;
  if (!next) return { tier, index, next, progressBps: 10_000 };
  const span = BigInt(next.minTheoCents - tier.minTheoCents);
  const into = theoCents - BigInt(tier.minTheoCents);
  const progressBps = span > 0n ? Number((into * 10_000n) / span) : 0;
  return { tier, index, next, progressBps: Math.max(0, Math.min(10_000, progressBps)) };
}

/** Position of a tier key on the ladder, or -1 when the ruleset has no such tier. */
export function casinoTierRank(status: CasinoStatusRules, key: CasinoStatusTierKey): number {
  return casinoStatusTiers(status).findIndex((tier) => tier.key === key);
}

export function casinoTierByKey(status: CasinoStatusRules, key: CasinoStatusTierKey): CasinoStatusTierRules | null {
  return casinoStatusTiers(status).find((tier) => tier.key === key) ?? null;
}

/** The largest session bankroll a player at this status may open. */
export function casinoMaxBankrollCents(casino: CasinoRules, theoCents: bigint): number {
  if (!casino.status) return casino.session.maxBankrollCents;
  return Math.max(casino.session.maxBankrollCents, casinoStatusTier(casino.status, theoCents).tier.maxBankrollCents);
}

// --- Rating edges ------------------------------------------------------------------

/** Slots rate at the machine's own long-run house edge, including free spins. */
export function slotRatingEdgeBps(machine: CasinoSlotMachineRules, betPerLineCents: number): number {
  return Math.max(0, 10_000 - effectiveSlotRtpBps(machine, betPerLineCents));
}

export function blackjackRatingEdgeBps(status: CasinoStatusRules, table: CasinoBlackjackTableRules): number {
  return table.dealerHitsSoft17 ? status.ratingEdgeBps.blackjackHitsSoft17 : status.ratingEdgeBps.blackjackStandsSoft17;
}

export function rouletteRatingEdgeBps(status: CasinoStatusRules, table: CasinoRouletteTableRules): number {
  return table.wheel === 'AMERICAN' ? status.ratingEdgeBps.rouletteAmerican : status.ratingEdgeBps.rouletteEuropean;
}

export function streetDiceRatingEdgeBps(status: CasinoStatusRules, bet: 'LINE' | 'ODDS'): number {
  return bet === 'LINE' ? status.ratingEdgeBps.streetDiceLine : status.ratingEdgeBps.streetDiceOdds;
}

// --- Rating a wager ----------------------------------------------------------------

export interface CasinoRatingDelta {
  /** Theo for this wager in cents x bps. */
  theoBasis: bigint;
  /** Comps earned by this wager in cents x bps. */
  compBasis: bigint;
}

/**
 * Rate one charged wager. Comps are a share of theo at the player's tier before the
 * wager, plus any Casino Front bonus. Comps are always strictly below theo, so the
 * expected value of playing for comps stays negative.
 */
export function rateCasinoWager(
  status: CasinoStatusRules,
  input: { wagerCents: bigint; edgeBps: number; theoBeforeCents: bigint; compBonusBps?: number },
): CasinoRatingDelta {
  if (input.wagerCents <= 0n || input.edgeBps <= 0) return { theoBasis: 0n, compBasis: 0n };
  const theoBasis = input.wagerCents * BigInt(Math.trunc(input.edgeBps));
  const rate = casinoCompRateBps(status, input.theoBeforeCents, input.compBonusBps ?? 0);
  return { theoBasis, compBasis: (theoBasis * BigInt(rate)) / CASINO_BASIS_PER_CENT };
}

/** Rate a house take that is already a real amount, such as poker rake. */
export function rateCasinoHouseTake(
  status: CasinoStatusRules,
  input: { takeCents: bigint; theoBeforeCents: bigint; compBonusBps?: number },
): CasinoRatingDelta {
  return rateCasinoWager(status, { wagerCents: input.takeCents, edgeBps: 10_000, theoBeforeCents: input.theoBeforeCents, compBonusBps: input.compBonusBps });
}

/** Comp rate in bps of theo, capped below 100% so comps can never exceed theo. */
export function casinoCompRateBps(status: CasinoStatusRules, theoBeforeCents: bigint, bonusBps = 0): number {
  const base = casinoStatusTier(status, theoBeforeCents).tier.compRateBps;
  return Math.max(0, Math.min(9_999, base + Math.max(0, bonusBps)));
}

export function casinoBasisToCents(basis: bigint): bigint {
  return basis > 0n ? basis / CASINO_BASIS_PER_CENT : 0n;
}

// --- VIP rooms ---------------------------------------------------------------------

export type CasinoVipAccessVia = 'STATUS' | 'FRONT';

export interface CasinoVipAccess {
  allowed: boolean;
  via: CasinoVipAccessVia | null;
  reason: string | null;
}

export interface CasinoVipAccessInput {
  venue: CasinoVenueRules;
  theoCents: bigint;
  /** Highest operating Casino Front level the player runs in this venue's city. 0 for none. */
  frontLevel: number;
  /** True when the boss is in this city on a trip or run rather than living here. */
  visiting: boolean;
  /** Armed company the boss walked in with: trip bodyguards, or the run's escorts. */
  companions: number;
}

/**
 * Whether the door staff let this boss into the venue's VIP room.
 *
 * Status opens the door when the player's network tier reaches the room's minimum.
 * A visiting boss also needs the room's bodyguard count ("respect"). Operating a
 * Casino Front in the venue's city opens the door outright: the house knows you,
 * and your front's crew walks you in.
 */
export function casinoVipAccess(status: CasinoStatusRules | undefined, input: CasinoVipAccessInput): CasinoVipAccess {
  const room = input.venue.vipRoom;
  if (!status || !room) return { allowed: false, via: null, reason: 'This casino has no VIP room.' };

  const front = status.casinoFront;
  if (front?.grantsVipAccess && input.frontLevel >= front.minLevel) {
    return { allowed: true, via: 'FRONT', reason: null };
  }

  const needed = casinoTierRank(status, room.minTier);
  const have = casinoStatusTier(status, input.theoCents).index;
  const tierName = casinoTierByKey(status, room.minTier)?.name ?? room.minTier;
  if (needed < 0 || have < needed) {
    return {
      allowed: false,
      via: null,
      reason: room.name + ' admits ' + tierName + ' status and up'
        + (front?.grantsVipAccess ? ', or the owner of a Casino Front in this city.' : '.'),
    };
  }
  if (input.visiting && input.companions < room.visitorMinBodyguards) {
    const count = room.visitorMinBodyguards;
    return {
      allowed: false,
      via: null,
      reason: 'Visitors need ' + count + ' bodyguard' + (count === 1 ? '' : 's') + ' at their side to get into ' + room.name + '.',
    };
  }
  return { allowed: true, via: 'STATUS', reason: null };
}

/** Comp-paid hotel extensions need a casino in the trip city and a status block that allows it. */
export function casinoCompsCoverHotel(casino: CasinoRules | undefined, citySlug: string): boolean {
  return Boolean(casino?.enabled && casino.status?.comps.hotelExtensions && casino.venues[citySlug]);
}
