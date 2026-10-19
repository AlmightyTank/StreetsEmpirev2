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

/** Account XP for each turn spent on an action. */
export const EXPERIENCE_PER_TURN = 1;

/** Account XP for a finished quest, by quest type. Anything not listed pays the default. */
export const QUEST_EXPERIENCE = {
  DAILY: 75,
  WEEKLY: 200,
  SEASON: 300,
  CITY_CONTRACT: 150,
  EVENT: 150,
  ALLIANCE: 150,
  default: 100,
} as const;

export function questExperience(questType: string): number {
  return (QUEST_EXPERIENCE as Record<string, number>)[questType] ?? QUEST_EXPERIENCE.default;
}

/**
 * Crowns paid once per account when it reaches a level: a small payout every
 * `every` levels and a bigger one every `majorEvery`, with no top level. Paid
 * outside the per-round earn cap, since each one can only ever land once.
 * Pace from `npm run qa:account-xp`.
 */
export const EXPERIENCE_LEVEL_CROWNS = { every: 5, crowns: 20, majorEvery: 25, majorCrowns: 75 } as const;

export function experienceCrownsForLevel(level: number): number {
  const { every, crowns, majorEvery, majorCrowns } = EXPERIENCE_LEVEL_CROWNS;
  if (!Number.isInteger(level) || level < every) return 0;
  if (level % majorEvery === 0) return majorCrowns;
  return level % every === 0 ? crowns : 0;
}

/** Levels in (fromLevel, toLevel] that pay Crowns, lowest first. */
export function experienceCrownMilestones(fromLevel: number, toLevel: number): { level: number; crowns: number }[] {
  const { every } = EXPERIENCE_LEVEL_CROWNS;
  const out: { level: number; crowns: number }[] = [];
  for (let level = (Math.floor(Math.max(0, fromLevel) / every) + 1) * every; level <= toLevel; level += every) {
    out.push({ level, crowns: experienceCrownsForLevel(level) });
  }
  return out;
}

export type AccountTrustGate = 'coldMessage' | 'foundAlliance';

/**
 * Account level needed before a player can reach out to strangers. Replies,
 * alliance chat and everything else stay open from level 1, and staff skip
 * the gates. Pace from `npm run qa:account-xp`.
 */
export const ACCOUNT_TRUST_GATES: Readonly<Record<AccountTrustGate, { level: number; label: string }>> = {
  coldMessage: { level: 4, label: 'Message players who have not written to you' },
  foundAlliance: { level: 6, label: 'Found an alliance or post its recruitment thread' },
};

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
