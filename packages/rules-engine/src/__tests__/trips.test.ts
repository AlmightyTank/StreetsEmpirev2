import { describe, expect, it } from 'vitest';
import { classicOgTripsA, classicOgTripsB, classicOgTripsC, classicOgTripsD, classicOgTripsD2, classicOgV08H, type Ruleset } from '@streets/rulesets';
import { checkMove } from '../calculations/relocation.js';
import { planLaunch } from '../calculations/runs.js';
import {
  airportCheckChance,
  rollAirport,
  gunRentCents,
  lodgingCents,
  tripNetWorthCents,
  bossAwayDefenseMultiplier,
  bossHitLootCents,
  huntedRules,
  laidUp,
  checkExtend,
  checkTrip,
  hotelCents,
  lieutenantCutCents,
  rideAlongHourCents,
  settleHotelBill,
  planTripHeadHome,
  tripPosition,
  tripRules,
} from '../calculations/trips.js';

const ruleset: Ruleset = classicOgTripsA;
const rules = classicOgTripsA.travel.trips;
const now = new Date('2026-09-28T12:00:00Z');
const minutes = (value: number) => new Date(now.getTime() + value * 60_000);
const free = {
  from: 'new-york-city', to: 'las-vegas', now, stayMinutes: 120, bankrollCents: 1_000_000n,
  cashCents: 50_000_000n, turns: 100, roundEndsAt: minutes(60 * 24 * 10),
  tripOut: false, movingUntil: null, lockedUntil: null,
};

describe('Trips A: the boss travels', () => {
  it('is off on every older ruleset', () => {
    expect(tripRules(classicOgV08H)).toBeUndefined();
    expect(checkTrip(classicOgV08H, free).code).toBe('TRIPS_DISABLED');
  });

  it('prices the hotel by the started hour and the city', () => {
    expect(hotelCents(rules, 'las-vegas', 120)).toBe(BigInt(Math.round(rules.hotelCentsPerHour * 0.6)) * 2n);
    expect(hotelCents(rules, 'las-vegas', 61)).toBe(hotelCents(rules, 'las-vegas', 120));
    expect(hotelCents(rules, 'beverly-hills', 60)).toBeGreaterThan(hotelCents(rules, 'detroit', 60));
    expect(hotelCents(rules, 'nowhere', 60)).toBe(BigInt(rules.hotelCentsPerHour));
  });

  it('flies out, stays and flies home on four timestamps', () => {
    const check = checkTrip(ruleset, free);
    expect(check.blockedReason).toBeNull();
    const flight = rules.flightMinutes;
    expect(check.times.arrivesAt).toEqual(minutes(flight));
    expect(check.times.stayUntil).toEqual(minutes(flight + 120));
    expect(check.times.returnsAt).toEqual(minutes(flight * 2 + 120));
    expect(check.totalCents).toBe(check.ticketCents + check.hotelCents + free.bankrollCents);

    expect(tripPosition(check.times, now).phase).toBe('outbound');
    expect(tripPosition(check.times, minutes(flight)).phase).toBe('town');
    expect(tripPosition(check.times, minutes(flight + 120)).phase).toBe('inbound');
    expect(tripPosition(check.times, minutes(flight * 2 + 120))).toEqual({ phase: 'home', until: check.times.returnsAt });
  });

  it('refuses a trip for the reason that matters most', () => {
    expect(checkTrip(ruleset, { ...free, to: 'nowhere' }).code).toBe('UNKNOWN_CITY');
    expect(checkTrip(ruleset, { ...free, to: 'new-york-city' }).code).toBe('ALREADY_HOME');
    expect(checkTrip(ruleset, { ...free, tripOut: true }).code).toBe('TRIP_OUT');
    expect(checkTrip(ruleset, { ...free, movingUntil: minutes(30) }).code).toBe('ON_THE_ROAD');
    expect(checkTrip(ruleset, { ...free, lockedUntil: minutes(30) }).code).toBe('LOCKED_UP');
    expect(checkTrip(ruleset, { ...free, roundEndsAt: minutes(rules.cutoffHours * 60 - 1) }).code).toBe('TRIPS_CLOSED');
    expect(checkTrip(ruleset, { ...free, stayMinutes: 720, roundEndsAt: minutes(rules.cutoffHours * 60 + 60) }).code).toBe('TRIP_TOO_LONG');
    expect(checkTrip(ruleset, { ...free, stayMinutes: 90 }).code).toBe('BAD_STAY');
    expect(checkTrip(ruleset, { ...free, bankrollCents: -1n }).code).toBe('BAD_BANKROLL');
    expect(checkTrip(ruleset, { ...free, bankrollCents: BigInt(rules.carryOnCapCents) + 1n }).code).toBe('OVER_CARRY_ON');
    expect(checkTrip(ruleset, { ...free, turns: rules.launchTurns - 1 }).code).toBe('NOT_ENOUGH_TURNS');
    const exact = checkTrip(ruleset, free).totalCents;
    expect(checkTrip(ruleset, { ...free, cashCents: exact - 1n }).code).toBe('NOT_ENOUGH_CASH');
    expect(checkTrip(ruleset, { ...free, cashCents: exact }).code).toBeNull();
    expect(checkTrip(ruleset, { ...free, bankrollCents: 0n }).code).toBeNull();
  });

  it('extends a stay only in town, out of the bankroll, up to the longest stay', () => {
    const times = checkTrip(ruleset, free).times;
    const trip = { ...times, city: 'las-vegas', bankrollCents: 1_000_000n };
    const inTown = minutes(rules.flightMinutes + 10);
    const roundEndsAt = free.roundEndsAt;
    expect(checkExtend(ruleset, { trip, blocks: 1, now, roundEndsAt }).code).toBe('NOT_IN_TOWN');
    expect(checkExtend(ruleset, { trip, blocks: 0, now: inTown, roundEndsAt }).code).toBe('BAD_EXTENSION');
    const one = checkExtend(ruleset, { trip, blocks: 1, now: inTown, roundEndsAt });
    expect(one.code).toBeNull();
    expect(one.stayUntil.getTime() - times.stayUntil.getTime()).toBe(rules.extendMinutes * 60_000);
    expect(one.returnsAt.getTime() - times.returnsAt.getTime()).toBe(rules.extendMinutes * 60_000);
    expect(one.hotelCents).toBe(hotelCents(rules, 'las-vegas', rules.extendMinutes));
    const tooMany = Math.ceil(rules.maxStayMinutes / rules.extendMinutes);
    expect(checkExtend(ruleset, { trip, blocks: tooMany, now: inTown, roundEndsAt }).code).toBe('STAY_TOO_LONG');
    expect(checkExtend(ruleset, { trip: { ...trip, bankrollCents: 0n }, blocks: 1, now: inTown, roundEndsAt }).code).toBe('NOT_ENOUGH_BANKROLL');
    expect(checkExtend(ruleset, { trip, blocks: 1, now: inTown, roundEndsAt: times.returnsAt }).code).toBe('TRIP_TOO_LONG');
  });

  it('heads home only from town, and the flight leaves now', () => {
    const times = checkTrip(ruleset, free).times;
    expect(planTripHeadHome(times, now)).toBeNull();
    const inTown = minutes(rules.flightMinutes + 10);
    expect(planTripHeadHome(times, inTown)).toEqual({ stayUntil: inTown, returnsAt: minutes(rules.flightMinutes * 2 + 10) });
    expect(planTripHeadHome(times, times.stayUntil)).toBeNull();
  });

  it('skims the lieutenant cut off a positive take and never more', () => {
    expect(lieutenantCutCents(rules, 100_000n)).toBe(10_000n);
    expect(lieutenantCutCents(rules, 99n)).toBe(9n);
    expect(lieutenantCutCents(rules, 0n)).toBe(0n);
    expect(lieutenantCutCents(rules, -500n)).toBe(0n);
    expect(lieutenantCutCents(undefined, 100_000n)).toBe(0n);
    expect(lieutenantCutCents({ ...rules, lieutenantCut: 2 }, 100n)).toBe(100n);
  });

  it('prices a ride-along hour as the boss\'s room plus lodging for each escort', () => {
    const b = classicOgTripsB.travel.trips;
    expect(rideAlongHourCents(rules, 'las-vegas', 10)).toBe(0n);
    expect(rideAlongHourCents(b, 'las-vegas', 0)).toBe(hotelCents(b, 'las-vegas', 60));
    expect(rideAlongHourCents(b, 'las-vegas', 10)).toBe(hotelCents(b, 'las-vegas', 60) + 10n * BigInt(b.rideAlong.crewCentsPerThugHour));
    expect(rideAlongHourCents(b, 'las-vegas', -3)).toBe(hotelCents(b, 'las-vegas', 60));
  });

  it('bills a stay by the started hour, and checks the boss out when the wallet runs dry', () => {
    const arriveAt = now;
    const leaveAt = minutes(24 * 60);
    const bill = (at: Date, hoursPaid: number, walletCents: bigint) =>
      settleHotelBill({ arriveAt, leaveAt, now: at, hoursPaid, walletCents, hourCents: 1_000n });
    expect(bill(minutes(-1), 0, 5_000n)).toEqual({ hoursPaid: 0, chargeCents: 0n, checkoutAt: null });
    expect(bill(now, 0, 5_000n)).toEqual({ hoursPaid: 1, chargeCents: 1_000n, checkoutAt: null });
    expect(bill(minutes(60), 1, 4_000n)).toEqual({ hoursPaid: 1, chargeCents: 0n, checkoutAt: null });
    expect(bill(minutes(61), 1, 4_000n)).toEqual({ hoursPaid: 2, chargeCents: 1_000n, checkoutAt: null });
    expect(bill(minutes(179), 0, 10_000n)).toEqual({ hoursPaid: 3, chargeCents: 3_000n, checkoutAt: null });
    // Two hours affordable of five started: out at the start of the third.
    expect(bill(minutes(299), 0, 2_500n)).toEqual({ hoursPaid: 2, chargeCents: 2_000n, checkoutAt: minutes(120) });
    // Broke on arrival: out the moment it gets there.
    expect(bill(minutes(10), 0, 999n)).toEqual({ hoursPaid: 0, chargeCents: 0n, checkoutAt: now });
    // Never past the planned end of the stay.
    expect(bill(minutes(48 * 60), 0, 1_000_000n).hoursPaid).toBe(24);
    // Idempotent: settling the settled bill again charges nothing.
    const once = bill(minutes(299), 0, 10_000n);
    expect(bill(minutes(299), once.hoursPaid, 10_000n - once.chargeCents)).toEqual({ hoursPaid: once.hoursPaid, chargeCents: 0n, checkoutAt: null });
  });

  it('holds a ride-along run in town for the longer window', () => {
    const b: Ruleset = classicOgTripsB;
    const crew = planLaunch(b, { home: 'new-york-city', to: 'detroit', routeIndex: 0, now });
    const boss = planLaunch(b, { home: 'new-york-city', to: 'detroit', routeIndex: 0, now, windowMinutes: classicOgTripsB.travel.trips.rideAlong.maxStayMinutes });
    const window = (plan: typeof crew) => plan.stops[0]!.leaveAt!.getTime() - plan.stops[0]!.arriveAt.getTime();
    expect(window(crew)).toBe(classicOgTripsB.travel.runs.townWindowMinutes * 60_000);
    expect(window(boss)).toBe(classicOgTripsB.travel.trips.rideAlong.maxStayMinutes * 60_000);
    expect(boss.turns).toBe(crew.turns);
  });

  it('keeps a laid-up boss home', () => {
    expect(checkTrip(ruleset, { ...free, laidUpUntil: minutes(30) }).code).toBe('LAID_UP');
    expect(checkTrip(ruleset, { ...free, laidUpUntil: minutes(-1) }).code).toBeNull();
    expect(laidUp(minutes(1), now)).toBe(true);
    expect(laidUp(now, now)).toBe(false);
    expect(laidUp(null, now)).toBe(false);
  });

  it('rolls a hit on a boss as a share of the bankroll, capped by what the squad carries', () => {
    const c: Ruleset = classicOgTripsC;
    const hunted = classicOgTripsC.travel.trips.hunted;
    const carry = BigInt(classicOgTripsC.travel.convoys.loot.cashPerAttackerCents);
    expect(huntedRules(classicOgTripsB)).toBeUndefined();
    expect(bossHitLootCents(classicOgTripsB, { bankrollCents: 1_000_000n, fitAttackers: 10, rng: () => 0 })).toEqual({ percent: 0, cashCents: 0n });
    const low = bossHitLootCents(c, { bankrollCents: 1_000_000n, fitAttackers: 100, rng: () => 0 });
    expect(low).toEqual({ percent: hunted.bankrollPercent.min, cashCents: 1_000_000n * BigInt(hunted.bankrollPercent.min) / 100n });
    const high = bossHitLootCents(c, { bankrollCents: 1_000_000n, fitAttackers: 100, rng: () => 0.999999 });
    expect(high.percent).toBe(hunted.bankrollPercent.max);
    expect(bossHitLootCents(c, { bankrollCents: 100_000_000n, fitAttackers: 2, rng: () => 0 }).cashCents).toBe(2n * carry);
    expect(bossHitLootCents(c, { bankrollCents: 0n, fitAttackers: 5, rng: () => 0.5 }).cashCents).toBe(0n);
  });

  it('weakens home defense only while the boss is away, and only where the boss is hunted', () => {
    expect(bossAwayDefenseMultiplier(classicOgTripsC, true)).toBe(classicOgTripsC.travel.trips.hunted.awayDefenseMultiplier);
    expect(bossAwayDefenseMultiplier(classicOgTripsC, false)).toBe(1);
    expect(bossAwayDefenseMultiplier(classicOgTripsB, true)).toBe(1);
  });

  it('flies bodyguards on their own tickets and lodging, from fit thugs at home', () => {
    const d: Ruleset = classicOgTripsD;
    const trip = classicOgTripsD.travel.trips;
    const guards = trip.bodyguards;
    const withGuards = { ...free, bodyguards: 4, fitThugs: 10 };
    const alone = checkTrip(d, free);
    const crew = checkTrip(d, withGuards);
    expect(crew.code).toBeNull();
    expect(crew.ticketCents).toBe(alone.ticketCents + 4n * BigInt(guards.ticketCents));
    expect(crew.hotelCents).toBe(alone.hotelCents + lodgingCents(trip, 4, 120));
    expect(lodgingCents(trip, 4, 61)).toBe(4n * 2n * BigInt(guards.lodgingCentsPerThugHour));
    expect(checkTrip(ruleset, { ...withGuards }).code).toBe('NO_BODYGUARDS');
    expect(checkTrip(d, { ...withGuards, bodyguards: guards.max + 1, fitThugs: 100 }).code).toBe('TOO_MANY_BODYGUARDS');
    expect(checkTrip(d, { ...withGuards, fitThugs: 3 }).code).toBe('NOT_ENOUGH_THUGS');
    expect(checkTrip(d, { ...withGuards, bodyguards: 1.5 }).code).toBe('BAD_BODYGUARDS');
    expect(checkTrip(d, { ...withGuards, cashCents: crew.totalCents - 1n }).code).toBe('NOT_ENOUGH_CASH');
  });

  it('rents guns for a stay at a real price, never the price of owning them', () => {
    const guards = classicOgTripsD.travel.trips.bodyguards;
    expect(gunRentCents(guards, { PISTOL: 3, AK47: 1 })).toBe(3n * BigInt(guards.gunRentCents.PISTOL) + BigInt(guards.gunRentCents.AK47));
    expect(gunRentCents(guards, {})).toBe(0n);
    for (const [key, weapon] of Object.entries(classicOgTripsD.combat.weapons)) {
      const rent = guards.gunRentCents[key as keyof typeof guards.gunRentCents];
      expect(rent).toBeGreaterThan(0);
      expect(rent).toBeLessThan(weapon.buyCents);
    }
  });

  it('counts bodyguards as thugs in a trip\'s net worth', () => {
    const perThug = BigInt(classicOgTripsD.economy.netWorth.perThugCents);
    expect(tripNetWorthCents(classicOgTripsD, 0n, 5)).toBe(5n * perThug);
    expect(tripNetWorthCents(classicOgTripsD, 1_000n, 0)).toBe(tripNetWorthCents(classicOgTripsD, 1_000n));
  });

  it('looks twice at a hot boss at the airport, and grounds a very hot one', () => {
    const d2: Ruleset = classicOgTripsD2;
    const airport = classicOgTripsD2.travel.trips.airport;
    expect(airportCheckChance(airport, airport.checkFromHeat)).toBe(0);
    expect(airportCheckChance(airport, airport.checkFromHeat + 10)).toBeCloseTo(10 * airport.chancePerHeat);
    expect(airportCheckChance(airport, 1_000)).toBe(airport.maxChance);
    expect(airportCheckChance(undefined, 1_000)).toBe(0);
    expect(rollAirport(airport, { heat: 10, bankrollCents: 1_000_000n, rng: () => 0 })).toEqual({ pulled: false, seizedCents: 0n, delayMinutes: 0 });
    expect(rollAirport(airport, { heat: 80, bankrollCents: 1_000_000n, rng: () => 0 })).toEqual({
      pulled: true, seizedCents: 1_000_000n * BigInt(airport.seizePercent) / 100n, delayMinutes: airport.delayMinutes,
    });
    expect(rollAirport(airport, { heat: 80, bankrollCents: 1_000_000n, rng: () => 0.99 }).pulled).toBe(false);
    expect(checkTrip(d2, { ...free, heat: airport.noFlyHeat }).code).toBe('NO_FLY');
    expect(checkTrip(d2, { ...free, heat: airport.noFlyHeat - 1 }).code).toBeNull();
    expect(checkTrip(classicOgTripsD, { ...free, heat: 100 }).code).toBeNull();
    // Bodyguards draw eyes at the check, but never ground the boss by themselves.
    const guardHeat = airport.bodyguardHeat;
    expect(airportCheckChance(airport, airport.checkFromHeat, 5)).toBeCloseTo(5 * guardHeat * airport.chancePerHeat);
    expect(rollAirport(airport, { heat: airport.checkFromHeat, bodyguards: 5, bankrollCents: 100n, rng: () => 0 }).pulled).toBe(true);
    expect(checkTrip(d2, { ...free, heat: airport.noFlyHeat - 1, bodyguards: 12, fitThugs: 12 }).code).toBeNull();
  });

  it('keeps the operation home while the boss is away', () => {
    const move = {
      from: 'new-york-city', to: 'atlanta', now, netWorthCents: 100_000_000n, cashCents: 50_000_000n,
      roundEndsAt: minutes(60 * 24 * 10), lastMoveAt: null, movingUntil: null, lockedUntil: null, runOut: false, revengeOpenUntil: null,
    };
    expect(checkMove(ruleset, move).code).toBeNull();
    expect(checkMove(ruleset, { ...move, tripOut: true }).code).toBe('TRIP_OUT');
  });
});
