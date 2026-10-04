import type { PlayerExperienceDto } from './types/api.js';

const FIRST_LEVEL_XP = 100;
const XP_STEP_PER_LEVEL = 50;

export type ExperienceRewardRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ExperienceLevelReward = {
  level: number;
  key: string;
  title: string;
  description: string;
  rarity: ExperienceRewardRarity;
};

export const EXPERIENCE_LEVEL_REWARDS: readonly ExperienceLevelReward[] = [
  { level: 5, key: 'player-level-5-title', title: 'On the Rise', description: 'Reached player level 5.', rarity: 'common' },
  { level: 10, key: 'player-level-10-title', title: 'Known Face', description: 'Reached player level 10.', rarity: 'uncommon' },
  { level: 20, key: 'player-level-20-title', title: 'Street Veteran', description: 'Reached player level 20.', rarity: 'rare' },
  { level: 30, key: 'player-level-30-title', title: 'City Fixture', description: 'Reached player level 30.', rarity: 'epic' },
  { level: 50, key: 'player-level-50-title', title: 'Living Legend', description: 'Reached player level 50.', rarity: 'legendary' },
];

/** Total lifetime XP needed to reach a level. Level 1 starts at zero. */
export function experienceRequiredForLevel(level: number): number {
  if (!Number.isFinite(level) || level < 1) return 0;
  const completedLevels = Math.floor(level) - 1;
  return completedLevels * FIRST_LEVEL_XP
    + XP_STEP_PER_LEVEL * completedLevels * (completedLevels - 1) / 2;
}

export function experienceLevelFor(totalXp: number): number {
  const safeXp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (experienceRequiredForLevel(level + 1) <= safeXp) level += 1;
  return level;
}

export function playerExperienceDto(totalXp: number): PlayerExperienceDto {
  const safeXp = Math.max(0, Math.floor(totalXp));
  const level = experienceLevelFor(safeXp);
  const currentLevelXp = experienceRequiredForLevel(level);
  const nextLevelXp = experienceRequiredForLevel(level + 1);
  const xpIntoLevel = safeXp - currentLevelXp;
  const xpForLevel = nextLevelXp - currentLevelXp;
  return {
    totalXp: safeXp,
    level,
    xpIntoLevel,
    xpForLevel,
    xpToNextLevel: xpForLevel - xpIntoLevel,
    progressPercent: Math.min(100, Math.floor((xpIntoLevel / xpForLevel) * 100)),
  };
}
