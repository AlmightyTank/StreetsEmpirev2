import { describe, expect, it } from 'vitest';
import { classicOgV07N } from '@streets/rulesets';
import {
  DAILY_CONTRACT_SLOTS,
  dailyContractWindow,
  selectedDailyContractKeys,
} from '../daily-contract.service.js';

describe('DailyContractService rotation', () => {
  it('uses the same UTC reset boundary as rankings', () => {
    const ruleset = {
      ...classicOgV07N,
      rankings: { ...classicOgV07N.rankings, dailyResetHourUtc: 12 },
    };
    expect(dailyContractWindow(new Date('2026-09-22T11:59:59.000Z'), ruleset)).toEqual({
      startsAt: new Date('2026-09-21T12:00:00.000Z'),
      endsAt: new Date('2026-09-22T12:00:00.000Z'),
    });
    expect(dailyContractWindow(new Date('2026-09-22T12:00:00.000Z'), ruleset)).toEqual({
      startsAt: new Date('2026-09-22T12:00:00.000Z'),
      endsAt: new Date('2026-09-23T12:00:00.000Z'),
    });
  });

  it('selects exactly three deterministic offers per window', () => {
    const now = new Date('2026-09-22T15:00:00.000Z');
    const first = selectedDailyContractKeys(classicOgV07N, now);
    const second = selectedDailyContractKeys(classicOgV07N, now);
    expect(first).toHaveLength(DAILY_CONTRACT_SLOTS);
    expect(new Set(first).size).toBe(DAILY_CONTRACT_SLOTS);
    expect(second).toEqual(first);
  });

  it('rotates the board after the next reset', () => {
    const before = selectedDailyContractKeys(classicOgV07N, new Date('2026-09-22T15:00:00.000Z'));
    const after = selectedDailyContractKeys(classicOgV07N, new Date('2026-09-23T15:00:00.000Z'));
    expect(after).toHaveLength(DAILY_CONTRACT_SLOTS);
    expect(after).not.toEqual(before);
  });
});
