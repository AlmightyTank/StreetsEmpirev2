import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { CASE_SCALE, cityLaw, coolCase, loadRulesetForRound, wantedStage } from '@streets/rules-engine';
import type { AdminLawDto, AdminLawPlayerDto, WantedStageDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer } from '../utils/db.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { LawService } from './law.service.js';
import { LawOfficialService } from './law-official.service.js';
import { LawWarrantService } from './law-warrant.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HIGHEST_LIMIT = 15;
const MISMATCH_LIMIT = 25;

const emptyCounts = (): Record<WantedStageDto, number> => ({ QUIET: 0, NOTICED: 0, INVESTIGATION: 0, WARRANT: 0, FEDERAL: 0 });

/**
 * 1.3.0-G. Law operations for staff.
 *
 * The report is read-only. The one write is an audited correction that sets a player's Case
 * in one city to an exact value, written as an ADMIN receipt like any other change so the
 * receipts still add up; it never drafts a warrant, alerts or advances a Job on its own. A
 * player's Case stays private to everyone but them and staff.
 */
export const AdminLawService = {
  async report(prisma: PrismaClient, roundId: string, now = new Date()): Promise<AdminLawDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true, rulesetId: true, rulesetVersion: true } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const ruleset = loadRulesetForRound(round);
    const rules = ruleset.law;
    const empty: AdminLawDto = {
      roundId, generatedAt: now.toISOString(), enabled: false, rulesetId: round.rulesetId,
      stages: [], highest: [],
      warrants: { open: 0, waiting: 0, served24h: 0, lawyered24h: 0, quashed24h: 0 },
      payroll: { working: {}, underInvestigation: 0, stung24h: 0 },
      tips24h: 0, receipts24h: [], integrity: { checked: 0, mismatches: [] }, adjustments7d: 0,
    };
    if (!rules) return empty;

    const since = new Date(now.getTime() - DAY_MS);
    const inRound = { roundPlayer: { roundId } };
    const [cases, warrantsOpen, warrantsResolved, officials, stings, tips, receipts, sums, adjustments] = await Promise.all([
      prisma.playerCase.findMany({
        where: inRound,
        include: { city: { select: { slug: true, name: true } }, roundPlayer: { select: { displayName: true } } },
      }),
      prisma.playerWarrant.groupBy({ by: ['status'], where: { ...inRound, status: { in: ['OPEN', 'WAITING'] } }, _count: { _all: true } }),
      prisma.playerWarrant.groupBy({ by: ['status'], where: { ...inRound, resolvedAt: { gte: since } }, _count: { _all: true } }),
      // Every ACTIVE row: a lapsed week still leaves an open Internal Affairs file that can sting.
      prisma.playerOfficial.findMany({ where: { ...inRound, status: 'ACTIVE' }, select: { role: true, iaOpenedAt: true, paidUntil: true } }),
      prisma.playerActivity.count({ where: { ...inRound, type: 'OFFICIAL_STUNG', createdAt: { gte: since } } }),
      prisma.playerTip.count({ where: { ...inRound, createdAt: { gte: since } } }),
      prisma.playerCaseReceipt.groupBy({ by: ['source'], where: { ...inRound, createdAt: { gte: since } }, _count: { _all: true }, _sum: { deltaHundredths: true } }),
      prisma.playerCaseReceipt.groupBy({ by: ['roundPlayerId', 'cityId'], where: inRound, _sum: { deltaHundredths: true } }),
      prisma.adminAuditLog.count({ where: { action: 'law.case-adjust', createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) }, after: { path: ['roundId'], equals: roundId } } }),
    ]);

    const stages = new Map<string, { citySlug: string; cityName: string; counts: Record<WantedStageDto, number> }>();
    const standing = cases.map((row) => {
      const hundredths = coolCase(row, now, rules, cityLaw(rules, row.city.slug).coolingSpeed);
      const stage = wantedStage(hundredths, rules);
      const city = stages.get(row.city.slug) ?? { citySlug: row.city.slug, cityName: row.city.name, counts: emptyCounts() };
      city.counts[stage] += 1;
      stages.set(row.city.slug, city);
      return { row, hundredths, stage };
    });

    const stored = new Map(cases.map((row) => [`${row.roundPlayerId}:${row.cityId}`, row]));
    const mismatches: AdminLawDto['integrity']['mismatches'] = [];
    const sumByCase = new Map(sums.map((entry) => [`${entry.roundPlayerId}:${entry.cityId}`, entry._sum.deltaHundredths ?? 0]));
    for (const row of cases) {
      const sum = sumByCase.get(`${row.roundPlayerId}:${row.cityId}`) ?? 0;
      if (sum !== row.caseHundredths) {
        mismatches.push({ playerId: row.roundPlayerId, displayName: row.roundPlayer.displayName, cityName: row.city.name, stored: row.caseHundredths / CASE_SCALE, receipts: sum / CASE_SCALE });
      }
    }
    // Receipts for a city with no stored Case at all are just as wrong.
    for (const entry of sums) {
      if (stored.has(`${entry.roundPlayerId}:${entry.cityId}`) || !entry._sum.deltaHundredths) continue;
      mismatches.push({ playerId: entry.roundPlayerId, displayName: '(no Case row)', cityName: entry.cityId, stored: 0, receipts: entry._sum.deltaHundredths / CASE_SCALE });
    }

    const working: Record<string, number> = {};
    for (const official of officials) {
      if (official.paidUntil > now) working[official.role] = (working[official.role] ?? 0) + 1;
    }
    const statusCount = (rows: typeof warrantsOpen, status: string) => rows.find((row) => row.status === status)?._count._all ?? 0;

    return {
      roundId,
      generatedAt: now.toISOString(),
      enabled: true,
      rulesetId: round.rulesetId,
      stages: [...stages.values()].sort((a, b) => a.cityName.localeCompare(b.cityName)),
      highest: standing
        .filter((entry) => entry.hundredths > 0)
        .sort((a, b) => b.hundredths - a.hundredths)
        .slice(0, HIGHEST_LIMIT)
        .map(({ row, hundredths, stage }) => ({ playerId: row.roundPlayerId, displayName: row.roundPlayer.displayName, cityName: row.city.name, case: hundredths / CASE_SCALE, stage })),
      warrants: {
        open: statusCount(warrantsOpen, 'OPEN'),
        waiting: statusCount(warrantsOpen, 'WAITING'),
        served24h: statusCount(warrantsResolved, 'SERVED'),
        lawyered24h: statusCount(warrantsResolved, 'LAWYERED'),
        quashed24h: statusCount(warrantsResolved, 'QUASHED'),
      },
      payroll: { working, underInvestigation: officials.filter((official) => official.iaOpenedAt).length, stung24h: stings },
      tips24h: tips,
      receipts24h: receipts
        .map((row) => ({ source: row.source, entries: row._count._all, caseChange: (row._sum.deltaHundredths ?? 0) / CASE_SCALE }))
        .sort((a, b) => b.entries - a.entries),
      integrity: { checked: cases.length, mismatches: mismatches.slice(0, MISMATCH_LIMIT) },
      adjustments7d: adjustments,
    };
  },

  /** One player's Case page, exactly as they would read it now, without settling anything. */
  async player(prisma: PrismaClient, roundPlayerId: string, now = new Date()): Promise<AdminLawPlayerDto> {
    const player = await prisma.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      select: { id: true, displayName: true, cityId: true, round: { select: { id: true, name: true, rulesetId: true, rulesetVersion: true } } },
    });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
    const ruleset = loadRulesetForRound(player.round);
    const page = await LawService.page(prisma, player.id, player.cityId, ruleset, now);
    const decorated = page
      ? await LawOfficialService.decoratePage(prisma, await LawWarrantService.decoratePage(prisma, page, player.id), player.id)
      : null;
    // Every city on the map, so staff can correct a city the player has no Case in yet, on
    // rulesets before officials (D) as well.
    // 1.5.0-E3: only the cities this round's map has (San Francisco replaced Beverly Hills).
    const cities = page
      ? (await prisma.city.findMany({ where: { isEnabled: true }, orderBy: { sortOrder: 'asc' }, select: { slug: true, name: true } }))
        .filter((city) => !ruleset.cities || ruleset.cities[city.slug])
      : [];
    return { playerId: player.id, displayName: player.displayName, roundId: player.round.id, roundName: player.round.name, cities, page: decorated };
  },

  /** Set the player's Case in one city to `points`, with a reason, in one audited transaction. */
  async adjust(
    prisma: PrismaClient,
    actor: AuditActor,
    roundPlayerId: string,
    input: { citySlug: string; points: number; reason: string },
    now = new Date(),
  ): Promise<AdminLawPlayerDto> {
    await prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const player = await tx.roundPlayer.findUnique({
        where: { id: roundPlayerId },
        select: { id: true, accountId: true, displayName: true, round: { select: { id: true, status: true, rulesetId: true, rulesetVersion: true } } },
      });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
      if (player.accountId === actor.id) throw AppError.conflict('ADMIN_SELF_ACTION', 'Another admin has to correct your own Case.');
      if (player.round.status !== 'ACTIVE' && player.round.status !== 'REGISTRATION') {
        throw AppError.conflict('ROUND_FINISHED', 'That round has finished, so its Cases are frozen.');
      }
      const ruleset = loadRulesetForRound(player.round);
      const rules = ruleset.law;
      if (!rules) throw AppError.conflict('LAW_DISABLED', 'The police keep no Case in this round.');
      if (!Number.isFinite(input.points) || input.points < 0 || input.points > rules.caseMax) {
        throw AppError.badRequest('CASE_ADJUST_INVALID', `A Case runs from 0 to ${rules.caseMax}.`);
      }
      const city = await tx.city.findUnique({ where: { slug: input.citySlug }, select: { id: true, slug: true, name: true } });
      if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That city does not exist.');

      const before = await LawService.caseIn(tx, roundPlayerId, ruleset, city.id, now);
      const target = Math.round(input.points * CASE_SCALE);
      if (target === before) throw AppError.conflict('CASE_UNCHANGED', `The Case in ${city.name} is already ${before / CASE_SCALE}.`);
      const sourceKey = `admin:${randomUUID()}`;
      await LawService.record(tx, roundPlayerId, ruleset, [
        target < before
          ? { cityId: city.id, ceiling: target, source: 'ADMIN', sourceKey }
          : { cityId: city.id, floor: target, source: 'ADMIN', sourceKey },
      ], now);
      const row = await tx.playerCase.findUniqueOrThrow({ where: { roundPlayerId_cityId: { roundPlayerId, cityId: city.id } } });
      await AdminAuditService.record(tx, actor, {
        action: 'law.case-adjust',
        targetType: 'player-case',
        targetId: row.id,
        reason: input.reason,
        before: { roundId: player.round.id, roundPlayerId, displayName: player.displayName, city: city.slug, case: before / CASE_SCALE, stage: wantedStage(before, rules) },
        after: { roundId: player.round.id, roundPlayerId, displayName: player.displayName, city: city.slug, case: row.caseHundredths / CASE_SCALE, stage: row.stage, sourceKey },
      });
    });
    return AdminLawService.player(prisma, roundPlayerId, now);
  },
};
