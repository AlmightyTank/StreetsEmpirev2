import type { Prisma } from '@prisma/client';

/**
 * Phase P. Per-day counters each gang keeps in `memory.telemetry.days`: what it did
 * (outcomes), why moves were blocked (error codes, kept apart from choosing to lay
 * low), and why targets were passed over (dogpile, shields, not back since the last
 * hit). Days are UTC dates; only the last `TELEMETRY_DAYS` are kept.
 */

export const TELEMETRY_DAYS = 60;

export type NpcSkipReason = 'DOGPILE' | 'SHIELD' | 'NOT_BACK' | 'EMPTY_BLOCK' | 'NO_MARK';

export interface NpcTelemetryDay {
  outcomes: Record<string, number>;
  blocked: Record<string, number>;
  skips: Record<string, number>;
}

export type NpcTelemetry = Record<string, NpcTelemetryDay>;

export function telemetryDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function counts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0));
}

export function storedTelemetry(memory: Prisma.JsonValue): NpcTelemetry {
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) return {};
  const root = memory.telemetry;
  if (!root || typeof root !== 'object' || Array.isArray(root)) return {};
  const days = root.days;
  if (!days || typeof days !== 'object' || Array.isArray(days)) return {};
  const out: NpcTelemetry = {};
  for (const [day, row] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !row || typeof row !== 'object' || Array.isArray(row)) continue;
    out[day] = { outcomes: counts(row.outcomes), blocked: counts(row.blocked), skips: counts(row.skips) };
  }
  return out;
}

function add(into: Record<string, number>, key: string, amount = 1): void {
  if (amount > 0) into[key] = (into[key] ?? 0) + amount;
}

/** One tick into the day's counters, pruning days past the keep window. */
export function bumpTelemetry(telemetry: NpcTelemetry, now: Date, tick: { outcome: string; blockedCode?: string | null; skips?: Readonly<Record<string, number>> }): NpcTelemetry {
  const key = telemetryDay(now);
  const today = telemetry[key] ?? { outcomes: {}, blocked: {}, skips: {} };
  const next: NpcTelemetryDay = { outcomes: { ...today.outcomes }, blocked: { ...today.blocked }, skips: { ...today.skips } };
  add(next.outcomes, tick.outcome);
  if (tick.outcome === 'BLOCKED') add(next.blocked, tick.blockedCode ?? 'UNKNOWN');
  for (const [reason, amount] of Object.entries(tick.skips ?? {})) add(next.skips, reason, amount);
  const cutoff = telemetryDay(new Date(now.getTime() - (TELEMETRY_DAYS - 1) * 24 * 3_600_000));
  const kept = Object.fromEntries(Object.entries(telemetry).filter(([day]) => day >= cutoff && day !== key));
  return { ...kept, [key]: next };
}

export function telemetryJson(telemetry: NpcTelemetry): Prisma.InputJsonObject {
  return { days: Object.fromEntries(Object.entries(telemetry).map(([day, row]) => [day, { outcomes: { ...row.outcomes }, blocked: { ...row.blocked }, skips: { ...row.skips } }])) };
}

/** Totals across gangs and days, inclusive of both ends. */
export function sumTelemetry(all: readonly NpcTelemetry[], fromDay: string, toDay: string): NpcTelemetryDay {
  const total: NpcTelemetryDay = { outcomes: {}, blocked: {}, skips: {} };
  for (const telemetry of all) {
    for (const [day, row] of Object.entries(telemetry)) {
      if (day < fromDay || day > toDay) continue;
      for (const [key, amount] of Object.entries(row.outcomes)) add(total.outcomes, key, amount);
      for (const [key, amount] of Object.entries(row.blocked)) add(total.blocked, key, amount);
      for (const [key, amount] of Object.entries(row.skips)) add(total.skips, key, amount);
    }
  }
  return total;
}

export function rate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;
}
