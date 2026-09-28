import type { Ruleset, TripRules } from '@streets/rulesets';
import { cityRules } from './cities.js';

/**
 * Trips A. The boss flies to another city for a hotel stay and flies home. Everything
 * here is pure; the server checks what only the database knows (a trip already out, a
 * move on the road) and passes it in.
 *
 * A trip is four timestamps: it leaves at `departedAt`, lands at `arrivesAt`, checks out
 * at `stayUntil` and is home at `returnsAt`. Where the boss is at any moment follows
 * from those, so a trip settles the same however often it is read.
 */

export function tripRules(ruleset: Ruleset): TripRules | undefined {
  return ruleset.travel?.trips;
}

/** What the hotel charges for `minutes` in a city, rounded up to whole hours. */
export function hotelCents(rules: TripRules, city: string, minutes: number): bigint {
  const hours = Math.ceil(Math.max(0, minutes) / 60);
  const lean = rules.hotelPrice?.[city] ?? 1;
  return BigInt(Math.round(rules.hotelCentsPerHour * lean)) * BigInt(hours);
}

/**
 * Trips B. What a run with the boss aboard pays the hotel for one started hour in a city:
 * the boss's room at the city's rate, plus lodging for every escort.
 */
export function rideAlongHourCents(rules: TripRules, city: string, escorts: number): bigint {
  const ride = rules.rideAlong;
  if (!ride) return 0n;
  return hotelCents(rules, city, 60) + BigInt(ride.crewCentsPerThugHour) * BigInt(Math.max(0, escorts));
}

export interface HotelBill {
  /** Hours of this stay paid for once the bill is settled. */
  hoursPaid: number;
  /** What this settlement takes from the wallet. */
  chargeCents: bigint;
  /** When the boss had to check out because the wallet could not cover the next hour. */
  checkoutAt: Date | null;
}

/**
 * Trips B. Settle a stay's hotel bill up to `now`. Every hour is paid when it starts, out
 * of the wallet as it stands; the first hour starts on arrival. The first hour the
 * wallet cannot cover is the moment the boss checks out. Pure and idempotent: settling
 * again with the returned `hoursPaid` and the charged wallet changes nothing.
 */
export function settleHotelBill(input: {
  arriveAt: Date;
  /** When the stay ends as planned (the town window closing, or a check-out). */
  leaveAt: Date;
  now: Date;
  hoursPaid: number;
  walletCents: bigint;
  hourCents: bigint;
}): HotelBill {
  const hour = 3_600_000;
  const start = input.arriveAt.getTime();
  const end = Math.min(input.now.getTime(), input.leaveAt.getTime());
  const due = input.now.getTime() < start ? 0 : Math.max(1, Math.ceil((end - start) / hour));
  let paid = Math.max(0, input.hoursPaid);
  let wallet = input.walletCents;
  let charge = 0n;
  while (paid < due) {
    if (wallet < input.hourCents) {
      return { hoursPaid: paid, chargeCents: charge, checkoutAt: new Date(start + paid * hour) };
    }
    wallet -= input.hourCents;
    charge += input.hourCents;
    paid++;
  }
  return { hoursPaid: paid, chargeCents: charge, checkoutAt: null };
}

/** The lieutenant's skim off a positive take while the boss is away. Never more than the take. */
export function lieutenantCutCents(rules: TripRules | undefined, takeCents: bigint): bigint {
  if (!rules || takeCents <= 0n || rules.lieutenantCut <= 0) return 0n;
  const share = Math.max(0, Math.min(1, rules.lieutenantCut));
  // Integer maths: the share as parts per ten thousand, truncated toward the player.
  return (takeCents * BigInt(Math.round(share * 10_000))) / 10_000n;
}

export interface TripTimes {
  departedAt: Date;
  arrivesAt: Date;
  stayUntil: Date;
  returnsAt: Date;
}

export type TripPhase = 'outbound' | 'town' | 'inbound' | 'home';

export interface TripPosition {
  phase: TripPhase;
  /** When the current phase ends. For `home`, when the trip got home. */
  until: Date;
}

/** Where the boss is along a trip at `now`. */
export function tripPosition(trip: TripTimes, now: Date): TripPosition {
  const t = now.getTime();
  if (t < trip.arrivesAt.getTime()) return { phase: 'outbound', until: trip.arrivesAt };
  if (t < trip.stayUntil.getTime()) return { phase: 'town', until: trip.stayUntil };
  if (t < trip.returnsAt.getTime()) return { phase: 'inbound', until: trip.returnsAt };
  return { phase: 'home', until: trip.returnsAt };
}

export interface TripCheck {
  /** What stops the trip right now, in words; null when it can go. */
  blockedReason: string | null;
  code: string | null;
  /** When the reason goes away on its own, if it does. */
  blockedUntil: Date | null;
  ticketCents: bigint;
  hotelCents: bigint;
  /** Everything that leaves home cash: ticket, hotel and bankroll. */
  totalCents: bigint;
  times: TripTimes;
  /** When trips close for the round. */
  cutoffAt: Date;
}

/**
 * Can this boss fly to `to` now, for this stay and bankroll, and what would it cost.
 * Checked in this order so the player sees the reason that matters most.
 */
export function checkTrip(ruleset: Ruleset, input: {
  from: string;
  to: string;
  now: Date;
  stayMinutes: number;
  bankrollCents: bigint;
  cashCents: bigint;
  turns: number;
  roundEndsAt: Date;
  tripOut: boolean;
  movingUntil: Date | null;
  lockedUntil: Date | null;
}): TripCheck {
  const rules = tripRules(ruleset);
  const now = input.now.getTime();
  const flight = (rules?.flightMinutes ?? 0) * 60_000;
  const stay = Math.max(0, input.stayMinutes) * 60_000;
  const times: TripTimes = {
    departedAt: input.now,
    arrivesAt: new Date(now + flight),
    stayUntil: new Date(now + flight + stay),
    returnsAt: new Date(now + flight + stay + flight),
  };
  const cutoffAt = new Date(input.roundEndsAt.getTime() - (rules?.cutoffHours ?? 0) * 3_600_000);
  const ticketCents = BigInt(rules?.ticketCents ?? 0);
  const hotel = rules ? hotelCents(rules, input.to, input.stayMinutes) : 0n;
  const bankroll = input.bankrollCents > 0n ? input.bankrollCents : 0n;
  const totalCents = ticketCents + hotel + bankroll;
  const result = (code: string | null, blockedReason: string | null, blockedUntil: Date | null = null): TripCheck => ({
    code, blockedReason, blockedUntil, ticketCents, hotelCents: hotel, totalCents, times, cutoffAt,
  });
  const name = (slug: string) => ruleset.cities?.[slug]?.name ?? slug;
  const dollars = (cents: bigint | number) => `$${(Number(cents) / 100).toLocaleString('en-US')}`;

  if (!rules) return result('TRIPS_DISABLED', 'The boss stays home this round.');
  if (!cityRules(ruleset, input.to)) return result('UNKNOWN_CITY', 'That city is not on the map.');
  if (input.to === input.from) return result('ALREADY_HOME', `You already live in ${name(input.from)}.`);
  if (input.tripOut) return result('TRIP_OUT', 'You are already away. Come home before you fly again.');
  if (input.movingUntil && input.movingUntil.getTime() > now) return result('ON_THE_ROAD', 'You are moving house.', input.movingUntil);
  if (input.lockedUntil && input.lockedUntil.getTime() > now) return result('LOCKED_UP', 'You are locked up.', input.lockedUntil);
  if (now >= cutoffAt.getTime()) return result('TRIPS_CLOSED', 'Flights are closed as the round ends.');
  if (times.returnsAt.getTime() > input.roundEndsAt.getTime()) return result('TRIP_TOO_LONG', 'That stay would run past the end of the round.');
  if (!rules.stayMinutes.includes(input.stayMinutes)) return result('BAD_STAY', 'Pick one of the stays on offer.');
  if (input.bankrollCents < 0n) return result('BAD_BANKROLL', 'A bankroll cannot be negative.');
  if (bankroll > BigInt(rules.carryOnCapCents)) return result('OVER_CARRY_ON', `You can carry at most ${dollars(rules.carryOnCapCents)} onto a plane.`);
  if (input.turns < rules.launchTurns) return result('NOT_ENOUGH_TURNS', `Getting out the door takes ${rules.launchTurns} turns.`);
  if (totalCents > input.cashCents) return result('NOT_ENOUGH_CASH', `The ticket, the hotel and the bankroll come to ${dollars(totalCents)}.`);
  return result(null, null);
}

export interface ExtendCheck {
  blockedReason: string | null;
  code: string | null;
  hotelCents: bigint;
  stayUntil: Date;
  returnsAt: Date;
}

/** Stay on for `blocks` more extension blocks, paid out of the bankroll. Only in town. */
export function checkExtend(ruleset: Ruleset, input: {
  trip: TripTimes & { city: string; bankrollCents: bigint };
  blocks: number;
  now: Date;
  roundEndsAt: Date;
}): ExtendCheck {
  const rules = tripRules(ruleset);
  const minutes = Math.max(0, Math.trunc(input.blocks)) * (rules?.extendMinutes ?? 0);
  const added = minutes * 60_000;
  const stayUntil = new Date(input.trip.stayUntil.getTime() + added);
  const returnsAt = new Date(input.trip.returnsAt.getTime() + added);
  const hotel = rules ? hotelCents(rules, input.trip.city, minutes) : 0n;
  const result = (code: string | null, blockedReason: string | null): ExtendCheck => ({ code, blockedReason, hotelCents: hotel, stayUntil, returnsAt });

  if (!rules) return result('TRIPS_DISABLED', 'The boss stays home this round.');
  if (tripPosition(input.trip, input.now).phase !== 'town') return result('NOT_IN_TOWN', 'You can only extend a stay while you are checked in.');
  if (minutes <= 0) return result('BAD_EXTENSION', 'Extend by at least one block.');
  const stayed = stayUntil.getTime() - input.trip.arrivesAt.getTime();
  if (stayed > rules.maxStayMinutes * 60_000) return result('STAY_TOO_LONG', `No stay runs longer than ${rules.maxStayMinutes / 60} hours.`);
  if (returnsAt.getTime() > input.roundEndsAt.getTime()) return result('TRIP_TOO_LONG', 'That stay would run past the end of the round.');
  if (hotel > input.trip.bankrollCents) return result('NOT_ENOUGH_BANKROLL', 'Your bankroll cannot cover the extra nights. Nothing is wired from home.');
  return result(null, null);
}

/**
 * Check out now and fly home. Only from town: a boss in the air lands first.
 * Heading home early refunds nothing: the front desk keeps the deposit.
 */
export function planTripHeadHome(trip: TripTimes, now: Date): { stayUntil: Date; returnsAt: Date } | null {
  if (tripPosition(trip, now).phase !== 'town') return null;
  const flight = trip.arrivesAt.getTime() - trip.departedAt.getTime();
  return { stayUntil: now, returnsAt: new Date(now.getTime() + flight) };
}

/** A trip's bankroll in net worth: cash on the boss, weighted like cash at home. */
export function tripNetWorthCents(ruleset: Ruleset, bankrollCents: bigint): bigint {
  const weight = BigInt(ruleset.economy.netWorth.cashWeightPercent);
  return ((bankrollCents > 0n ? bankrollCents : 0n) * weight) / 100n;
}
