import type { SupporterRedirectDto, SupporterStatusDto } from '@streets/shared';
import { api } from './client.js';

/** Account → Supporting: status, Stripe Checkout and the Stripe billing portal. */
export const supporterApi = {
  status: () => api.get<SupporterStatusDto>('/supporter'),
  checkout: () => api.post<SupporterRedirectDto>('/supporter/checkout', {}),
  portal: () => api.post<SupporterRedirectDto>('/supporter/portal', {}),
};
