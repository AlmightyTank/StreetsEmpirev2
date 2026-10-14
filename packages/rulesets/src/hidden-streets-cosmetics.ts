import type { QuestCosmeticCatalog } from './types.js';

/**
 * Hidden Streets Slice D — Blackwood reward and cosmetic integration.
 *
 * Original designs only: a gate badge and gate frame earned from
 * SECRET_BLACKWOOD_GATE, plus the Blackwood Manor site theme reserved for the
 * Slice H mansion finale (defined here so its style key is stable, awarded by
 * no quest yet). No film/TV/game likenesses, emblems, lines, or names.
 */
export const BLACKWOOD_COSMETICS = {
  'blackwood-gate-badge': {
    key: 'blackwood-gate-badge',
    name: 'Blackwood Gate',
    description: 'Walked the Blackwood estate gate trail and lived to file the report.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  'blackwood-gate-frame': {
    key: 'blackwood-gate-frame',
    name: 'Blackwood Gate Frame',
    description: 'An iron-green profile frame from the Blackwood estate gate.',
    kind: 'PROFILE_FRAME',
    rarity: 'epic',
    styleKey: 'blackwood-gate-frame',
  },
  'blackwood-manor-theme': {
    key: 'blackwood-manor-theme',
    name: 'Blackwood Manor',
    description: 'A gaslight-and-ivy manor shell. Reserved for the Blackwood mansion finale.',
    kind: 'SITE_THEME',
    rarity: 'legendary',
    styleKey: 'blackwood-manor',
  },
} as const satisfies QuestCosmeticCatalog;

/**
 * Hidden Streets Slice E — Comedy Collection cosmetics.
 *
 * Original street-comedy rewards only. The title badge is earned from the
 * Traveling Sample Case opener, while the frame comes from the Regional
 * Management secret. Both are static presentation styles and carry no gameplay
 * power.
 */
export const COMEDY_COSMETICS = {
  'comedy-roadshow-badge': {
    key: 'comedy-roadshow-badge',
    name: 'Roadshow Regular',
    description: 'Solved the city’s strangest roadside comedy case file.',
    kind: 'TITLE_BADGE',
    rarity: 'rare',
  },
  'comedy-roadshow-frame': {
    key: 'comedy-roadshow-frame',
    name: 'Roadshow Frame',
    description: 'A sunny profile frame for players who survived the city’s joke circuit.',
    kind: 'PROFILE_FRAME',
    rarity: 'rare',
    styleKey: 'comedy-roadshow-frame',
  },
} as const satisfies QuestCosmeticCatalog;
