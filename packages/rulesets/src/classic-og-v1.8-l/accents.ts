import type { QuestCosmeticCatalog } from '../types.js';

/**
 * 1.8.0-L. Six more site accents, each paid by a contract that had no cosmetic
 * yet: Ledger's finale and the once-a-season kingpin contracts.
 */
export const questAccents = {
  'mama-original-neon': {
    key: 'mama-original-neon',
    name: 'Original Neon',
    description: 'The neon green StreetsEmpire first ran on. Mama King keeps it for whoever builds a Street Empire.',
    kind: 'ACCENT',
    rarity: 'epic',
    styleKey: 'original-neon',
  },
  'ace-neon-sign-pink': {
    key: 'ace-neon-sign-pink',
    name: 'Neon Sign Pink',
    description: 'Ace’s marquee pink, lit for a whale the house was glad to see.',
    kind: 'ACCENT',
    rarity: 'epic',
    styleKey: 'neon-sign-pink',
  },
  'ledger-gavel-bronze': {
    key: 'ledger-gavel-bronze',
    name: 'Gavel Bronze',
    description: 'Ledger’s courtroom bronze for a case closed for good.',
    kind: 'ACCENT',
    rarity: 'legendary',
    styleKey: 'gavel-bronze',
  },
  'ledger-clean-books-ivory': {
    key: 'ledger-clean-books-ivory',
    name: 'Clean Books Ivory',
    description: 'Paper-white ivory for books an auditor could not fault.',
    kind: 'ACCENT',
    rarity: 'epic',
    styleKey: 'clean-books-ivory',
  },
  'wheels-sunset-coral': {
    key: 'wheels-sunset-coral',
    name: 'Sunset Coral',
    description: 'Wheels’ coral for a crew that ran it coast to coast.',
    kind: 'ACCENT',
    rarity: 'epic',
    styleKey: 'sunset-coral',
  },
  'blocks-night-map-plum': {
    key: 'blocks-night-map-plum',
    name: 'Night Map Plum',
    description: 'Blocks’ plum for the operator who put their name across the city map.',
    kind: 'ACCENT',
    rarity: 'epic',
    styleKey: 'night-map-plum',
  },
} as const satisfies QuestCosmeticCatalog;

/** Which contract pays which accent. */
export const ACCENT_REWARDS = {
  SEASON_STREET_EMPIRE: 'mama-original-neon',
  SEASON_WHALE: 'ace-neon-sign-pink',
  LEDGER_CASE_CLOSED: 'ledger-gavel-bronze',
  SEASON_CLEAN_BOOKS: 'ledger-clean-books-ivory',
  SEASON_COAST_TO_COAST: 'wheels-sunset-coral',
  SEASON_CITY_MAP: 'blocks-night-map-plum',
} as const satisfies Record<string, keyof typeof questAccents>;
