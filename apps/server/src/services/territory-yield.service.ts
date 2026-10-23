import type { TerritoryYieldProfile } from '@streets/rulesets';
import type { Prisma } from '@prisma/client';
import type { Db } from '../utils/db.js';

const HOUR_MS = 60 * 60 * 1000;

export interface TerritoryControlInterval {
  readonly allianceId: string | null;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
}

export interface TerritoryYieldState {
  readonly ownerAllianceId: string | null;
  readonly contents: Readonly<Record<string, number>>;
  readonly cashCents: number;
  readonly tollCents?: number;
  readonly fractionalRemainders?: Readonly<Record<string, number>>;
  readonly lastSettledAt: Date;
  readonly carryMillis: number;
}

export function districtYieldControlIntervals(
  segments: readonly { allianceId: string | null; startedAt: Date; endedAt: Date | null }[],
  roundStartedAt: Date,
  now: Date,
): TerritoryControlInterval[] {
  const intervals: TerritoryControlInterval[] = [];
  let cursor = roundStartedAt;
  for (const segment of [...segments].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    if (segment.startedAt > cursor) intervals.push({ allianceId: null, startedAt: cursor, endedAt: segment.startedAt });
    const endedAt = segment.endedAt && segment.endedAt < now ? segment.endedAt : null;
    intervals.push({ allianceId: segment.allianceId, startedAt: segment.startedAt, endedAt });
    if (!endedAt) return intervals;
    cursor = endedAt;
  }
  if (cursor < now) intervals.push({ allianceId: null, startedAt: cursor, endedAt: now });
  return intervals;
}

export function cityYieldControlIntervals(
  events: readonly { previousAllianceId: string | null; nextAllianceId: string | null; happenedAt: Date }[],
  roundStartedAt: Date,
  now: Date,
): TerritoryControlInterval[] {
  const sorted = [...events].filter((event) => event.happenedAt <= now).sort((a, b) => a.happenedAt.getTime() - b.happenedAt.getTime());
  const intervals: TerritoryControlInterval[] = [];
  let owner: string | null = null;
  let cursor = roundStartedAt;
  let initialized = false;
  for (const event of sorted) {
    const at = event.happenedAt < roundStartedAt ? roundStartedAt : event.happenedAt;
    if (!initialized) {
      owner = event.previousAllianceId;
      initialized = true;
    } else if (owner !== event.previousAllianceId) {
      owner = event.previousAllianceId;
    }
    if (at > cursor) intervals.push({ allianceId: owner, startedAt: cursor, endedAt: at });
    owner = event.nextAllianceId;
    cursor = at;
  }
  intervals.push({ allianceId: owner, startedAt: cursor, endedAt: null });
  return intervals;
}

export async function districtTerritoryControlIntervals(input: {
  tx: Db;
  roundId: string;
  cityId: string;
  district: string;
  roundStartedAt: Date;
  now: Date;
}): Promise<TerritoryControlInterval[]> {
  const turf = await input.tx.turf.findUnique({
    where: { roundId_cityId_district: { roundId: input.roundId, cityId: input.cityId, district: input.district } },
    select: { holdSegments: { select: { allianceId: true, startedAt: true, endedAt: true }, orderBy: { startedAt: 'asc' } } },
  });
  return districtYieldControlIntervals(turf?.holdSegments ?? [], input.roundStartedAt, input.now);
}

export async function cityTerritoryControlIntervals(input: {
  tx: Db;
  roundId: string;
  cityId: string;
  roundStartedAt: Date;
  now: Date;
}): Promise<TerritoryControlInterval[]> {
  const events = await input.tx.turfControlEvent.findMany({
    where: { roundId: input.roundId, cityId: input.cityId },
    select: { previousAllianceId: true, nextAllianceId: true, happenedAt: true },
    orderBy: { happenedAt: 'asc' },
  });
  return cityYieldControlIntervals(events, input.roundStartedAt, input.now);
}

/** Settle whole yield hours from authoritative control intervals. Retries are pure and idempotent. */
export function settleTerritoryYield(input: {
  state: TerritoryYieldState;
  profile: TerritoryYieldProfile;
  intervals: readonly TerritoryControlInterval[];
  currentAllianceId: string | null;
  now: Date;
  priorSameTierHoldings: number;
}): TerritoryYieldState {
  const state = input.state;
  const ownerChanged = state.ownerAllianceId !== input.currentAllianceId;
  if (input.now.getTime() <= state.lastSettledAt.getTime() && !ownerChanged) return state;
  if (!input.currentAllianceId) {
    return { ownerAllianceId: null, contents: {}, cashCents: 0, tollCents: 0, lastSettledAt: new Date(Math.max(input.now.getTime(), state.lastSettledAt.getTime())), carryMillis: 0 };
  }

  const transferBasisPoints = ownerChanged
    ? Math.max(0, Math.min(10_000, Math.trunc(input.profile.ownershipChangeTransferBasisPoints ?? 2500)))
    : 10_000;
  const retained = (amount: number) => Math.floor(Math.max(0, Math.trunc(amount)) * transferBasisPoints / 10_000);
  const goods = Object.fromEntries(Object.entries(state.contents).map(([key, amount]) => [key, ownerChanged ? retained(amount) : amount]));
  const fractionalRemainders = ownerChanged ? {} : { ...(state.fractionalRemainders ?? {}) };
  let cashCents = ownerChanged ? retained(state.cashCents) : state.cashCents;
  const tollCents = ownerChanged ? retained(state.tollCents ?? 0) : Math.max(0, Math.trunc(state.tollCents ?? 0));
  const scaleBasisPoints = diminishingScale(input.profile.perAdditionalHoldingBasisPoints, input.priorSameTierHoldings);

  let carryMillis = ownerChanged ? 0 : state.carryMillis;
  let accruedHours = 0;
  let trailingMillis = carryMillis;
  let currentIntervalStart: number | null = null;
  let becameNeutral = false;
  const from = state.lastSettledAt.getTime();
  const to = Math.max(input.now.getTime(), from);
  const intervals = [...input.intervals].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  for (const interval of intervals) {
    if (interval.allianceId !== input.currentAllianceId) {
      if (interval.allianceId === null && (interval.endedAt?.getTime() ?? to) > from) becameNeutral = true;
      currentIntervalStart = null;
      trailingMillis = 0;
      continue;
    }
    const start = Math.max(from, interval.startedAt.getTime());
    const end = Math.min(to, interval.endedAt?.getTime() ?? to);
    if (end <= start) continue;
    if (currentIntervalStart === null) {
      currentIntervalStart = start;
      trailingMillis = ownerChanged || start > from ? 0 : carryMillis;
    } else if (start > currentIntervalStart) {
      // A gap ends a yield clock even if the same alliance later reconquers.
      trailingMillis = 0;
      currentIntervalStart = start;
    }
    const elapsed = end - start + trailingMillis;
    const wholeHours = Math.floor(elapsed / HOUR_MS);
    accruedHours += wholeHours;
    trailingMillis = elapsed % HOUR_MS;
    currentIntervalStart = end;
  }
  carryMillis = trailingMillis;
  if (becameNeutral) {
    for (const key of Object.keys(goods)) goods[key] = 0;
    cashCents = 0;
    for (const key of Object.keys(fractionalRemainders)) fractionalRemainders[key] = 0;
  }

  for (const [resource, rawRate] of Object.entries(input.profile.goodsPerHour)) {
    const rate = Math.max(0, Math.trunc(rawRate));
    const cap = rate * input.profile.cacheHours;
    const scaled = Math.max(0, Math.trunc(fractionalRemainders[resource] ?? 0)) + rate * scaleBasisPoints * accruedHours;
    const gained = Math.floor(scaled / 10_000);
    fractionalRemainders[resource] = scaled % 10_000;
    goods[resource] = Math.min(cap, Math.max(0, Math.trunc(goods[resource] ?? 0)) + gained);
  }
  const cashRate = Math.max(0, Math.trunc(input.profile.cashCentsPerHour));
  const cashScaled = Math.max(0, Math.trunc(fractionalRemainders.CASH_CENTS ?? 0)) + cashRate * scaleBasisPoints * accruedHours;
  const gainedCash = Math.floor(cashScaled / 10_000);
  fractionalRemainders.CASH_CENTS = cashScaled % 10_000;
  cashCents = Math.min(cashRate * input.profile.cacheHours, Math.max(0, Math.trunc(cashCents)) + gainedCash);
  return {
    ownerAllianceId: input.currentAllianceId,
    contents: goods,
    cashCents,
    tollCents,
    fractionalRemainders,
    lastSettledAt: new Date(to),
    carryMillis: Math.min(HOUR_MS - 1, Math.max(0, carryMillis)),
  };
}

/** Persist one cache settlement under a row lock so retries cannot duplicate accrued ticks. */
export async function settlePersistedTerritoryYield(input: {
  tx: Db;
  roundId: string;
  scope: 'district' | 'city' | 'region';
  locationKey: string;
  profile: TerritoryYieldProfile;
  intervals: readonly TerritoryControlInterval[];
  initialSettledAt?: Date;
  currentAllianceId: string | null;
  now: Date;
  priorSameTierHoldings: number;
}): Promise<TerritoryYieldState> {
  await input.tx.territoryYieldCache.upsert({
    where: { roundId_scope_locationKey: { roundId: input.roundId, scope: input.scope, locationKey: input.locationKey } },
    create: {
      roundId: input.roundId,
      scope: input.scope,
      locationKey: input.locationKey,
      ownerAllianceId: input.currentAllianceId,
      contents: { goods: {}, cashCents: 0 },
      fractionalRemainders: {},
      lastSettledAt: input.initialSettledAt ?? input.now,
      carryMillis: 0,
    },
    update: {},
  });
  await input.tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "TerritoryYieldCache"
    WHERE "roundId" = ${input.roundId} AND "scope" = ${input.scope} AND "locationKey" = ${input.locationKey}
    FOR UPDATE
  `;
  const row = await input.tx.territoryYieldCache.findUniqueOrThrow({
    where: { roundId_scope_locationKey: { roundId: input.roundId, scope: input.scope, locationKey: input.locationKey } },
  });
  const rawContents = row.contents && typeof row.contents === 'object' && !Array.isArray(row.contents)
    ? row.contents as Record<string, unknown>
    : {};
  const rawGoods = rawContents.goods && typeof rawContents.goods === 'object' && !Array.isArray(rawContents.goods)
    ? rawContents.goods as Record<string, unknown>
    : {};
  const rawRemainders = row.fractionalRemainders && typeof row.fractionalRemainders === 'object' && !Array.isArray(row.fractionalRemainders)
    ? row.fractionalRemainders as Record<string, unknown>
    : {};
  const state = settleTerritoryYield({
    state: {
      ownerAllianceId: row.ownerAllianceId,
      contents: Object.fromEntries(Object.entries(rawGoods).map(([key, value]) => [key, Number(value) || 0])),
      cashCents: Number(rawContents.cashCents) || 0,
      tollCents: Number(rawContents.tollCents) || 0,
      fractionalRemainders: Object.fromEntries(Object.entries(rawRemainders).map(([key, value]) => [key, Number(value) || 0])),
      lastSettledAt: row.lastSettledAt,
      carryMillis: row.carryMillis,
    },
    profile: input.profile,
    intervals: input.intervals,
    currentAllianceId: input.currentAllianceId,
    now: input.now,
    priorSameTierHoldings: input.priorSameTierHoldings,
  });
  await input.tx.territoryYieldCache.update({
    where: { id: row.id },
    data: {
      ownerAllianceId: state.ownerAllianceId,
      contents: { goods: state.contents, cashCents: state.cashCents, tollCents: state.tollCents ?? 0 } as Prisma.InputJsonValue,
      fractionalRemainders: (state.fractionalRemainders ?? {}) as Prisma.InputJsonValue,
      lastSettledAt: state.lastSettledAt,
      carryMillis: state.carryMillis,
    },
  });
  return state;
}

function diminishingScale(perAdditionalHoldingBasisPoints: number, priorHoldings: number): number {
  const factor = Math.max(0, Math.min(10_000, Math.trunc(perAdditionalHoldingBasisPoints)));
  let scale = 10_000;
  for (let index = 0; index < Math.max(0, Math.trunc(priorHoldings)); index += 1) {
    scale = Math.floor(scale * factor / 10_000);
  }
  return scale;
}
