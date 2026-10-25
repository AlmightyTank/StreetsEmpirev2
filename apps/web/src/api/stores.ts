import type { GameActionResult, PlayerBoardDto, PlayerBoardFilterDto, PlayerBoardFillResult, PlayerBoardOfferResult, PostPlayerBoardOfferInput, SalvageTradeInput, SalvageTradeResult, SalvageYardDto, StoresDto, StoreCheckoutInput, StoreCheckoutResult, StoreSpecialOrderInput, StoreSpecialOrderResult, StoreTradeInput, StoreTradeResult, WeaponUnlockInput, WeaponUnlockResult } from '@streets/shared';
import { api } from './client.js';

export const storesApi = {
  catalog: () => api.get<StoresDto>('/game/stores'),
  trade: (input: StoreTradeInput) => api.post<GameActionResult<StoreTradeResult>>('/game/stores/trade', input),
  checkout: (input: StoreCheckoutInput) => api.post<GameActionResult<StoreCheckoutResult>>('/game/stores/checkout', input),
  specialOrder: (input: StoreSpecialOrderInput) => api.post<GameActionResult<StoreSpecialOrderResult>>('/game/stores/special-order', input),
  salvage: () => api.get<SalvageYardDto>('/game/stores/salvage'),
  salvageTrade: (input: SalvageTradeInput) => api.post<SalvageTradeResult>('/game/stores/salvage/trade', input),
  board: (filter: PlayerBoardFilterDto = 'ALL') => api.get<PlayerBoardDto>(`/game/stores/board?filter=${filter}`),
  boardPost: (input: PostPlayerBoardOfferInput) => api.post<PlayerBoardOfferResult>('/game/stores/board/offers', input),
  boardBuy: (offerId: string, actionId: string) => api.post<PlayerBoardFillResult>(`/game/stores/board/offers/${encodeURIComponent(offerId)}/buy`, { actionId }),
  boardCancel: (offerId: string) => api.post<PlayerBoardOfferResult>(`/game/stores/board/offers/${encodeURIComponent(offerId)}/cancel`, {}),
  unlock: (input: WeaponUnlockInput) => api.post<GameActionResult<WeaponUnlockResult>>('/game/stores/unlock', input),
};
