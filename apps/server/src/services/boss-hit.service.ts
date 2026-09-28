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
import type { BossHitDto, BossHitInput, BossHitResult, BossTargetDto, GameActionResult } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs } from './action.service.js';
import { accountsShareNetwork } from './admin-signals.service.js';
import { allianceTargetBlock } from './alliance.service.js';
import type { BossHitCrew, BossHitOutcome } from './boss-trip-settle.service.js';
import { hideoutWeaponPriority } from './hideout.service.js';
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

/** Why this player cannot send a squad after a boss at all right now. */
function squadBlock(ruleset: Ruleset, player: RoundPlayer, turns: number, now: Date): string | null {
  const rules = convoyRules(ruleset);
  if (!rules || !huntedRules(ruleset)) return 'Nobody hunts a boss this round.';
  if (player.lockedUntil && player.lockedUntil > now) return 'You are locked up.';
  if (player.movingUntil && player.movingUntil > now) return 'You are moving house.';
  if (turns < rules.turnCost) return `A hit costs ${rules.turnCost} turns.`;
  return null;
}

function toHitDto(ruleset: Ruleset, playerId: string, hit: {
  id: string; attackerId: string; status: 'PENDING' | 'LANDED' | 'ESCAPED'; city: string; startedAt: Date; landsAt: Date; squad: number; result: unknown;
  attacker: { publicPimpId: number; displayName: string }; owner: { publicPimpId: number; displayName: string };
}): BossHitDto {
  const role: BossHitDto['role'] = hit.attackerId === playerId ? 'attacker' : 'owner';
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
    report: outcome ? {
      escaped: outcome.escaped,
      held: outcome.held ?? false,
      cashCents: (role === 'attacker' ? 1 : -1) * Number(outcome.cashCents),
      laidUpUntil: outcome.laidUpUntil,
      yourWounds: role === 'attacker' ? outcome.attackerWounds ?? 0 : outcome.defenderWounds ?? 0,
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
      where: { status: 'PENDING', landsAt: { lte: now }, OR: [{ attackerId: playerId }, { ownerId: playerId }] },
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
  async hits(prisma: PrismaClient, ruleset: Ruleset, player: Pick<RoundPlayer, 'id' | 'hideoutLookoutsLevel'>, now: Date): Promise<BossHitDto[]> {
    if (!huntedRules(ruleset)) return [];
    const since = new Date(now.getTime() - RECENT_MS);
    const rows = await prisma.bossHit.findMany({
      where: { OR: [{ attackerId: player.id }, { ownerId: player.id }], AND: [{ OR: [{ status: 'PENDING' }, { startedAt: { gte: since } }] }] },
      include: { attacker: { select: { publicPimpId: true, displayName: true } }, owner: { select: { publicPimpId: true, displayName: true } } },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    const seeUntil = now.getTime() + headsUpMinutes(ruleset, player.hideoutLookoutsLevel) * 60_000;
    return rows
      .filter((hit) => hit.attackerId === player.id || hit.status !== 'PENDING' || hit.landsAt.getTime() <= seeUntil)
      .map((hit) => toHitDto(ruleset, player.id, hit));
  },

  /** When a hit the boss's lookouts can see lands, if one is coming. */
  async seenComing(db: Db | PrismaClient, ruleset: Ruleset, player: Pick<RoundPlayer, 'id' | 'hideoutLookoutsLevel'>, tripId: string, now: Date): Promise<Date | null> {
    if (!huntedRules(ruleset)) return null;
    const seeUntil = new Date(now.getTime() + headsUpMinutes(ruleset, player.hideoutLookoutsLevel) * 60_000);
    const hit = await db.bossHit.findFirst({ where: { tripId, ownerId: player.id, status: 'PENDING', landsAt: { gt: now, lte: seeUntil } }, orderBy: { landsAt: 'asc' } });
    return hit?.landsAt ?? null;
  },
};
