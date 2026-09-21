import type {
  PublicCurrentGameDto,
  PublicGameDetailDto,
  PublicGamesArchiveDto,
  PublicOverviewDto,
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
};
