import type { CasinoCashierInput, CasinoPageDto, CasinoSessionCloseInput, CasinoSessionStartInput } from '@streets/shared';
import { api } from './client.js';

export const casinoApi = {
  page: () => api.get<CasinoPageDto>('/game/casino'),
  buy: (input: CasinoCashierInput) => api.post<CasinoPageDto>('/game/casino/chips/buy', input),
  redeem: (input: CasinoCashierInput) => api.post<CasinoPageDto>('/game/casino/chips/redeem', input),
  openSession: (input: CasinoSessionStartInput) => api.post<CasinoPageDto>('/game/casino/sessions', input),
  closeSession: (sessionId: string, input: CasinoSessionCloseInput) =>
    api.post<CasinoPageDto>('/game/casino/sessions/' + encodeURIComponent(sessionId) + '/close', input),
};
