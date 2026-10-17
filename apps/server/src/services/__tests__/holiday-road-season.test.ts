import { describe, expect, it } from 'vitest';
import { HOLIDAY_ROAD_WINDOW } from '@streets/rulesets';
import { encounterIsInSeason } from '../random-encounter.service.js';

describe('Holiday Road encounter eligibility', () => {
  const entry = { availableUtc: HOLIDAY_ROAD_WINDOW };
  it('appears only within the Christmas event server-UTC window', () => {
    expect(encounterIsInSeason(entry, new Date('2026-12-14T23:59:59.999Z'))).toBe(false);
    expect(encounterIsInSeason(entry, new Date(HOLIDAY_ROAD_WINDOW.startsAt))).toBe(true);
    expect(encounterIsInSeason(entry, new Date('2026-12-25T12:00:00.000Z'))).toBe(true);
    expect(encounterIsInSeason(entry, new Date(HOLIDAY_ROAD_WINDOW.endsAt))).toBe(false);
  });
  it('does not gate the existing year-round encounter pool', () => {
    expect(encounterIsInSeason({}, new Date('2026-10-17T00:00:00Z'))).toBe(true);
  });
});
