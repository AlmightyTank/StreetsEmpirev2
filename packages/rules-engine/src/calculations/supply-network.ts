export type SupplyOrderStatus = 'OPEN' | 'PARTIALLY_COLLECTED' | 'FULFILLED';

export interface SupplyPickupPlanInput {
  orderQuantity: number;
  /** Units already loaded at the supplier, whether they reached home or not. */
  collectedQuantity: number;
  /** 1.6.0-C. Units promised to pickups still driving out, not yet loaded. */
  reservedQuantity?: number;
  requestedQuantity: number;
  /** Combined cargo of the selected vehicles, counted once for the whole fleet (`runCapacity`). */
  capacityUnits: number;
  /** 1.6.0-C. Room left at the destination after stock and loads already on their way. Absent: unbounded. */
  storageRoomUnits?: number;
}

export interface SupplyPickupPlan {
  vehicleCapacity: number;
  /** What the order still has to give, less what other pickups already claimed. */
  remainingBefore: number;
  pickupQuantity: number;
  remainingAfter: number;
  /** The order's status once this load is collected at the supplier. */
  orderStatusAfter: SupplyOrderStatus;
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer.`);
  }
}

export function supplyOrderStatus(orderQuantity: number, collectedQuantity: number): SupplyOrderStatus {
  if (!Number.isSafeInteger(orderQuantity) || orderQuantity <= 0) {
    throw new RangeError('orderQuantity must be a positive safe integer.');
  }
  assertNonNegativeInteger(collectedQuantity, 'collectedQuantity');
  if (collectedQuantity > orderQuantity) {
    throw new RangeError('collectedQuantity cannot exceed orderQuantity.');
  }
  if (collectedQuantity === 0) return 'OPEN';
  if (collectedQuantity === orderQuantity) return 'FULFILLED';
  return 'PARTIALLY_COLLECTED';
}

/**
 * Validate one partial pickup against the remaining paid order, the selected fleet and the
 * room waiting for it at home. Orders may span many trips; this plans only the requested load.
 */
export function planSupplyPickup(input: SupplyPickupPlanInput): SupplyPickupPlan {
  const reserved = input.reservedQuantity ?? 0;
  assertNonNegativeInteger(reserved, 'reservedQuantity');
  supplyOrderStatus(input.orderQuantity, input.collectedQuantity + reserved);
  const remainingBefore = input.orderQuantity - input.collectedQuantity - reserved;
  if (!Number.isSafeInteger(input.requestedQuantity) || input.requestedQuantity <= 0) {
    throw new RangeError('requestedQuantity must be a positive safe integer.');
  }
  assertNonNegativeInteger(input.capacityUnits, 'capacityUnits');
  if (input.capacityUnits <= 0) throw new RangeError('At least one vehicle with cargo capacity is required.');
  if (input.requestedQuantity > input.capacityUnits) {
    throw new RangeError('Pickup quantity exceeds the selected vehicles\' combined cargo capacity.');
  }
  if (input.requestedQuantity > remainingBefore) {
    throw new RangeError('Pickup quantity exceeds the order\'s remaining quantity.');
  }
  if (input.storageRoomUnits !== undefined && input.requestedQuantity > Math.max(0, input.storageRoomUnits)) {
    throw new RangeError('Pickup quantity exceeds the room left at its destination.');
  }

  return {
    vehicleCapacity: input.capacityUnits,
    remainingBefore,
    pickupQuantity: input.requestedQuantity,
    remainingAfter: remainingBefore - input.requestedQuantity,
    orderStatusAfter: supplyOrderStatus(input.orderQuantity, input.collectedQuantity + input.requestedQuantity),
  };
}

export interface SupplyPickupDelivery {
  /** Units credited to the destination: never more than were loaded. */
  delivered: number;
  /** Loaded at the supplier and lost on the road: seized, looted or burned in a fight. */
  lost: number;
  /** Units of the same product that rode home on top of the load (convoy loot), for home stock. */
  extra: number;
  status: 'DELIVERED' | 'FAILED';
}

/**
 * 1.6.0-C. What a pickup run brings home. The load shares the trunk with whatever else the
 * run picked up, so only up to the loaded quantity counts as delivered; anything above it
 * goes home as ordinary product, and a load that came home empty failed.
 */
export function settleSupplyPickup(loaded: number, arrived: number): SupplyPickupDelivery {
  assertNonNegativeInteger(loaded, 'loaded');
  assertNonNegativeInteger(arrived, 'arrived');
  const delivered = Math.min(loaded, arrived);
  return { delivered, lost: loaded - delivered, extra: arrived - delivered, status: delivered > 0 ? 'DELIVERED' : 'FAILED' };
}

export type SupplyRouteRisk = 'QUIET' | 'WATCHED' | 'HEAVY';

/**
 * 1.6.0-C. A readable band for a pickup's road: its worst police leaning, nudged by the
 * fleet's route profile. Never a chance, never a roll.
 */
export function supplyRouteRisk(police: number, vehicleRiskMultiplier = 1): SupplyRouteRisk {
  const pressure = police * vehicleRiskMultiplier;
  if (pressure >= 1.4) return 'HEAVY';
  if (pressure >= 1.1) return 'WATCHED';
  return 'QUIET';
}
