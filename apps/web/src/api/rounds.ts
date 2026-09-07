import type { RoundDto, RoundPlayerDto } from '@streets/shared';
import { api } from './client.js';

export interface CurrentRoundResponse {
  round: RoundDto | null;
  me: RoundPlayerDto | null;
  canJoin: boolean;
}

export const roundsApi = {
  current: () => api.get<CurrentRoundResponse>('/rounds/current'),

  join: () => api.post<CurrentRoundResponse>('/rounds/current/join'),
};
