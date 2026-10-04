import type { PlayerExperienceDto } from './types/api.js';

const FIRST_LEVEL_XP = 100;
const XP_STEP_PER_LEVEL = 50;

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
