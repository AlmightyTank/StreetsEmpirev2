import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TRUST_GATES,
  EXPERIENCE_LEVEL_REWARDS,
  experienceCrownMilestones,
  experienceCrownsForLevel,
  experienceLevelFor,
  experienceRequiredForLevel,
  playerExperienceDto,
  questExperience,
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

  it('keeps XP level rewards ordered and keyed by level', () => {
    expect(EXPERIENCE_LEVEL_REWARDS.map((reward) => reward.level)).toEqual([5, 10, 20, 30, 50]);
    expect(EXPERIENCE_LEVEL_REWARDS.every((reward) => reward.key === `player-level-${reward.level}-title`)).toBe(true);
  });

  it('pays quest XP by type with a default for everything else', () => {
    expect(questExperience('DAILY')).toBe(75);
    expect(questExperience('WEEKLY')).toBe(200);
    expect(questExperience('SEASON')).toBe(300);
    expect(questExperience('ALLIANCE')).toBe(150);
    expect(questExperience('STORY')).toBe(100);
    expect(questExperience('default')).toBe(100);
  });

  it('pays level Crowns every five levels, more every twenty-five, with no top', () => {
    expect(experienceCrownsForLevel(4)).toBe(0);
    expect(experienceCrownsForLevel(5)).toBe(20);
    expect(experienceCrownsForLevel(7)).toBe(0);
    expect(experienceCrownsForLevel(25)).toBe(75);
    expect(experienceCrownsForLevel(100)).toBe(75);
    expect(experienceCrownsForLevel(105)).toBe(20);
    expect(experienceCrownMilestones(0, 4)).toEqual([]);
    expect(experienceCrownMilestones(4, 10).map((m) => m.level)).toEqual([5, 10]);
    expect(experienceCrownMilestones(5, 10).map((m) => m.level)).toEqual([10]);
    expect(experienceCrownMilestones(0, 50).reduce((n, m) => n + m.crowns, 0)).toBe(8 * 20 + 2 * 75);
  });

  it('keeps trust gates above what starting turns alone reach', () => {
    for (const gate of Object.values(ACCOUNT_TRUST_GATES)) expect(gate.level).toBeGreaterThan(experienceLevelFor(144));
    expect(ACCOUNT_TRUST_GATES.foundAlliance.level).toBeGreaterThanOrEqual(ACCOUNT_TRUST_GATES.coldMessage.level);
  });
});
