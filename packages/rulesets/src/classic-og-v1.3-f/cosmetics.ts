import type { QuestCosmeticCatalog } from '../types.js';

/** 1.3.0-F. Ledger's law cosmetics. Cosmetic only: nothing here touches a Case, a warrant or money. */
export const lawCosmetics = {
  'ledger-cool-head': {
    key: 'ledger-cool-head',
    name: 'Cool Head',
    description: 'Earned from Ledger’s Cooling Off: you let a city’s file go cold.',
    kind: 'TITLE_BADGE',
    rarity: 'uncommon',
  },
  'ledger-lawyered-up': {
    key: 'ledger-lawyered-up',
    name: 'Lawyered Up',
    description: 'Earned from Ledger’s Right to Counsel: your lawyer picks up on the first ring.',
    kind: 'TITLE_BADGE',
    rarity: 'uncommon',
  },
  'ledger-clean-hands': {
    key: 'ledger-clean-hands',
    name: 'Clean Hands',
    description: 'Earned from Ledger’s Clean Hands: you cut an official loose before Internal Affairs could use them.',
    kind: 'TITLE_BADGE',
    rarity: 'rare',
  },
  'ledger-teflon': {
    key: 'ledger-teflon',
    name: 'Teflon',
    description: 'Earned from Ledger’s Beat the Rap: a District Attorney made a warrant disappear.',
    kind: 'TITLE_BADGE',
    rarity: 'rare',
  },
  'ledger-case-closed': {
    key: 'ledger-case-closed',
    name: 'Case Closed',
    description: 'Earned from Ledger’s finale: a Case that reached a warrant, closed without a door kicked in.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  'ledger-case-file-frame': {
    key: 'ledger-case-file-frame',
    name: 'Case File Frame',
    description: 'A manila case file with a red CLOSED stamp, earned from Ledger’s finale.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'case-file-frame',
  },
} as const satisfies QuestCosmeticCatalog;
