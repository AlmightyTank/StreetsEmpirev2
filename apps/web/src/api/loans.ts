import type { GameActionResult, LoanAcceptInputDto, LoanAcceptResult, LoanSharkPageDto } from '@streets/shared';
import { api } from './client.js';

/** 1.6.5-B. The loan shark: fixed offers, and the loans they make. */
export const loansApi = {
  page: () => api.get<LoanSharkPageDto>('/game/loans'),
  accept: (input: LoanAcceptInputDto) => api.post<GameActionResult<LoanAcceptResult>>('/game/loans/accept', input),
};
