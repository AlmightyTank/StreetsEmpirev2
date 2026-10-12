import type { GameActionResult, LoanAcceptInputDto, LoanAcceptResult, LoanPaymentInputDto, LoanPaymentPreviewDto, LoanPaymentResult, LoanSharkPageDto } from '@streets/shared';
import { api } from './client.js';

/** 1.6.5-B. The loan shark: fixed offers, and the loans they make. */
export const loansApi = {
  page: () => api.get<LoanSharkPageDto>('/game/loans'),
  accept: (input: LoanAcceptInputDto) => api.post<GameActionResult<LoanAcceptResult>>('/game/loans/accept', input),
  /** 1.6.5-D. What a payment would do, then the payment. */
  preview: (loanId: string, amountCents: number) => api.get<LoanPaymentPreviewDto>(`/game/loans/${encodeURIComponent(loanId)}/preview?amountCents=${amountCents}`),
  pay: (loanId: string, input: LoanPaymentInputDto) => api.post<GameActionResult<LoanPaymentResult>>(`/game/loans/${encodeURIComponent(loanId)}/pay`, input),
};
