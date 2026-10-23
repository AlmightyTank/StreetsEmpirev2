import type { SupporterBenefitsDto, SupporterPollsDto, SupporterRedirectDto, SupporterStatusDto } from '@streets/shared';
import { api } from './client.js';

/** Supporter page: status, Stripe Checkout and the Stripe billing portal. */
export const supporterApi = {
  status: () => api.get<SupporterStatusDto>('/supporter'),
  benefits: () => api.get<SupporterBenefitsDto>('/supporter/benefits'),
  checkout: () => api.post<SupporterRedirectDto>('/supporter/checkout', {}),
  giftCheckout: (recipientAccountId: string) => api.post<SupporterRedirectDto>('/supporter/gift-checkout', { recipientAccountId }),
  portal: () => api.post<SupporterRedirectDto>('/supporter/portal', {}),
  verifyGooglePlay: (purchaseToken: string) => api.post<SupporterStatusDto>('/supporter/google-play/verify', { purchaseToken }),
  polls: () => api.get<SupporterPollsDto>('/supporter/polls'),
  vote: (pollId: string, optionKey: string) => api.post<SupporterPollsDto>(`/supporter/polls/${encodeURIComponent(pollId)}/vote`, { optionKey }),
  setListed: (listed: boolean) => api.post<SupporterStatusDto>('/supporter/listing', { listed }),
  setReleaseCredit: (optIn: boolean) => api.post<SupporterStatusDto>('/supporter/release-credit', { optIn }),
};
