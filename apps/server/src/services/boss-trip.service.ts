import type { BossTrip, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  checkExtend,
  checkTrip,
  gunRentCents,
  hashParts,
  hotelCents,
  airportCheckChance,
  rollAirport,
  seededRng,
  loadRulesetForRound,
  planTripHeadHome,
  tripPosition,
  tripRules,
  type Ruleset,
  type TripCheck,
} from '@streets/rules-engine';
import type {
  GameActionResult,
  TripDto,
  TripExtendInput,
  TripExtendResult,
  TripHeadHomeInput,
  TripHeadHomeResult,
  TripLaunchInput,
  TripLaunchResult,
  TripPanelDto,
  TripReceiptDto,
  TripRentGunsInput,
  TripRentGunsResult,
} from '@streets/shared';
import type { WeaponKey } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, fitThugs } from './action.service.js';
import { activeTrip, bossRun, rentedGunsOf } from './boss-trip-settle.service.js';
import { PermanentUnlockService } from './permanent-unlock.service.js';
import { BossHitService } from './boss-hit.service.js';
import { BossPresenceService } from './boss-presence.service.js';
import { totalAwayWorth } from './run-settle.service.js';
import { LawOfficialService } from './law-official.service.js';

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;

function requireTrips(ruleset: Ruleset) {
  const rules = tripRules(ruleset);
  if (!rules) throw AppError.conflict('TRIPS_DISABLED', 'The boss stays home this round.');
  return rules;
}

function refusal(check: { code: string | null; blockedReason: string | null }): AppError {
  const code = check.code ?? 'TRIP_BLOCKED';
  const message = check.blockedReason ?? 'You cannot travel right now.';
  const bad = [
    'UNKNOWN_CITY', 'ALREADY_HOME', 'BAD_STAY', 'BAD_BANKROLL', 'OVER_CARRY_ON', 'NOT_ENOUGH_CASH', 'NOT_ENOUGH_TURNS', 'BAD_EXTENSION', 'NOT_ENOUGH_BANKROLL',
    'BAD_BODYGUARDS', 'TOO_MANY_BODYGUARDS', 'NOT_ENOUGH_THUGS', 'BAD_GUNS', 'TOO_MANY_GUNS', 'NO_WEAPON_ACCESS', 'BAD_COLLECT',
  ];
  return bad.includes(code) ? AppError.badRequest(code, message, { trip: message }) : AppError.conflict(code, message);
}

/** Trips D. The weapons this player may rent: whatever Tommy would sell them at home. */
function rentableWeapons(player: Pick<RoundPlayer, 'shotgunUnlocked' | 'tek9Unlocked' | 'ak47Unlocked'>): WeaponKey[] {
  return [
    'PISTOL',
    ...(player.shotgunUnlocked ? ['SHOTGUN' as const] : []),
    ...(player.tek9Unlocked ? ['TEK9' as const] : []),
    ...(player.ak47Unlocked ? ['AK47' as const] : []),
  ];
}

/** Trips D. Why no guns can be rented on this trip right now, or null when they can. */
function rentBlock(ruleset: Ruleset, trip: BossTrip, unlocked: boolean, now: Date): string | null {
  const rules = tripRules(ruleset)?.bodyguards;
  if (!rules) return 'Nobody rents guns out of town this round.';
  if (!unlocked) return 'Tommy has nobody out of town for you yet.';
  if (trip.bodyguards <= 0) return 'The boss flew alone: nobody to arm.';
  if (tripPosition(trip, now).phase !== 'town') return 'Guns change hands in town, not at the airport.';
  const carrying = Object.values(rentedGunsOf(trip)).reduce((sum, count) => sum + count, 0);
  if (carrying >= trip.bodyguards) return 'Every bodyguard is already carrying.';
  return null;
}

async function hasGunConnect(db: Db | PrismaClient, ruleset: Ruleset, roundPlayerId: string): Promise<boolean> {
  const key = tripRules(ruleset)?.bodyguards?.gunConnectUnlockKey;
  return Boolean(key && (await PermanentUnlockService.keys(db, roundPlayerId)).has(key));
}

function tripDto(ruleset: Ruleset, trip: BossTrip, roundEndsAt: Date, now: Date, hitLandsAt: Date | null = null, rentBlockedReason: string | null = null): TripDto | null {
  const position = tripPosition(trip, now);
  if (position.phase === 'home') return null;
  const rules = tripRules(ruleset);
  const extend = checkExtend(ruleset, { trip, blocks: 1, now, roundEndsAt });
  return {
    id: trip.id,
    mode: trip.mode,
    homeCity: trip.homeCity,
    city: trip.city,
    cityName: cityName(ruleset, trip.city),
    phase: position.phase,
    until: position.until.toISOString(),
    bankrollCents: Number(trip.bankrollCents),
    startBankrollCents: Number(trip.startBankrollCents),
    ticketCents: Number(trip.ticketCents),
    hotelCents: Number(trip.hotelCents),
    departedAt: trip.departedAt.toISOString(),
    arrivesAt: trip.arrivesAt.toISOString(),
    stayUntil: trip.stayUntil.toISOString(),
    returnsAt: trip.returnsAt.toISOString(),
    extend: { minutes: rules?.extendMinutes ?? 0, hotelCents: Number(extend.hotelCents), blockedReason: extend.blockedReason },
    canHeadHome: planTripHeadHome(trip, now) !== null,
    hitLandsAt: hitLandsAt?.toISOString() ?? null,
    bodyguards: trip.bodyguards,
    woundedBodyguards: trip.woundedBodyguards,
    rentedGuns: rentedGunsOf(trip),
    gunRentCents: Number(trip.gunRentCents),
    rentBlockedReason,
    airportSeizedCents: Number(trip.airportSeizedCents),
    airportDelayMinutes: trip.airportDelayMinutes,
  };
}

function receiptDto(ruleset: Ruleset, trip: BossTrip): TripReceiptDto {
  return {
    id: trip.id,
    city: trip.city,
    cityName: cityName(ruleset, trip.city),
    startBankrollCents: Number(trip.startBankrollCents),
    bankrollCents: Number(trip.bankrollCents),
    ticketCents: Number(trip.ticketCents),
    hotelCents: Number(trip.hotelCents),
    departedAt: trip.departedAt.toISOString(),
    returnedAt: (trip.returnedAt ?? trip.returnsAt).toISOString(),
  };
}

/** The trip a player has out, for an action: refused when there is none. */
async function requireActiveTrip(tx: Db, roundPlayerId: string): Promise<BossTrip> {
  const trip = await activeTrip(tx, roundPlayerId);
  if (!trip) throw AppError.conflict('NO_TRIP', 'The boss is at home.');
  return trip;
}

/**
 * Trips A. The boss flies to another city for a hotel stay and flies home. A trip is a
 * BossTrip row; `RoundPlayer.cityId` never changes, so home, its rank, its targets and
 * its defense stay exactly where they were. Every change is a game action: locked,
 * idempotent and with a before and after. Coming home is lazy (`BossTripSettleService`).
 */
export const BossTripService = {
  /** The trip panel on Travel. Null on rounds without trips. */
  async page(db: Db | PrismaClient, player: RoundPlayer & { city: { slug: string } }, ruleset: Ruleset, roundEndsAt: Date, now: Date): Promise<TripPanelDto | null> {
    const rules = tripRules(ruleset);
    if (!rules) return null;
    const home = player.city.slug;
    const [trip, last, riding] = await Promise.all([
      db.bossTrip.findFirst({ where: { roundPlayerId: player.id, status: 'ACTIVE' } }),
      db.bossTrip.findFirst({ where: { roundPlayerId: player.id, status: 'RETURNED' }, orderBy: { returnedAt: 'desc' } }),
      bossRun(db, player.id),
    ]);
    // Trips B: the town the boss's run is headed for or sitting in, the last before home.
    const ridingTo = riding ? riding.stops[Math.max(0, riding.stops.length - 2)]?.city ?? home : null;
    const connect = await hasGunConnect(db, ruleset, player.id);
    const destinations = Object.keys(ruleset.cities ?? {}).filter((slug) => slug !== home);
    // Any city but home gives the same general reason, at the cheapest stay and no bankroll.
    const general: TripCheck = checkTrip(ruleset, {
      from: home,
      to: destinations[0] ?? home,
      now,
      stayMinutes: rules.stayMinutes[0] ?? 0,
      bankrollCents: 0n,
      cashCents: player.cashCents,
      turns: player.turns,
      roundEndsAt,
      tripOut: Boolean(trip),
      movingUntil: player.movingUntil,
      lockedUntil: player.lockedUntil,
      laidUpUntil: player.laidUpUntil,
      heat: player.heat,
    });
    // Cash is checked per quote in the panel: the general reason stays about the boss, not the wallet.
    const blocked = riding && !trip
      ? { code: 'BOSS_ON_RUN', blockedReason: `The boss is riding with your run to ${cityName(ruleset, ridingTo!)}.`, blockedUntil: null }
      : general.code === 'NOT_ENOUGH_CASH' ? null : general;
    return {
      rules: {
        flightMinutes: rules.flightMinutes,
        ticketCents: rules.ticketCents,
        carryOnCapCents: rules.carryOnCapCents,
        stayMinutes: [...rules.stayMinutes],
        maxStayMinutes: rules.maxStayMinutes,
        extendMinutes: rules.extendMinutes,
        launchTurns: rules.launchTurns,
        lieutenantCut: rules.lieutenantCut,
        rideAlong: rules.rideAlong ? { ...rules.rideAlong } : null,
        bodyguards: rules.bodyguards
          ? { max: rules.bodyguards.max, ticketCents: rules.bodyguards.ticketCents, lodgingCentsPerThugHour: rules.bodyguards.lodgingCentsPerThugHour, gunRentCents: { ...rules.bodyguards.gunRentCents } }
          : null,
      },
      gunConnect: rules.bodyguards ? { unlocked: connect, weapons: rentableWeapons(player) } : null,
      fitThugs: fitThugs(player),
      ...(await BossPresenceService.panel(db, ruleset, player, now)),
      airport: rules.airport
        ? {
            heat: player.heat, checkChance: airportCheckChance(rules.airport, player.heat), seizePercent: rules.airport.seizePercent,
            delayMinutes: rules.airport.delayMinutes, noFlyHeat: rules.airport.noFlyHeat, bodyguardHeat: rules.airport.bodyguardHeat ?? 0,
            checkChancePerBodyguard: airportCheckChance(rules.airport, player.heat, 1) - airportCheckChance(rules.airport, player.heat),
            checkHome: Boolean(rules.airport.checkHome),
            // 1.3.0-G: the same Customs cut the outbound check applies, so the preview matches it.
            customsCut: ruleset.law?.officials && await LawOfficialService.working(db as Db, player.id, player.cityId, 'CUSTOMS', now)
              ? ruleset.law.officials.roles.CUSTOMS.checkCut
              : 0,
          }
        : null,
      bossRun: riding ? { runId: riding.id, cityName: cityName(ruleset, ridingTo!) } : null,
      laidUpUntil: player.laidUpUntil && player.laidUpUntil > now ? player.laidUpUntil.toISOString() : null,
      cutoffAt: general.cutoffAt.toISOString(),
      blockedReason: blocked?.blockedReason ?? null,
      blockedCode: blocked?.code ?? null,
      blockedUntil: blocked?.blockedUntil?.toISOString() ?? null,
      destinations: destinations.map((slug) => ({ slug, name: cityName(ruleset, slug), hotelCentsPerHour: Number(hotelCents(rules, slug, 60)) })),
      trip: trip ? tripDto(ruleset, trip, roundEndsAt, now, await BossHitService.seenComing(db, ruleset, player, trip.id, now), rentBlock(ruleset, trip, connect, now)) : null,
      lastTrip: last ? receiptDto(ruleset, last) : null,
    };
  },

  /** Fly out: the ticket, the hotel and the bankroll leave home cash together. */
  launch(prisma: PrismaClient, roundPlayerId: string, input: TripLaunchInput): Promise<GameActionResult<TripLaunchResult>> {
    return ActionService.run<TripLaunchResult>(prisma, roundPlayerId, {
      action: 'TRIP_LAUNCH',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, now }) => {
        // The round's own rules: the home city's lean never prices a hotel elsewhere.
        const base = loadRulesetForRound(round);
        requireTrips(base);
        const bankrollCents = BigInt(input.bankrollCents);
        // Trips B: one boss. A boss riding with a run cannot also be on a plane.
        if (await bossRun(tx, roundPlayerId)) throw AppError.conflict('BOSS_ON_RUN', 'The boss is riding with your run. Bring it home first.');
        const check = checkTrip(base, {
          from: player.city.slug,
          to: input.to,
          now,
          stayMinutes: input.stayMinutes,
          bankrollCents,
          cashCents: current.cashCents,
          turns: current.turns,
          roundEndsAt: round.endsAt,
          tripOut: Boolean(await activeTrip(tx, roundPlayerId)),
          movingUntil: player.movingUntil,
          lockedUntil: player.lockedUntil,
          laidUpUntil: player.laidUpUntil,
          bodyguards: input.bodyguards,
          fitThugs: fitThugs(current),
          heat: current.heat,
        });
        if (check.blockedReason) throw refusal(check);
        const to = await tx.city.findUnique({ where: { slug: input.to }, select: { isEnabled: true } });
        if (!to?.isEnabled) throw AppError.badRequest('UNKNOWN_CITY', 'That city is not on the map.', { to: 'Pick a city.' });

        const rules = requireTrips(base);
        // Trips D2: a hot boss can be pulled aside on the way out. Rolled once, from the action.
        // 1.3.0-D: Customs on the payroll at home looks the other way more often. The no-fly line above still holds.
        const customs = base.law?.officials ? await LawOfficialService.working(tx, roundPlayerId, player.cityId, 'CUSTOMS', now) : null;
        const airport = rollAirport(rules.airport, {
          heat: current.heat, bodyguards: input.bodyguards, bankrollCents, rng: seededRng(hashParts(input.actionId, 'airport')),
          chanceMultiplier: customs ? 1 - base.law!.officials!.roles.CUSTOMS.checkCut : 1,
        });
        if (customs && rules.airport) await LawOfficialService.favor(tx, base, customs, 'customsFlight', now);
        const delay = airport.delayMinutes * 60_000;
        const later = (at: Date) => new Date(at.getTime() + delay);
        const times = { departedAt: check.times.departedAt, arrivesAt: later(check.times.arrivesAt), stayUntil: later(check.times.stayUntil), returnsAt: later(check.times.returnsAt) };
        const trip = await tx.bossTrip.create({
          data: {
            roundPlayerId,
            mode: 'FLY',
            homeCity: player.city.slug,
            city: input.to,
            bankrollCents: bankrollCents - airport.seizedCents,
            startBankrollCents: bankrollCents,
            ticketCents: check.ticketCents,
            hotelCents: check.hotelCents,
            turnsSpent: rules.launchTurns,
            bodyguards: input.bodyguards,
            airportSeizedCents: airport.seizedCents,
            airportDelayMinutes: airport.delayMinutes,
            ...times,
          },
        });
        const result: TripLaunchResult = {
          tripId: trip.id,
          city: input.to,
          cityName: cityName(base, input.to),
          ticketCents: Number(check.ticketCents),
          hotelCents: Number(check.hotelCents),
          bankrollCents: input.bankrollCents,
          stayMinutes: input.stayMinutes,
          turns: rules.launchTurns,
          arrivesAt: times.arrivesAt.toISOString(),
          stayUntil: times.stayUntil.toISOString(),
          returnsAt: times.returnsAt.toISOString(),
          bodyguards: input.bodyguards,
          ...(airport.pulled ? { airport: { seizedCents: Number(airport.seizedCents), delayMinutes: airport.delayMinutes } } : {}),
        };
        const where = cityName(base, input.to);
        return {
          next: {
            ...current,
            turns: current.turns - rules.launchTurns,
            // Trips D: the bodyguards leave home with the boss, unarmed.
            thugs: current.thugs - input.bodyguards,
            cashCents: current.cashCents - check.totalCents,
            awayNetWorthCents: await totalAwayWorth(tx, roundPlayerId, base),
          },
          result,
          // The bankroll is a transfer: it comes home. The ticket and the hotel are spent.
          ledger: [
            { source: 'TRIP_LAUNCH', label: `Flight · ${where}`, amountCents: -check.ticketCents },
            ...(check.hotelCents > 0n ? [{ source: 'TRIP_LAUNCH', label: `Hotel · ${where}`, amountCents: -check.hotelCents }] : []),
            ...(airport.seizedCents > 0n ? [{ source: 'TRIP_AIRPORT', label: 'Taken at airport security', amountCents: -airport.seizedCents }] : []),
          ],
          activity: { type: 'TRIP_STARTED', payload: { ...result } },
        };
      },
    });
  },

  /** Stay on: more hotel, paid out of the bankroll. Nothing is wired from home. */
  extend(prisma: PrismaClient, roundPlayerId: string, input: TripExtendInput): Promise<GameActionResult<TripExtendResult>> {
    return ActionService.run<TripExtendResult>(prisma, roundPlayerId, {
      action: 'TRIP_EXTEND',
      actionId: input.actionId,
      execute: async ({ tx, current, round, now }) => {
        const base = loadRulesetForRound(round);
        const rules = requireTrips(base);
        const trip = await requireActiveTrip(tx, roundPlayerId);
        const check = checkExtend(base, { trip, blocks: input.blocks, now, roundEndsAt: round.endsAt });
        if (check.blockedReason) throw refusal(check);
        const updated = await tx.bossTrip.update({
          where: { id: trip.id },
          data: {
            bankrollCents: trip.bankrollCents - check.hotelCents,
            hotelCents: trip.hotelCents + check.hotelCents,
            stayUntil: check.stayUntil,
            returnsAt: check.returnsAt,
          },
        });
        return {
          next: { ...current, awayNetWorthCents: await totalAwayWorth(tx, roundPlayerId, base) },
          result: {
            tripId: trip.id,
            minutes: input.blocks * rules.extendMinutes,
            hotelCents: Number(check.hotelCents),
            bankrollCents: Number(updated.bankrollCents),
            stayUntil: check.stayUntil.toISOString(),
            returnsAt: check.returnsAt.toISOString(),
          },
          ledger: check.hotelCents > 0n
            ? [{ source: 'TRIP_EXTEND', label: `Hotel extension · ${cityName(base, trip.city)}`, amountCents: -check.hotelCents }]
            : [],
        };
      },
    });
  },

  /**
   * Trips D. Rent guns in town from Tommy's out-of-town connect: one per bodyguard at most,
   * only what Tommy would sell at home, paid out of the bankroll for the rest of the stay.
   * They are handed back at check-out and never count as yours.
   */
  rentGuns(prisma: PrismaClient, roundPlayerId: string, input: TripRentGunsInput): Promise<GameActionResult<TripRentGunsResult>> {
    return ActionService.run<TripRentGunsResult>(prisma, roundPlayerId, {
      action: 'TRIP_RENT_GUNS',
      actionId: input.actionId,
      execute: async ({ tx, current, round, now }) => {
        const base = loadRulesetForRound(round);
        const rules = requireTrips(base).bodyguards;
        if (!rules) throw AppError.conflict('NO_GUN_CONNECT', 'Nobody rents guns out of town this round.');
        const trip = await requireActiveTrip(tx, roundPlayerId);
        const blocked = rentBlock(base, trip, await hasGunConnect(tx, base, roundPlayerId), now);
        if (blocked) throw AppError.conflict('RENT_BLOCKED', blocked);
        const wanted = input.guns;
        const total = Object.values(wanted).reduce((sum, count) => sum + count, 0);
        if (total < 1) throw refusal({ code: 'BAD_GUNS', blockedReason: 'Rent at least one gun.' });
        const held = rentedGunsOf(trip);
        const carrying = Object.values(held).reduce((sum, count) => sum + count, 0);
        if (carrying + total > trip.bodyguards) throw refusal({ code: 'TOO_MANY_GUNS', blockedReason: `One gun each: ${trip.bodyguards - carrying} bodyguard${trip.bodyguards - carrying === 1 ? '' : 's'} still unarmed.` });
        const allowed = new Set(rentableWeapons(current));
        const locked = (Object.keys(wanted) as WeaponKey[]).find((key) => wanted[key] > 0 && !allowed.has(key));
        if (locked) throw refusal({ code: 'NO_WEAPON_ACCESS', blockedReason: 'Tommy only rents what he would sell you at home.' });
        const rentCents = gunRentCents(rules, wanted);
        if (rentCents > trip.bankrollCents) throw refusal({ code: 'NOT_ENOUGH_BANKROLL', blockedReason: 'Your bankroll cannot cover the rent. Nothing is wired from home.' });
        const rentedGuns = { PISTOL: held.PISTOL + wanted.PISTOL, SHOTGUN: held.SHOTGUN + wanted.SHOTGUN, TEK9: held.TEK9 + wanted.TEK9, AK47: held.AK47 + wanted.AK47 };
        const updated = await tx.bossTrip.update({
          where: { id: trip.id },
          data: { bankrollCents: trip.bankrollCents - rentCents, gunRentCents: trip.gunRentCents + rentCents, rentedGuns },
        });
        return {
          next: { ...current, awayNetWorthCents: await totalAwayWorth(tx, roundPlayerId, base) },
          result: { tripId: trip.id, guns: rentedGuns, rentCents: Number(rentCents), bankrollCents: Number(updated.bankrollCents) },
          ledger: rentCents > 0n ? [{ source: 'TRIP_RENT_GUNS', label: `Gun rent · ${cityName(base, trip.city)}`, amountCents: -rentCents }] : [],
        };
      },
    });
  },

  /** Check out now and fly home. Refunds nothing. */
  headHome(prisma: PrismaClient, roundPlayerId: string, input: TripHeadHomeInput): Promise<GameActionResult<TripHeadHomeResult>> {
    return ActionService.run<TripHeadHomeResult>(prisma, roundPlayerId, {
      action: 'TRIP_HEAD_HOME',
      actionId: input.actionId,
      execute: async ({ tx, current, now }) => {
        const trip = await requireActiveTrip(tx, roundPlayerId);
        const plan = planTripHeadHome(trip, now);
        if (!plan) throw AppError.conflict('NOT_IN_TOWN', 'The boss can only check out from the hotel.');
        await tx.bossTrip.update({ where: { id: trip.id }, data: plan });
        return {
          next: current,
          result: { tripId: trip.id, returnsAt: plan.returnsAt.toISOString() },
          ledger: [],
        };
      },
    });
  },
};
