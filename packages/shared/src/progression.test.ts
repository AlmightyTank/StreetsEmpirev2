import { describe, expect, it } from 'vitest';
import {
  DOUBLE_EXPERIENCE_MULTIPLIER,
  EXPERIENCE_LEVEL_REWARDS,
  doubleExperienceWeekendEndsAt,
  experienceAwardAmount,
  experienceLevelFor,
  experienceRequiredForLevel,
  isDoubleExperienceWeekend,
  nextDoubleExperienceChange,
  playerExperienceDto,
} from './progression.js';

describe('account experience progression', () => {
  it('uses a steadily rising level curve from level 1', () => {
    expect(experienceRequiredForLevel(1)).toBe(0);
    expect(experienceRequiredForLevel(2)).toBe(100);
    expect(experienceRequiredForLevel(3)).toBe(250);
    expect(experienceLevelFor(99)).toBe(1);
    expect(experienceLevelFor(100)).toBe(2);
    expect(experienceLevelFor(249)).toBe(2);
    expect(experienceLevelFor(250)).toBe(3);
  });

  it('reports progress within the current level and safely handles invalid totals', () => {
    expect(playerExperienceDto(175)).toEqual({
      totalXp: 175,
      level: 2,
      xpIntoLevel: 75,
      xpForLevel: 150,
      xpToNextLevel: 75,
      progressPercent: 50,
    });
    expect(playerExperienceDto(-10)).toMatchObject({ totalXp: 0, level: 1, progressPercent: 0 });
  });

  it('doubles lifetime XP on Saturday and Sunday UTC and leaves weekdays alone', () => {
    const friday = new Date('2026-10-16T23:59:59.999Z');
    const saturday = new Date('2026-10-17T00:00:00.000Z');
    const sundayNight = new Date('2026-10-18T23:59:59.999Z');
    const monday = new Date('2026-10-19T00:00:00.000Z');

    expect(isDoubleExperienceWeekend(friday)).toBe(false);
    expect(isDoubleExperienceWeekend(saturday)).toBe(true);
    expect(isDoubleExperienceWeekend(sundayNight)).toBe(true);
    expect(isDoubleExperienceWeekend(monday)).toBe(false);
    expect(isDoubleExperienceWeekend(new Date(Number.NaN))).toBe(false);

    expect(experienceAwardAmount(75.9, friday)).toBe(75);
    expect(experienceAwardAmount(75, saturday)).toBe(75 * DOUBLE_EXPERIENCE_MULTIPLIER);
    expect(experienceAwardAmount(12, sundayNight)).toBe(24);
    expect(experienceAwardAmount(0, saturday)).toBe(0);
    expect(experienceAwardAmount(-4, saturday)).toBe(0);

    expect(doubleExperienceWeekendEndsAt(saturday)?.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(doubleExperienceWeekendEndsAt(sundayNight)?.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(doubleExperienceWeekendEndsAt(friday)).toBeNull();
    expect(nextDoubleExperienceChange(friday).toISOString()).toBe('2026-10-17T00:00:00.000Z');
    expect(nextDoubleExperienceChange(new Date('2026-10-14T15:00:00.000Z')).toISOString()).toBe('2026-10-17T00:00:00.000Z');
    expect(nextDoubleExperienceChange(saturday).toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });

  it('keeps XP level rewards ordered and keyed by level', () => {
    expect(EXPERIENCE_LEVEL_REWARDS.map((reward) => reward.level)).toEqual([5, 10, 20, 30, 50]);
    expect(EXPERIENCE_LEVEL_REWARDS.every((reward) => reward.key === `player-level-${reward.level}-title`)).toBe(true);
  });
});
