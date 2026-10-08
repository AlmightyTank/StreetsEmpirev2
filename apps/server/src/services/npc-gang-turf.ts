import type { PrismaClient } from '@prisma/client';
import { cornerMinimumFor, headsUpMinutes, presenceAfter, type Ruleset } from '@streets/rules-engine';
import type { DistrictKey, NpcGangTurfRules } from '@streets/rulesets';
import { TurfService, localsOnBlock } from './turf.service.js';

/**
 * Phase J. NPC turf is ordinary turf. This module reads where a gang stands on
 * the city's blocks and picks one move; the scheduler then makes that move
 * through the same Scout, claim, post, backup and pull services players use.
 */

export interface NpcTurfBlock {
  turfId: string;
  district: DistrictKey;
  districtName: string;
  cornerThugs: number;
  minimum: number;
  /** A pending human push on this block. `seen` follows the holder's Lookouts, as for players. */
  push: { id: string; landsAt: string; seen: boolean; backedUp: boolean } | null;
  /**
   * A live block war on this block (rounds where wars replace pushes). `defendFightId` is an
   * incoming assault the gang has not sent a squad to; `canBreak` means a siege with no
   * break attempt already on its way.
   */
  war: { id: string; status: string; defendFightId: string | null; canBreak: boolean } | null;
}

export interface NpcTurfProspect {
  district: DistrictKey;
  districtName: string;
  presence: number;
  needed: number;
  locals: number;
  minimum: number;
}

export interface NpcTurfState {
  enabled: boolean;
  held: NpcTurfBlock[];
  /** The locals-held block this gang is working toward, if it wants one. */
  prospect: NpcTurfProspect | null;
  canHoldMore: boolean;
  npcBlocksInCity: number;
  /** Fights this gang lost inside the loss window; only counted while it holds a block. */
  recentLosses: number;
  /** Human crews with live presence on a block this gang holds. */
  pressureIds: string[];
}

export interface NpcTurfGang {
  roundPlayerId: string;
  roundId: string;
  cityId: string;
  citySlug: string;
  thugs: number;
  hideoutLookoutsLevel: number;
  racketEffects: unknown;
}

export const NO_NPC_TURF: NpcTurfState = {
  enabled: false, held: [], prospect: null, canHoldMore: false, npcBlocksInCity: 0, recentLosses: 0, pressureIds: [],
};

export function npcDistrictName(ruleset: Ruleset, citySlug: string, district: DistrictKey): string {
  return ruleset.cities?.[citySlug]?.districts?.[district]?.name ?? ruleset.districts[district]?.name ?? district;
}

function reportWon(report: unknown): boolean | null {
  return report && typeof report === 'object' && !Array.isArray(report) && typeof (report as { won?: unknown }).won === 'boolean'
    ? (report as { won: boolean }).won
    : null;
}

export async function loadNpcTurf(prisma: PrismaClient, gang: NpcTurfGang, ruleset: Ruleset, rules: NpcGangTurfRules, now: Date): Promise<NpcTurfState> {
  const turf = ruleset.turf;
  if (!rules.enabled || !turf || !TurfService.holdingEnabled(ruleset)) return NO_NPC_TURF;
  await TurfService.ensureRound(prisma, gang.roundId, ruleset);

  const blocks = await prisma.turf.findMany({
    where: { roundId: gang.roundId, cityId: gang.cityId },
    select: {
      id: true, district: true, holderId: true, cornerThugs: true,
      localsThugs: true, localsAt: true, localsReclaimAt: true,
      holder: { select: { npcGang: { select: { id: true } } } },
    },
    orderBy: { district: 'asc' },
  });
  const known = blocks.filter((block) => Boolean(turf.districts[block.district as DistrictKey]));
  const heldRows = known.filter((block) => block.holderId === gang.roundPlayerId);
  const npcBlocksInCity = known.filter((block) => Boolean(block.holder?.npcGang)).length;

  const pushes = heldRows.length
    ? await prisma.turfPush.findMany({
        where: { turfId: { in: heldRows.map((block) => block.id) }, status: 'PENDING', landsAt: { gt: now } },
        select: { id: true, turfId: true, landsAt: true, backups: { where: { playerId: gang.roundPlayerId }, select: { id: true } } },
        orderBy: { landsAt: 'asc' },
      })
    : [];
  const wars = heldRows.length
    ? await prisma.blockWar.findMany({
        where: { turfId: { in: heldRows.map((block) => block.id) }, defenderId: gang.roundPlayerId, status: { not: 'ENDED' } },
        select: { id: true, turfId: true, status: true, fightRows: { where: { status: 'PENDING' }, select: { id: true, kind: true, landsAt: true }, orderBy: { landsAt: 'asc' } } },
      })
    : [];
  const sentTo = new Set(wars.length
    ? (await prisma.blockWarSquad.findMany({
        where: { warId: { in: wars.map((war) => war.id) }, playerId: gang.roundPlayerId },
        select: { fightId: true },
      })).map((row) => row.fightId)
    : []);
  const headsUpMs = headsUpMinutes(ruleset, gang.hideoutLookoutsLevel, gang.racketEffects) * 60_000;
  const held: NpcTurfBlock[] = heldRows.map((block) => {
    const district = block.district as DistrictKey;
    const push = pushes.find((row) => row.turfId === block.id);
    const war = wars.find((row) => row.turfId === block.id);
    const incoming = war?.fightRows.find((fight) => fight.kind !== 'BREAK' && fight.landsAt > now);
    return {
      turfId: block.id,
      district,
      districtName: npcDistrictName(ruleset, gang.citySlug, district),
      cornerThugs: block.cornerThugs,
      minimum: cornerMinimumFor(ruleset, district, gang.thugs),
      push: push ? {
        id: push.id,
        landsAt: push.landsAt.toISOString(),
        seen: push.landsAt.getTime() <= now.getTime() + headsUpMs,
        backedUp: push.backups.length > 0,
      } : null,
      war: war ? {
        id: war.id,
        status: war.status,
        defendFightId: incoming && !sentTo.has(incoming.id) ? incoming.id : null,
        canBreak: war.status === 'SIEGE' && !war.fightRows.some((fight) => fight.kind === 'BREAK'),
      } : null,
    };
  });

  const canHoldMore = held.length < Math.min(rules.maxBlocksPerGang, turf.caps.blocksPerCrewHome)
    && npcBlocksInCity < rules.maxNpcBlocksPerCity;

  let prospect: NpcTurfProspect | null = null;
  if (canHoldMore) {
    let best: { prospect: NpcTurfProspect; score: number } | null = null;
    for (const block of known) {
      if (block.holderId) continue;
      const district = block.district as DistrictKey;
      const presence = await TurfService.presenceFor(prisma, gang.roundPlayerId, gang.cityId, district, ruleset, now);
      const locals = localsOnBlock(ruleset, {
        holderId: null, citySlug: gang.citySlug, district,
        localsThugs: block.localsThugs, localsAt: block.localsAt, localsReclaimAt: block.localsReclaimAt,
      }, now);
      // Keep working the block already started, then the cheapest to take and the best to hold.
      const score = presence * 3 + turf.districts[district].holdBonus * 10 - locals;
      if (!best || score > best.score) {
        best = {
          score,
          prospect: {
            district,
            districtName: npcDistrictName(ruleset, gang.citySlug, district),
            presence,
            needed: turf.presence.turnsToClaim,
            locals,
            minimum: cornerMinimumFor(ruleset, district, gang.thugs),
          },
        };
      }
    }
    prospect = best?.prospect ?? null;
  }

  let recentLosses = 0;
  let pressureIds: string[] = [];
  if (held.length) {
    const since = new Date(now.getTime() - Math.max(1, rules.lossWindowHours) * 3_600_000);
    const [fights, presences] = await Promise.all([
      prisma.raidBattle.findMany({
        where: { OR: [{ attackerId: gang.roundPlayerId }, { defenderId: gang.roundPlayerId }], createdAt: { gte: since }, voidedAt: null },
        select: { attackerId: true, attackerReport: true },
        take: 50,
      }),
      prisma.turfPresence.findMany({
        where: {
          cityId: gang.cityId,
          district: { in: held.map((block) => block.district) },
          roundPlayerId: { not: gang.roundPlayerId },
          roundPlayer: { roundId: gang.roundId, npcGang: { is: null }, account: { isActive: true } },
        },
        select: { roundPlayerId: true, turns: true, at: true },
      }),
    ]);
    recentLosses = fights.filter((fight) => {
      const won = reportWon(fight.attackerReport);
      if (won === null) return false;
      return fight.attackerId === gang.roundPlayerId ? !won : won;
    }).length;
    pressureIds = [...new Set(presences
      .filter((row) => presenceAfter(ruleset, row.turns, Math.max(0, now.getTime() - row.at.getTime()) / 3_600_000) >= 1)
      .map((row) => row.roundPlayerId))];
  }

  return { enabled: true, held, prospect, canHoldMore, npcBlocksInCity, recentLosses, pressureIds };
}

export type NpcTurfMove =
  | { kind: 'ABANDON'; block: NpcTurfBlock; reason: 'LOSSES' | 'UNDERMANNED' | 'UNSUPPLIED' | 'MIGRATING' | 'LAYING_LOW' }
  | { kind: 'BACKUP'; block: NpcTurfBlock; pushId: string; thugs: number }
  | { kind: 'WAR_DEFEND'; block: NpcTurfBlock; warId: string; thugs: number }
  | { kind: 'WAR_BREAK'; block: NpcTurfBlock; warId: string; thugs: number }
  | { kind: 'REINFORCE'; block: NpcTurfBlock; thugs: number }
  | { kind: 'CLAIM'; prospect: NpcTurfProspect; thugs: number }
  | { kind: 'WORK'; prospect: NpcTurfProspect; turns: number };

export interface NpcTurfCapacity {
  ambition: number;
  /** Fit thugs at home that also have a home gun to carry. */
  armedFit: number;
  turns: number;
  postTurnCost: number;
  scoutMinTurns: number;
  perScoutTurn: number;
  squadCap: number;
  beer: number;
  /** Beer a held corner burns over `supplyHours`. */
  beerNeed: number;
  canBuyBeer: boolean;
}

/**
 * Phase J. `forced` moves jump the weighted choice: walking away from a block the
 * gang cannot keep, and backing up a corner whose push it has spotted. `option`
 * is the best ordinary turf move, which competes with raids and production.
 */
export function npcTurfMoves(state: NpcTurfState, rules: NpcGangTurfRules, cap: NpcTurfCapacity): { forced: NpcTurfMove | null; option: NpcTurfMove | null } {
  if (!state.enabled) return { forced: null, option: null };

  // A crew at war stands and fights: the war itself settles who keeps the block.
  for (const block of state.held) {
    if (!block.war || cap.armedFit < 1) continue;
    const thugs = Math.min(cap.armedFit, cap.squadCap);
    if (block.war.defendFightId) return { forced: { kind: 'WAR_DEFEND', block, warId: block.war.id, thugs }, option: null };
    if (block.war.canBreak && cap.armedFit >= block.minimum) return { forced: { kind: 'WAR_BREAK', block, warId: block.war.id, thugs }, option: null };
  }

  for (const block of state.held) {
    if (block.war) continue;
    if (state.recentLosses >= rules.abandonAfterLosses) return { forced: { kind: 'ABANDON', block, reason: 'LOSSES' }, option: null };
    if (block.cornerThugs < block.minimum && cap.armedFit < block.minimum - block.cornerThugs && !block.push) {
      return { forced: { kind: 'ABANDON', block, reason: 'UNDERMANNED' }, option: null };
    }
    if (cap.beerNeed > 0 && cap.beer < 1 && !cap.canBuyBeer) return { forced: { kind: 'ABANDON', block, reason: 'UNSUPPLIED' }, option: null };
  }

  for (const block of state.held) {
    if (block.push?.seen && !block.push.backedUp && cap.armedFit > 0) {
      return { forced: { kind: 'BACKUP', block, pushId: block.push.id, thugs: Math.min(cap.armedFit, cap.squadCap) }, option: null };
    }
  }

  for (const block of state.held) {
    const target = Math.ceil(block.minimum * Math.max(1, rules.reinforceBelowMinimum));
    // A spotted push refuses permanent posts; the backup above is the answer to it.
    if (block.push?.seen || block.war || block.cornerThugs >= target || cap.armedFit < 1 || cap.turns < cap.postTurnCost) continue;
    return { forced: null, option: { kind: 'REINFORCE', block, thugs: Math.min(cap.armedFit, target - block.cornerThugs) } };
  }

  const prospect = state.prospect;
  if (!prospect || !state.canHoldMore || cap.ambition < rules.minAmbition) return { forced: null, option: null };
  if (prospect.presence >= prospect.needed) {
    const squad = Math.max(prospect.minimum, prospect.locals + Math.ceil(prospect.minimum / 2));
    if (cap.armedFit >= squad && cap.turns >= cap.postTurnCost) {
      return { forced: null, option: { kind: 'CLAIM', prospect, thugs: squad } };
    }
    return { forced: null, option: null };
  }
  const short = Math.ceil((prospect.needed - prospect.presence) / Math.max(0.01, cap.perScoutTurn));
  const turns = Math.min(cap.turns, Math.max(cap.scoutMinTurns, Math.min(short, 12)));
  if (turns < cap.scoutMinTurns) return { forced: null, option: null };
  return { forced: null, option: { kind: 'WORK', prospect, turns } };
}
