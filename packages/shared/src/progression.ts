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

/**
 * Step titles fill every level up to 50 that has no milestone title, Crowns or
 * unlock, so each level-up gives something. Text only, never power.
 */
const STEP_TITLES: readonly [number, string][] = [
  [2, 'Corner Rookie'], [7, 'Block Runner'], [8, 'Street Smart'], [9, 'Night Shift'],
  [11, 'Hustler'], [12, 'Fast Money'], [13, 'Lookout Captain'], [14, 'The Plug'],
  [16, 'Made Moves'], [17, 'Turf Watcher'], [18, 'Late Night Regular'], [19, 'Road Dog'],
  [21, 'Shot Caller'], [22, 'Heavy Hitter'], [23, 'Old School'], [24, 'Money Counter'],
  [26, 'Block Captain'], [27, 'Night Owl'], [28, 'Back Room Boss'], [29, 'Silent Partner'],
  [31, 'Rainmaker'], [32, 'The Fixer'], [33, 'Uptown Name'], [34, 'High Roller'],
  [36, 'Kingmaker'], [37, 'Iron Nerve'], [38, 'Ghost of the Block'], [39, 'Cold Ledger'],
  [41, 'Underboss'], [42, 'Long Memory'], [43, 'Headliner'], [44, 'City Whisper'],
  [46, 'Street Royalty'], [47, 'Untouchable'], [48, 'Last Word'], [49, 'One Away'],
];

export const EXPERIENCE_STEP_TITLES: readonly ExperienceLevelReward[] = STEP_TITLES.map(([level, title]) => ({
  level,
  key: `player-level-${level}-title`,
  title,
  description: `Reached player level ${level}.`,
  rarity: level >= 40 ? 'rare' : level >= 20 ? 'uncommon' : 'common',
}));

/** One legendary title per prestige star past the first (levels 100, 150, ...). */
export function prestigeTitleFor(level: number): ExperienceLevelReward | null {
  if (!Number.isInteger(level) || level < 100 || level % 50 !== 0) return null;
  const prestige = level / 50;
  return {
    level,
    key: `player-prestige-${prestige}-title`,
    title: prestige === 2 ? 'Twice a Legend' : `Legend ${'★'.repeat(Math.min(prestige, 5))}${prestige > 5 ? ` ${prestige}` : ''}`,
    description: `Reached prestige ${prestige} (player level ${level}).`,
    rarity: 'legendary',
  };
}

/** Every title earned in (fromLevel, toLevel]: milestones, step titles and prestige titles, lowest first. */
export function experienceTitlesBetween(fromLevel: number, toLevel: number): ExperienceLevelReward[] {
  const inRange = (reward: ExperienceLevelReward) => reward.level > fromLevel && reward.level <= toLevel;
  const out = [...EXPERIENCE_LEVEL_REWARDS.filter(inRange), ...EXPERIENCE_STEP_TITLES.filter(inRange)];
  for (let level = Math.max(100, (Math.floor(fromLevel / 50) + 1) * 50); level <= toLevel; level += 50) {
    const title = prestigeTitleFor(level);
    if (title) out.push(title);
  }
  return out.sort((a, b) => a.level - b.level);
}

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

export type AccountTrustGate = 'casino' | 'coldMessage' | 'sportsbook' | 'foundAlliance';

/**
 * Features that open with account level: reaching out to strangers (spam
 * protection) and the gambling floors (a gentler start). Replies, alliance chat
 * and the core game stay open from level 1. Staff and accounts with a finished
 * season skip every gate. Pace from `npm run qa:account-xp`.
 */
export const ACCOUNT_TRUST_GATES: Readonly<Record<AccountTrustGate, { level: number; label: string }>> = {
  casino: { level: 3, label: 'Play the casino' },
  coldMessage: { level: 4, label: 'Message players who have not written to you' },
  sportsbook: { level: 5, label: 'Bet on the sportsbook' },
  foundAlliance: { level: 6, label: 'Found an alliance or post its recruitment thread' },
};

/** Client-side mirror of the server gate, for showing what is open. Staff are not known here. */
export function accountGateOpen(experience: Pick<PlayerExperienceDto, 'level' | 'veteran'> | null | undefined, gate: AccountTrustGate): boolean {
  if (!experience) return false;
  return Boolean(experience.veteran) || experience.level >= ACCOUNT_TRUST_GATES[gate].level;
}

export type LevelRewardKind = 'title' | 'crowns' | 'unlock' | 'prestige';

export interface LevelRewardLine {
  level: number;
  kind: LevelRewardKind;
  label: string;
}

/** What reaching `level` gives, one line per reward. Every level from 2 to 50 has at least one. */
export function levelRewardsAt(level: number): LevelRewardLine[] {
  const out: LevelRewardLine[] = [];
  for (const title of experienceTitlesBetween(level - 1, level)) out.push({ level, kind: 'title', label: `Title: ${title.title}` });
  const crowns = experienceCrownsForLevel(level);
  if (crowns) out.push({ level, kind: 'crowns', label: `${crowns} Crowns` });
  for (const gate of Object.values(ACCOUNT_TRUST_GATES)) if (gate.level === level) out.push({ level, kind: 'unlock', label: `Unlocks: ${gate.label}` });
  if (level >= 50 && level % 50 === 0) out.push({ level, kind: 'prestige', label: `Prestige star ${level / 50}` });
  return out;
}

/** Levels per prestige star. Levels never cap; every 50 adds a star. */
export const PRESTIGE_LEVELS = 50;

export interface AccountLevelBadge {
  level: number;
  /** Stars earned: one per 50 levels. */
  prestige: number;
  /** Colour band for the level chip, from the reward rarities. */
  tier: ExperienceRewardRarity;
}

export function accountLevelBadge(level: number): AccountLevelBadge {
  const safe = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  const tier: ExperienceRewardRarity = safe >= 100 ? 'legendary'
    : safe >= 50 ? 'epic'
      : safe >= 25 ? 'rare'
        : safe >= 10 ? 'uncommon'
          : 'common';
  return { level: safe, prestige: Math.floor(safe / PRESTIGE_LEVELS), tier };
}

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
