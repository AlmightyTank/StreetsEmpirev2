import type { FavorCatalog } from '../types.js';
import { favorCatalog as inventoryFavors } from '../classic-og-v0.7-i/favors.js';

export const favorCatalog = {
  ...inventoryFavors,
  MAMA_ADVICE: {
    ...inventoryFavors.MAMA_ADVICE,
    description: 'For 10 minutes: +10% Scout income and +10% Scout recruitment.',
    effect: { kind: 'SCOUT_BOOST', incomePercent: 10, recruitmentPercent: 10 },
  },
  STREET_FRENZY: {
    ...inventoryFavors.STREET_FRENZY,
    description: 'For 1 minute: +25% Scout income.',
    effect: { kind: 'SCOUT_BOOST', incomePercent: 25, recruitmentPercent: 0 },
  },
  COOKHOUSE_RUSH: {
    ...inventoryFavors.COOKHOUSE_RUSH,
    description: 'For 5 minutes: +20% product output from Produce. Extra output still costs ingredients and adds Heat normally.',
    effect: { kind: 'PRODUCTION_BOOST', outputPercent: 20 },
  },
  PIP_CONNECTION: {
    ...inventoryFavors.PIP_CONNECTION,
    description: 'For 10 minutes: 10% off eligible product purchases at Pip’s counter.',
    effect: { kind: 'PIP_BUY_DISCOUNT', discountPercent: 10 },
  },
  FIELD_MEDIC: {
    ...inventoryFavors.FIELD_MEDIC,
    description: 'For 10 minutes: +20% medicine efficiency when treating wounded thugs.',
    effect: { kind: 'TREATMENT_EFFICIENCY', medicineEfficiencyPercent: 20 },
  },
} as const satisfies FavorCatalog;
