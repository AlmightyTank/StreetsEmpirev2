import type { EmpireInsightsDto } from '@streets/shared';
import { api } from './client.js';

export const insightsApi = {
  get: () => api.get<EmpireInsightsDto>('/insights'),
};
