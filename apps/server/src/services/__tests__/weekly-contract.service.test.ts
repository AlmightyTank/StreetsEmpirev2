import { describe, expect, it } from 'vitest';
import { classicOgV07O } from '@streets/rulesets';
import {
  WEEKLY_CONTRACT_SLOTS,
  selectedWeeklyContractKeys,
  turfHoldHoursForSegments,
  weeklyContractWindow,
} from '../weekly-contract.service.js';

describe('WeeklyContractService rotation', () => {
  it('rolls Monday at the same UTC reset hour as the daily board', () => {
    const ruleset = {
      ...classicOgV07O,
      rankings: { ...classicOgV07O.rankings, dailyResetHourUtc: 12 },
    };
    expect(weeklyContractWindow(new Date('2026-09-28T11:59:59.000Z'), ruleset)).toEqual({
      startsAt: new Date('2026-09-21T12:00:00.000Z'),
      endsAt: new Date('2026-09-28T12:00:00.000Z'),
    });
    expect(weeklyContractWindow(new Date('2026-09-28T12:00:00.000Z'), ruleset)).toEqual({
      startsAt: new Date('2026-09-28T12:00:00.000Z'),
      endsAt: new Date('2026-10-05T12:00:00.000Z'),
    });
  });

  it('selects two deterministic offers from different categories', () => {
    const now = new Date('2026-09-22T15:00:00.000Z');
    const first = selectedWeeklyContractKeys(classicOgV07O, now);
    const second = selectedWeeklyContractKeys(classicOgV07O, now);
    expect(first).toHaveLength(WEEKLY_CONTRACT_SLOTS);
    expect(second).toEqual(first);

    const categories = first.map((key) => classicOgV07O.questDefinitions?.[key]?.category);
    expect(new Set(categories).size).toBe(WEEKLY_CONTRACT_SLOTS);
  });

  it('rotates after the next weekly boundary', () => {
    const before = selectedWeeklyContractKeys(classicOgV07O, new Date('2026-09-22T15:00:00.000Z'));
    const after = selectedWeeklyContractKeys(classicOgV07O, new Date('2026-09-29T15:00:00.000Z'));
    expect(after).toHaveLength(WEEKLY_CONTRACT_SLOTS);
    expect(after).not.toEqual(before);
  });

  it('counts overlapping turf holds as combined whole hours', () => {
    const start = new Date('2026-09-21T12:00:00.000Z');
    const end = new Date('2026-09-24T12:00:00.000Z');
    expect(turfHoldHoursForSegments([
      { startedAt: new Date('2026-09-21T00:00:00.000Z'), endedAt: new Date('2026-09-22T12:00:00.000Z') },
      { startedAt: new Date('2026-09-22T00:00:00.000Z'), endedAt: new Date('2026-09-23T12:30:00.000Z') },
      { startedAt: new Date('2026-09-24T00:00:00.000Z'), endedAt: null },
    ], start, end)).toBe(60);
  });
});
