import type {
  CurrentRoundDto,
  GameNewsFeedDto,
  GameStatusDto,
} from '@streets/shared';
import { api } from './client.js';

export const roundsApi = {
  current: () => api.get<CurrentRoundDto>('/rounds/current'),
  join: () => api.post<CurrentRoundDto>('/rounds/current/join'),
  status: () => api.get<GameStatusDto>('/rounds/current/status'),
  news: () => api.get<GameNewsFeedDto>('/rounds/current/news'),
};
