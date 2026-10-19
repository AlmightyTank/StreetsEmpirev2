import type { CareerStoryBiographyDto, CrewLegendArchiveDto } from '@streets/shared';
import type {
  RoundAftermathArchiveDto,
  AdminSeasonChecklistDto,
  CurrentRoundDto,
  GameNewsFeedDto,
  GameStatusDto,
  RoundAftermathCategoriesDto,
  RoundAftermathCategoryKey,
  RoundAftermathCityDetailDto,
  RoundAftermathAlliancesDto,
  RoundAftermathPersonalDto,
  RoundAftermathRecordsDto,
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
  aftermathArchive: (filters: {
    page: number;
    pageSize: number;
    q?: string;
    year?: number;
    reportStatus?: 'READY' | 'UNAVAILABLE' | 'PREPARING';
    order: 'newest' | 'oldest';
  }) => {
    const query = new URLSearchParams({
      page: String(filters.page),
      pageSize: String(filters.pageSize),
      order: filters.order,
    });
    if (filters.q) query.set('q', filters.q);
    if (filters.year) query.set('year', String(filters.year));
    if (filters.reportStatus) query.set('reportStatus', filters.reportStatus);
    return api.get<RoundAftermathArchiveDto>(`/rounds/aftermath/archive?${query.toString()}`);
  },
  aftermathCategories: (roundId: string) => api.get<RoundAftermathCategoriesDto>(`/rounds/${encodeURIComponent(roundId)}/aftermath/categories`),
  aftermathCity: (roundId: string, citySlug: string) => api.get<RoundAftermathCityDetailDto>(
    `/rounds/${encodeURIComponent(roundId)}/aftermath/cities/${encodeURIComponent(citySlug)}`,
  ),
  aftermathAlliances: (roundId: string) => api.get<RoundAftermathAlliancesDto>(`/rounds/${encodeURIComponent(roundId)}/aftermath/alliances`),
  aftermathMine: (roundId: string) => api.get<RoundAftermathPersonalDto>(`/rounds/${encodeURIComponent(roundId)}/aftermath/me`),
  aftermathCareerStories: (roundId: string) => api.get<{ biography: CareerStoryBiographyDto[] }>(`/rounds/${encodeURIComponent(roundId)}/aftermath/career-stories/me`),
  aftermathCrewLegends: (roundId: string) =>
    api.get<CrewLegendArchiveDto[]>(`/rounds/${encodeURIComponent(roundId)}/aftermath/crew-legends/me`),
  aftermathRecords: (roundId: string, category: RoundAftermathCategoryKey, page = 1, citySlug?: string) => api.get<RoundAftermathRecordsDto>(
    `/rounds/${encodeURIComponent(roundId)}/aftermath/records/${category}?page=${page}&pageSize=10${citySlug ? `&citySlug=${encodeURIComponent(citySlug)}` : ''}`,
  ),
  aftermathLeaderboard: (roundId: string, category: RoundAftermathCategoryKey, page = 1, pageSize = 25) => api.get<RoundAftermathLeaderboardDto>(
    `/rounds/${encodeURIComponent(roundId)}/aftermath/leaderboards/${category}?page=${page}&pageSize=${pageSize}`,
  ),
};
