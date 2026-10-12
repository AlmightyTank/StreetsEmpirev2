import type { GameActionResult, SupplyOrderInput, SupplyOrderPlacementResult, SupplyPageDto, SupplyPickupDispatchResult, SupplyPickupInput, SupplyPropertyActionResult, SupplyPropertyBuyInput, SupplyPropertyCloseInput, SupplyShipmentInput, SupplyShipmentResult, SupplyLaneOrderInput, SupplyLaneResult } from '@streets/shared';
import { api } from './client.js';

export const supplyApi = {
  page: () => api.get<SupplyPageDto>('/game/supply'),
  placeOrder: (input: SupplyOrderInput) => api.post<GameActionResult<SupplyOrderPlacementResult>>('/game/supply/orders', input),
  /** 1.6.0-C. Send vehicles for one load of a paid order. */
  dispatchPickup: (input: SupplyPickupInput) => api.post<GameActionResult<SupplyPickupDispatchResult>>('/game/supply/pickups', input),
  /** 1.6.0-H. Buy abroad and ship by route card. */
  shipLane: (input: SupplyLaneOrderInput) => api.post<GameActionResult<SupplyLaneResult>>('/game/supply/lanes', input),
  /** 1.6.0-F. Ship stock between warehouses in different cities. */
  ship: (input: SupplyShipmentInput) => api.post<GameActionResult<SupplyShipmentResult>>('/game/supply/shipments', input),
  /** 1.6.0-D. Buy or give up a warehouse or a safehouse. */
  buyProperty: (input: SupplyPropertyBuyInput) => api.post<GameActionResult<SupplyPropertyActionResult>>('/game/supply/properties', input),
  closeProperty: (input: SupplyPropertyCloseInput) => api.post<GameActionResult<SupplyPropertyActionResult>>('/game/supply/properties/close', input),
};
