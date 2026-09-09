import type {
  ActivityHistoryDto,
  PublicPlayerProfileResponseDto,
  RankingsDto,
} from '@streets/shared';
import { api } from './client.js';

export const communityApi = {
  rankings: () => api.get<RankingsDto>('/game/rankings'),
  profile: (publicPimpId: number) =>
    api.get<PublicPlayerProfileResponseDto>(`/game/players/${publicPimpId}`),
  activity: (limit = 50) =>
    api.get<ActivityHistoryDto>(`/game/activity?limit=${Math.max(1, Math.min(100, limit))}`),
};
