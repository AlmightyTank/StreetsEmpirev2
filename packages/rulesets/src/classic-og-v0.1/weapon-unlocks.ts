import type { WeaponUnlockKey, WeaponUnlockRule } from '../types.js';

/** BALANCE_APPROXIMATION. Work earns trust; a one-time favor earns access. */
export const weaponUnlocks = {
  TEK9: {
    title: 'A favor for Tommy',
    description: 'Prove you can run a crew, then deliver rock for Tommy’s contacts.',
    workTurns: 50,
    thugs: 10,
    prerequisite: null,
    cashCents: 0,
    crack: 100,
  },
  AK47: {
    title: 'Finance the shipment',
    description: 'Earn Tommy’s trust, then put up the cash for his next shipment.',
    workTurns: 150,
    thugs: 25,
    prerequisite: 'TEK9',
    cashCents: 2_500_000,
    crack: 0,
  },
} as const satisfies Record<WeaponUnlockKey, WeaponUnlockRule>;
