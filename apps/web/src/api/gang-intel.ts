import type { GangInvestigationActionResult, GangInvestigationPageDto, GameActionResult } from '@streets/shared';
import { api } from './client.js';

export const gangIntelApi = {
  page: () => api.get<GangInvestigationPageDto>('/game/gang-intel'),
  advance: (investigationId: string, actionId: string) =>
    api.post<GameActionResult<GangInvestigationActionResult>>('/game/gang-intel/advance', { investigationId, actionId }),
};
