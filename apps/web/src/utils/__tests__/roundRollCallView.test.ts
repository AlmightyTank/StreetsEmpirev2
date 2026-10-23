import { describe, expect, it } from 'vitest';
import { nextRoundRollCallDelayMs, rollCallWindowStart, todayRewardTier } from '../roundRollCallView.js';

describe('today\'s roll call reward', () => {
  it('keeps the reward earned today on the calendar', () => {
    expect(todayRewardTier({
      stamps: 4,
      requiredStamps: 21,
      alreadyCheckedInToday: true,
      canCheckInToday: false,
    })).toBe(4);
  });

  it('points at the reward a check-in today will earn', () => {
    expect(todayRewardTier({
      stamps: 4,
      requiredStamps: 21,
      alreadyCheckedInToday: false,
      canCheckInToday: true,
    })).toBe(5);
  });

  it('does not invent a current day after the track is finished or closed', () => {
    expect(todayRewardTier({
      stamps: 21,
      requiredStamps: 21,
      alreadyCheckedInToday: false,
      canCheckInToday: false,
    })).toBeNull();
    expect(todayRewardTier({
      stamps: 0,
      requiredStamps: 0,
      alreadyCheckedInToday: false,
      canCheckInToday: false,
    })).toBeNull();
  });

  it('keeps today inside the visible window without moving claimed rewards', () => {
    expect(rollCallWindowStart(21, 0, 12)).toBe(9);
    expect(rollCallWindowStart(21, 2, 2)).toBe(0);
    expect(rollCallWindowStart(21, 20, 21)).toBe(15);
    expect(rollCallWindowStart(4, 0, 2)).toBe(0);
  });

  it('waits until the next round day and backs off when that moment has already passed', () => {
    const now = Date.parse('2026-10-17T12:00:00.000Z');
    expect(nextRoundRollCallDelayMs('2026-10-18T12:00:00.000Z', now)).toBe(86_400_000);
    expect(nextRoundRollCallDelayMs('2026-10-17T11:00:00.000Z', now)).toBe(60_000);
    expect(nextRoundRollCallDelayMs(null, now)).toBeNull();
  });
});
