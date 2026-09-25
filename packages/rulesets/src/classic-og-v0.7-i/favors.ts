import type { FavorCatalog } from '../types.js';

export const favorCatalog = {
  MAMA_ADVICE: {
    key: 'MAMA_ADVICE',
    name: "Mama's Advice",
    description: 'Ten minutes of Mama leaning on the street for you: better earnings and a stronger recruiting push when you call it in.',
    contactKey: 'MAMA_KING',
    activation: { kind: 'TIMED', category: 'STREET', durationMinutes: 10 },
  },
  STREET_FRENZY: {
    key: 'STREET_FRENZY',
    name: 'Street Frenzy',
    description: 'One hard minute of everyone pushing the corners for maximum street income.',
    contactKey: 'MAMA_KING',
    activation: { kind: 'TIMED', category: 'STREET', durationMinutes: 1 },
  },
  COOKHOUSE_RUSH: {
    key: 'COOKHOUSE_RUSH',
    name: 'Cookhouse Rush',
    description: 'Five minutes of Pip pulling strings around the cookhouse to push more product out the door.',
    contactKey: 'PIP',
    activation: { kind: 'TIMED', category: 'UNDERWORLD', durationMinutes: 5 },
  },
  PIP_CONNECTION: {
    key: 'PIP_CONNECTION',
    name: "Pip's Connection",
    description: 'Ten minutes of Pip opening a better line into the product market.',
    contactKey: 'PIP',
    activation: { kind: 'TIMED', category: 'UNDERWORLD', durationMinutes: 10 },
  },
  TOMMY_VOUCHER: {
    key: 'TOMMY_VOUCHER',
    name: 'Tommy Voucher',
    description: 'A one-use marker from Tommy for a future eligible weapon purchase.',
    contactKey: 'TOMMY',
    activation: { kind: 'SINGLE_USE', category: 'MUSCLE' },
  },
  FIELD_MEDIC: {
    key: 'FIELD_MEDIC',
    name: 'Field Medic',
    description: 'Ten minutes of Tommy putting a trusted field medic on your wounded muscle.',
    contactKey: 'TOMMY',
    activation: { kind: 'TIMED', category: 'MUSCLE', durationMinutes: 10 },
  },
} as const satisfies FavorCatalog;
