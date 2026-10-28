import type { Prisma } from '@prisma/client';
import type { Db } from '../utils/db.js';

export type GangRelationshipStatus = 'UNKNOWN' | 'NOTICED' | 'FRIENDLY' | 'TRUSTED' | 'ALLIED' | 'HOSTILE' | 'VENDETTA' | 'NEMESIS' | 'DEFEATED';

export const GangRelationshipEventKind = {
  TURF_CLAIM: 'TURF_CLAIM',
  GANG_SCOUT: 'GANG_SCOUT',
  GANG_INVESTIGATION_ADVANCE: 'GANG_INVESTIGATION_ADVANCE',
  TRADE_COMPLETED: 'TRADE_COMPLETED',
  FAIR_PRICE_DEAL: 'FAIR_PRICE_DEAL',
  FAVOR_COMPLETED: 'FAVOR_COMPLETED',
  INFORMATION_SHARED: 'INFORMATION_SHARED',
  PROTECTION_PROVIDED: 'PROTECTION_PROVIDED',
  DEAL_BROKEN: 'DEAL_BROKEN',
  TRADER_THREATENED: 'TRADER_THREATENED',
  GANG_MEMBER_ATTACKED: 'GANG_MEMBER_ATTACKED',
  PLAYER_ATTACKED_GANG: 'PLAYER_ATTACKED_GANG',
} as const;

export type GangRelationshipEventKind = typeof GangRelationshipEventKind[keyof typeof GangRelationshipEventKind];

export interface GangRelationshipSummary {
  status: GangRelationshipStatus;
  hostilityScore: number;
  trustScore: number;
  respectScore: number;
  favorsCompleted: number;
  favorsOwed: number;
  betrayalCount: number;
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
  trustDelta?: number;
  respectDelta?: number;
  favorsCompletedDelta?: number;
  favorsOwedDelta?: number;
  betrayal?: boolean;
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

export function gangStatusForRelationship(hostility: number, trust: number): GangRelationshipStatus {
  if (hostility >= 12) return 'NEMESIS';
  if (hostility >= 8) return 'VENDETTA';
  if (hostility >= 4) return 'HOSTILE';
  if (trust >= 12) return 'ALLIED';
  if (trust >= 8) return 'TRUSTED';
  if (trust >= 4) return 'FRIENDLY';
  if (hostility >= 1 || trust >= 1) return 'NOTICED';
  return 'UNKNOWN';
}

function summary(row: { status: string; score: number; trustScore: number; respectScore: number; favorsCompleted: number; favorsOwed: number; betrayalCount: number; eventCount: number; lastEventAt: Date }): GangRelationshipSummary {
  return {
    status: row.status as GangRelationshipStatus,
    hostilityScore: row.score,
    trustScore: row.trustScore,
    respectScore: row.respectScore,
    favorsCompleted: row.favorsCompleted,
    favorsOwed: row.favorsOwed,
    betrayalCount: row.betrayalCount,
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
      select: { status: true, score: true, trustScore: true, respectScore: true, favorsCompleted: true, favorsOwed: true, betrayalCount: true, eventCount: true, lastEventAt: true },
    });
    return summary(relationship);
  }

  const occurredAt = input.occurredAt ?? new Date();
  const relationship = await db.gangPlayerRelationship.upsert({
    where: { gangId_roundPlayerId: { gangId: input.gangId, roundPlayerId: input.roundPlayerId } },
    create: {
      gangId: input.gangId,
      roundPlayerId: input.roundPlayerId,
      status: gangStatusForRelationship(Math.max(0, input.scoreDelta), Math.max(0, input.trustDelta ?? 0)),
      score: Math.max(0, input.scoreDelta),
      trustScore: Math.max(0, input.trustDelta ?? 0),
      respectScore: Math.max(0, input.respectDelta ?? 0),
      favorsCompleted: Math.max(0, input.favorsCompletedDelta ?? 0),
      favorsOwed: Math.max(0, input.favorsOwedDelta ?? 0),
      betrayalCount: input.betrayal ? 1 : 0,
      eventCount: 0,
      firstEventAt: occurredAt,
      lastEventAt: occurredAt,
    },
    update: {},
    select: {
      id: true, status: true, score: true, trustScore: true, respectScore: true,
      favorsCompleted: true, favorsOwed: true, betrayalCount: true, eventCount: true,
      lastEventAt: true, vendettaAt: true, nemesisAt: true,
      friendlyAt: true, trustedAt: true, alliedAt: true, betrayedAt: true,
    },
  });
  const score = Math.max(0, relationship.score + input.scoreDelta);
  const trustScore = Math.max(0, relationship.trustScore + (input.trustDelta ?? 0));
  const respectScore = Math.max(0, relationship.respectScore + (input.respectDelta ?? 0));
  const favorsCompleted = Math.max(0, relationship.favorsCompleted + (input.favorsCompletedDelta ?? 0));
  const favorsOwed = Math.max(0, relationship.favorsOwed + (input.favorsOwedDelta ?? 0));
  const betrayalCount = relationship.betrayalCount + (input.betrayal ? 1 : 0);
  const status = gangStatusForRelationship(score, trustScore);
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
      trustDelta: input.trustDelta ?? 0,
      respectDelta: input.respectDelta ?? 0,
      favorsCompletedDelta: input.favorsCompletedDelta ?? 0,
      favorsOwedDelta: input.favorsOwedDelta ?? 0,
      betrayal: input.betrayal ?? false,
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
      trustScore,
      respectScore,
      favorsCompleted,
      favorsOwed,
      betrayalCount,
      eventCount,
      lastEventAt: occurredAt,
      ...(relationship.vendettaAt === null && status === 'VENDETTA' ? { vendettaAt: occurredAt } : {}),
      ...(relationship.nemesisAt === null && status === 'NEMESIS' ? { nemesisAt: occurredAt } : {}),
      ...(relationship.friendlyAt === null && status === 'FRIENDLY' ? { friendlyAt: occurredAt } : {}),
      ...(relationship.trustedAt === null && status === 'TRUSTED' ? { trustedAt: occurredAt } : {}),
      ...(relationship.alliedAt === null && status === 'ALLIED' ? { alliedAt: occurredAt } : {}),
      ...(input.betrayal && relationship.betrayedAt === null ? { betrayedAt: occurredAt } : {}),
    },
    select: { status: true, score: true, trustScore: true, respectScore: true, favorsCompleted: true, favorsOwed: true, betrayalCount: true, eventCount: true, lastEventAt: true },
  });
  return summary(updated);
}
