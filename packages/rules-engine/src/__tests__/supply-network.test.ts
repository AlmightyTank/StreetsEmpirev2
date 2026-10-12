import { describe, expect, it } from 'vitest';
import { classicOgV16C, classicOgV16D } from '@streets/rulesets';
import { planSupplyPickup, planSupplyRun, settlePropertyUpkeep, settleSupplyPickup, supplyOrderStatus, supplyRouteRisk } from '../calculations/supply-network.js';
import { planLaunch, runCapacity } from '../calculations/runs.js';

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

describe('1.6.0-D supply runs and property upkeep', () => {
  const ruleset = classicOgV16D;
  const now = new Date('2026-10-09T12:00:00Z');
  const home = 'new-york-city';

  it('is an ordinary run when the load comes home', () => {
    const plan = planSupplyRun(ruleset, { home, origin: 'detroit', destination: home, routeIndex: 0, now });
    const launch = planLaunch(ruleset, { home, to: 'detroit', routeIndex: 0, now });
    expect(plan).toMatchObject({ loadStop: 0, unloadStop: 1, turns: launch.turns });
    expect(plan.stops).toEqual(launch.stops);
  });

  it('drives the load on to a warehouse in a third city before heading home', () => {
    const plan = planSupplyRun(ruleset, { home, origin: 'detroit', destination: 'atlanta', routeIndex: 0, now });
    expect(plan.stops.map((stop) => stop.city)).toEqual(['detroit', 'atlanta', home]);
    expect(plan).toMatchObject({ loadStop: 0, unloadStop: 1 });
    // New York to Detroit 10h, Detroit to Atlanta 11h, Atlanta home 13h: 34 drive hours.
    expect(plan.turns).toBe(17);
    expect(plan.stops[1]!.departAt).toEqual(plan.stops[0]!.leaveAt);
    expect(plan.stops[2]!.departAt).toEqual(plan.stops[1]!.leaveAt);
  });

  it('loads and unloads at one stop when the warehouse is in the supplier city', () => {
    const plan = planSupplyRun(ruleset, { home, origin: 'detroit', destination: 'detroit', routeIndex: 0, now });
    expect(plan.stops.map((stop) => stop.city)).toEqual(['detroit', home]);
    expect(plan).toMatchObject({ loadStop: 0, unloadStop: 0 });
  });

  it('loads at home as it leaves when the supplier is local and the warehouse is not', () => {
    const plan = planSupplyRun(ruleset, { home: 'detroit', origin: 'detroit', destination: 'atlanta', routeIndex: 0, now });
    expect(plan.stops.map((stop) => stop.city)).toEqual(['atlanta', 'detroit']);
    expect(plan).toMatchObject({ loadStop: -1, unloadStop: 0 });
    expect(() => planSupplyRun(ruleset, { home, origin: home, destination: home, routeIndex: 0, now })).toThrow(/never leaves home/);
  });

  it('reports the worst road on the whole trip', () => {
    // Miami Beach to New York is I-95, the most watched road on the map.
    const plan = planSupplyRun(ruleset, { home, origin: 'detroit', destination: 'miami-beach', routeIndex: 0, now });
    expect(plan.police).toBeGreaterThanOrEqual(1.8);
  });

  it('pays upkeep period by period, and falls behind only for what cash cannot cover', () => {
    const day = 24 * 3_600_000;
    const paidThrough = new Date(now.getTime() - 2.5 * day);
    expect(settlePropertyUpkeep({ paidThrough: new Date(now.getTime() + 1), now, upkeepCents: 100n, periodHours: 24, cashCents: 1_000n }))
      .toMatchObject({ periods: 0, chargeCents: 0n, behind: 0 });
    // 2.5 days past: three periods have started.
    expect(settlePropertyUpkeep({ paidThrough, now, upkeepCents: 100n, periodHours: 24, cashCents: 1_000n }))
      .toEqual({ periods: 3, chargeCents: 300n, paidThrough: new Date(paidThrough.getTime() + 3 * day), behind: 0 });
    expect(settlePropertyUpkeep({ paidThrough, now, upkeepCents: 100n, periodHours: 24, cashCents: 250n }))
      .toEqual({ periods: 2, chargeCents: 200n, paidThrough: new Date(paidThrough.getTime() + 2 * day), behind: 1 });
    expect(settlePropertyUpkeep({ paidThrough, now, upkeepCents: 100n, periodHours: 24, cashCents: 0n }))
      .toMatchObject({ periods: 0, behind: 3, paidThrough });
  });
});
