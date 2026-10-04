import { describe, expect, it } from 'vitest';
import { EXPERIENCE_LEVEL_REWARDS, experienceLevelFor, experienceRequiredForLevel, playerExperienceDto } from './progression.js';

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

  it('keeps XP level rewards ordered and keyed by level', () => {
    expect(EXPERIENCE_LEVEL_REWARDS.map((reward) => reward.level)).toEqual([5, 10, 20, 30, 50]);
    expect(EXPERIENCE_LEVEL_REWARDS.every((reward) => reward.key === `player-level-${reward.level}-title`)).toBe(true);
  });
});
