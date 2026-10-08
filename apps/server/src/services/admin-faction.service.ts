import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { factionTier, factionTierName, loadRulesetForRound } from '@streets/rules-engine';
import type { FactionKey } from '@streets/rulesets';
import type { AdminFactionRoundDto, AdminFactionStandingDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MISMATCH_LIMIT = 25;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function adminFactionStandings(prisma: PrismaClient, roundPlayerId: string): Promise<AdminFactionStandingDto[]> {
  const player = await prisma.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: { round: { select: { rulesetId: true, rulesetVersion: true } } },
  });
  if (!player) return [];
  const ruleset = loadRulesetForRound(player.round);
  if (!ruleset.factions || !ruleset.factionStanding) return [];
  const [standings, receiptSums, receiptLatest] = await Promise.all([
    prisma.playerFactionStanding.findMany({ where: { roundPlayerId } }),
    prisma.playerFactionReceipt.groupBy({ by: ['factionKey'], where: { roundPlayerId }, _count: { _all: true }, _sum: { delta: true } }),
    prisma.playerFactionReceipt.groupBy({ by: ['factionKey'], where: { roundPlayerId }, _max: { createdAt: true } }),
  ]);
  const stored = new Map(standings.map((row) => [row.factionKey, row]));
  const sums = new Map(receiptSums.map((row) => [row.factionKey, { receipts: row._count._all, points: row._sum.delta ?? 0 }]));
  const latest = new Map(receiptLatest.map((row) => [row.factionKey, row._max.createdAt?.toISOString() ?? null]));
  return Object.entries(ruleset.factions).map(([factionKey, faction]) => {
    const row = stored.get(factionKey);
    const points = row?.points ?? 0;
    const tier = factionTier(points, ruleset.factionStanding!);
    return {
      factionKey,
      factionName: faction.name,
      points,
      tier,
      tierName: factionTierName(tier),
      receiptPoints: sums.get(factionKey)?.points ?? 0,
      receipts: sums.get(factionKey)?.receipts ?? 0,
      lastReceiptAt: latest.get(factionKey) ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  });
}

export const AdminFactionService = {
  async report(prisma: PrismaClient, roundId: string, now = new Date()): Promise<AdminFactionRoundDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true, rulesetId: true, rulesetVersion: true } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const ruleset = loadRulesetForRound(round);
    const empty: AdminFactionRoundDto = {
      roundId, generatedAt: now.toISOString(), enabled: false, rulesetId: round.rulesetId,
      standings: [], receipts24h: [], integrity: { checked: 0, mismatches: [] }, adjustments7d: 0,
    };
    if (!ruleset.factions || !ruleset.factionStanding) return empty;

    const since = new Date(now.getTime() - DAY_MS);
    const inRound = { roundPlayer: { roundId } };
    const [standings, receiptSums, receipts24h, adjustments] = await Promise.all([
      prisma.playerFactionStanding.findMany({
        where: inRound,
        include: { roundPlayer: { select: { displayName: true } } },
        orderBy: [{ points: 'desc' }, { updatedAt: 'desc' }],
        take: 100,
      }),
      prisma.playerFactionReceipt.groupBy({ by: ['roundPlayerId', 'factionKey'], where: inRound, _sum: { delta: true }, _count: { _all: true } }),
      prisma.playerFactionReceipt.groupBy({ by: ['source'], where: { ...inRound, createdAt: { gte: since } }, _count: { _all: true }, _sum: { delta: true } }),
      prisma.adminAuditLog.count({ where: { action: 'faction.standing-adjust', createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) }, after: { path: ['roundId'], equals: roundId } } }),
    ]);
    const sumByStanding = new Map(receiptSums.map((row) => [`${row.roundPlayerId}:${row.factionKey}`, { points: row._sum.delta ?? 0, receipts: row._count._all }]));
    const mismatches = standings.flatMap((row) => {
      const receipts = sumByStanding.get(`${row.roundPlayerId}:${row.factionKey}`)?.points ?? 0;
      return receipts === row.points ? [] : [{ roundPlayerId: row.roundPlayerId, displayName: row.roundPlayer.displayName, factionKey: row.factionKey, stored: row.points, receipts }];
    });
    return {
      roundId,
      generatedAt: now.toISOString(),
      enabled: true,
      rulesetId: round.rulesetId,
      standings: standings.map((row) => {
        const tier = factionTier(row.points, ruleset.factionStanding!);
        const sums = sumByStanding.get(`${row.roundPlayerId}:${row.factionKey}`);
        return {
          roundPlayerId: row.roundPlayerId,
          displayName: row.roundPlayer.displayName,
          factionKey: row.factionKey,
          factionName: ruleset.factions![row.factionKey as FactionKey]?.name ?? row.factionKey,
          points: row.points,
          tier,
          tierName: factionTierName(tier),
          receiptPoints: sums?.points ?? 0,
          receipts: sums?.receipts ?? 0,
          lastReceiptAt: null,
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
      receipts24h: receipts24h.map((row) => ({ source: row.source, entries: row._count._all, standing: row._sum.delta ?? 0 })).sort((a, b) => b.entries - a.entries),
      integrity: { checked: standings.length, mismatches: mismatches.slice(0, MISMATCH_LIMIT) },
      adjustments7d: adjustments,
    };
  },

  async adjust(
    prisma: PrismaClient,
    actor: AuditActor,
    roundPlayerId: string,
    input: { factionKey: string; points: number; reason: string },
    now = new Date(),
  ) {
    await prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const player = await tx.roundPlayer.findUnique({
        where: { id: roundPlayerId },
        select: { id: true, accountId: true, displayName: true, round: { select: { id: true, status: true, rulesetId: true, rulesetVersion: true } } },
      });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
      if (player.accountId === actor.id) throw AppError.conflict('ADMIN_SELF_ACTION', 'Another admin has to correct your own standing.');
      if (player.round.status !== 'ACTIVE' && player.round.status !== 'REGISTRATION') {
        throw AppError.conflict('ROUND_FINISHED', 'That round has finished, so its faction standings are frozen.');
      }
      const ruleset = loadRulesetForRound(player.round);
      const rules = ruleset.factionStanding;
      const factionKey = input.factionKey as FactionKey;
      const faction = ruleset.factions?.[factionKey];
      if (!rules || !ruleset.factions) throw AppError.conflict('FACTIONS_DISABLED', 'This round has no faction standing.');
      if (!faction) throw AppError.notFound('FACTION_NOT_FOUND', 'That faction does not exist in this round.');
      if (!Number.isSafeInteger(input.points) || input.points < 0 || input.points > rules.max) {
        throw AppError.badRequest('FACTION_POINTS_INVALID', `Standing runs from 0 to ${rules.max}.`);
      }
      const standing = await tx.playerFactionStanding.findUnique({
        where: { roundPlayerId_factionKey: { roundPlayerId, factionKey: input.factionKey } },
      });
      const before = standing?.points ?? 0;
      if (before === input.points) throw AppError.conflict('FACTION_STANDING_UNCHANGED', `${player.displayName} already has ${before} standing with ${faction.name}.`);

      const tier = factionTier(input.points, rules);
      const sourceKey = `admin:${randomUUID()}`;
      const innerCircleAt = input.points >= rules.tiers.innerCircle ? standing?.innerCircleAt ?? now : null;
      const saved = await tx.playerFactionStanding.upsert({
        where: { roundPlayerId_factionKey: { roundPlayerId, factionKey: input.factionKey } },
        create: { roundPlayerId, factionKey: input.factionKey, points: input.points, tier, createdAt: now, ...(innerCircleAt ? { innerCircleAt } : {}) },
        update: { points: input.points, tier, innerCircleAt, ...(innerCircleAt ? {} : { innerCirclePostedAt: null }) },
      });
      await tx.playerFactionReceipt.create({
        data: {
          roundPlayerId,
          factionKey: input.factionKey,
          source: 'ADMIN',
          sourceKey,
          delta: input.points - before,
          pointsAfter: input.points,
          tierAfter: tier,
          createdAt: now,
        },
      });
      await ActivityService.log(tx, roundPlayerId, 'ADMIN_GRANT', json({
        reason: input.reason,
        corrected: { factionKey: input.factionKey, factionName: faction.name, before, after: input.points, tier },
      }));
      await AdminAuditService.record(tx, actor, {
        action: 'faction.standing-adjust',
        targetType: 'player-faction-standing',
        targetId: saved.id,
        reason: input.reason,
        before: { roundId: player.round.id, roundPlayerId, displayName: player.displayName, factionKey: input.factionKey, factionName: faction.name, points: before, tier: factionTier(before, rules) },
        after: { roundId: player.round.id, roundPlayerId, displayName: player.displayName, factionKey: input.factionKey, factionName: faction.name, points: input.points, tier, sourceKey },
      });
    });
    const { AdminPlayerService } = await import('./admin-player.service.js');
    return AdminPlayerService.inspect(prisma, roundPlayerId, now);
  },
};
