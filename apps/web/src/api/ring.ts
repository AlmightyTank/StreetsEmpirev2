import type { RingStateDto } from '@streets/shared';
import { api } from './client.js';

export const ringApi = {
  status: () => api.get<RingStateDto>('/game/ring'),
  destroy: () => api.post<{ rewardCents: number }>('/game/ring/destroy', {}),
};
