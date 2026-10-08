import { classicOgV15C } from '../classic-og-v1.5-c/index.js';
import type { Ruleset } from '../types.js';

const rackets = classicOgV15C.business.rackets;

/**
 * 1.5.0-D — Road Specialization.
 *
 * The road lane keeps a fleet running for less, and that is all it does: no business or
 * faction unlocks a vehicle class or changes how one drives, so anyone can field the same
 * fleet. An Auto Garage on the crew's blocks takes up to 25% off repairs (either of its
 * rackets, scaled by strength). The Chop Shop's Vehicle recovery racket now also takes up
 * to 25% off recovery, and Stolen Low-Riders' 8% now covers Sedans and Vans in Charlie's
 * garage too. Road Saints MC at Trusted take 10% off every repair and recovery. Together
 * they never take more than 35% off one service.
 */
export const classicOgV15D = {
  ...classicOgV15C,
  meta: { id: 'classic-og-v1.5-d', version: '1.5.0-D', name: 'Classic OG - Road Specialization' },
  business: {
    ...classicOgV15C.business,
    rackets: {
      ...rackets,
      catalog: {
        ...rackets.catalog,
        STOLEN_LOW_RIDERS: {
          ...rackets.catalog.STOLEN_LOW_RIDERS,
          description: 'Hot cars with new plates: Charlie sells you Low-Riders, Sedans and Vans cheaper.',
          effect: { kind: 'STORE_PRICE', store: 'CHARLIE', items: ['LOW_RIDER', 'SEDAN', 'VAN'], buyDiscountPercent: 8 },
        },
        VEHICLE_RECOVERY: {
          ...rackets.catalog.VEHICLE_RECOVERY,
          description: 'The shop knows every chop and every impound lot: a Low-Rider a convoy hit would take may come back, and recovering a Disabled car costs less.',
        },
        RUN_MODS: {
          ...rackets.catalog.RUN_MODS,
          description: 'Hidden compartments and clean plates: fewer police stops on runs out of town. The bay repairs your Damaged cars for less.',
        },
        GETAWAY_CARS: {
          ...rackets.catalog.GETAWAY_CARS,
          description: 'A car waiting round the corner: a beaten push squad takes fewer wounds getting home. The bay repairs your Damaged cars for less.',
        },
      },
    },
  },
  vehicleCatalog: {
    ...classicOgV15C.vehicleCatalog,
    service: {
      ...classicOgV15C.vehicleCatalog.service,
      specialization: {
        autoGarageRepairPercent: 25,
        chopShopRecoveryPercent: 25,
        roadSaints: { tier: 'TRUSTED', percent: 10 },
        maxDiscountPercent: 35,
      },
    },
  },
} as const satisfies Ruleset;
