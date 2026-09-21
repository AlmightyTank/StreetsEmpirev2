import type {
  PublicAlliancePageDto,
  PublicAlliancesDto,
  PublicCitiesDto,
  PublicCityPageDto,
  PublicCurrentGameDto,
  PublicGameDetailDto,
  PublicGamesArchiveDto,
  PublicHallOfFameDto,
  PublicNewsArticleDto,
  PublicNewsFeedDto,
  PublicOverviewDto,
  PublicPlayerPageDto,
  PublicRankingsDto,
  PublicSearchDto,
  PublicStatsDto,
  PublicStatusDto,
  PublicTurfDto,
} from '@streets/shared';

export class PublicApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'PublicApiError';
  }
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new PublicApiError(response.status, `Public API request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const publicSiteApi = {
  overview: () => get<PublicOverviewDto>('/api/public/overview'),
  currentGame: () => get<{ currentGame: PublicCurrentGameDto | null }>('/api/public/current-game'),
  games: () => get<PublicGamesArchiveDto>('/api/public/games'),
  game: (gameId: string) =>
    get<{ game: PublicGameDetailDto }>(`/api/public/games/${encodeURIComponent(gameId)}`),
  rankings: (limit = 100) => get<PublicRankingsDto>(`/api/public/rankings?limit=${limit}`),
  player: (publicPimpId: number) =>
    get<{ player: PublicPlayerPageDto }>(`/api/public/players/${publicPimpId}`),
  alliances: () => get<PublicAlliancesDto>('/api/public/alliances'),
  alliance: (tag: string) =>
    get<{ alliance: PublicAlliancePageDto }>(`/api/public/alliances/${encodeURIComponent(tag)}`),
  cities: () => get<PublicCitiesDto>('/api/public/cities'),
  city: (slug: string) =>
    get<{ city: PublicCityPageDto }>(`/api/public/cities/${encodeURIComponent(slug)}`),
  turf: () => get<PublicTurfDto>('/api/public/turf'),
  hallOfFame: () => get<PublicHallOfFameDto>('/api/public/hall-of-fame'),
  stats: () => get<PublicStatsDto>('/api/public/stats'),
  news: (limit = 50) => get<PublicNewsFeedDto>(`/api/public/news?limit=${limit}`),
  newsArticle: (id: string) =>
    get<{ article: PublicNewsArticleDto }>(`/api/public/news/${encodeURIComponent(id)}`),
  search: (query: string) =>
    get<PublicSearchDto>(`/api/public/search?q=${encodeURIComponent(query)}`),
  status: () => get<PublicStatusDto>('/api/public/status'),
};
