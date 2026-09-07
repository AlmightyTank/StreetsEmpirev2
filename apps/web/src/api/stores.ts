import type { GameActionResult, StoresDto, StoreTradeInput, StoreTradeResult, WeaponUnlockInput, WeaponUnlockResult } from '@streets/shared';
import { api } from './client.js';

export const storesApi = {
  catalog: () => api.get<StoresDto>('/game/stores'),
  trade: (input: StoreTradeInput) => api.post<GameActionResult<StoreTradeResult>>('/game/stores/trade', input),
  unlock: (input: WeaponUnlockInput) => api.post<GameActionResult<WeaponUnlockResult>>('/game/stores/unlock', input),
};
