import type {
  ActivityHistoryDto,
  HallOfFameDto,
  PublicCareerResponseDto,
  PublicPlayerProfileResponseDto,
  RankingsDto,
} from '@streets/shared';
import { api } from './client.js';

export const communityApi = {
  rankings: () => api.get<RankingsDto>('/game/rankings'),
  hallOfFame: () => api.get<HallOfFameDto>('/game/hall-of-fame'),
  career: () => api.get<PublicCareerResponseDto>('/game/career'),
  profile: (publicPimpId: number) =>
    api.get<PublicPlayerProfileResponseDto>(`/game/players/${publicPimpId}`),
  forumProfile: (forumUserId: string) =>
    api.get<PublicPlayerProfileResponseDto>(`/game/forum-players/${encodeURIComponent(forumUserId)}`),
  activity: (limit = 50) =>
    api.get<ActivityHistoryDto>(`/game/activity?limit=${Math.max(1, Math.min(100, limit))}`),
};
