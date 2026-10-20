import { describe, expect, it } from 'vitest';
import type { TerritoryYieldProfile } from '@streets/rulesets';
import { cityYieldControlIntervals, districtYieldControlIntervals, settleTerritoryYield, type TerritoryYieldState } from '../territory-yield.service.js';
import { allocateTerritoryYield } from '../territory-yield-budget.js';

const HOUR = 60 * 60 * 1000;
const profile: TerritoryYieldProfile = {
  goodsPerHour: { WEED: 1 },
  cashCentsPerHour: 100,
  cacheHours: 2,
  perAdditionalHoldingBasisPoints: 8500,
};

const stateAt = (ms: number, overrides: Partial<TerritoryYieldState> = {}): TerritoryYieldState => ({
  ownerAllianceId: 'alliance-a', contents: {}, cashCents: 0, lastSettledAt: new Date(ms), carryMillis: 0, ...overrides,
});

describe('territory yield settlement', () => {
  it('derives district and city intervals from the durable ownership history', () => {
    const district = districtYieldControlIntervals([
      { allianceId: 'alliance-a', startedAt: new Date(HOUR), endedAt: new Date(2 * HOUR) },
    ], new Date(0), new Date(3 * HOUR));
    expect(district).toEqual([
      { allianceId: null, startedAt: new Date(0), endedAt: new Date(HOUR) },
      { allianceId: 'alliance-a', startedAt: new Date(HOUR), endedAt: new Date(2 * HOUR) },
      { allianceId: null, startedAt: new Date(2 * HOUR), endedAt: new Date(3 * HOUR) },
    ]);
    const city = cityYieldControlIntervals([
      { previousAllianceId: 'alliance-a', nextAllianceId: 'alliance-b', happenedAt: new Date(2 * HOUR) },
    ], new Date(0), new Date(3 * HOUR));
    expect(city).toEqual([
      { allianceId: 'alliance-a', startedAt: new Date(0), endedAt: new Date(2 * HOUR) },
      { allianceId: 'alliance-b', startedAt: new Date(2 * HOUR), endedAt: null },
    ]);
  });

  it('settles only complete hours and carries fractional returns through retries', () => {
    const intervals = [{ allianceId: 'alliance-a', startedAt: new Date(0), endedAt: null }];
    const oneHour = settleTerritoryYield({ state: stateAt(0), profile, intervals, currentAllianceId: 'alliance-a', now: new Date(HOUR), priorSameTierHoldings: 1 });
    expect(oneHour.contents.WEED).toBe(0);
    const twoHours = settleTerritoryYield({ state: oneHour, profile, intervals, currentAllianceId: 'alliance-a', now: new Date(2 * HOUR), priorSameTierHoldings: 1 });
    expect(twoHours.contents.WEED).toBe(1);
    expect(twoHours.cashCents).toBe(170);
    expect(settleTerritoryYield({ state: twoHours, profile, intervals, currentAllianceId: 'alliance-a', now: twoHours.lastSettledAt, priorSameTierHoldings: 1 })).toBe(twoHours);
  });

  it('does not accrue across neutral time and clears a neutral cache', () => {
    const result = settleTerritoryYield({ state: stateAt(0, { contents: { WEED: 2 }, cashCents: 50 }), profile, intervals: [], currentAllianceId: null, now: new Date(10 * HOUR), priorSameTierHoldings: 0 });
    expect(result).toMatchObject({ ownerAllianceId: null, contents: {}, cashCents: 0, carryMillis: 0 });
  });

  it('discards an old cache when the control history includes a neutral interval', () => {
    const intervals = [
      { allianceId: 'alliance-a', startedAt: new Date(0), endedAt: new Date(HOUR) },
      { allianceId: null, startedAt: new Date(HOUR), endedAt: new Date(2 * HOUR) },
      { allianceId: 'alliance-b', startedAt: new Date(2 * HOUR), endedAt: null },
    ];
    const result = settleTerritoryYield({ state: stateAt(0, { contents: { WEED: 1 }, cashCents: 50 }), profile, intervals, currentAllianceId: 'alliance-b', now: new Date(3 * HOUR), priorSameTierHoldings: 0 });
    expect(result.contents.WEED).toBe(1);
    expect(result.cashCents).toBe(100);
  });

  it('preserves cache value on reconquest and stops at the twelve-hour cap', () => {
    const intervals = [{ allianceId: 'alliance-b', startedAt: new Date(0), endedAt: null }];
    const result = settleTerritoryYield({
      state: stateAt(0, { contents: { WEED: 1 }, cashCents: 150 }), profile,
      intervals, currentAllianceId: 'alliance-b', now: new Date(4 * HOUR), priorSameTierHoldings: 0,
    });
    expect(result.contents.WEED).toBe(2);
    expect(result.cashCents).toBe(200);
  });

  it('transfers only the configured raid share of goods, cash, and tolls on control flip', () => {
    const flipped = settleTerritoryYield({
      state: stateAt(0, { ownerAllianceId: 'alliance-a', contents: { WEED: 5 }, cashCents: 101, tollCents: 79 }),
      profile: { ...profile, ownershipChangeTransferBasisPoints: 4000 },
      intervals: [{ allianceId: 'alliance-b', startedAt: new Date(0), endedAt: null }],
      currentAllianceId: 'alliance-b', now: new Date(1_000), priorSameTierHoldings: 0,
    });
    expect(flipped).toMatchObject({ contents: { WEED: 2 }, cashCents: 40, tollCents: 31 });
  });

  it('transfers a cache on a backdated territory flip without moving its clock backward', () => {
    const flipped = settleTerritoryYield({
      state: stateAt(2 * HOUR, { ownerAllianceId: 'alliance-a', contents: { WEED: 5 }, cashCents: 101, tollCents: 79 }),
      profile, intervals: [{ allianceId: 'alliance-b', startedAt: new Date(HOUR), endedAt: null }],
      currentAllianceId: 'alliance-b', now: new Date(HOUR), priorSameTierHoldings: 0,
    });
    expect(flipped).toMatchObject({ contents: { WEED: 1 }, cashCents: 25, tollCents: 19, lastSettledAt: new Date(2 * HOUR) });
  });

  it('allocates a deterministic daily value ceiling and leaves uncapped contents behind', () => {
    expect(allocateTerritoryYield({
      goods: { WEED: 3, BEER: 2 }, cashCents: 300, tollCents: 100,
      unitValues: { WEED: 100, BEER: 50 }, availableValueCents: 275,
    })).toEqual({ goods: { BEER: 2, WEED: 1 }, cashCents: 75, tollCents: 0, valueCents: 275 });
    expect(allocateTerritoryYield({
      goods: {}, cashCents: 300, tollCents: 100, unitValues: {}, availableValueCents: 275,
    })).toEqual({ goods: {}, cashCents: 275, tollCents: 0, valueCents: 275 });
  });
});
