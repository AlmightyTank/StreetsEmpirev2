import type { Prisma } from '@prisma/client';

export type ItemEvent = { at: string; type: string; summary: string; city?: string; otherPlayer?: string };

export function itemEvents(value: unknown): ItemEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.at !== 'string' || !Number.isFinite(Date.parse(row.at)) || typeof row.type !== 'string' || typeof row.summary !== 'string') return [];
    return [{ at: row.at, type: row.type, summary: row.summary,
      ...(typeof row.city === 'string' ? { city: row.city } : {}),
      ...(typeof row.otherPlayer === 'string' ? { otherPlayer: row.otherPlayer } : {}) }];
  });
}

export function appendItemEvent(value: unknown, event: Omit<ItemEvent, 'at'> & { at?: Date | string }): Prisma.InputJsonArray {
  const at = event.at instanceof Date ? event.at.toISOString() : event.at ?? new Date().toISOString();
  const next: ItemEvent = { at, type: event.type, summary: event.summary,
    ...(event.city ? { city: event.city } : {}), ...(event.otherPlayer ? { otherPlayer: event.otherPlayer } : {}) };
  return [...itemEvents(value), next].slice(-100) as Prisma.InputJsonArray;
}

export function historyScore(item: { name: string | null; stats: unknown; history: unknown; mods: unknown }): number {
  const stats = item.stats && typeof item.stats === 'object' && !Array.isArray(item.stats) ? item.stats as Record<string, unknown> : {};
  const modCount = Array.isArray(item.mods) ? item.mods.length : 0;
  return (item.name ? 20 : 0) + Math.max(0, Number(stats.fights) || 0) * 4 + Math.max(0, Number(stats.runs) || 0) * 3
    + Math.max(0, Number(stats.roundsFired) || 0) / 100 + modCount * 2 + itemEvents(item.history).length;
}

export function readFeaturedItem(value: unknown): import('@streets/shared').FeaturedItemDto | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || (row.kind !== 'GUN' && row.kind !== 'VEHICLE') || typeof row.model !== 'string'
    || typeof row.condition !== 'number' || typeof row.roundName !== 'string') return null;
  const mods = Array.isArray(row.mods) ? row.mods.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const mod = entry as Record<string, unknown>;
    return typeof mod.key === 'string' && typeof mod.tier === 'number' ? [{ key: mod.key, tier: mod.tier }] : [];
  }) : [];
  const stats = row.stats && typeof row.stats === 'object' && !Array.isArray(row.stats)
    ? Object.fromEntries(Object.entries(row.stats as Record<string, unknown>).filter((entry): entry is [string, number] => typeof entry[1] === 'number')) : {};
  return { id: row.id, kind: row.kind, model: row.model, name: typeof row.name === 'string' ? row.name : null,
    lookKey: typeof row.lookKey === 'string' ? row.lookKey : null, condition: row.condition, mods,
    stats, history: itemEvents(row.history), roundName: row.roundName };
}
