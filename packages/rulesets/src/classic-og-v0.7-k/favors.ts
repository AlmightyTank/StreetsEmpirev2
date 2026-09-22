import type { FavorCatalog } from '../types.js';
import { favorCatalog as timedFavors } from '../classic-og-v0.7-j/favors.js';

export const favorCatalog = {
  ...timedFavors,
  TOMMY_VOUCHER: {
    ...timedFavors.TOMMY_VOUCHER,
    description: 'Arm it, then your next eligible weapon purchase from Tommy gets 20% off. It is consumed only when that purchase succeeds.',
    effect: {
      kind: 'STORE_BUY_DISCOUNT',
      storeKey: 'TOMMY',
      itemKeys: ['PISTOL', 'SHOTGUN', 'TEK9', 'AK47'],
      discountPercent: 20,
    },
  },
  BURNER_PHONE: {
    key: 'BURNER_PHONE',
    name: 'Burner Phone',
    description: 'Arm it, then your next successful Recon costs 0 turns.',
    contactKey: 'TOMMY',
    activation: { kind: 'SINGLE_USE', category: 'UNDERWORLD' },
    effect: { kind: 'FREE_RECON' },
  },
  DOCTOR_FAVOR: {
    key: 'DOCTOR_FAVOR',
    name: 'Doctor Favor',
    description: 'Arm it, then your next successful wounded-thug treatment costs 0 medicine.',
    contactKey: 'TOMMY',
    activation: { kind: 'SINGLE_USE', category: 'MUSCLE' },
    effect: { kind: 'FREE_TREATMENT' },
  },
} as const satisfies FavorCatalog;
