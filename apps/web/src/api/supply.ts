import type { GameActionResult, SupplyOrderInput, SupplyOrderPlacementResult, SupplyPageDto } from '@streets/shared';
import { api } from './client.js';

export const supplyApi = {
  page: () => api.get<SupplyPageDto>('/game/supply'),
  placeOrder: (input: SupplyOrderInput) => api.post<GameActionResult<SupplyOrderPlacementResult>>('/game/supply/orders', input),
};
