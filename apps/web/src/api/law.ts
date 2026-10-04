import type { GameActionResult, LawPageDto, TipDto } from '@streets/shared';
import { api } from './client.js';

/** 1.3.0-A. The player's own Case. There is no way to read anyone else's. */
export const lawApi = {
  page: () => api.get<LawPageDto>('/game/law'),
  /** 1.3.0-C. Answer a warrant with a lawyer during its window. */
  lawyerUp: (warrantId: string, actionId: string) =>
    api.post<GameActionResult<{ warrantId: string; feeCents: number; cityName: string }>>(`/game/law/warrants/${encodeURIComponent(warrantId)}/lawyer`, { actionId }),
  /** 1.3.0-D. Officials, a DA's quash, and informants. */
  hire: (citySlug: string, role: string, actionId: string) =>
    api.post<GameActionResult<{ officialId: string; weekCents: number; paidUntil: string }>>('/game/law/officials', { citySlug, role, actionId }),
  payWeek: (officialId: string, actionId: string) =>
    api.post<GameActionResult<{ officialId: string; weekCents: number; paidUntil: string }>>(`/game/law/officials/${encodeURIComponent(officialId)}/pay`, { actionId }),
  cut: (officialId: string, actionId: string) =>
    api.post<GameActionResult<{ officialId: string }>>(`/game/law/officials/${encodeURIComponent(officialId)}/cut`, { actionId }),
  quash: (warrantId: string, actionId: string) =>
    api.post<GameActionResult<{ warrantId: string; cityName: string; quashReadyAt: string }>>(`/game/law/warrants/${encodeURIComponent(warrantId)}/quash`, { actionId }),
  tip: (kind: 'SWEEP' | 'CITY', citySlug: string | undefined, actionId: string) =>
    api.post<GameActionResult<TipDto>>('/game/law/tips', { kind, ...(citySlug ? { citySlug } : {}), actionId }),
  /** 1.3.0-C. Keep a lawyer on retainer. */
  retain: (actionId: string) =>
    api.post<GameActionResult<{ feeCents: number; retainedUntil: string }>>('/game/law/lawyer/retain', { actionId }),
};
