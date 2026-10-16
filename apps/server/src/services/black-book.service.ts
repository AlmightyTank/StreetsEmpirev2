import type { Prisma } from '@prisma/client';
import type { BlackBookPageDto, IntelConfidenceDto, IntelSourceKindDto } from '@streets/shared';
import type { Db } from '../utils/db.js';

interface IntelSource {
  kind: IntelSourceKindDto;
  observedAt: string;
}

export interface RecordIntelSignalInput {
  roundId: string;
  ownerId: string;
  targetId?: string | null;
  cityId: string;
  district?: string | null;
  topic: string;
  sourceKind: IntelSourceKindDto;
  strengthBand?: 'light' | 'guarded' | 'heavy' | 'unknown';
  observedAt?: Date;
  expiresAt: Date;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readSources(value: unknown): IntelSource[] {
  if (!Array.isArray(value)) return [];
  return value.filter((source): source is IntelSource => {
    if (!source || typeof source !== 'object') return false;
    const item = source as Record<string, unknown>;
    return (item.kind === 'contact' || item.kind === 'scout' || item.kind === 'faction_warning')
      && typeof item.observedAt === 'string';
  });
}

export function mergeIntelSources(existing: unknown, next: IntelSource): { sources: IntelSource[]; confidence: IntelConfidenceDto } {
  const byKind = new Map(readSources(existing).map((source) => [source.kind, source]));
  const prior = byKind.get(next.kind);
  if (!prior || prior.observedAt < next.observedAt) byKind.set(next.kind, next);
  const sources = [...byKind.values()].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const confidence: IntelConfidenceDto = sources.length >= 3 ? 'confirmed' : sources.length === 2 ? 'likely' : 'rumor';
  return { sources, confidence };
}

function strengthBand(report: unknown): 'light' | 'guarded' | 'heavy' | 'unknown' {
  if (!report || typeof report !== 'object') return 'unknown';
  const fitThugs = (report as Record<string, unknown>).fitThugs;
  if (typeof fitThugs !== 'number') return 'unknown';
  if (fitThugs < 25) return 'light';
  if (fitThugs < 100) return 'guarded';
  return 'heavy';
}

function detailBand(detail: unknown): 'light' | 'guarded' | 'heavy' | 'unknown' {
  if (!detail || typeof detail !== 'object') return 'unknown';
  const value = (detail as Record<string, unknown>).strengthBand;
  return value === 'light' || value === 'guarded' || value === 'heavy' ? value : 'unknown';
}

export function blackBookActionLinks(input: { citySlug: string; district?: string | null; targetPublicPimpId?: number | null }) {
  const turfQuery = new URLSearchParams({ city: input.citySlug, ...(input.district ? { district: input.district } : {}) });
  const targetId = input.targetPublicPimpId;
  return {
    investigate: targetId ? `/game/combat?target=${targetId}#intel` : `/game/scout?district=${encodeURIComponent(input.district ?? '')}`,
    negotiate: targetId ? `/game/players/${targetId}` : null,
    reinforce: `/game/turf?${turfQuery.toString()}`,
    strike: targetId ? `/game/combat?target=${targetId}` : null,
  };
}

export const BlackBookService = {
  async recordSignal(db: Db, input: RecordIntelSignalInput) {
    const observedAt = input.observedAt ?? new Date();
    const current = await db.intelRumor.findUnique({
      where: { ownerId_topic: { ownerId: input.ownerId, topic: input.topic } },
      select: { sources: true, expiresAt: true },
    });
    const merged = mergeIntelSources(current?.sources, { kind: input.sourceKind, observedAt: observedAt.toISOString() });
    const detail = { strengthBand: input.strengthBand ?? 'unknown' };
    return db.intelRumor.upsert({
      where: { ownerId_topic: { ownerId: input.ownerId, topic: input.topic } },
      create: {
        roundId: input.roundId,
        ownerId: input.ownerId,
        targetId: input.targetId ?? null,
        cityId: input.cityId,
        district: input.district ?? null,
        topic: input.topic,
        confidence: merged.confidence,
        sources: json(merged.sources),
        detail: json(detail),
        expiresAt: input.expiresAt,
      },
      update: {
        targetId: input.targetId ?? undefined,
        cityId: input.cityId,
        district: input.district ?? undefined,
        confidence: merged.confidence,
        sources: json(merged.sources),
        detail: json(detail),
        expiresAt: current && current.expiresAt > input.expiresAt ? current.expiresAt : input.expiresAt,
      },
    });
  },

  async expireStale(db: Db, now = new Date(), ownerId?: string): Promise<number> {
    const result = await db.intelRumor.deleteMany({ where: { expiresAt: { lte: now }, ...(ownerId ? { ownerId } : {}) } });
    return result.count;
  },

  async page(db: Db, ownerId: string, now = new Date()): Promise<BlackBookPageDto> {
    const owner = await db.roundPlayer.findUniqueOrThrow({
      where: { id: ownerId },
      select: { roundId: true, cityId: true },
    });
    const expiredRemoved = await this.expireStale(db, now, ownerId);

    // Project fresh combat recon into qualitative Black Book entries. The raw
    // report remains in CombatIntel; only a broad band crosses this boundary.
    const recon = await db.combatIntel.findMany({
      where: { observerId: ownerId, expiresAt: { gt: now } },
      select: { targetId: true, report: true, expiresAt: true, updatedAt: true, target: { select: { cityId: true } } },
    });
    for (const row of recon) {
      await this.recordSignal(db, {
        roundId: owner.roundId,
        ownerId,
        targetId: row.targetId,
        cityId: row.target.cityId,
        topic: `rival:${row.targetId}:defense`,
        sourceKind: 'scout',
        strengthBand: strengthBand(row.report),
        observedAt: row.updatedAt,
        expiresAt: row.expiresAt,
      });
    }

    const rows = await db.intelRumor.findMany({
      where: { ownerId, expiresAt: { gt: now } },
      include: {
        city: { select: { slug: true, name: true } },
        target: { select: { publicPimpId: true, displayName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const confidenceRank: Record<IntelConfidenceDto, number> = { rumor: 1, likely: 2, confirmed: 3 };
    rows.sort((a, b) => confidenceRank[b.confidence as IntelConfidenceDto] - confidenceRank[a.confidence as IntelConfidenceDto]
      || b.updatedAt.getTime() - a.updatedAt.getTime());

    return {
      expiredRemoved,
      entries: rows.map((row) => {
        return {
          id: row.id,
          confidence: row.confidence as IntelConfidenceDto,
          sourceKinds: readSources(row.sources).map((source) => source.kind),
          observedAt: row.updatedAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          ageMinutes: Math.max(0, Math.floor((now.getTime() - row.updatedAt.getTime()) / 60_000)),
          target: row.target,
          city: row.city,
          district: row.district,
          strengthBand: detailBand(row.detail),
          actions: blackBookActionLinks({ citySlug: row.city.slug, district: row.district, targetPublicPimpId: row.target?.publicPimpId }),
        };
      }),
    };
  },
};
