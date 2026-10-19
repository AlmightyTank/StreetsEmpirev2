import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TRUST_GATES,
  experienceSourceLabel,
  seasonFinishExperience,
  turnExperienceFor,
  accountGateOpen,
  accountLevelBadge,
  experienceTitlesBetween,
  levelRewardsAt,
  prestigeTitleFor,
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

  it('gives every level from 2 to 50 at least one reward', () => {
    for (let level = 2; level <= 50; level += 1) expect(levelRewardsAt(level).length, `level ${level}`).toBeGreaterThan(0);
    expect(levelRewardsAt(50).map((reward) => reward.kind)).toEqual(expect.arrayContaining(['title', 'crowns', 'prestige']));
  });

  it('keeps title keys unique and ordered, with prestige titles past 50', () => {
    const titles = experienceTitlesBetween(0, 200);
    expect(new Set(titles.map((title) => title.key)).size).toBe(titles.length);
    expect(titles.map((title) => title.level)).toEqual([...titles.map((title) => title.level)].sort((a, b) => a - b));
    expect(experienceTitlesBetween(0, 50)).toHaveLength(41);
    expect(experienceTitlesBetween(50, 150).map((title) => title.key)).toEqual(['player-prestige-2-title', 'player-prestige-3-title']);
    expect(prestigeTitleFor(75)).toBeNull();
  });

  it('bands the level chip and counts prestige stars', () => {
    expect(accountLevelBadge(4)).toEqual({ level: 4, prestige: 0, tier: 'common' });
    expect(accountLevelBadge(30)).toMatchObject({ tier: 'rare', prestige: 0 });
    expect(accountLevelBadge(63)).toMatchObject({ tier: 'epic', prestige: 1 });
    expect(accountLevelBadge(151)).toMatchObject({ tier: 'legendary', prestige: 3 });
  });

  it('opens every gate for veterans and none for a fresh account', () => {
    expect(accountGateOpen({ level: 1, veteran: true }, 'foundAlliance')).toBe(true);
    expect(accountGateOpen({ level: 1 }, 'casino')).toBe(false);
    expect(accountGateOpen({ level: ACCOUNT_TRUST_GATES.casino.level }, 'casino')).toBe(true);
    expect(accountGateOpen(null, 'casino')).toBe(false);
  });

  it('pays full turn XP for the first 300 turns of the day, then half, exactly over any split', () => {
    expect(turnExperienceFor(0, 300)).toBe(300);
    expect(turnExperienceFor(300, 100)).toBe(50);
    expect(turnExperienceFor(250, 100)).toBe(50 + 25);
    let total = 0;
    for (let spent = 0; spent < 576; spent += 1) total += turnExperienceFor(spent, 1);
    expect(total).toBe(turnExperienceFor(0, 576));
  });

  it('stacks season finish bonuses by final national rank', () => {
    expect(seasonFinishExperience(null)).toBe(500);
    expect(seasonFinishExperience(40)).toBe(500);
    expect(seasonFinishExperience(10)).toBe(1_500);
    expect(seasonFinishExperience(3)).toBe(3_000);
    expect(seasonFinishExperience(1)).toBe(5_500);
  });

  it('labels XP log sources for players', () => {
    expect(experienceSourceLabel('TURN_SPEND')).toBe('Turns spent');
    expect(experienceSourceLabel('QUEST_DAILY')).toBe('Daily contract');
    expect(experienceSourceLabel('QUEST_STORY')).toBe('Job finished');
    expect(experienceSourceLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
  });
});
