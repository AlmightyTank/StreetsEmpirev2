import type { PrismaClient, RoundPlayer } from '@prisma/client';
import {
  convoyRules,
  equipCombatSquad,
  hashParts,
  headsUpMinutes,
  huntedRules,
  loadRulesetForRound,
  seededRng,
  tripPosition,
  type Ruleset,
} from '@streets/rules-engine';
import type { BossHitBackupInput, BossHitBackupResult, BossHitDto, BossHitInput, BossHitResult, BossTargetDto, GameActionResult } from '@streets/shared';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs } from './action.service.js';
import { accountsShareNetwork } from './admin-signals.service.js';
import { allianceTargetBlock } from './alliance.service.js';
import type { BossHitCrew, BossHitOutcome } from './boss-trip-settle.service.js';
import { hideoutWeaponPriority } from './hideout.service.js';
import { truceBlock } from './boss-presence.service.js';
import { PlayerStateService } from './player-state.service.js';

const RECENT_MS = 24 * 60 * 60_000;
const NO_GUNS = { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 };
const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;

/** What an area recon keeps about a visiting boss it spotted. */
export type BossReconTarget = Omit<BossTargetDto, 'blockedReason' | 'maxSquad' | 'inTownNow'>;

function guardBand(standing: number): BossTargetDto['guards'] {
  return standing <= 0 ? 'none' : standing < 6 ? 'light' : 'armed';
}

function bankrollBand(cents: bigint): BossTargetDto['bankroll'] {
  const dollars = Number(cents) / 100;
  return dollars < 10_000 ? 'light' : dollars < 100_000 ? 'loaded' : 'heavy';
}

/**
 * Trips C. The bosses an area recon at `at` spots in the player's city: in town now, or
 * landing within the lookahead. A solo boss keeps a low profile, so each one is seen only
 * with the ruleset's chance, rolled per boss and per recon so a second look can find them.
 */
export async function scanBosses(db: Db | PrismaClient, ruleset: Ruleset, player: RoundPlayer & { city: { slug: string } }, roundId: string, at: Date, lookaheadMs: number): Promise<BossReconTarget[]> {
  const hunted = huntedRules(ruleset);
  if (!hunted) return [];
  const trips = await db.bossTrip.findMany({
    where: {
      status: 'ACTIVE',
      city: player.city.slug,
      roundPlayerId: { not: player.id },
      roundPlayer: { roundId },
      arrivesAt: { lt: new Date(at.getTime() + lookaheadMs) },
      stayUntil: { gt: at },
    },
    include: { roundPlayer: { include: { alliance: { select: { tag: true } } } } },
    orderBy: { arrivesAt: 'asc' },
  });
  return trips
    .filter((trip) => seededRng(hashParts(trip.id, 'boss-sight', at.toISOString()))() < hunted.soloSightChance)
    .map((trip) => ({
      tripId: trip.id,
      owner: { publicPimpId: trip.roundPlayer.publicPimpId, displayName: trip.roundPlayer.displayName, allianceTag: trip.roundPlayer.alliance?.tag ?? null },
      city: trip.city,
      cityName: cityName(ruleset, trip.city),
      inTownFrom: trip.arrivesAt.toISOString(),
      inTownUntil: trip.stayUntil.toISOString(),
      bankroll: bankrollBand(trip.bankrollCents),
      alone: trip.bodyguards - trip.woundedBodyguards <= 0,
      guards: guardBand(trip.bodyguards - trip.woundedBodyguards),
    }));
}

/**
 * Trips D2. How many thugs an ally can send to a boss's fight, and why not: they must
 * share the boss's alliance, live where the hit is, have been called, and have fit thugs.
 */
function backupLimit(
  ruleset: Ruleset,
  player: Pick<RoundPlayer, 'id' | 'allianceId' | 'lockedUntil' | 'movingUntil'> & { city: { slug: string } },
  hit: { ownerId: string; status: string; landsAt: Date; city: string; alliesCalledAt: Date | null; owner: { allianceId: string | null }; backups: Array<{ playerId: string }> },
  current: { thugs: number; woundedThugs: number; busyThugs: number; postedThugs?: number },
  now: Date,
): { max: number; reason: string | null } {
  const cap = ruleset.combat?.squadCap ?? 0;
  const fit = Math.min(fitThugs(current), cap);
  if (hit.status !== 'PENDING' || hit.landsAt <= now) return { max: 0, reason: 'Too late: it has already happened.' };
  if (hit.ownerId === player.id) return { max: 0, reason: 'That is your own fight.' };
  if (!player.allianceId || player.allianceId !== hit.owner.allianceId) return { max: 0, reason: 'Only their allies can answer.' };
  if (player.city.slug !== hit.city) return { max: 0, reason: `You do not live in ${cityName(ruleset, hit.city)}.` };
  if (!hit.alliesCalledAt) return { max: 0, reason: 'They have not called for help.' };
  if (hit.backups.some((backup) => backup.playerId === player.id)) return { max: 0, reason: 'You already sent help.' };
  if (player.lockedUntil && player.lockedUntil > now) return { max: 0, reason: 'You are locked up.' };
  if (player.movingUntil && player.movingUntil > now) return { max: 0, reason: 'You are moving house.' };
  return { max: fit, reason: fit < 1 ? 'You have no fit thugs to send.' : null };
}

/** Why this player cannot send a squad after a boss at all right now. */
function squadBlock(ruleset: Ruleset, player: RoundPlayer, turns: number, now: Date): string | null {
  const rules = convoyRules(ruleset);
  if (!rules || !huntedRules(ruleset)) return 'Nobody hunts a boss this round.';
  if (player.lockedUntil && player.lockedUntil > now) return 'You are locked up.';
  if (player.movingUntil && player.movingUntil > now) return 'You are moving house.';
  if (turns < rules.turnCost) return `A hit costs ${rules.turnCost} turns.`;
  return null;
}

type HitRow = {
  id: string; attackerId: string; ownerId: string; status: 'PENDING' | 'LANDED' | 'ESCAPED'; city: string; startedAt: Date; landsAt: Date; squad: number; result: unknown;
  alliesCalledAt: Date | null; backups: Array<{ playerId: string; thugs: number; wounded: number }>;
  attacker: { publicPimpId: number; displayName: string }; owner: { publicPimpId: number; displayName: string; allianceId: string | null };
};

function toHitDto(ruleset: Ruleset, player: Pick<RoundPlayer, 'id' | 'allianceId'>, hit: HitRow, answer: BossHitDto['answer'] = null, now: Date = new Date()): BossHitDto {
  const playerId = player.id;
  const role: BossHitDto['role'] = hit.attackerId === playerId ? 'attacker' : hit.ownerId === playerId ? 'owner' : 'ally';
  const pending = hit.status === 'PENDING' && hit.landsAt > now;
  const mine = hit.backups.find((backup) => backup.playerId === playerId);
  const outcome = hit.result as BossHitOutcome | null;
  return {
    id: hit.id,
    role,
    status: hit.status,
    cityName: cityName(ruleset, hit.city),
    startedAt: hit.startedAt.toISOString(),
    landsAt: hit.landsAt.toISOString(),
    squad: hit.squad,
    attacker: { publicPimpId: hit.attacker.publicPimpId, displayName: hit.attacker.displayName },
    owner: { publicPimpId: hit.owner.publicPimpId, displayName: hit.owner.displayName },
    alliesCalled: hit.alliesCalledAt !== null,
    backup: hit.backups.reduce((sum, backup) => sum + backup.thugs, 0),
    canCallAllies: role === 'owner' && pending && hit.alliesCalledAt === null && Boolean(huntedRules(ruleset) && ruleset.travel?.trips?.allyBackup && hit.owner.allianceId),
    answer: role === 'ally' && pending && !mine ? answer : null,
    report: outcome ? {
      escaped: outcome.escaped,
      held: outcome.held ?? false,
      cashCents: (role === 'attacker' ? 1 : -1) * Number(outcome.cashCents),
      laidUpUntil: outcome.laidUpUntil,
      yourWounds: role === 'attacker' ? outcome.attackerWounds ?? 0 : role === 'ally' ? mine?.wounded ?? 0 : outcome.defenderWounds ?? 0,
      opponentWounds: role === 'attacker' ? outcome.defenderWounds ?? 0 : outcome.attackerWounds ?? 0,
    } : null,
  };
}

/**
 * Trips C. Hitting a boss who is visiting where you live. It runs on the convoy clock: find
 * them with an area recon, commit a squad, and the hit lands when the window closes, in the
 * boss's own trip settle, whoever reads first. Nobody holds two locks.
 */
export const BossHitService = {
  hit(prisma: PrismaClient, attackerId: string, input: BossHitInput, now?: Date): Promise<GameActionResult<BossHitResult>> {
    return ActionService.run<BossHitResult>(prisma, attackerId, {
      action: 'BOSS_HIT',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, now: at }) => {
        const base = loadRulesetForRound(round);
        const rules = convoyRules(base);
        const model = base.combat;
        if (!rules || !model || !huntedRules(base)) throw AppError.conflict('HUNTING_DISABLED', 'Nobody hunts a boss this round.');
        const trip = await tx.bossTrip.findUnique({ where: { id: input.tripId }, include: { roundPlayer: true } });
        if (!trip || trip.status !== 'ACTIVE' || trip.roundPlayer.roundId !== round.id) throw AppError.notFound('TRIP_NOT_FOUND', 'That boss is not in town.');
        const owner = trip.roundPlayer;
        if (owner.id === attackerId || owner.accountId === player.accountId) throw AppError.badRequest('OWN_TRIP', 'That is you.');
        const allied = allianceTargetBlock(player, owner, at);
        if (allied) throw AppError.conflict('ALLIED', allied);
        if (await accountsShareNetwork(tx, player.accountId, owner.accountId, at)) {
          throw AppError.conflict('LINKED_ACCOUNTS', 'You have played from the same network as this crew, so you cannot hit their boss.');
        }
        const truce = await truceBlock(tx, attackerId, owner.id, at);
        if (truce) throw AppError.conflict('TRUCE', truce);
        const blocked = squadBlock(base, player, current.turns, at);
        if (blocked) throw AppError.conflict('HIT_BLOCKED', blocked);
        if (trip.city !== player.city.slug) throw AppError.conflict('OUT_OF_REACH', `That boss is in ${cityName(base, trip.city)}, not where you live.`);
        const recon = await tx.convoyRecon.findUnique({ where: { roundPlayerId: attackerId } });
        const spotted = Boolean(recon && recon.expiresAt > at && (recon.bossTargets as unknown as BossReconTarget[]).some((target) => target.tripId === trip.id));
        if (!spotted) throw AppError.conflict('NOT_SPOTTED', 'Recon the area first: you have not spotted that boss.');
        if (tripPosition(trip, at).phase !== 'town') throw AppError.conflict('NOT_IN_TOWN', 'That boss is not in town right now.');
        assertTurns(current.turns, rules.turnCost);
        if (trip.lastHitAt && trip.lastHitAt.getTime() + rules.rehitMinutes * 60_000 > at.getTime()) throw AppError.conflict('RECENTLY_HIT', 'That boss was hit a moment ago.');
        if (await tx.bossHit.findFirst({ where: { tripId: trip.id, status: 'PENDING' } })) throw AppError.conflict('ALREADY_HIT', 'Someone is already on that boss.');
        const squadOut = await tx.bossHit.findFirst({ where: { attackerId, status: 'PENDING' } })
          ?? await tx.convoyTail.findFirst({ where: { attackerId, status: 'PENDING' } });
        if (squadOut) throw AppError.conflict('SQUAD_OUT', 'Your squad is already out on a hit.');
        const maxSquad = Math.min(fitThugs(current), model.squadCap);
        if (maxSquad < 1) throw AppError.badRequest('NO_SQUAD', 'You have no fit thugs to send.', { squad: 'Nobody to send.' });
        if (input.squad > maxSquad) throw AppError.badRequest('SQUAD_TOO_BIG', `Send at most ${maxSquad}.`, { squad: `At most ${maxSquad}.` });

        const landsAt = new Date(at.getTime() + rules.warningMinutes * 60_000);
        // Trips D: the squad takes the best of the home arsenal, in case there are bodyguards.
        const squad = equipCombatSquad({
          thugs: Math.max(input.squad, fitThugs(current)),
          thugHappiness: player.thugHappiness,
          weapons: { PISTOL: current.pistols, SHOTGUN: current.shotguns, TEK9: current.tek9s, AK47: current.ak47s },
          weaponPriority: hideoutWeaponPriority(base, player),
        }, Math.min(input.squad, model.squadCap), model);
        const attackerCrew: BossHitCrew = { thugHappiness: player.thugHappiness, weapons: { ...NO_GUNS, ...squad.equipment } };
        const hit = await tx.bossHit.create({
          data: {
            tripId: trip.id, ownerId: owner.id, attackerId, city: trip.city, squad: input.squad,
            attackerCrew: JSON.parse(JSON.stringify(attackerCrew)),
            turnsSpent: rules.turnCost, actionId: input.actionId, startedAt: at, landsAt,
          },
        });
        const result: BossHitResult = { hitId: hit.id, landsAt: landsAt.toISOString(), city: trip.city, cityName: cityName(base, trip.city), squad: input.squad, turns: rules.turnCost };
        return {
          next: { ...current, turns: current.turns - rules.turnCost, busyThugs: current.busyThugs + input.squad },
          result,
          activity: { type: 'BOSS_HIT', payload: { ...result, owner: owner.displayName } },
        };
      },
    }, now);
  },

  /** Land every due hit this player is part of, each in the boss's own transaction. */
  async settleDueFor(prisma: PrismaClient, playerId: string, now: Date = new Date()): Promise<void> {
    const due = await prisma.bossHit.findMany({
      where: { status: 'PENDING', landsAt: { lte: now }, OR: [{ attackerId: playerId }, { ownerId: playerId }, { backups: { some: { playerId } } }] },
      select: { ownerId: true },
    });
    for (const ownerId of new Set(due.map((row) => row.ownerId))) await PlayerStateService.settle(prisma, ownerId, { markActive: false, now });
  },

  /** Land every due hit in every round, for the alerts poller. */
  async sweep(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
    const due = await prisma.bossHit.findMany({ where: { status: 'PENDING', landsAt: { lte: now } }, select: { ownerId: true }, take: 200 });
    const owners = [...new Set(due.map((row) => row.ownerId))];
    for (const ownerId of owners) await PlayerStateService.settle(prisma, ownerId, { markActive: false, now });
    return owners.length;
  },

  /** The visiting bosses a fresh recon spotted, as the convoys panel shows them. */
  async targets(prisma: PrismaClient, ruleset: Ruleset, player: RoundPlayer & { city: { slug: string } }, seen: readonly BossReconTarget[], fit: number, now: Date): Promise<BossTargetDto[]> {
    const rules = convoyRules(ruleset);
    if (!rules || !huntedRules(ruleset) || !seen.length) return [];
    const live = await prisma.bossTrip.findMany({
      where: { id: { in: seen.map((target) => target.tripId) } },
      include: { roundPlayer: true, hits: { where: { status: 'PENDING' }, select: { id: true } } },
    });
    const block = squadBlock(ruleset, player, player.turns, now);
    const out: BossTargetDto[] = [];
    for (const target of seen) {
      const trip = live.find((entry) => entry.id === target.tripId);
      if (!trip || trip.status !== 'ACTIVE') continue;
      const phase = tripPosition(trip, now).phase;
      const inTownNow = phase === 'town';
      // The recon saw them; where they are now is live.
      const inTownUntil = trip.stayUntil.toISOString();
      const linked = await accountsShareNetwork(prisma, player.accountId, trip.roundPlayer.accountId, now);
      out.push({
        ...target,
        inTownUntil,
        inTownNow,
        maxSquad: fit,
        blockedReason: allianceTargetBlock(player, trip.roundPlayer, now)
          ?? (linked ? 'You have played from the same network as this crew.' : null)
          ?? (trip.hits.length ? 'Someone is already on them.' : null)
          ?? (trip.lastHitAt && trip.lastHitAt.getTime() + rules.rehitMinutes * 60_000 > now.getTime() ? 'They were hit a moment ago.' : null)
          ?? (!inTownNow ? (phase === 'outbound' ? 'Not in town yet.' : 'Gone by now.') : null)
          ?? block
          ?? (fit < 1 ? 'You have no fit thugs to send.' : null),
      });
    }
    return out;
  },

  /** Hits this player started or took in the last day, and any still waiting. The boss sees one on them only through their lookouts. */
  async hits(prisma: PrismaClient, ruleset: Ruleset, player: RoundPlayer & { city: { slug: string } }, now: Date): Promise<BossHitDto[]> {
    if (!huntedRules(ruleset)) return [];
    const since = new Date(now.getTime() - RECENT_MS);
    const allyCalls = ruleset.travel?.trips?.allyBackup && player.allianceId
      ? [{ status: 'PENDING' as const, city: player.city.slug, alliesCalledAt: { not: null }, owner: { allianceId: player.allianceId }, ownerId: { not: player.id } }]
      : [];
    const rows = await prisma.bossHit.findMany({
      where: {
        OR: [{ attackerId: player.id }, { ownerId: player.id }, { backups: { some: { playerId: player.id } } }, ...allyCalls],
        AND: [{ OR: [{ status: 'PENDING' }, { startedAt: { gte: since } }] }],
      },
      include: {
        attacker: { select: { publicPimpId: true, displayName: true } },
        owner: { select: { publicPimpId: true, displayName: true, allianceId: true } },
        backups: { select: { playerId: true, thugs: true, wounded: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    const seeUntil = now.getTime() + headsUpMinutes(ruleset, player.hideoutLookoutsLevel) * 60_000;
    const out: BossHitDto[] = [];
    for (const hit of rows) {
      // Nobody tells the boss: a hit on them shows only once their lookouts spot it.
      if (hit.ownerId === player.id && hit.status === 'PENDING' && hit.landsAt.getTime() > seeUntil) continue;
      const ally = hit.attackerId !== player.id && hit.ownerId !== player.id;
      out.push(toHitDto(ruleset, player, hit, ally ? backupLimit(ruleset, player, hit, player, now) : null, now));
    }
    return out;
  },

  /** Trips D2. The boss calls allies who live in the city. Only once their lookouts have spotted the hit. */
  async callAllies(prisma: PrismaClient, ownerId: string, input: { hitId: string }, now: Date = new Date()): Promise<{ called: number }> {
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, ownerId);
      const hit = await tx.bossHit.findUnique({ where: { id: input.hitId }, include: { owner: { include: { round: true } } } });
      if (!hit || hit.ownerId !== ownerId) throw AppError.notFound('HIT_NOT_FOUND', 'Nobody is coming for you there.');
      if (hit.status !== 'PENDING' || hit.landsAt <= now) throw AppError.conflict('HIT_OVER', 'Too late: it has already happened.');
      const base = loadRulesetForRound(hit.owner.round);
      if (!base.travel?.trips?.allyBackup) throw AppError.conflict('NO_ALLY_BACKUP', 'Nobody comes running this round.');
      if (hit.landsAt.getTime() - now.getTime() > headsUpMinutes(base, hit.owner.hideoutLookoutsLevel) * 60_000) {
        throw AppError.notFound('HIT_NOT_FOUND', 'Nobody you can see is coming for you.');
      }
      if (!hit.owner.allianceId) throw AppError.conflict('NO_ALLIANCE', 'You have no alliance to call.');
      if (hit.alliesCalledAt) return { called: 0 };
      const city = await tx.city.findUnique({ where: { slug: hit.city }, select: { id: true } });
      const called = city ? await tx.roundPlayer.count({ where: { allianceId: hit.owner.allianceId, cityId: city.id, id: { not: ownerId }, roundId: hit.owner.roundId } }) : 0;
      await tx.bossHit.update({ where: { id: hit.id }, data: { alliesCalledAt: now } });
      return { called };
    });
  },

  /** Trips D2. An ally who lives in the city sends thugs to the boss's side, with the best of their arsenal. */
  backup(prisma: PrismaClient, senderId: string, input: BossHitBackupInput, now?: Date): Promise<GameActionResult<BossHitBackupResult>> {
    return ActionService.run<BossHitBackupResult>(prisma, senderId, {
      action: 'BOSS_HIT_BACKUP',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, now: at }) => {
        const base = loadRulesetForRound(round);
        const model = base.combat;
        if (!model || !huntedRules(base) || !base.travel?.trips?.allyBackup) throw AppError.conflict('NO_ALLY_BACKUP', 'Nobody comes running this round.');
        const hit = await tx.bossHit.findUnique({ where: { id: input.hitId }, include: { owner: true, backups: true } });
        if (!hit || hit.owner.roundId !== round.id) throw AppError.notFound('HIT_NOT_FOUND', 'That fight is not happening.');
        const limit = backupLimit(base, player, hit, current, at);
        if (limit.reason) throw AppError.conflict('CANNOT_SEND', limit.reason);
        if (input.thugs > limit.max) throw AppError.badRequest('TOO_MANY', `Send at most ${limit.max}.`, { thugs: `At most ${limit.max}.` });
        const squad = equipCombatSquad({
          thugs: Math.max(input.thugs, fitThugs(current)),
          thugHappiness: player.thugHappiness,
          weapons: { PISTOL: current.pistols, SHOTGUN: current.shotguns, TEK9: current.tek9s, AK47: current.ak47s },
          weaponPriority: hideoutWeaponPriority(base, player),
        }, Math.min(input.thugs, model.squadCap), model);
        const crew: BossHitCrew = { thugHappiness: player.thugHappiness, weapons: { ...NO_GUNS, ...squad.equipment } };
        await tx.bossHitBackup.create({ data: { hitId: hit.id, playerId: senderId, thugs: input.thugs, crew: JSON.parse(JSON.stringify(crew)), sentAt: at } });
        const result: BossHitBackupResult = { hitId: hit.id, thugs: input.thugs, landsAt: hit.landsAt.toISOString() };
        return {
          next: { ...current, busyThugs: current.busyThugs + input.thugs },
          result,
          activity: { type: 'BOSS_HIT_BACKUP', payload: { ...result, owner: hit.owner.displayName, cityName: cityName(base, hit.city) } },
        };
      },
    }, now);
  },

  /** When a hit the boss's lookouts can see lands, if one is coming. */
  async seenComing(db: Db | PrismaClient, ruleset: Ruleset, player: Pick<RoundPlayer, 'id' | 'hideoutLookoutsLevel'>, tripId: string, now: Date): Promise<Date | null> {
    if (!huntedRules(ruleset)) return null;
    const seeUntil = new Date(now.getTime() + headsUpMinutes(ruleset, player.hideoutLookoutsLevel) * 60_000);
    const hit = await db.bossHit.findFirst({ where: { tripId, ownerId: player.id, status: 'PENDING', landsAt: { gt: now, lte: seeUntil } }, orderBy: { landsAt: 'asc' } });
    return hit?.landsAt ?? null;
  },
};
