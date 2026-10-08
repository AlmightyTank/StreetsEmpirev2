import { classicOgV15B } from '../classic-og-v1.5-b/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.5.0-C — Garage Service, Recovery & Class Art.
 *
 * Road trouble now dents the fleet instead of quietly deleting it. A bust or a lost
 * convoy fight brings one vehicle home Damaged; an arrest impounds one, and it comes
 * home Disabled. Neither can roll out again until the garage fixes it. Repairs run
 * about 15% of a class's price and recovery about 40%, so a bad run costs real money
 * without costing the car. Convoy crews still steal Low-Riders; a Sedan or Van they
 * cannot drive off is wrecked (Disabled) instead.
 */
export const classicOgV15C = {
  ...classicOgV15B,
  meta: { id: 'classic-og-v1.5-c', version: '1.5.0-C', name: 'Classic OG - Garage Service & Recovery' },
  vehicleCatalog: {
    ...classicOgV15B.vehicleCatalog,
    service: {
      repairCents: { LOW_RIDER: 75_000, SEDAN: 50_000, VAN: 125_000 },
      recoveryCents: { LOW_RIDER: 200_000, SEDAN: 140_000, VAN: 340_000 },
      damage: { bust: 1, convoyLoss: 1 },
      disable: { arrest: 1 },
      damageOrder: ['VAN', 'LOW_RIDER', 'SEDAN'],
    },
  },
} as const satisfies Ruleset;
