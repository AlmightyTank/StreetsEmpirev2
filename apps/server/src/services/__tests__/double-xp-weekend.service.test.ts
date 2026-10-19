import { describe, expect, it } from 'vitest';
import { candidateWeekendStarts, chooseWeekendStart, doubleXpWeekendActive } from '../double-xp-weekend.service.js';

describe('Double XP Weekend schedule', () => {
  it('selects only complete Fridays inside a month', () => {
    const starts = candidateWeekendStarts(2026, 9);
    expect(starts.every((date) => date.getUTCDay() === 5 && date.getUTCMonth() === 9)).toBe(true);
    expect(starts.every((date) => date.getUTCDate() <= 28)).toBe(true);
    expect(chooseWeekendStart(2026, 9, () => 0)).toEqual(starts[0]);
  });

  it('is active from Friday through Sunday and ends at Monday midnight', () => {
    const startsAt = new Date('2026-10-09T00:00:00.000Z');
    const endsAt = new Date('2026-10-12T00:00:00.000Z');
    expect(doubleXpWeekendActive({ startsAt, endsAt }, new Date('2026-10-09T00:00:00.000Z'))).toBe(true);
    expect(doubleXpWeekendActive({ startsAt, endsAt }, new Date('2026-10-11T23:59:59.999Z'))).toBe(true);
    expect(doubleXpWeekendActive({ startsAt, endsAt }, endsAt)).toBe(false);
  });
});
