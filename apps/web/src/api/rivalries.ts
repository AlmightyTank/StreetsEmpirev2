import type { RivalryHistoryDto } from '@streets/shared';
import { api } from './client.js';

export const rivalriesApi = {
  list: (roundId: string) => api.get<RivalryHistoryDto[]>(`/rounds/${encodeURIComponent(roundId)}/rivalries`),
  public: (roundId: string, relationshipId: string) => api.get(`/rounds/${encodeURIComponent(roundId)}/rivalries/${encodeURIComponent(relationshipId)}/public`),
  cards: (roundId: string, relationshipId: string) => api.get(`/rounds/${encodeURIComponent(roundId)}/rivalries/${encodeURIComponent(relationshipId)}/public/cards`),
};
