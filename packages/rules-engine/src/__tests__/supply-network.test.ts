import { describe, expect, it } from 'vitest';
import { planSupplyPickup, supplyOrderStatus } from '../calculations/supply-network.js';

describe('1.6.0-A supply foundation invariants', () => {
  it('keeps an order open, partial, or fulfilled according to collected quantity', () => {
    expect(supplyOrderStatus(20, 0)).toBe('OPEN');
    expect(supplyOrderStatus(20, 8)).toBe('PARTIALLY_COLLECTED');
    expect(supplyOrderStatus(20, 20)).toBe('FULFILLED');
  });

  it('allows a large order to be collected in vehicle-sized batches', () => {
    const first = planSupplyPickup({
      orderQuantity: 20,
      collectedQuantity: 0,
      requestedQuantity: 8,
      vehicleLoadout: { VAN: 1 },
      vehicleCapacity: { VAN: 8 },
    });
    const second = planSupplyPickup({
      orderQuantity: 20,
      collectedQuantity: first.pickupQuantity,
      requestedQuantity: 12,
      vehicleLoadout: { LOW_RIDER: 1, SEDAN: 1 },
      vehicleCapacity: { LOW_RIDER: 7, SEDAN: 5 },
    });

    expect(first).toMatchObject({ vehicleCapacity: 8, remainingBefore: 20, remainingAfter: 12, orderStatusAfter: 'PARTIALLY_COLLECTED' });
    expect(second).toMatchObject({ vehicleCapacity: 12, remainingBefore: 12, remainingAfter: 0, orderStatusAfter: 'FULFILLED' });
  });

  it('rejects collection above fleet capacity or remaining order quantity', () => {
    const base = {
      orderQuantity: 20,
      collectedQuantity: 0,
      requestedQuantity: 9,
      vehicleLoadout: { VAN: 1 },
      vehicleCapacity: { VAN: 8 },
    };
    expect(() => planSupplyPickup(base)).toThrow(/combined cargo capacity/);
    expect(() => planSupplyPickup({ ...base, requestedQuantity: 3, collectedQuantity: 18 })).toThrow(/remaining quantity/);
  });

  it('rejects invalid stored quantities and unknown vehicle classes', () => {
    expect(() => supplyOrderStatus(10, 11)).toThrow(/cannot exceed/);
    expect(() => planSupplyPickup({
      orderQuantity: 10,
      collectedQuantity: 0,
      requestedQuantity: 1,
      vehicleLoadout: { ARMORED: 1 },
      vehicleCapacity: {},
    })).toThrow(/No positive cargo capacity/);
  });
});
