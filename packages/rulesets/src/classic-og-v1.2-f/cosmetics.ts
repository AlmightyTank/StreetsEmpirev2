import type { QuestCosmeticCatalog } from '../types.js';

/** 1.2.0-F. Ace's casino cosmetics. Cosmetic only: nothing here changes odds, limits or money. */
export const casinoCosmetics = {
  'ace-floor-walker': {
    key: 'ace-floor-walker',
    name: 'Floor Walker',
    description: 'Earned from Ace’s Tour of the Floor: you have sat at every kind of table the house runs.',
    kind: 'TITLE_BADGE',
    rarity: 'uncommon',
  },
  'ace-natural': {
    key: 'ace-natural',
    name: 'Natural',
    description: 'Earned from Ace’s Natural Talent: an ace and a face, dealt straight to you.',
    kind: 'TITLE_BADGE',
    rarity: 'uncommon',
  },
  'ace-road-gambler': {
    key: 'ace-road-gambler',
    name: 'Road Gambler',
    description: 'Earned from Ace’s Road Game: known at casinos in three different cities.',
    kind: 'TITLE_BADGE',
    rarity: 'rare',
  },
  'ace-velvet-rope': {
    key: 'ace-velvet-rope',
    name: 'Behind the Rope',
    description: 'Earned from Ace’s Behind the Velvet Rope: the door staff know your name.',
    kind: 'TITLE_BADGE',
    rarity: 'rare',
  },
  'ace-black-room': {
    key: 'ace-black-room',
    name: 'Black Room Regular',
    description: 'Earned from Ace’s finale: High Roller status and a seat in the Empire Black Room.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  'ace-velvet-rose': {
    key: 'ace-velvet-rose',
    name: 'Velvet Rose',
    description: 'Ace’s Black Room accent. Recolors the player-facing game in VIP-room rose.',
    kind: 'ACCENT',
    rarity: 'legendary',
    styleKey: 'velvet-rose',
  },
  'ace-velvet-rope-frame': {
    key: 'ace-velvet-rope-frame',
    name: 'Velvet Rope Frame',
    description: 'A rose velvet rope on gold posts, earned from Ace’s Black Room finale.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'velvet-rope-frame',
  },
} as const satisfies QuestCosmeticCatalog;
