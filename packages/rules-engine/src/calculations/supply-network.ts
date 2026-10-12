import type { Ruleset } from '@streets/rulesets';
import { findRoutes, type TravelRoute } from './cities.js';
import { RunError, driveMs, driveTurns, planLaunch, runRules, type RunStopPlan } from './runs.js';

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

export interface SupplyRunPlan {
  /** Every stop: the supplier, then the destination if it is neither there nor home, then home. */
  stops: RunStopPlan[];
  /** Index of the stop where the load goes on; -1 when it is loaded at home as the run leaves. */
  loadStop: number;
  /** Index of the stop where the load comes off; the last stop when it is delivered home. */
  unloadStop: number;
  /** Every leg, paid at dispatch. */
  turns: number;
  /** The first leg, as the player picked it. */
  route: TravelRoute;
  /** The worst police leaning on any road the run will drive. */
  police: number;
}

/**
 * 1.6.0-D. A supply run from home: out to where the load is, on to where it goes, and home.
 * Only the first leg is the player's pick; the rest take the shortest road, as a run moving
 * on does. Stops keep the town window, so loading and unloading happen on the clock like a
 * trade would. Throws `RunError` like any run plan. Not for a load that never leaves home.
 */
export function planSupplyRun(ruleset: Ruleset, input: { home: string; origin: string; destination: string; routeIndex: number; now: Date }): SupplyRunPlan {
  const { home, origin, destination, now } = input;
  if (origin === home && destination === home) throw new RunError('ALREADY_HOME', 'That load never leaves home.', 'to');
  // Loaded at home as the run leaves: one trip out to the destination and back.
  const first = origin === home ? destination : origin;
  const launch = planLaunch(ruleset, { home, to: first, routeIndex: input.routeIndex, now });
  const out = launch.stops[0]!;
  const roads = [launch.route.police];
  let stops = launch.stops;
  if (origin !== home && destination !== home && destination !== origin) {
    const onward = findRoutes(ruleset, origin, destination)[0];
    const back = findRoutes(ruleset, destination, home)[0];
    if (!onward || !back) throw new RunError('NO_ROAD', 'There is no road between those cities.', 'to');
    const window = (runRules(ruleset)?.townWindowMinutes ?? 0) * 60_000;
    const arriveAt = new Date(out.leaveAt!.getTime() + driveMs(ruleset, onward.driveHours));
    const leaveAt = new Date(arriveAt.getTime() + window);
    stops = [
      out,
      { city: destination, route: onward.cities, departAt: out.leaveAt!, arriveAt, leaveAt },
      { city: home, route: back.cities, departAt: leaveAt, arriveAt: new Date(leaveAt.getTime() + driveMs(ruleset, back.driveHours)), leaveAt: null },
    ];
    roads.push(onward.police, back.police);
    const outHours = launch.route.driveHours;
    return {
      stops,
      loadStop: 0,
      unloadStop: 1,
      turns: driveTurns(ruleset, outHours + onward.driveHours + back.driveHours),
      route: launch.route,
      police: Math.max(...roads),
    };
  }
  const back = findRoutes(ruleset, first, home)[0];
  if (back) roads.push(back.police);
  return {
    stops,
    loadStop: origin === home ? -1 : 0,
    unloadStop: destination === home ? stops.length - 1 : 0,
    turns: launch.turns,
    route: launch.route,
    police: Math.max(...roads),
  };
}

export interface PropertyUpkeep {
  /** Periods paid now. */
  periods: number;
  chargeCents: bigint;
  /** Paid up to here. Still in the past when the cash ran out. */
  paidThrough: Date;
  /** Periods that fell due and could not be paid. */
  behind: number;
}

/**
 * 1.6.0-D. Upkeep falls due one period at a time and is paid from cash in order. A
 * property the cash cannot cover stays behind until it can; nothing is taken from it.
 */
export function settlePropertyUpkeep(input: { paidThrough: Date; now: Date; upkeepCents: bigint; periodHours: number; cashCents: bigint }): PropertyUpkeep {
  const period = input.periodHours * 3_600_000;
  if (!(period > 0)) throw new RangeError('periodHours must be positive.');
  const due = input.now.getTime() < input.paidThrough.getTime() ? 0 : Math.floor((input.now.getTime() - input.paidThrough.getTime()) / period) + 1;
  const affordable = input.upkeepCents <= 0n ? due : Number(input.cashCents > 0n ? input.cashCents / input.upkeepCents : 0n);
  const periods = Math.min(due, affordable);
  return {
    periods,
    chargeCents: input.upkeepCents * BigInt(periods),
    paidThrough: new Date(input.paidThrough.getTime() + periods * period),
    behind: due - periods,
  };
}
