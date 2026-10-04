import type { GameActionResult, LawPageDto } from '@streets/shared';
import { api } from './client.js';

/** 1.3.0-A. The player's own Case. There is no way to read anyone else's. */
export const lawApi = {
  page: () => api.get<LawPageDto>('/game/law'),
  /** 1.3.0-C. Answer a warrant with a lawyer during its window. */
  lawyerUp: (warrantId: string, actionId: string) =>
    api.post<GameActionResult<{ warrantId: string; feeCents: number; cityName: string }>>(`/game/law/warrants/${encodeURIComponent(warrantId)}/lawyer`, { actionId }),
  /** 1.3.0-C. Keep a lawyer on retainer. */
  retain: (actionId: string) =>
    api.post<GameActionResult<{ feeCents: number; retainedUntil: string }>>('/game/law/lawyer/retain', { actionId }),
};
