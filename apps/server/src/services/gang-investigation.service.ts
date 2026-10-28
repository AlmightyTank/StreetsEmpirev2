import type { Prisma } from '@prisma/client';
import type { GangIntelDto, GangInvestigationActionResult, GangInvestigationDto, GangInvestigationPageDto, GangInvestigationAdvanceInput } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { ActionService, assertTurns } from './action.service.js';
import { AppError } from '../utils/errors.js';
import { recordGangEvent } from './gang-relationship.service.js';

const INVESTIGATION_HOURS = 24;

export interface GangInvestigationScoutInput {
  roundId: string;
  roundPlayerId: string;
  cityId: string;
  district: string;
  turns: number;
  now: Date;
}

function statusForConfidence(confidence: number): GangIntelDto['status'] {
  if (confidence >= 4) return 'CONFIRMED';
  if (confidence >= 2) return 'SUSPECTED';
  return 'TRAIL';
}

function targetForConfidence(confidence: number): string {
  if (confidence >= 4) return 'SAFEHOUSE';
  if (confidence >= 2) return 'RUNNER_ROUTE';
  return 'TURF_CORNER';
}

function clueFor(gang: { crewName: string }, confidence: number, stakeout: boolean): string {
  if (stakeout) return `${gang.crewName} has been pinned to a safehouse. Your crew can plan a hit from here.`;
  if (confidence >= 4) return `${gang.crewName} is using a nearby safehouse to coordinate activity in this district.`;
  if (confidence >= 2) return `${gang.crewName} runners are repeatedly crossing this district after dark.`;
  return `A runner linked to ${gang.crewName} was seen working this district.`;
}

function readClues(value: unknown): Array<{ text: string; observedAt: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { text: string; observedAt: string } => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Record<string, unknown>;
    return typeof row.text === 'string' && typeof row.observedAt === 'string';
  });
}

function toDto(row: {
  id: string; district: string; targetLocation: string; status: string; confidence: number; clueCount: number;
  clues: unknown; gangAwareness: number; expiresAt: Date; lastObservedAt: Date;
  gang: { slug: string; bossName: string; crewName: string; crewTag: string };
  city: { slug: string; name: string };
}): GangInvestigationDto {
  const clues = readClues(row.clues);
  return {
    id: row.id,
    gang: row.gang,
    district: row.district,
    targetLocation: row.targetLocation,
    status: row.status as GangIntelDto['status'],
    confidence: row.confidence,
    clueCount: row.clueCount,
    clue: clues.at(-1)?.text ?? 'No fresh clue is available.',
    clues,
    gangAwareness: row.gangAwareness,
    expiresAt: row.expiresAt.toISOString(),
    lastObservedAt: row.lastObservedAt.toISOString(),
    city: row.city,
  };
}

const investigationSelect = {
  id: true, district: true, targetLocation: true, status: true, confidence: true, clueCount: true,
  clues: true, gangAwareness: true, expiresAt: true, lastObservedAt: true,
  gang: { select: { slug: true, bossName: true, crewName: true, crewTag: true } },
  city: { select: { slug: true, name: true } },
} as const;

export const GangInvestigationService = {
  async observeScout(db: Db, input: GangInvestigationScoutInput): Promise<GangIntelDto | null> {
    const turf = await db.turf.findUnique({
      where: { roundId_cityId_district: { roundId: input.roundId, cityId: input.cityId, district: input.district } },
      select: {
        localGangId: true,
        localGang: { select: { slug: true, bossName: true, crewName: true, crewTag: true } },
      },
    });
    if (!turf?.localGangId || !turf.localGang) return null;

    const existing = await db.gangInvestigation.findUnique({
      where: { roundPlayerId_gangId_cityId_district: { roundPlayerId: input.roundPlayerId, gangId: turf.localGangId, cityId: input.cityId, district: input.district } },
      select: { confidence: true, clueCount: true, clues: true, gangAwareness: true },
    });
    const confidence = Math.min(4, (existing?.confidence ?? 0) + (input.turns >= 3 ? 2 : 1));
    const status = statusForConfidence(confidence);
    const clue = confidence >= 4
      ? `${turf.localGang.crewName} is using a nearby safehouse to coordinate activity in this district.`
      : confidence >= 2
      ? `${turf.localGang.crewName} runners are repeatedly crossing this district after dark.`
      : `A runner linked to ${turf.localGang.crewName} was seen working this district.`;
    const priorClues = Array.isArray(existing?.clues) ? existing.clues : [];
    const clues = [...priorClues, { text: clue, observedAt: input.now.toISOString() }].slice(-6) as Prisma.InputJsonValue;
    const expiresAt = new Date(input.now.getTime() + INVESTIGATION_HOURS * 3_600_000);
    const investigation = await db.gangInvestigation.upsert({
      where: { roundPlayerId_gangId_cityId_district: { roundPlayerId: input.roundPlayerId, gangId: turf.localGangId, cityId: input.cityId, district: input.district } },
      create: {
        roundId: input.roundId, roundPlayerId: input.roundPlayerId, gangId: turf.localGangId,
        cityId: input.cityId, district: input.district, targetLocation: 'TURF_CORNER', status,
        confidence, clueCount: 1, clues, gangAwareness: confidence >= 4 ? 1 : 0,
        lastObservedAt: input.now, expiresAt,
      },
      update: {
        status, confidence, clueCount: (existing?.clueCount ?? 0) + 1, clues,
        gangAwareness: (existing?.gangAwareness ?? 0) + (confidence >= 4 ? 1 : 0),
        lastObservedAt: input.now, expiresAt, resolvedAt: null,
      },
      select: { status: true, confidence: true, clueCount: true, gangAwareness: true, expiresAt: true },
    });
    await recordGangEvent(db, {
      roundId: input.roundId,
      gangId: turf.localGangId,
      roundPlayerId: input.roundPlayerId,
      sourceKind: 'GANG_SCOUT',
      sourceId: `${input.roundPlayerId}:${input.cityId}:${input.district}:${input.now.toISOString()}`,
      outcome: 'CLUE_FOUND',
      scoreDelta: 1,
      summary: clue,
      metadata: { confidence, status },
      occurredAt: input.now,
    });
    return {
      gang: turf.localGang,
      district: input.district,
      targetLocation: 'TURF_CORNER',
      status: investigation.status as GangIntelDto['status'],
      confidence: investigation.confidence,
      clueCount: investigation.clueCount,
      clue,
      gangAwareness: investigation.gangAwareness,
      expiresAt: investigation.expiresAt.toISOString(),
    };
  },

  async page(db: Db, roundPlayerId: string, now = new Date()): Promise<GangInvestigationPageDto> {
    const rows = await db.gangInvestigation.findMany({
      where: {
        roundPlayerId,
        resolvedAt: null,
        expiresAt: { gt: now },
        status: { notIn: ['EXPIRED', 'RESOLVED'] },
      },
      select: investigationSelect,
      orderBy: [{ status: 'desc' }, { lastObservedAt: 'desc' }],
    });
    return { investigations: rows.map(toDto) };
  },

  async advance(db: import('@prisma/client').PrismaClient, roundPlayerId: string, input: GangInvestigationAdvanceInput, now = new Date()) {
    return ActionService.run<GangInvestigationActionResult>(db, roundPlayerId, {
      action: 'GANG_INVESTIGATION_ADVANCE',
      actionId: input.actionId,
      idempotencyScope: `GANG_INVESTIGATION_ADVANCE:${input.investigationId}`,
      execute: async ({ tx, current, round }) => {
        assertTurns(current.turns, 1);
        const existing = await tx.gangInvestigation.findFirst({
          where: { id: input.investigationId, roundPlayerId, resolvedAt: null },
          select: { ...investigationSelect, gangId: true, cityId: true },
        });
        if (!existing) throw AppError.notFound('GANG_INVESTIGATION_NOT_FOUND', 'That gang lead is no longer available.');
        if (existing.expiresAt <= now) {
          await tx.gangInvestigation.update({ where: { id: existing.id }, data: { status: 'EXPIRED' } });
          throw AppError.conflict('GANG_INVESTIGATION_EXPIRED', 'That gang lead has gone cold.');
        }
        const stakeout = existing.confidence >= 4;
        const confidence = Math.min(4, existing.confidence + 1);
        const status = stakeout ? 'STAKEOUT' : statusForConfidence(confidence);
        const clue = clueFor(existing.gang, confidence, stakeout);
        const clues = [...readClues(existing.clues), { text: clue, observedAt: now.toISOString() }].slice(-6);
        const updated = await tx.gangInvestigation.update({
          where: { id: existing.id },
          data: {
            targetLocation: targetForConfidence(confidence), status, confidence,
            clueCount: existing.clueCount + 1, clues,
            gangAwareness: existing.gangAwareness + (confidence >= 4 ? 1 : 0),
            lastObservedAt: now,
            expiresAt: new Date(now.getTime() + 24 * 3_600_000),
          },
          select: investigationSelect,
        });
        await recordGangEvent(tx, {
          roundId: round.id,
          gangId: existing.gangId,
          roundPlayerId,
          sourceKind: 'GANG_INVESTIGATION_ADVANCE',
          sourceId: input.actionId,
          outcome: stakeout ? 'STAKEOUT_ESTABLISHED' : 'LEAD_FOLLOWED',
          scoreDelta: 0,
          summary: clue,
          metadata: { investigationId: existing.id, status, targetLocation: targetForConfidence(confidence) },
          occurredAt: now,
        });
        return {
          next: { ...current, turns: current.turns - 1 },
          result: { investigation: toDto(updated), turnsUsed: 1 },
        };
      },
    }, now);
  },
};
