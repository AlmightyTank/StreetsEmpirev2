import type { Prisma } from '@prisma/client';
import type { Db } from '../utils/db.js';

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
  return db.cityMemoryEvent.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      roundId: input.roundId,
      cityId: input.cityId,
      kind: input.kind,
      visibility: input.visibility ?? 'public',
      actors: json(input.actorRoundPlayerIds ?? []),
      summary: json(input.summary ?? {}),
      happenedAt: input.happenedAt ?? new Date(),
      idempotencyKey: input.idempotencyKey,
    },
    update: {},
  });
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
