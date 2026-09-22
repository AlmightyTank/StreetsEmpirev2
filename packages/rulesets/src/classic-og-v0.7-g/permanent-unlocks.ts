import type { PermanentUnlockCatalog } from '../types.js';

export const permanentUnlocks = {
  WEAPON_SHOTGUN_ACCESS: {
    key: 'WEAPON_SHOTGUN_ACCESS',
    name: 'Shotgun Rack Access',
    description: 'Tommy will sell you Shotguns for the rest of this round.',
    category: 'WEAPON',
    effect: { kind: 'WEAPON_ACCESS', weapon: 'SHOTGUN' },
  },
  WEAPON_TEK9_ACCESS: {
    key: 'WEAPON_TEK9_ACCESS',
    name: 'Tek-9 Rack Access',
    description: 'Tommy will sell you Tek-9s for the rest of this round.',
    category: 'WEAPON',
    effect: { kind: 'WEAPON_ACCESS', weapon: 'TEK9' },
  },
  WEAPON_AK47_ACCESS: {
    key: 'WEAPON_AK47_ACCESS',
    name: 'AK-47 Rack Access',
    description: 'Tommy will sell you AK-47s for the rest of this round.',
    category: 'WEAPON',
    effect: { kind: 'WEAPON_ACCESS', weapon: 'AK47' },
  },
  PRODUCT_METH_ACCESS: {
    key: 'PRODUCT_METH_ACCESS',
    name: 'Meth Counter Access',
    description: 'Pip will sell you Meth directly for the rest of this round.',
    category: 'PRODUCT',
    effect: { kind: 'PRODUCT_PURCHASE_ACCESS', productKey: 'METH' },
  },
  PRODUCT_ECSTASY_ACCESS: {
    key: 'PRODUCT_ECSTASY_ACCESS',
    name: 'Ecstasy Counter Access',
    description: 'Pip will sell you Ecstasy directly for the rest of this round.',
    category: 'PRODUCT',
    effect: { kind: 'PRODUCT_PURCHASE_ACCESS', productKey: 'ECSTASY' },
  },
  PRODUCT_COCAINE_ACCESS: {
    key: 'PRODUCT_COCAINE_ACCESS',
    name: 'Cocaine Counter Access',
    description: 'Pip will sell you Cocaine directly for the rest of this round.',
    category: 'PRODUCT',
    effect: { kind: 'PRODUCT_PURCHASE_ACCESS', productKey: 'COCAINE' },
  },
  PRODUCT_HEROIN_ACCESS: {
    key: 'PRODUCT_HEROIN_ACCESS',
    name: 'Heroin Counter Access',
    description: 'Pip will sell you Heroin directly for the rest of this round.',
    category: 'PRODUCT',
    effect: { kind: 'PRODUCT_PURCHASE_ACCESS', productKey: 'HEROIN' },
  },
} as const satisfies PermanentUnlockCatalog;
