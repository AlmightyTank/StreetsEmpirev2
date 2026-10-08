import type { Prisma } from '@prisma/client';

export type VehicleLoadout = { LOW_RIDER: number; SEDAN: number; VAN: number };
const emptyLoadout = (): VehicleLoadout => ({ LOW_RIDER: 0, SEDAN: 0, VAN: 0 });

/** Legacy runs that do not have a valid class breakdown remain all Low-Riders. */
export function readVehicleLoadout(value: Prisma.JsonValue | undefined, expectedTotal: number): VehicleLoadout {
  const result = emptyLoadout();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of ['LOW_RIDER', 'SEDAN', 'VAN'] as const) {
      const count = value[key];
      if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0) result[key] = count;
    }
  }
  const total = result.LOW_RIDER + result.SEDAN + result.VAN;
  return total === expectedTotal ? result : { ...emptyLoadout(), LOW_RIDER: expectedTotal };
}

/** Keep class ownership in step when a road incident removes cars from a run. */
export function trimVehicleLoadout(loadout: VehicleLoadout, targetTotal: number): VehicleLoadout {
  const result = { ...loadout };
  let remove = Math.max(0, result.LOW_RIDER + result.SEDAN + result.VAN - targetTotal);
  for (const key of ['LOW_RIDER', 'SEDAN', 'VAN'] as const) {
    const lost = Math.min(result[key], remove);
    result[key] -= lost;
    remove -= lost;
  }
  return result;
}

export function addLowRiders(loadout: VehicleLoadout, count: number): VehicleLoadout {
  return { ...loadout, LOW_RIDER: loadout.LOW_RIDER + Math.max(0, count) };
}

export function vehicleLoadoutJson(loadout: VehicleLoadout): Prisma.InputJsonValue {
  return { ...loadout };
}
