import type { PublicCurrentGameDto, PublicOverviewDto } from '@streets/shared';

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Public API request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const publicSiteApi = {
  overview: () => get<PublicOverviewDto>('/api/public/overview'),
  currentGame: () => get<{ currentGame: PublicCurrentGameDto | null }>('/api/public/current-game'),
};
