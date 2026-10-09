import { describe, expect, it } from 'vitest';
import { classicOgV16C } from '@streets/rulesets';
import { planSupplyPickup, settleSupplyPickup, supplyOrderStatus, supplyRouteRisk } from '../calculations/supply-network.js';
import { runCapacity } from '../calculations/runs.js';

describe('1.6.0-A supply foundation invariants', () => {
  it('keeps an order open, partial, or fulfilled according to collected quantity', () => {
    expect(supplyOrderStatus(20, 0)).toBe('OPEN');
    expect(supplyOrderStatus(20, 8)).toBe('PARTIALLY_COLLECTED');
    expect(supplyOrderStatus(20, 20)).toBe('FULFILLED');
  });

  it('rejects invalid stored quantities', () => {
    expect(() => supplyOrderStatus(10, 11)).toThrow(/cannot exceed/);
  });
});

describe('1.6.0-C multi-trip pickups', () => {
  it('collects a large order in vehicle-sized loads until it is fulfilled', () => {
    const first = planSupplyPickup({ orderQuantity: 20, collectedQuantity: 0, requestedQuantity: 8, capacityUnits: 8 });
    const second = planSupplyPickup({ orderQuantity: 20, collectedQuantity: first.pickupQuantity, requestedQuantity: 12, capacityUnits: 12 });

    expect(first).toMatchObject({ vehicleCapacity: 8, remainingBefore: 20, remainingAfter: 12, orderStatusAfter: 'PARTIALLY_COLLECTED' });
    expect(second).toMatchObject({ vehicleCapacity: 12, remainingBefore: 12, remainingAfter: 0, orderStatusAfter: 'FULFILLED' });
  });

  it('counts loads already promised to other pickups against the order', () => {
    const plan = planSupplyPickup({ orderQuantity: 2_000, collectedQuantity: 500, reservedQuantity: 750, requestedQuantity: 750, capacityUnits: 1_125 });
    expect(plan).toMatchObject({ remainingBefore: 750, remainingAfter: 0 });
    expect(() => planSupplyPickup({ orderQuantity: 2_000, collectedQuantity: 500, reservedQuantity: 750, requestedQuantity: 751, capacityUnits: 1_125 }))
      .toThrow(/remaining quantity/);
  });

  it('rejects a load above the fleet, the order, or the room waiting at home', () => {
    const base = { orderQuantity: 20, collectedQuantity: 0, requestedQuantity: 9, capacityUnits: 8 };
    expect(() => planSupplyPickup(base)).toThrow(/combined cargo capacity/);
    expect(() => planSupplyPickup({ ...base, requestedQuantity: 3, collectedQuantity: 18 })).toThrow(/remaining quantity/);
    expect(() => planSupplyPickup({ ...base, requestedQuantity: 5, storageRoomUnits: 4 })).toThrow(/room left/);
    expect(() => planSupplyPickup({ ...base, capacityUnits: 0, requestedQuantity: 1 })).toThrow(/At least one vehicle/);
  });

  it('counts a mixed fleet once, rounding the whole load rather than each car', () => {
    const ruleset = classicOgV16C;
    // Two Sedans carry 487.5 each: the pair holds 975, not 974.
    expect(runCapacity(ruleset, { SEDAN: 2 })).toBe(975);
    const capacity = runCapacity(ruleset, { LOW_RIDER: 1, SEDAN: 1, VAN: 1 });
    expect(capacity).toBe(750 + 487 + 1_125);
    expect(planSupplyPickup({ orderQuantity: 10_000, collectedQuantity: 0, requestedQuantity: capacity, capacityUnits: capacity }).pickupQuantity).toBe(capacity);
  });

  it('credits only what made it home, never more than was loaded', () => {
    expect(settleSupplyPickup(750, 750)).toEqual({ delivered: 750, lost: 0, extra: 0, status: 'DELIVERED' });
    expect(settleSupplyPickup(750, 600)).toEqual({ delivered: 600, lost: 150, extra: 0, status: 'DELIVERED' });
    expect(settleSupplyPickup(750, 0)).toEqual({ delivered: 0, lost: 750, extra: 0, status: 'FAILED' });
    expect(settleSupplyPickup(750, 900)).toEqual({ delivered: 750, lost: 0, extra: 150, status: 'DELIVERED' });
  });

  it('bands a road by its police and the fleet profile', () => {
    expect(supplyRouteRisk(0.9)).toBe('QUIET');
    expect(supplyRouteRisk(1)).toBe('QUIET');
    expect(supplyRouteRisk(1, 1.15)).toBe('WATCHED');
    expect(supplyRouteRisk(1.3, 0.9)).toBe('WATCHED');
    expect(supplyRouteRisk(1.5)).toBe('HEAVY');
  });
});
