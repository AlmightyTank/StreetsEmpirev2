import type { Prisma } from '@prisma/client';

/**
 * Phase I. One human crew an NPC gang remembers hitting it. Grudges are rebuilt
 * from raid battles every tick, so `memory.grudges` is a cache for admins and
 * reports, never the source of truth.
 */
export interface NpcGrudge {
  attackerId: string;
  publicPimpId: number;
  name: string;
  hits: number;
  lastHitAt: string;
  lastBattleId: string;
  lastKind: string;
  expiresAt: string;
  /** Set once this gang hit them back after their latest hit. */
  settledAt: string | null;
  settledBattleId: string | null;
}

export interface NpcGrudgeHit {
  id: string;
  attackerId: string;
  publicPimpId: number;
  name: string;
  kind: string;
  createdAt: Date;
}

export interface NpcGrudgePayback {
  id: string;
  defenderId: string;
  createdAt: Date;
}

export const MAX_REMEMBERED_GRUDGES = 8;

/**
 * Folds the hits a gang took inside the window into one grudge per attacker.
 * A grudge is settled by a payback landed after that attacker's latest hit, so
 * hitting the gang again reopens it.
 */
export function buildNpcGrudges(hits: readonly NpcGrudgeHit[], paybacks: readonly NpcGrudgePayback[], windowHours: number, now: Date): NpcGrudge[] {
  const windowMs = Math.max(1, windowHours) * 3_600_000;
  const byAttacker = new Map<string, { hits: number; latest: NpcGrudgeHit }>();
  for (const hit of hits) {
    if (now.getTime() - hit.createdAt.getTime() > windowMs) continue;
    const row = byAttacker.get(hit.attackerId);
    if (!row) byAttacker.set(hit.attackerId, { hits: 1, latest: hit });
    else {
      row.hits += 1;
      if (hit.createdAt > row.latest.createdAt) row.latest = hit;
    }
  }

  const grudges: NpcGrudge[] = [];
  for (const [attackerId, { hits: count, latest }] of byAttacker) {
    const settled = paybacks
      .filter((payback) => payback.defenderId === attackerId && payback.createdAt > latest.createdAt)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0];
    grudges.push({
      attackerId,
      publicPimpId: latest.publicPimpId,
      name: latest.name,
      hits: count,
      lastHitAt: latest.createdAt.toISOString(),
      lastBattleId: latest.id,
      lastKind: latest.kind,
      expiresAt: new Date(latest.createdAt.getTime() + windowMs).toISOString(),
      settledAt: settled?.createdAt.toISOString() ?? null,
      settledBattleId: settled?.id ?? null,
    });
  }

  // Open grudges first, then the most hits, then the freshest.
  return grudges
    .sort((left, right) => Number(Boolean(left.settledAt)) - Number(Boolean(right.settledAt))
      || right.hits - left.hits
      || Date.parse(right.lastHitAt) - Date.parse(left.lastHitAt)
      || left.publicPimpId - right.publicPimpId)
    .slice(0, MAX_REMEMBERED_GRUDGES);
}

export function openNpcGrudges(grudges: readonly NpcGrudge[], now: Date): NpcGrudge[] {
  return grudges.filter((grudge) => !grudge.settledAt && Date.parse(grudge.expiresAt) > now.getTime());
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Reads the cached grudges back out of `NpcGang.memory`, dropping anything malformed or expired. */
export function storedNpcGrudges(memory: Prisma.JsonValue, now: Date): NpcGrudge[] {
  if (!isObject(memory) || !Array.isArray(memory.grudges)) return [];
  return memory.grudges.flatMap((row): NpcGrudge[] => {
    if (!isObject(row)) return [];
    const { attackerId, publicPimpId, name, hits, lastHitAt, lastBattleId, lastKind, expiresAt, settledAt, settledBattleId } = row;
    if (typeof attackerId !== 'string' || typeof publicPimpId !== 'number' || typeof name !== 'string'
      || typeof hits !== 'number' || typeof lastHitAt !== 'string' || typeof expiresAt !== 'string') return [];
    if (Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now.getTime()) return [];
    return [{
      attackerId, publicPimpId, name, hits, lastHitAt, expiresAt,
      lastBattleId: typeof lastBattleId === 'string' ? lastBattleId : '',
      lastKind: typeof lastKind === 'string' ? lastKind : 'RAID',
      settledAt: typeof settledAt === 'string' ? settledAt : null,
      settledBattleId: typeof settledBattleId === 'string' ? settledBattleId : null,
    }];
  });
}

export function grudgesJson(grudges: readonly NpcGrudge[]): Prisma.JsonArray {
  return grudges.map((grudge) => ({ ...grudge }));
}
