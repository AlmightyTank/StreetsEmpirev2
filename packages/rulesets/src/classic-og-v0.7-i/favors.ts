import type { FavorCatalog } from '../types.js';

export const favorCatalog = {
  MAMA_ADVICE: {
    key: 'MAMA_ADVICE',
    name: "Mama's Advice",
    description: 'A short street-work favor from Mama. Phase K will activate its timed street-income/recruitment effect.',
    contactKey: 'MAMA_KING',
    activation: { kind: 'TIMED', category: 'STREET', durationMinutes: 10 },
  },
  STREET_FRENZY: {
    key: 'STREET_FRENZY',
    name: 'Street Frenzy',
    description: 'A one-minute street push. Phase K will activate its timed street-income effect.',
    contactKey: 'MAMA_KING',
    activation: { kind: 'TIMED', category: 'STREET', durationMinutes: 1 },
  },
  COOKHOUSE_RUSH: {
    key: 'COOKHOUSE_RUSH',
    name: 'Cookhouse Rush',
    description: 'A short production push from Pip. Phase K will activate its timed production effect.',
    contactKey: 'PIP',
    activation: { kind: 'TIMED', category: 'UNDERWORLD', durationMinutes: 5 },
  },
  PIP_CONNECTION: {
    key: 'PIP_CONNECTION',
    name: "Pip's Connection",
    description: 'A temporary underworld connection from Pip. Phase K will activate its product-market effect.',
    contactKey: 'PIP',
    activation: { kind: 'TIMED', category: 'UNDERWORLD', durationMinutes: 10 },
  },
  TOMMY_VOUCHER: {
    key: 'TOMMY_VOUCHER',
    name: 'Tommy Voucher',
    description: 'A one-use favor from Tommy. Phase L will apply it to a future eligible weapon purchase.',
    contactKey: 'TOMMY',
    activation: { kind: 'SINGLE_USE', category: 'MUSCLE' },
  },
  FIELD_MEDIC: {
    key: 'FIELD_MEDIC',
    name: 'Field Medic',
    description: 'A temporary treatment favor from Tommy. Phase K will activate its medical-support effect.',
    contactKey: 'TOMMY',
    activation: { kind: 'TIMED', category: 'MUSCLE', durationMinutes: 10 },
  },
} as const satisfies FavorCatalog;
