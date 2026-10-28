import type { Prisma } from '@prisma/client';
import type { Db } from '../utils/db.js';

export type GangRelationshipStatus = 'UNKNOWN' | 'NOTICED' | 'HOSTILE' | 'VENDETTA' | 'NEMESIS' | 'DEFEATED';

export interface GangRelationshipSummary {
  status: GangRelationshipStatus;
  score: number;
  eventCount: number;
  lastEventAt: Date;
}

export interface GangEventInput {
  roundId: string;
  gangId: string;
  roundPlayerId: string;
  turfId?: string;
  sourceKind: string;
  sourceId: string;
  outcome: string;
  scoreDelta: number;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
}

export function gangStatusForScore(score: number): GangRelationshipStatus {
  if (score >= 12) return 'NEMESIS';
  if (score >= 8) return 'VENDETTA';
  if (score >= 4) return 'HOSTILE';
  if (score >= 1) return 'NOTICED';
  return 'UNKNOWN';
}

function summary(row: { status: string; score: number; eventCount: number; lastEventAt: Date }): GangRelationshipSummary {
  return {
    status: row.status as GangRelationshipStatus,
    score: row.score,
    eventCount: row.eventCount,
    lastEventAt: row.lastEventAt,
  };
}

export async function recordGangEvent(db: Db, input: GangEventInput): Promise<GangRelationshipSummary> {
  const idempotencyKey = `gang:${input.gangId}:${input.roundPlayerId}:${input.sourceKind}:${input.sourceId}`;
  const existing = await db.gangEvent.findUnique({
    where: { idempotencyKey },
    select: { gangId: true, roundPlayerId: true },
  });
  if (existing) {
    const relationship = await db.gangPlayerRelationship.findUniqueOrThrow({
      where: { gangId_roundPlayerId: { gangId: existing.gangId, roundPlayerId: existing.roundPlayerId! } },
      select: { status: true, score: true, eventCount: true, lastEventAt: true },
    });
    return summary(relationship);
  }

  const occurredAt = input.occurredAt ?? new Date();
  const relationship = await db.gangPlayerRelationship.upsert({
    where: { gangId_roundPlayerId: { gangId: input.gangId, roundPlayerId: input.roundPlayerId } },
    create: {
      gangId: input.gangId,
      roundPlayerId: input.roundPlayerId,
      status: gangStatusForScore(Math.max(0, input.scoreDelta)),
      score: Math.max(0, input.scoreDelta),
      eventCount: 0,
      firstEventAt: occurredAt,
      lastEventAt: occurredAt,
    },
    update: {},
    select: { id: true, status: true, score: true, eventCount: true, lastEventAt: true, vendettaAt: true, nemesisAt: true },
  });
  const score = Math.max(0, relationship.score + input.scoreDelta);
  const status = gangStatusForScore(score);
  const eventCount = relationship.eventCount + 1;
  await db.gangEvent.create({
    data: {
      roundId: input.roundId,
      gangId: input.gangId,
      roundPlayerId: input.roundPlayerId,
      turfId: input.turfId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      idempotencyKey,
      outcome: input.outcome,
      scoreDelta: input.scoreDelta,
      summary: input.summary,
      metadata: input.metadata ?? {},
      occurredAt,
    },
  });
  const updated = await db.gangPlayerRelationship.update({
    where: { id: relationship.id },
    data: {
      status,
      score,
      eventCount,
      lastEventAt: occurredAt,
      ...(relationship.vendettaAt === null && status === 'VENDETTA' ? { vendettaAt: occurredAt } : {}),
      ...(relationship.nemesisAt === null && status === 'NEMESIS' ? { nemesisAt: occurredAt } : {}),
    },
    select: { status: true, score: true, eventCount: true, lastEventAt: true },
  });
  return summary(updated);
}
