import type { Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import { loadRulesetForRound, runPosition, tripPosition, tripRules, type Ruleset } from '@streets/rules-engine';
import type { GameActionResult, TripOutpostVisitInput, TripOutpostVisitResult, TripPanelDto } from '@streets/shared';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { ActivityService } from './activity.service.js';
import { allianceTargetBlock } from './alliance.service.js';
import { toStopPlans, totalAwayWorth } from './run-settle.service.js';
import { lockOutpost, outpostBoxWorthCents } from './turf.service.js';

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const districtName = (ruleset: Ruleset, city: string, district: string) =>
  ruleset.cities?.[city]?.districts?.[district as keyof Ruleset['districts']]?.name
  ?? ruleset.districts[district as keyof Ruleset['districts']]?.name
  ?? district;

/** Trips D2. Where a boss is in person, away from home: in town on a flight trip, or in town with their run. */
export interface BossPresence {
  city: string;
  via: 'trip' | 'run';
  tripId: string | null;
}

export async function bossPresence(db: Db | PrismaClient, ruleset: Ruleset, playerId: string, now: Date): Promise<BossPresence | null> {
  const trip = await db.bossTrip.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' } });
  if (trip && tripPosition(trip, now).phase === 'town') return { city: trip.city, via: 'trip', tripId: trip.id };
  const run = await db.run.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE', bossAboard: true }, include: { stops: { orderBy: { order: 'asc' } } } });
  if (run) {
    const position = runPosition(ruleset, toStopPlans(run.stops), now);
    if (position.phase === 'town') return { city: position.city, via: 'run', tripId: null };
  }
  return null;
}

/** Trips D2. The city a boss is standing in: where they are visiting, or home if they are not away at all. */
async function standingIn(db: Db | PrismaClient, ruleset: Ruleset, player: { id: string; movingUntil: Date | null; city: { slug: string } }, now: Date): Promise<{ city: string; visiting: boolean } | null> {
  const presence = await bossPresence(db, ruleset, player.id, now);
  if (presence) return { city: presence.city, visiting: true };
  // A boss moving house is on the road, though their home is still the old city until arrival.
  if (player.movingUntil && player.movingUntil > now) return null;
  const [trips, runs] = await Promise.all([
    db.bossTrip.count({ where: { roundPlayerId: player.id, status: 'ACTIVE' } }),
    db.run.count({ where: { roundPlayerId: player.id, status: 'ACTIVE', bossAboard: true } }),
  ]);
  return trips + runs > 0 ? null : { city: player.city.slug, visiting: false };
}

/** Trips D2. Why these two crews cannot hit each other: a sit-down's truce. Null when they can. */
export async function truceBlock(db: Db | PrismaClient, a: string, b: string, now: Date): Promise<string | null> {
  const truce = await db.sitDown.findFirst({
    where: { status: 'AGREED', truceUntil: { gt: now }, OR: [{ proposerId: a, inviteeId: b }, { proposerId: b, inviteeId: a }] },
    orderBy: { truceUntil: 'desc' },
  });
  if (!truce?.truceUntil) return null;
  return `You sat down with them. The truce holds until ${truce.truceUntil.toISOString().slice(11, 16)} UTC.`;
}

/** Trips D2. Every crew this player has a truce with right now, and the reason to show against them. */
export async function trucesFor(db: Db | PrismaClient, playerId: string, now: Date): Promise<Map<string, string>> {
  const rows = await db.sitDown.findMany({
    where: { status: 'AGREED', truceUntil: { gt: now }, OR: [{ proposerId: playerId }, { inviteeId: playerId }] },
    select: { proposerId: true, inviteeId: true, truceUntil: true },
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    const other = row.proposerId === playerId ? row.inviteeId : row.proposerId;
    map.set(other, `You sat down with them. The truce holds until ${row.truceUntil!.toISOString().slice(11, 16)} UTC.`);
  }
  return map;
}

/**
 * Trips D2. The boss in person: walking an outpost, and sitting down with other bosses.
 * Both need the boss to be somewhere in person, so both read `bossPresence`.
 */
export const BossPresenceService = {
  /** The presence, outpost and sit-down parts of the trip panel. */
  async panel(db: Db | PrismaClient, ruleset: Ruleset, player: RoundPlayer & { city: { slug: string } }, now: Date): Promise<Pick<TripPanelDto, 'presence' | 'outpostsHere' | 'sitDowns'>> {
    const rules = tripRules(ruleset);
    const presence = rules ? await bossPresence(db, ruleset, player.id, now) : null;
    const outposts = presence && rules?.outpostVisits
      ? await db.turfOutpost.findMany({ where: { ownerId: player.id, turf: { city: { slug: presence.city } } }, include: { turf: { select: { district: true } } } })
      : [];
    const sit = rules?.sitDowns;
    let sitDowns: TripPanelDto['sitDowns'] = null;
    if (sit) {
      const [incoming, outgoing, truces, candidates] = await Promise.all([
        db.sitDown.findMany({ where: { inviteeId: player.id, status: 'PENDING', expiresAt: { gt: now } }, include: { proposer: true }, orderBy: { proposedAt: 'desc' } }),
        db.sitDown.findMany({ where: { proposerId: player.id, status: 'PENDING', expiresAt: { gt: now } }, include: { invitee: true }, orderBy: { proposedAt: 'desc' } }),
        db.sitDown.findMany({ where: { status: 'AGREED', truceUntil: { gt: now }, OR: [{ proposerId: player.id }, { inviteeId: player.id }] }, include: { proposer: true, invitee: true } }),
        sitDownCandidates(db, ruleset, player, now),
      ]);
      sitDowns = {
        truceHours: sit.truceHours,
        candidates,
        incoming: incoming.map((row) => ({ id: row.id, from: { publicPimpId: row.proposer.publicPimpId, displayName: row.proposer.displayName }, cityName: cityName(ruleset, row.city), expiresAt: row.expiresAt.toISOString() })),
        outgoing: outgoing.map((row) => ({ id: row.id, to: { publicPimpId: row.invitee.publicPimpId, displayName: row.invitee.displayName }, cityName: cityName(ruleset, row.city), expiresAt: row.expiresAt.toISOString() })),
        truces: truces.map((row) => {
          const other = row.proposerId === player.id ? row.invitee : row.proposer;
          return { with: { publicPimpId: other.publicPimpId, displayName: other.displayName }, until: row.truceUntil!.toISOString() };
        }),
      };
    }
    return {
      presence: presence ? { city: presence.city, cityName: cityName(ruleset, presence.city), via: presence.via } : null,
      outpostsHere: outposts.map((box) => ({
        id: box.id,
        district: box.turf.district,
        districtName: districtName(ruleset, presence!.city, box.turf.district),
        cashCents: Number(box.cashCents),
        moraleUntil: box.moraleUntil && box.moraleUntil > now ? box.moraleUntil.toISOString() : null,
        canCollect: presence!.via === 'trip' && box.cashCents > 0n,
      })),
      sitDowns,
    };
  },

  /**
   * Trips D2. Walk an outpost in the city the boss is in: its corner crew stays put for the
   * ruleset's hours whatever the box holds, and a boss who flew in can carry the box's cash
   * in the bankroll, up to the carry-on cap. It flies home with them, and can be taken off
   * them by a hit, like any bankroll.
   */
  visitOutpost(prisma: PrismaClient, roundPlayerId: string, input: TripOutpostVisitInput): Promise<GameActionResult<TripOutpostVisitResult>> {
    return ActionService.run<TripOutpostVisitResult>(prisma, roundPlayerId, {
      action: 'OUTPOST_VISIT',
      actionId: input.actionId,
      execute: async ({ tx, current, round, now }) => {
        const base = loadRulesetForRound(round);
        const rules = tripRules(base);
        if (!rules?.outpostVisits || !base.turf?.outposts) throw AppError.conflict('NO_VISITS', 'The boss never visits an outpost this round.');
        const presence = await bossPresence(tx, base, roundPlayerId, now);
        if (!presence) throw AppError.conflict('NOT_IN_TOWN', 'The boss has to be in town to walk a corner.');
        const box = await tx.turfOutpost.findUnique({ where: { id: input.outpostId }, include: { turf: { include: { city: { select: { slug: true } } } } } });
        if (!box || box.ownerId !== roundPlayerId) throw AppError.notFound('OUTPOST_NOT_FOUND', 'That is not one of your outposts.');
        if (box.turf.city.slug !== presence.city) throw AppError.conflict('WRONG_CITY', `That outpost is in ${cityName(base, box.turf.city.slug)}; the boss is in ${cityName(base, presence.city)}.`);
        await lockOutpost(tx, box.id);
        const fresh = await tx.turfOutpost.findUniqueOrThrow({ where: { id: box.id } });

        let collected = 0n;
        if (input.collectCents > 0) {
          if (presence.via !== 'trip' || !presence.tripId) throw AppError.badRequest('BAD_COLLECT', 'A run moves box cash with its own transfer; the boss carries cash only off a plane.', { collectCents: 'Only on a flight trip.' });
          const trip = await tx.bossTrip.findUniqueOrThrow({ where: { id: presence.tripId } });
          const room = BigInt(rules.carryOnCapCents) - trip.bankrollCents;
          const wanted = BigInt(input.collectCents);
          collected = [wanted, fresh.cashCents, room > 0n ? room : 0n].reduce((low, value) => (value < low ? value : low));
          if (collected > 0n) await tx.bossTrip.update({ where: { id: trip.id }, data: { bankrollCents: trip.bankrollCents + collected } });
        }
        const moraleUntil = new Date(now.getTime() + rules.outpostVisits.moraleHours * 3_600_000);
        const products = fresh.products as Record<string, number>;
        const before = outpostBoxWorthCents(base, { cashCents: fresh.cashCents, beer: fresh.beer, products });
        await tx.turfOutpost.update({ where: { id: box.id }, data: { visitedAt: now, moraleUntil, cashCents: fresh.cashCents - collected } });
        const after = outpostBoxWorthCents(base, { cashCents: fresh.cashCents - collected, beer: fresh.beer, products });
        const result: TripOutpostVisitResult = {
          outpostId: box.id,
          districtName: districtName(base, presence.city, box.turf.district),
          cityName: cityName(base, presence.city),
          moraleUntil: moraleUntil.toISOString(),
          collectedCents: Number(collected),
        };
        return {
          next: {
            ...current,
            outpostNetWorthCents: current.outpostNetWorthCents + (after - before),
            awayNetWorthCents: await totalAwayWorth(tx, roundPlayerId, base),
          },
          result,
          ledger: [],
          activity: { type: 'OUTPOST_VISIT', payload: { ...result } as unknown as Prisma.InputJsonValue },
        };
      },
    });
  },

  /** Trips D2. Propose a sit-down to a boss in the same city. At least one of you must be visiting. */
  async propose(prisma: PrismaClient, proposerId: string, targetPublicPimpId: number, now: Date = new Date()): Promise<{ sitDownId: string; expiresAt: string }> {
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, proposerId);
      const proposer = await tx.roundPlayer.findUniqueOrThrow({ where: { id: proposerId }, include: { city: true, round: true } });
      const base = loadRulesetForRound(proposer.round);
      const rules = tripRules(base)?.sitDowns;
      if (!rules) throw AppError.conflict('NO_SIT_DOWNS', 'Nobody sits down this round.');
      const target = await tx.roundPlayer.findFirst({ where: { roundId: proposer.roundId, publicPimpId: targetPublicPimpId }, include: { city: true } });
      if (!target || target.id === proposerId || target.accountId === proposer.accountId) throw AppError.badRequest('BAD_TARGET', 'Pick another boss.');
      const reason = await sitDownBlock(tx, base, proposer, target, now);
      if (reason) throw AppError.conflict('CANNOT_SIT_DOWN', reason.message);
      if (await tx.sitDown.findFirst({ where: { proposerId, inviteeId: target.id, status: 'PENDING', expiresAt: { gt: now } } })) {
        throw AppError.conflict('ALREADY_ASKED', 'You already asked them. Give them a moment.');
      }
      // A stale invitation between the same two would block the new one.
      await tx.sitDown.updateMany({ where: { proposerId, inviteeId: target.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      const here = (await standingIn(tx, base, proposer, now))!;
      const expiresAt = new Date(now.getTime() + rules.inviteMinutes * 60_000);
      const row = await tx.sitDown.create({ data: { roundId: proposer.roundId, city: here.city, proposerId, inviteeId: target.id, proposedAt: now, expiresAt } });
      await ActivityService.log(tx, proposerId, 'SIT_DOWN', { with: target.displayName, cityName: cityName(base, row.city) });
      return { sitDownId: row.id, expiresAt: expiresAt.toISOString() };
    });
  },

  /** Trips D2. Answer a sit-down. Agreeing needs both bosses still there. */
  async answer(prisma: PrismaClient, inviteeId: string, sitDownId: string, accept: boolean, now: Date = new Date()): Promise<{ status: 'AGREED' | 'DECLINED'; truceUntil: string | null }> {
    return prisma.$transaction(async (tx) => {
      const row = await tx.sitDown.findUnique({ where: { id: sitDownId } });
      if (!row || row.inviteeId !== inviteeId) throw AppError.notFound('SIT_DOWN_NOT_FOUND', 'Nobody asked you to that.');
      for (const id of [row.proposerId, row.inviteeId].sort()) await lockRoundPlayer(tx, id);
      const fresh = await tx.sitDown.findUniqueOrThrow({ where: { id: sitDownId } });
      if (fresh.status !== 'PENDING') throw AppError.conflict('ANSWERED', 'That sit-down has already been answered.');
      if (fresh.expiresAt <= now) {
        await tx.sitDown.update({ where: { id: sitDownId }, data: { status: 'EXPIRED' } });
        throw AppError.conflict('EXPIRED', 'Too late: they stopped waiting.');
      }
      if (!accept) {
        await tx.sitDown.update({ where: { id: sitDownId }, data: { status: 'DECLINED', answeredAt: now } });
        return { status: 'DECLINED' as const, truceUntil: null };
      }
      const [proposer, invitee] = await Promise.all([
        tx.roundPlayer.findUniqueOrThrow({ where: { id: fresh.proposerId }, include: { city: true, round: true } }),
        tx.roundPlayer.findUniqueOrThrow({ where: { id: fresh.inviteeId }, include: { city: true } }),
      ]);
      const base = loadRulesetForRound(proposer.round);
      const rules = tripRules(base)?.sitDowns;
      if (!rules) throw AppError.conflict('NO_SIT_DOWNS', 'Nobody sits down this round.');
      const reason = await sitDownBlock(tx, base, proposer, invitee, now);
      if (reason) throw AppError.conflict('CANNOT_SIT_DOWN', reason.message);
      const where = (await standingIn(tx, base, proposer, now))!.city;
      if (where !== fresh.city) throw AppError.conflict('CANNOT_SIT_DOWN', 'They have left the city they asked you to meet in.');
      const truceUntil = new Date(now.getTime() + rules.truceHours * 3_600_000);
      await tx.sitDown.update({ where: { id: sitDownId }, data: { status: 'AGREED', answeredAt: now, truceUntil } });
      for (const [me, other] of [[proposer, invitee], [invitee, proposer]] as const) {
        await ActivityService.log(tx, me.id, 'SIT_DOWN_AGREED', { with: other.displayName, cityName: cityName(base, fresh.city), truceUntil: truceUntil.toISOString() });
      }
      return { status: 'AGREED' as const, truceUntil: truceUntil.toISOString() };
    });
  },
};

/**
 * Trips D2. Why these two bosses cannot sit down right now: they must be standing in the
 * same city, at least one of them visiting, not allies, not already under a truce.
 */
async function sitDownBlock(
  db: Db | PrismaClient,
  ruleset: Ruleset,
  a: RoundPlayer & { city: { slug: string } },
  b: RoundPlayer & { city: { slug: string } },
  now: Date,
): Promise<{ message: string } | null> {
  const [here, there] = await Promise.all([standingIn(db, ruleset, a, now), standingIn(db, ruleset, b, now)]);
  if (!here) return { message: 'You are on the road or in the air. Sit down once you are in town.' };
  if (!there || there.city !== here.city) return { message: 'They are not in the same city as you.' };
  if (!here.visiting && !there.visiting) return { message: 'A sit-down takes a trip: one of you has to be visiting.' };
  const allied = allianceTargetBlock(a, b, now);
  if (allied) return { message: 'You are allies already.' };
  if (await truceBlock(db, a.id, b.id, now)) return { message: 'You already have a truce with them.' };
  return null;
}

/** Trips D2. Bosses the player could sit down with where they stand. */
async function sitDownCandidates(db: Db | PrismaClient, ruleset: Ruleset, player: RoundPlayer & { city: { slug: string } }, now: Date): Promise<NonNullable<TripPanelDto['sitDowns']>['candidates']> {
  const here = await standingIn(db, ruleset, player, now);
  if (!here) return [];
  const out: NonNullable<TripPanelDto['sitDowns']>['candidates'] = [];
  const add = async (other: RoundPlayer & { city: { slug: string }; alliance: { tag: string } | null }, how: 'lives here' | 'visiting') => {
    if (other.id === player.id || other.accountId === player.accountId || out.some((row) => row.publicPimpId === other.publicPimpId)) return;
    if (!(await sitDownBlock(db, ruleset, player, other, now))) {
      out.push({ publicPimpId: other.publicPimpId, displayName: other.displayName, allianceTag: other.alliance?.tag ?? null, how });
    }
  };
  // Visitors in town here: on a flight, or with their run.
  const trips = await db.bossTrip.findMany({
    where: { status: 'ACTIVE', city: here.city, roundPlayer: { roundId: player.roundId }, arrivesAt: { lte: now }, stayUntil: { gt: now } },
    include: { roundPlayer: { include: { city: true, alliance: { select: { tag: true } } } } },
  });
  for (const trip of trips) await add(trip.roundPlayer, 'visiting');
  const runs = await db.run.findMany({
    where: { status: 'ACTIVE', bossAboard: true, roundPlayer: { roundId: player.roundId } },
    include: { stops: { orderBy: { order: 'asc' } }, roundPlayer: { include: { city: true, alliance: { select: { tag: true } } } } },
  });
  for (const run of runs) {
    const position = runPosition(ruleset, toStopPlans(run.stops), now);
    if (position.phase === 'town' && position.city === here.city) await add(run.roundPlayer, 'visiting');
  }
  // A visitor can also sit down with the bosses who live here.
  if (here.visiting) {
    const city = await db.city.findUnique({ where: { slug: here.city }, select: { id: true } });
    const locals = city ? await db.roundPlayer.findMany({
      where: { roundId: player.roundId, cityId: city.id, account: { isActive: true } },
      include: { city: true, alliance: { select: { tag: true } } },
      take: 50,
    }) : [];
    for (const local of locals) await add(local, 'lives here');
  }
  return out;
}
