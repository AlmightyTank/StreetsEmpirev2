export type SupplyOrderStatus = 'OPEN' | 'PARTIALLY_COLLECTED' | 'FULFILLED';

export interface SupplyPickupPlanInput {
  orderQuantity: number;
  collectedQuantity: number;
  requestedQuantity: number;
  vehicleLoadout: Readonly<Record<string, number>>;
  vehicleCapacity: Readonly<Record<string, number>>;
}

export interface SupplyPickupPlan {
  vehicleCapacity: number;
  remainingBefore: number;
  pickupQuantity: number;
  remainingAfter: number;
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
 * Validate one partial pickup against the remaining paid order and selected fleet.
 * Orders may span many trips; this function plans only the requested load.
 */
export function planSupplyPickup(input: SupplyPickupPlanInput): SupplyPickupPlan {
  const remainingBefore = input.orderQuantity - input.collectedQuantity;
  supplyOrderStatus(input.orderQuantity, input.collectedQuantity);
  if (!Number.isSafeInteger(input.requestedQuantity) || input.requestedQuantity <= 0) {
    throw new RangeError('requestedQuantity must be a positive safe integer.');
  }

  let vehicleCapacity = 0;
  for (const [vehicleClass, count] of Object.entries(input.vehicleLoadout)) {
    assertNonNegativeInteger(count, `${vehicleClass} count`);
    if (count === 0) continue;
    const capacity = input.vehicleCapacity[vehicleClass];
    if (typeof capacity !== 'number' || !Number.isSafeInteger(capacity) || capacity <= 0) {
      throw new RangeError(`No positive cargo capacity is defined for ${vehicleClass}.`);
    }
    vehicleCapacity += capacity * count;
    if (!Number.isSafeInteger(vehicleCapacity)) {
      throw new RangeError('Combined vehicle capacity exceeds the safe integer range.');
    }
  }

  if (vehicleCapacity <= 0) throw new RangeError('At least one vehicle with cargo capacity is required.');
  if (input.requestedQuantity > vehicleCapacity) {
    throw new RangeError('Pickup quantity exceeds the selected vehicles\' combined cargo capacity.');
  }
  if (input.requestedQuantity > remainingBefore) {
    throw new RangeError('Pickup quantity exceeds the order\'s remaining quantity.');
  }

  const remainingAfter = remainingBefore - input.requestedQuantity;
  const collectedAfter = input.collectedQuantity + input.requestedQuantity;
  return {
    vehicleCapacity,
    remainingBefore,
    pickupQuantity: input.requestedQuantity,
    remainingAfter,
    orderStatusAfter: supplyOrderStatus(input.orderQuantity, collectedAfter),
  };
}
