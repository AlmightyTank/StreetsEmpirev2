import type {
  AdminSeasonChecklistDto,
  CurrentRoundDto,
  GameNewsFeedDto,
  GameStatusDto,
  RoundAftermathCategoriesDto,
  RoundAftermathCategoryKey,
  RoundAftermathLeaderboardDto,
  RoundAftermathOverviewDto,
} from '@streets/shared';
import { api } from './client.js';

export const roundsApi = {
  current: () => api.get<CurrentRoundDto>('/rounds/current'),
  join: () => api.post<CurrentRoundDto>('/rounds/current/join'),
  status: () => api.get<GameStatusDto>('/rounds/current/status'),
  adminSeasonChecklist: () => api.get<AdminSeasonChecklistDto>('/rounds/admin/season-checklist'),
  news: () => api.get<GameNewsFeedDto>('/rounds/current/news'),
  aftermath: (roundId: string) => api.get<RoundAftermathOverviewDto>(`/rounds/${encodeURIComponent(roundId)}/aftermath`),
  aftermathCategories: (roundId: string) => api.get<RoundAftermathCategoriesDto>(`/rounds/${encodeURIComponent(roundId)}/aftermath/categories`),
  aftermathLeaderboard: (roundId: string, category: RoundAftermathCategoryKey, page = 1, pageSize = 25) => api.get<RoundAftermathLeaderboardDto>(
    `/rounds/${encodeURIComponent(roundId)}/aftermath/leaderboards/${category}?page=${page}&pageSize=${pageSize}`,
  ),
};
