import type {
  AdminCrownAdjustmentDto,
  AdminCrownWalletDto,
  AdminDropDashboardDto,
  AdminDropEntryDto,
  AdminDropOfferDto,
  AdminDropSettingsDto,
  CrownPackOrderDto,
  CrownPacksDto,
  DropItemDetailDto,
  DropPurchaseResultDto,
  DropStorefrontDto,
  DropWalletDetailDto,
  GameActionResult,
  StreetPassSkipQuoteDto,
  StreetPassSkipResultDto,
  SupporterRedirectDto,
} from '@streets/shared';
import { api } from './client.js';

/** The Drop: storefront, wallet, purchases, Crown packs and Street Pass skips. */
export const dropApi = {
  status: () => api.get<{ enabled: boolean }>('/drop/status'),
  storefront: () => api.get<DropStorefrontDto>('/drop'),
  item: (slug: string) => api.get<DropItemDetailDto>(`/drop/items/${encodeURIComponent(slug)}`),
  wallet: () => api.get<DropWalletDetailDto>('/drop/wallet'),
  purchase: (offerId: string, actionId: string) => api.post<DropPurchaseResultDto>('/drop/purchase', { offerId, actionId }),
  packs: (platform?: string) => api.get<CrownPacksDto>(`/drop/crowns${platform ? `?platform=${encodeURIComponent(platform)}` : ''}`),
  checkout: (packId: string) => api.post<SupporterRedirectDto>('/drop/crowns/checkout', { packId }),
  verifyGooglePlayPack: (productId: string, purchaseToken: string) => api.post<{ credited: boolean }>('/drop/crowns/play-purchase', { productId, purchaseToken }),
  skipQuote: () => api.get<StreetPassSkipQuoteDto>('/drop/street-pass-skip'),
  skip: (tiers: number, actionId: string) => api.post<GameActionResult<StreetPassSkipResultDto>>('/drop/street-pass-skip', { tiers, actionId }),
};

type WithReason<T> = T & { reason: string };

export const adminDropApi = {
  dashboard: () => api.get<AdminDropDashboardDto>('/admin/drop'),
  preview: (key: string) => api.get<DropItemDetailDto>(`/admin/drop/preview/${encodeURIComponent(key)}`),
  settings: (patch: WithReason<Partial<AdminDropSettingsDto>>) => api.patch<AdminDropSettingsDto>('/admin/drop/settings', patch),
  entry: (key: string, patch: WithReason<{
    state?: string;
    priceCrowns?: number | null;
    returnPolicy?: string;
    inDailyPool?: boolean;
    homepageSlot?: number | null;
    confirmIrreversible?: boolean;
  }>) => api.patch<AdminDropEntryDto>(`/admin/drop/catalog/${encodeURIComponent(key)}`, patch),
  createOffer: (input: WithReason<{
    refKey: string;
    slot: string;
    badge: string;
    priceCrowns?: number | null;
    startsAt: string;
    endsAt?: string | null;
    note?: string | null;
  }>) => api.post<AdminDropOfferDto>('/admin/drop/offers', input),
  cancelOffer: (id: string, reason: string) => api.post<AdminDropOfferDto>(`/admin/drop/offers/${encodeURIComponent(id)}/cancel`, { reason }),
  walletByUsername: (username: string) => api.get<AdminCrownWalletDto>(`/admin/drop/wallets?username=${encodeURIComponent(username)}`),
  wallet: (accountId: string) => api.get<AdminCrownWalletDto>(`/admin/drop/wallets/${encodeURIComponent(accountId)}`),
  adjust: (accountId: string, delta: number, reason: string) =>
    api.post<AdminCrownAdjustmentDto>(`/admin/drop/wallets/${encodeURIComponent(accountId)}/adjust`, { delta, reason }),
  release: (accountId: string, reason: string) =>
    api.post<AdminCrownWalletDto>(`/admin/drop/wallets/${encodeURIComponent(accountId)}/release`, { reason }),
  decide: (id: string, approve: boolean, reason: string) =>
    api.post<AdminCrownAdjustmentDto>(`/admin/drop/adjustments/${encodeURIComponent(id)}/decide`, { approve, reason }),
  packOrders: (status?: string) =>
    api.get<{ orders: (CrownPackOrderDto & { accountId: string | null; checkoutSessionId: string | null })[] }>(`/admin/drop/pack-orders${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  reconcile: (id: string, reason: string) =>
    api.post<{ outcome: string; order: CrownPackOrderDto }>(`/admin/drop/pack-orders/${encodeURIComponent(id)}/reconcile`, { reason }),
};
