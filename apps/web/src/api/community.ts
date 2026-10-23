import type {
  ActivityHistoryDto,
  HallOfFameDto,
  PublicCareerResponseDto,
  CareerIdentityDto,
  CareerIdentityKey,
  PublicLegacyEntryDto,
  PublicPlayerProfileResponseDto,
  RankingsDto,
  MentoringDto,
  XpLeaderboardDto,
  CareerStoryActiveDto,
  CareerStoryArchiveDto,
} from '@streets/shared';
import { api } from './client.js';

export const communityApi = {
  rankings: () => api.get<RankingsDto>('/game/rankings'),
  hallOfFame: () => api.get<HallOfFameDto>('/game/hall-of-fame'),
  career: () => api.get<PublicCareerResponseDto>('/game/career'),
  xpLeaderboard: () => api.get<XpLeaderboardDto>('/game/xp-leaderboard'),
  mentoring: () => api.get<MentoringDto>('/game/mentoring'),
  chooseMentor: (mentorPublicPimpId: number) => api.post<MentoringDto>('/game/mentoring', { mentorPublicPimpId }),
  careerIdentity: () => api.get<{ career: CareerIdentityDto | null; choices: CareerIdentityKey[] }>('/game/career-identity'),
  chooseCareer: (career: CareerIdentityKey) =>
    api.post<{ career: CareerIdentityDto }>('/game/career-identity', { career }),
  careerStory: () => api.get<{ story: CareerStoryActiveDto | null }>('/game/career-story'),
  careerStoryPortfolio: () => api.get<{ portfolio: CareerStoryArchiveDto[] }>('/game/career-story/portfolio'),
  careerStoryBiography: () => api.get<{ biography: Array<{ career: string; title: string; status: string; completedChapters: number; finaleEarned: boolean; recognition: string | null }> }>('/game/career-story/biography'),
  publicCareerStoryPortfolio: (publicPimpId: number) => api.get<{ portfolio: CareerStoryArchiveDto[] }>(`/game/career-story/portfolio/public/${publicPimpId}`),
  chooseCareerStory: (chapterKey: string, branchKey: string) => api.post<{ choice: { id: string; chapterKey: string; branchKey: string } }>('/game/career-story/choice', { chapterKey, branchKey }),
  featureLegacy: (entryId: string | null) =>
    api.post<{ entries: PublicLegacyEntryDto[] }>('/game/legacy/feature', { entryId }),
  profile: (publicPimpId: number) =>
    api.get<PublicPlayerProfileResponseDto>(`/game/players/${publicPimpId}`),
  forumProfile: (forumUserId: string) =>
    api.get<PublicPlayerProfileResponseDto>(`/game/forum-players/${encodeURIComponent(forumUserId)}`),
  activity: (limit = 50) =>
    api.get<ActivityHistoryDto>(`/game/activity?limit=${Math.max(1, Math.min(100, limit))}`),
};
