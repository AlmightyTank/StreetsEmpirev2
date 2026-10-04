import type { PrismaClient } from '@prisma/client';
import {
  casinoBasisToCents,
  casinoMaxBankrollCents,
  casinoStatusTier,
  casinoStatusTiers,
  casinoTierByKey,
  casinoVipAccess,
  checkExtend,
  rateCasinoHouseTake,
  rateCasinoWager,
  tripRules,
  type CasinoRatingDelta,
  type CasinoVipAccess,
  type Ruleset,
} from '@streets/rules-engine';
import type { CasinoRoom, CasinoRules, CasinoStatusRules, CasinoStatusTierRules, CasinoVenueRules } from '@streets/rulesets';
import type { CasinoStatusDto, CasinoStatusTierDto, CasinoVenueDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActivityService } from './activity.service.js';
import { bossPresence } from './boss-presence.service.js';

/**
 * 1.2.0-E — High Rollers & City Identity.
 *
 * Rated play, casino status, comps and VIP rooms. Every game service calls in here
 * after it has charged a wager, inside the same player-locked transaction, and
 * before it starts a new VIP table game. Nothing here is passed to a game's RNG,
 * shuffle, roll or payout: status changes where you may sit, never what you win.
 */

type DbLike = Db | PrismaClient;
type StatusPlayer = { id: string; city: { slug: string } };

const CASINO_FRONT = 'CASINO_FRONT';

function tierDto(tier: CasinoStatusTierRules): CasinoStatusTierDto {
  return {
    key: tier.key,
    name: tier.name,
    minTheoCents: tier.minTheoCents,
    compRateBps: tier.compRateBps,
    maxBankrollCents: tier.maxBankrollCents,
  };
}

/** Round-to-date theoretical house win across every casino city. */
export async function casinoTheoCents(db: DbLike, roundPlayerId: string): Promise<bigint> {
  const total = await db.casinoRating.aggregate({ where: { roundPlayerId }, _sum: { theoBasis: true } });
  return casinoBasisToCents(total._sum.theoBasis ?? 0n);
}

/** Comps earned minus comps spent, in whole cents. */
export async function casinoCompBalanceCents(db: DbLike, roundPlayerId: string): Promise<bigint> {
  const rows = await db.casinoRating.findMany({ where: { roundPlayerId }, select: { compBasis: true, compsSpentCents: true } });
  const earned = casinoBasisToCents(rows.reduce((sum, row) => sum + row.compBasis, 0n));
  const spent = rows.reduce((sum, row) => sum + row.compsSpentCents, 0n);
  return earned > spent ? earned - spent : 0n;
}

/** The session bankroll ceiling for this player's current status. */
export async function casinoSessionMaxCents(db: DbLike, casino: CasinoRules, roundPlayerId: string): Promise<number> {
  if (!casino.status) return casino.session.maxBankrollCents;
  return casinoMaxBankrollCents(casino, await casinoTheoCents(db, roundPlayerId));
}

/**
 * Operating Casino Fronts by city slug: built, staffed by this crew and on a block
 * this crew still holds. Only the best level per city counts.
 */
async function operatingFronts(db: DbLike, roundPlayerId: string, status: CasinoStatusRules): Promise<Map<string, number>> {
  const rules = status.casinoFront;
  if (!rules) return new Map();
  const rows = await db.business.findMany({
    where: {
      kind: CASINO_FRONT,
      level: { gte: rules.minLevel },
      staff: { gt: 0 },
      staffOwnerId: roundPlayerId,
      turf: { holderId: roundPlayerId },
    },
    select: { level: true, turf: { select: { city: { select: { slug: true } } } } },
  });
  const byCity = new Map<string, number>();
  for (const row of rows) {
    const slug = row.turf.city.slug;
    byCity.set(slug, Math.max(byCity.get(slug) ?? 0, row.level));
  }
  return byCity;
}

/** Who walked into the room with the boss. A boss at home is never a visitor. */
async function bossCompany(db: DbLike, ruleset: Ruleset, player: StatusPlayer, now: Date): Promise<{ visiting: boolean; companions: number }> {
  const presence = await bossPresence(db, ruleset, player.id, now);
  if (!presence) return { visiting: false, companions: 0 };
  if (presence.via === 'trip' && presence.tripId) {
    const trip = await db.bossTrip.findUnique({ where: { id: presence.tripId }, select: { bodyguards: true, woundedBodyguards: true } });
    return { visiting: true, companions: Math.max(0, (trip?.bodyguards ?? 0) - (trip?.woundedBodyguards ?? 0)) };
  }
  const run = await db.run.findFirst({
    where: { roundPlayerId: player.id, status: 'ACTIVE', bossAboard: true },
    orderBy: [{ launchedAt: 'asc' }, { id: 'asc' }],
    select: { escortThugs: true, woundedEscorts: true },
  });
  return { visiting: true, companions: Math.max(0, (run?.escortThugs ?? 0) - (run?.woundedEscorts ?? 0)) };
}

/** Whether the boss gets past the VIP door at the venue in `citySlug`. */
export async function casinoVipAccessAt(
  db: DbLike,
  ruleset: Ruleset,
  player: StatusPlayer,
  citySlug: string,
  now: Date,
): Promise<CasinoVipAccess> {
  const casino = ruleset.casino;
  const venue = casino?.venues[citySlug];
  if (!casino?.status || !venue?.vipRoom) return { allowed: false, via: null, reason: 'This casino has no VIP room.' };
  const [theoCents, fronts, company] = await Promise.all([
    casinoTheoCents(db, player.id),
    operatingFronts(db, player.id, casino.status),
    bossCompany(db, ruleset, player, now),
  ]);
  return casinoVipAccess(casino.status, {
    venue,
    theoCents,
    frontLevel: fronts.get(citySlug) ?? 0,
    visiting: company.visiting,
    companions: company.companions,
  });
}

/**
 * Refuse a new game at a VIP table the boss cannot get into. Follow-up actions on a
 * hand or point already in play never call this, so a live game can always finish.
 */
export async function assertCasinoRoomAccess(
  db: DbLike,
  ruleset: Ruleset,
  player: StatusPlayer,
  citySlug: string,
  table: { room?: CasinoRoom; name: string },
  now: Date,
): Promise<void> {
  if (table.room !== 'VIP') return;
  const access = await casinoVipAccessAt(db, ruleset, player, citySlug, now);
  if (!access.allowed) {
    throw AppError.conflict('VIP_ROOM_LOCKED', access.reason ?? table.name + ' is in the VIP room.');
  }
}

/** Availability for a table list: the VIP door is resolved once per page. */
export async function casinoTableAvailability(
  db: DbLike,
  ruleset: Ruleset,
  player: StatusPlayer,
  citySlug: string | null,
  now: Date,
) {
  const venue = citySlug ? ruleset.casino?.venues[citySlug] : undefined;
  let door: Promise<CasinoVipAccess> | null = null;
  return async (table: { room?: CasinoRoom; venueKinds: readonly string[] }) => {
    const room: 'FLOOR' | 'VIP' = table.room === 'VIP' ? 'VIP' : 'FLOOR';
    if (!venue || !citySlug || !table.venueKinds.includes(venue.kind)) {
      return { room, availableHere: false, lockedReason: null };
    }
    if (room === 'FLOOR') return { room, availableHere: true, lockedReason: null };
    door ??= casinoVipAccessAt(db, ruleset, player, citySlug, now);
    const vip = await door;
    return { room, availableHere: vip.allowed, lockedReason: vip.allowed ? null : vip.reason };
  };
}

async function applyRating(
  tx: Db,
  ruleset: Ruleset,
  roundPlayerId: string,
  cityId: string,
  wageredCents: bigint,
  rate: (status: CasinoStatusRules, theoBeforeCents: bigint, compBonusBps: number) => CasinoRatingDelta,
  now: Date,
): Promise<void> {
  const status = ruleset.casino?.status;
  if (!status) return;
  const theoBefore = await casinoTheoCents(tx, roundPlayerId);
  let compBonusBps = 0;
  if (status.casinoFront?.compBonusBps) {
    const city = await tx.city.findUnique({ where: { id: cityId }, select: { slug: true } });
    const fronts = await operatingFronts(tx, roundPlayerId, status);
    if (city && fronts.has(city.slug)) compBonusBps = status.casinoFront.compBonusBps;
  }
  const delta = rate(status, theoBefore, compBonusBps);
  await tx.casinoRating.upsert({
    where: { roundPlayerId_cityId: { roundPlayerId, cityId } },
    update: {
      wageredCents: { increment: wageredCents },
      theoBasis: { increment: delta.theoBasis },
      compBasis: { increment: delta.compBasis },
      ratedWagers: { increment: 1 },
      lastRatedAt: now,
    },
    create: {
      roundPlayerId,
      cityId,
      wageredCents,
      theoBasis: delta.theoBasis,
      compBasis: delta.compBasis,
      ratedWagers: 1,
      lastRatedAt: now,
    },
  });

  const before = casinoStatusTier(status, theoBefore);
  const after = casinoStatusTier(status, await casinoTheoCents(tx, roundPlayerId));
  if (after.index > before.index) {
    await ActivityService.log(tx, roundPlayerId, 'CASINO_STATUS_UP', {
      tierKey: after.tier.key,
      tierName: after.tier.name,
      maxBankrollCents: after.tier.maxBankrollCents,
      compRateBps: after.tier.compRateBps,
    });
  }
}

export const CasinoStatusService = {
  /**
   * Rate one charged wager at the posted edge. Call only after the chips have left the
   * bankroll, inside the same transaction, so a replayed action can never rate twice.
   */
  rateWager(
    tx: Db,
    ruleset: Ruleset,
    input: { roundPlayerId: string; cityId: string; wagerCents: bigint; edgeBps: number; now: Date },
  ): Promise<void> {
    if (input.wagerCents <= 0n) return Promise.resolve();
    return applyRating(
      tx, ruleset, input.roundPlayerId, input.cityId, input.wagerCents,
      (status, theoBeforeCents, compBonusBps) => rateCasinoWager(status, { wagerCents: input.wagerCents, edgeBps: input.edgeBps, theoBeforeCents, compBonusBps }),
      input.now,
    );
  },

  /** Rate a real house take, such as poker rake, one-for-one as theo. */
  rateHouseTake(
    tx: Db,
    ruleset: Ruleset,
    input: { roundPlayerId: string; cityId: string; takeCents: bigint; now: Date },
  ): Promise<void> {
    if (input.takeCents <= 0n) return Promise.resolve();
    return applyRating(
      tx, ruleset, input.roundPlayerId, input.cityId, 0n,
      (status, theoBeforeCents, compBonusBps) => rateCasinoHouseTake(status, { takeCents: input.takeCents, theoBeforeCents, compBonusBps }),
      input.now,
    );
  },

  venueExtras(casino: CasinoRules, venue: CasinoVenueRules): Pick<CasinoVenueDto, 'identity' | 'vipRoom'> {
    const status = casino.status;
    return {
      identity: venue.identity ? { ...venue.identity } : null,
      vipRoom: status && venue.vipRoom
        ? {
            name: venue.vipRoom.name,
            blurb: venue.vipRoom.blurb,
            minTierKey: venue.vipRoom.minTier,
            minTierName: casinoTierByKey(status, venue.vipRoom.minTier)?.name ?? venue.vipRoom.minTier,
            visitorMinBodyguards: venue.vipRoom.visitorMinBodyguards,
          }
        : null,
    };
  },

  /** The status panel on the Casino page. Null on rulesets without rated play. */
  async page(
    db: DbLike,
    ruleset: Ruleset,
    player: StatusPlayer & { round: { endsAt: Date } },
    currentCitySlug: string | null,
    now: Date,
  ): Promise<CasinoStatusDto | null> {
    const casino = ruleset.casino;
    const status = casino?.status;
    if (!casino?.enabled || !status) return null;

    const [ratings, fronts, trip] = await Promise.all([
      db.casinoRating.findMany({ where: { roundPlayerId: player.id }, include: { city: true } }),
      operatingFronts(db, player.id, status),
      db.bossTrip.findFirst({ where: { roundPlayerId: player.id, status: 'ACTIVE' } }),
    ]);
    const theoCents = casinoBasisToCents(ratings.reduce((sum, row) => sum + row.theoBasis, 0n));
    const compsEarned = casinoBasisToCents(ratings.reduce((sum, row) => sum + row.compBasis, 0n));
    const compsSpent = ratings.reduce((sum, row) => sum + row.compsSpentCents, 0n);
    const compBalance = compsEarned > compsSpent ? compsEarned - compsSpent : 0n;
    const position = casinoStatusTier(status, theoCents);

    const cities = ratings
      .filter((row) => casino.venues[row.city.slug] !== undefined)
      .map((row) => ({
        citySlug: row.city.slug,
        cityName: row.city.name,
        venueName: casino.venues[row.city.slug]!.name,
        theoCents: Number(casinoBasisToCents(row.theoBasis)),
        wageredCents: Number(row.wageredCents),
      }))
      .sort((left, right) => right.theoCents - left.theoCents || left.citySlug.localeCompare(right.citySlug));

    const frontCities = [...fronts.entries()].filter(([slug]) => casino.venues[slug] !== undefined);
    const frontCityRows = frontCities.length
      ? await db.city.findMany({ where: { slug: { in: frontCities.map(([slug]) => slug) } }, select: { slug: true, name: true } })
      : [];
    const frontCityName = new Map(frontCityRows.map((row) => [row.slug, row.name]));

    const venueHere = currentCitySlug ? casino.venues[currentCitySlug] : undefined;
    let vipHere: CasinoStatusDto['vipHere'] = null;
    if (currentCitySlug && venueHere?.vipRoom) {
      const access = await casinoVipAccessAt(db, ruleset, player, currentCitySlug, now);
      vipHere = { citySlug: currentCitySlug, roomName: venueHere.vipRoom.name, allowed: access.allowed, via: access.via, reason: access.reason };
    }

    let hotelComp: CasinoStatusDto['hotelComp'] = null;
    const trips = tripRules(ruleset);
    if (trip && trips && status.comps.hotelExtensions) {
      const check = checkExtend(ruleset, { trip: { ...trip, bankrollCents: compBalance }, blocks: 1, now, roundEndsAt: player.round.endsAt });
      const tripCityName = ruleset.cities?.[trip.city]?.name ?? trip.city;
      hotelComp = {
        tripId: trip.id,
        citySlug: trip.city,
        cityName: tripCityName,
        stayUntil: trip.stayUntil.toISOString(),
        blockMinutes: trips.extendMinutes,
        blockCompCents: Number(check.hotelCents),
        blockedReason: !casino.venues[trip.city]
          ? 'There is no casino in ' + tripCityName + ' to comp the room.'
          : check.code === 'NOT_ENOUGH_BANKROLL'
            ? 'Not enough comps for another block yet.'
            : check.blockedReason,
      };
    }

    return {
      tier: tierDto(position.tier),
      nextTier: position.next ? tierDto(position.next) : null,
      progressBps: position.progressBps,
      theoCents: Number(theoCents),
      wageredCents: Number(ratings.reduce((sum, row) => sum + row.wageredCents, 0n)),
      compsEarnedCents: Number(compsEarned),
      compsSpentCents: Number(compsSpent),
      compBalanceCents: Number(compBalance),
      frontCompBonusBps: currentCitySlug && fronts.has(currentCitySlug) ? status.casinoFront?.compBonusBps ?? 0 : 0,
      maxBankrollCents: casinoMaxBankrollCents(casino, theoCents),
      tiers: casinoStatusTiers(status).map(tierDto),
      vipHere,
      casinoFronts: frontCities
        .map(([slug, level]) => ({
          citySlug: slug,
          cityName: frontCityName.get(slug) ?? slug,
          venueName: casino.venues[slug]!.name,
          level,
          grantsVip: Boolean(status.casinoFront?.grantsVipAccess && casino.venues[slug]!.vipRoom),
        }))
        .sort((left, right) => left.citySlug.localeCompare(right.citySlug)),
      cities,
      homeRoomCitySlug: cities.find((row) => row.theoCents > 0)?.citySlug ?? null,
      hotelComp,
    };
  },
};
