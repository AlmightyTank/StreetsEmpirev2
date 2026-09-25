import type { GameActionResult, StoresDto, StoreCheckoutInput, StoreCheckoutResult, StoreSpecialOrderInput, StoreSpecialOrderResult, StoreTradeInput, StoreTradeResult, WeaponUnlockInput, WeaponUnlockResult } from '@streets/shared';
import { api } from './client.js';

export const storesApi = {
  catalog: () => api.get<StoresDto>('/game/stores'),
  trade: (input: StoreTradeInput) => api.post<GameActionResult<StoreTradeResult>>('/game/stores/trade', input),
  checkout: (input: StoreCheckoutInput) => api.post<GameActionResult<StoreCheckoutResult>>('/game/stores/checkout', input),
  specialOrder: (input: StoreSpecialOrderInput) => api.post<GameActionResult<StoreSpecialOrderResult>>('/game/stores/special-order', input),
  unlock: (input: WeaponUnlockInput) => api.post<GameActionResult<WeaponUnlockResult>>('/game/stores/unlock', input),
};
