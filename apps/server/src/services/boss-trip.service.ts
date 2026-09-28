import type { BossTrip, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  checkExtend,
  checkTrip,
  hotelCents,
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
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { activeTrip, bossRun } from './boss-trip-settle.service.js';
import { BossHitService } from './boss-hit.service.js';
import { totalAwayWorth } from './run-settle.service.js';

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;

function requireTrips(ruleset: Ruleset) {
  const rules = tripRules(ruleset);
  if (!rules) throw AppError.conflict('TRIPS_DISABLED', 'The boss stays home this round.');
  return rules;
}

function refusal(check: { code: string | null; blockedReason: string | null }): AppError {
  const code = check.code ?? 'TRIP_BLOCKED';
  const message = check.blockedReason ?? 'You cannot travel right now.';
  const bad = ['UNKNOWN_CITY', 'ALREADY_HOME', 'BAD_STAY', 'BAD_BANKROLL', 'OVER_CARRY_ON', 'NOT_ENOUGH_CASH', 'NOT_ENOUGH_TURNS', 'BAD_EXTENSION', 'NOT_ENOUGH_BANKROLL'];
  return bad.includes(code) ? AppError.badRequest(code, message, { trip: message }) : AppError.conflict(code, message);
}

function tripDto(ruleset: Ruleset, trip: BossTrip, roundEndsAt: Date, now: Date, hitLandsAt: Date | null = null): TripDto | null {
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
      },
      bossRun: riding ? { runId: riding.id, cityName: cityName(ruleset, ridingTo!) } : null,
      laidUpUntil: player.laidUpUntil && player.laidUpUntil > now ? player.laidUpUntil.toISOString() : null,
      cutoffAt: general.cutoffAt.toISOString(),
      blockedReason: blocked?.blockedReason ?? null,
      blockedCode: blocked?.code ?? null,
      blockedUntil: blocked?.blockedUntil?.toISOString() ?? null,
      destinations: destinations.map((slug) => ({ slug, name: cityName(ruleset, slug), hotelCentsPerHour: Number(hotelCents(rules, slug, 60)) })),
      trip: trip ? tripDto(ruleset, trip, roundEndsAt, now, await BossHitService.seenComing(db, ruleset, player, trip.id, now)) : null,
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
        });
        if (check.blockedReason) throw refusal(check);
        const to = await tx.city.findUnique({ where: { slug: input.to }, select: { isEnabled: true } });
        if (!to?.isEnabled) throw AppError.badRequest('UNKNOWN_CITY', 'That city is not on the map.', { to: 'Pick a city.' });

        const rules = requireTrips(base);
        const trip = await tx.bossTrip.create({
          data: {
            roundPlayerId,
            mode: 'FLY',
            homeCity: player.city.slug,
            city: input.to,
            bankrollCents,
            startBankrollCents: bankrollCents,
            ticketCents: check.ticketCents,
            hotelCents: check.hotelCents,
            turnsSpent: rules.launchTurns,
            ...check.times,
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
          arrivesAt: check.times.arrivesAt.toISOString(),
          stayUntil: check.times.stayUntil.toISOString(),
          returnsAt: check.times.returnsAt.toISOString(),
        };
        const where = cityName(base, input.to);
        return {
          next: {
            ...current,
            turns: current.turns - rules.launchTurns,
            cashCents: current.cashCents - check.totalCents,
            awayNetWorthCents: await totalAwayWorth(tx, roundPlayerId, base),
          },
          result,
          // The bankroll is a transfer: it comes home. The ticket and the hotel are spent.
          ledger: [
            { source: 'TRIP_LAUNCH', label: `Flight · ${where}`, amountCents: -check.ticketCents },
            ...(check.hotelCents > 0n ? [{ source: 'TRIP_LAUNCH', label: `Hotel · ${where}`, amountCents: -check.hotelCents }] : []),
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
