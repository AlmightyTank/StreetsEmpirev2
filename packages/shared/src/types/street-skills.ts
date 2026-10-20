/** Street Skills Slice D DTOs. Public badges never include XP or milestone choices. */
export type StreetSkillKeyDto = 'HUSTLE' | 'MUSCLE' | 'WHEELS' | 'FIXER' | 'CONNECTIONS' | 'LUCK';

export interface StreetSkillBadgeDto {
  skill: StreetSkillKeyDto;
  label: string;
  points: number;
}

export type StreetSkillTaperBandDto = 'FULL' | 'HALF' | 'QUARTER';

export interface StreetSkillMilestoneDto {
  threshold: number;
  unlocked: boolean;
  choice: string | null;
  choices: Array<{ key: string; label: string; description: string }>;
}

export interface StreetSkillProgressDto {
  skill: StreetSkillKeyDto;
  xp: number;
  points: number;
  xpToday: number;
  taperBand: StreetSkillTaperBandDto;
  choices: Record<string, string>;
  respecs: number;
  respecReadyAt: string | null;
  milestones: StreetSkillMilestoneDto[];
}

export interface StreetSkillsDto {
  skills: StreetSkillProgressDto[];
  totalPoints: number;
  totalPointCap: number;
  skillPointCap: number;
  dailyFullXp: number;
  dailyHalfXp: number;
  xpToday: number;
  taperBand: StreetSkillTaperBandDto;
}
