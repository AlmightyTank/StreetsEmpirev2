import type { CareerIdentityKey } from './community.js';

export type CareerStorySourceKind = 'COMBAT' | 'TURF' | 'TRAVEL' | 'SUPPLY' | 'CONTACT' | 'BUSINESS' | 'SCOUT' | 'CASE' | 'CREW' | 'FACTION' | 'PUBLIC_ACTIVITY';
export type CareerStoryRewardKind = 'TITLE' | 'BADGE' | 'PROFILE_MOMENT' | 'CONTACT_REP' | 'TEMPORARY_GRANT';

export interface CareerStoryRewardBudget {
  cosmeticSlots: number;
  contactRep: number;
  temporaryGrantCents: number;
}

export interface CareerStoryBranchDefinition {
  key: string;
  title: string;
  body: string;
  reward: { kind: CareerStoryRewardKind; key: string; label: string };
}

export interface CareerStoryChapterDefinition {
  key: string;
  order: number;
  title: string;
  summary: string;
  sourceKind: CareerStorySourceKind;
  objectiveKey: string;
  prerequisiteChapterKey: string | null;
  branches: CareerStoryBranchDefinition[];
  optionalCrossover: boolean;
}

export interface CareerStoryArcDefinition {
  career: CareerIdentityKey;
  version: string;
  title: string;
  contractCategories: string[];
  chapters: CareerStoryChapterDefinition[];
  rewardBudget: CareerStoryRewardBudget;
}

export interface CareerStoryChapterProgressDto {
  chapterKey: string;
  order: number;
  completed: boolean;
  objectiveKey: string;
  claimedSourceIds: string[];
}

export interface CareerStoryActiveDto {
  career: CareerIdentityKey;
  catalogVersion: string;
  status: 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'ARCHIVED' | 'COMPLETE';
  currentChapterKey: string | null;
  chapters: CareerStoryChapterProgressDto[];
}

export interface CareerStoryArchiveDto {
  career: CareerIdentityKey;
  status: string;
  completedChapters: number;
  finaleEarned: boolean;
  title: string;
  visibility: 'PUBLIC' | 'PRIVATE';
}
