import type { Prisma } from '@prisma/client';
import type { Db } from '../utils/db.js';
import { activeRoundEventTime } from '@streets/rulesets';
import { inviteFromSettledMemory, LIVING_STORY_MEMORY_KINDS } from './living-story-trigger.service.js';

export type CityMemoryKind =
  | 'takeover'
  | 'war_win'
  | 'business_flip'
  | 'crackdown'
  | 'operation_complete';

export type CityMemoryVisibility = 'public' | 'involved-only';

export interface EmitCityMemoryInput {
  roundId: string;
  cityId: string;
  kind: CityMemoryKind | string;
  visibility?: CityMemoryVisibility | string;
  actorRoundPlayerIds?: string[];
  summary?: unknown;
  happenedAt?: Date;
  idempotencyKey: string;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function emitCityMemoryEvent(db: Db, input: EmitCityMemoryInput) {
  const storyKind = (LIVING_STORY_MEMORY_KINDS as readonly string[]).includes(input.kind);
  const round = storyKind ? await db.round.findUnique({ where: { id: input.roundId } }) : null;
  const happenedAt = input.happenedAt ?? new Date();
  const event = await db.cityMemoryEvent.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      roundId: input.roundId,
      cityId: input.cityId,
      kind: input.kind,
      visibility: input.visibility ?? 'public',
      actors: json(input.actorRoundPlayerIds ?? []),
      summary: json(input.summary ?? {}),
      happenedAt,
      ...(round ? { happenedAtActive: activeRoundEventTime(round, happenedAt) } : {}),
      idempotencyKey: input.idempotencyKey,
    },
    update: {},
  });
  if (round && round.status === 'ACTIVE' && !round.pausedAt) {
    await inviteFromSettledMemory(db, event, happenedAt);
  }
  return event;
}

function actorIds(row: { actors: unknown }): string[] {
  return Array.isArray(row.actors) ? row.actors.filter((id): id is string => typeof id === 'string') : [];
}

export interface ListCityMemoryOptions {
  roundId: string;
  cityId?: string;
  viewerRoundPlayerIds?: string[];
  limit?: number;
}

export async function listVisibleCityMemory(db: Db, options: ListCityMemoryOptions) {
  const rows = await db.cityMemoryEvent.findMany({
    where: {
      roundId: options.roundId,
      ...(options.cityId ? { cityId: options.cityId } : {}),
    },
    orderBy: { happenedAt: 'desc' },
    take: Math.min(Math.max(options.limit ?? 50, 1), 200),
  });
  const viewer = new Set(options.viewerRoundPlayerIds ?? []);
  return rows.filter((row) => {
    if (row.visibility === 'public') return true;
    if (viewer.size === 0) return false;
    return actorIds(row).some((id) => viewer.has(id));
  });
}

export async function latestCityMemoryForCity(db: Db, roundId: string, cityId: string) {
  const rows = await listVisibleCityMemory(db, { roundId, cityId, limit: 1 });
  return rows[0] ?? null;
}
