import type { Prisma } from '@prisma/client';
import type { GangIntelDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
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
};
