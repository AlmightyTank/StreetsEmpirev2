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
