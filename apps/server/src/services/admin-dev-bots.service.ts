import { Prisma, type PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { DistrictKey } from '@streets/rulesets';
import type { AdminDevBotsDto } from '@streets/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { devBotAccountWhere, devBotsBlockedReason, removeDevBots, seedDevBots } from './dev-bots.service.js';
import { openNpcGrudges, storedNpcGrudges } from './npc-gang-memory.js';
import { RoundService } from './round.service.js';

const blockedReason = () => devBotsBlockedReason({ isProduction: env.isProduction, databaseUrl: env.DATABASE_URL });

function refuseIfBlocked(): void {
  const reason = blockedReason();
  if (reason) throw AppError.forbidden(reason);
}

async function record(prisma: PrismaClient, actor: AuditActor, action: string, after: Record<string, unknown>, reason?: string) {
  await prisma.$transaction((tx) => AdminAuditService.record(tx, actor, { action, targetType: 'dev-bots', targetId: null, reason: reason ?? null, after }));
}

function jsonObject(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Prisma.JsonObject : {};
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

type AdminNpcGang = NonNullable<NonNullable<AdminDevBotsDto['bots'][number]['inCurrentRound']>['npcGang']>;

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Phase J. The turf snapshot the scheduler wrote on the gang's last tick. */
function npcGangTurf(root: Prisma.JsonObject): AdminNpcGang['turf'] {
  if (!root.turf || typeof root.turf !== 'object' || Array.isArray(root.turf)) return null;
  const turf = root.turf as Prisma.JsonObject;
  const held = Array.isArray(turf.held) ? turf.held : [];
  const prospect = jsonObject(turf.prospect as Prisma.JsonValue);
  const move = jsonObject(root.lastTurfMove as Prisma.JsonValue);
  const moveKind = stringField(move.kind);
  const moveAt = stringField(move.at);
  const moveDetail = typeof move.won === 'boolean'
    ? (move.won ? 'won' : 'lost')
    : stringField(move.reason)?.toLowerCase() ?? (typeof move.thugs === 'number' ? `${move.thugs} thugs` : typeof move.turns === 'number' ? `${move.turns} turns` : null);
  return {
    held: held.flatMap((row) => {
      const block = jsonObject(row);
      const districtName = stringField(block.districtName);
      return districtName ? [{
        districtName,
        cornerThugs: numberField(block.cornerThugs),
        minimum: numberField(block.minimum),
        pushLandsAt: stringField(block.pushLandsAt),
      }] : [];
    }),
    prospect: stringField(prospect.districtName) ? {
      districtName: stringField(prospect.districtName)!,
      presence: numberField(prospect.presence),
      needed: numberField(prospect.needed),
      locals: numberField(prospect.locals),
    } : null,
    recentLosses: numberField(turf.recentLosses),
    pressure: numberField(turf.pressure),
    lastMove: moveKind && moveAt ? { kind: moveKind, districtName: stringField(move.districtName) ?? '', at: moveAt, detail: moveDetail } : null,
  };
}

function npcGangMemory(memory: Prisma.JsonValue, now: Date): Pick<AdminNpcGang, 'lastIntent' | 'lastOutcome' | 'lastTarget' | 'lastError' | 'grudges' | 'lastRevenge' | 'turf'> {
  const root = jsonObject(memory);
  const detail = jsonObject(root.lastDetail as Prisma.JsonValue);
  const error = jsonObject(root.lastError as Prisma.JsonValue);
  const revenge = jsonObject(root.lastRevenge as Prisma.JsonValue);
  const errorCode = stringField(error.code);
  const errorMessage = stringField(error.message);
  const revengeTarget = stringField(revenge.targetName);
  const revengeAt = stringField(revenge.at);
  return {
    lastIntent: stringField(root.lastIntent),
    lastOutcome: stringField(root.lastOutcome),
    lastTarget: stringField(detail.targetName),
    lastError: errorMessage ? (errorCode ? `${errorCode}: ${errorMessage}` : errorMessage) : null,
    // Phase I. The cache from the gang's last tick, minus anything that expired since.
    grudges: storedNpcGrudges(memory, now).map((grudge) => ({
      targetName: grudge.name,
      publicPimpId: grudge.publicPimpId,
      hits: grudge.hits,
      lastHitAt: grudge.lastHitAt,
      expiresAt: grudge.expiresAt,
      settledAt: grudge.settledAt,
    })),
    lastRevenge: revengeTarget && revengeAt
      ? { targetName: revengeTarget, at: revengeAt, won: typeof revenge.won === 'boolean' ? revenge.won : null }
      : null,
    turf: npcGangTurf(root),
  };
}

function storedReportKind(battle: { kind: string; attackerReport: Prisma.JsonValue }): string {
  const report = jsonObject(battle.attackerReport);
  return stringField(report.kind) ?? battle.kind;
}

/** Local test targets from the panel instead of the CLI. Refused in production and against a non-local database. */
export const AdminDevBotsService = {
  async status(prisma: PrismaClient): Promise<AdminDevBotsDto> {
    const now = new Date();
    const round = await RoundService.getCurrent(prisma);
    const since = new Date(now.getTime() - 24 * 3_600_000);
    const accounts = await prisma.account.findMany({
      where: devBotAccountWhere,
      orderBy: { username: 'asc' },
      select: {
        id: true,
        username: true,
        isActive: true,
        _count: { select: { roundPlayers: true } },
        roundPlayers: round
          ? {
              where: { roundId: round.id },
              select: {
                id: true,
                displayName: true,
                publicPimpId: true,
                city: { select: { id: true, name: true } },
                netWorthCents: true,
                npcGang: { select: { archetype: true, tier: true, aggression: true, ambition: true, discipline: true, nextActionAt: true, lastActionAt: true, dormantUntil: true, memory: true, homeCity: { select: { name: true } } } },
              },
            }
          : {
              where: { id: '' },
              select: {
                id: true,
                displayName: true,
                publicPimpId: true,
                city: { select: { id: true, name: true } },
                netWorthCents: true,
                npcGang: { select: { archetype: true, tier: true, aggression: true, ambition: true, discipline: true, nextActionAt: true, lastActionAt: true, dormantUntil: true, memory: true, homeCity: { select: { name: true } } } },
              },
            },
      },
    });
    const currentPlayers = accounts.flatMap((account) => account.roundPlayers);
    const cityRows = new Map<string, {
      city: string;
      activeGangs: number;
      dueNow: number;
      recentHits: number;
      recentDriveBys: number;
      recentSpecialRaids: number;
      recentRevengeHits: number;
      heldBlocks: string[];
      nextActionAt: Date | null;
    }>();

    for (const player of currentPlayers) {
      if (!player.npcGang) continue;
      const cityId = player.city.id;
      const row = cityRows.get(cityId) ?? {
        city: player.city.name,
        activeGangs: 0,
        dueNow: 0,
        recentHits: 0,
        recentDriveBys: 0,
        recentSpecialRaids: 0,
        recentRevengeHits: 0,
        heldBlocks: [],
        nextActionAt: null,
      };
      row.activeGangs += 1;
      if (player.npcGang.nextActionAt <= now && (!player.npcGang.dormantUntil || player.npcGang.dormantUntil <= now)) row.dueNow += 1;
      if (!row.nextActionAt || player.npcGang.nextActionAt < row.nextActionAt) row.nextActionAt = player.npcGang.nextActionAt;
      cityRows.set(cityId, row);
    }

    let revenge24h = 0;
    let heldBlocks = 0;
    if (round && cityRows.size > 0) {
      const ruleset = loadRulesetForRound(round);
      const held = await prisma.turf.findMany({
        where: { roundId: round.id, holder: { npcGang: { isNot: null } } },
        select: { cityId: true, district: true, city: { select: { slug: true } } },
        orderBy: { district: 'asc' },
      });
      heldBlocks = held.length;
      for (const block of held) {
        const key = block.district as DistrictKey;
        const name = ruleset.cities?.[block.city.slug]?.districts?.[key]?.name ?? ruleset.districts[key]?.name ?? block.district;
        cityRows.get(block.cityId)?.heldBlocks.push(name);
      }

      const recent = await prisma.raidBattle.findMany({
        where: {
          createdAt: { gte: since },
          voidedAt: null,
          attacker: { roundId: round.id, npcGang: { isNot: null } },
          defender: { roundId: round.id },
        },
        select: {
          kind: true,
          attackerReport: true,
          defender: { select: { cityId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      for (const battle of recent) {
        const row = cityRows.get(battle.defender.cityId);
        if (!row) continue;
        const kind = storedReportKind(battle);
        row.recentHits += 1;
        if (kind === 'DRIVE_BY') row.recentDriveBys += 1;
        if (['DRUG_HOES', 'STEAL_RIDE', 'LURE_CREW'].includes(kind)) row.recentSpecialRaids += 1;
        // The engine stamps `retaliation` on the attacker's report when the hit answered an earlier one.
        if (jsonObject(battle.attackerReport).retaliation === true) {
          row.recentRevengeHits += 1;
          revenge24h += 1;
        }
      }
    }

    const npcGangs = currentPlayers.flatMap((player) => player.npcGang ? [player.npcGang] : []);
    const acted24h = npcGangs.filter((gang) => gang.lastActionAt && gang.lastActionAt >= since).length;
    const blocked24h = currentPlayers.filter((player) => {
      if (!player.npcGang?.lastActionAt || player.npcGang.lastActionAt < since) return false;
      return npcGangMemory(player.npcGang.memory, now).lastOutcome === 'BLOCKED';
    }).length;
    const openGrudges = npcGangs.reduce((sum, gang) => sum + openNpcGrudges(storedNpcGrudges(gang.memory, now), now).length, 0);

    return {
      blockedReason: blockedReason(),
      currentRound: round ? { id: round.id, name: round.name, rulesetVersion: round.rulesetVersion } : null,
      npcGangSummary: {
        generatedAt: now.toISOString(),
        active: npcGangs.length,
        dueNow: npcGangs.filter((gang) => gang.nextActionAt <= now && (!gang.dormantUntil || gang.dormantUntil <= now)).length,
        acted24h,
        blocked24h,
        openGrudges,
        revenge24h,
        heldBlocks,
        cities: Array.from(cityRows.values())
          .sort((left, right) => right.recentHits - left.recentHits || right.dueNow - left.dueNow || left.city.localeCompare(right.city))
          .map((row) => ({
            city: row.city,
            activeGangs: row.activeGangs,
            dueNow: row.dueNow,
            recentHits: row.recentHits,
            recentDriveBys: row.recentDriveBys,
            recentSpecialRaids: row.recentSpecialRaids,
            recentRevengeHits: row.recentRevengeHits,
            heldBlocks: row.heldBlocks,
            nextActionAt: row.nextActionAt?.toISOString() ?? null,
          })),
      },
      bots: accounts.map((account) => {
        const player = account.roundPlayers[0];
        const memory = player?.npcGang ? npcGangMemory(player.npcGang.memory, now) : null;
        return {
          accountId: account.id,
          username: account.username,
          isActive: account.isActive,
          roundsPlayed: account._count.roundPlayers,
          inCurrentRound: player
            ? {
                roundPlayerId: player.id,
                displayName: player.displayName,
                publicPimpId: player.publicPimpId,
                netWorthCents: Number(player.netWorthCents),
                npcGang: player.npcGang
                  ? {
                      archetype: player.npcGang.archetype,
                      tier: player.npcGang.tier,
                      aggression: player.npcGang.aggression,
                      ambition: player.npcGang.ambition,
                      discipline: player.npcGang.discipline,
                      nextActionAt: player.npcGang.nextActionAt.toISOString(),
                      lastActionAt: player.npcGang.lastActionAt?.toISOString() ?? null,
                      dormantUntil: player.npcGang.dormantUntil?.toISOString() ?? null,
                      homeCity: player.npcGang.homeCity.name,
                      lastIntent: memory?.lastIntent ?? null,
                      lastOutcome: memory?.lastOutcome ?? null,
                      lastTarget: memory?.lastTarget ?? null,
                      lastError: memory?.lastError ?? null,
                      grudges: memory?.grudges ?? [],
                      lastRevenge: memory?.lastRevenge ?? null,
                      turf: memory?.turf ?? null,
                    }
                  : null,
              }
            : null,
        };
      }),
    };
  },

  /** Adds the bots to the current round, or resets them there with fresh starting resources. */
  async seed(prisma: PrismaClient, actor: AuditActor, now = new Date()): Promise<AdminDevBotsDto> {
    refuseIfBlocked();
    const round = await RoundService.getCurrent(prisma, now);
    if (!round) throw AppError.conflict('NO_ACTIVE_ROUND', 'There is no current round to add dev bots to.');
    let seeded: number;
    try {
      seeded = await seedDevBots(prisma, round, loadRulesetForRound(round), now);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Starting city')) throw AppError.conflict('STARTING_CITY_DISABLED', error.message);
      throw error;
    }
    await record(prisma, actor, 'dev-bots.seed', { roundId: round.id, roundName: round.name, seeded });
    return AdminDevBotsService.status(prisma);
  },

  async remove(prisma: PrismaClient, actor: AuditActor, reason: string): Promise<AdminDevBotsDto> {
    refuseIfBlocked();
    const removed = await removeDevBots(prisma);
    await record(prisma, actor, 'dev-bots.remove', { removed }, reason);
    return AdminDevBotsService.status(prisma);
  },
};
