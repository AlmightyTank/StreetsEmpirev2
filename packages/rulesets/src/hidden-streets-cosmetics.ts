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

/** Hidden Streets Slices F-M — remaining expansion cosmetics. */
export const HIDDEN_STREETS_EXPANSION_COSMETICS = {
  'lost-fortune-badge': {
    key: 'lost-fortune-badge',
    name: 'Lost Fortune',
    description: 'Followed a trail of coins, maps, and tunnels without losing the plot.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  'lost-fortune-frame': {
    key: 'lost-fortune-frame',
    name: 'Lost Fortune Frame',
    description: 'An old-map profile frame for recovered city legends.',
    kind: 'PROFILE_FRAME',
    rarity: 'epic',
    styleKey: 'lost-fortune-frame',
  },
  'pattern-board-badge': {
    key: 'pattern-board-badge',
    name: 'Pattern Board',
    description: 'Connected a citywide case without exposing private player intel.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  'manor-unmasked-badge': {
    key: 'manor-unmasked-badge',
    name: 'Manor Unmasked',
    description: 'Finished the Blackwood Manor case and found the human truth behind the haunting.',
    kind: 'TITLE_BADGE',
    rarity: 'legendary',
  },
  'star-chart-frame': {
    key: 'star-chart-frame',
    name: 'Star Chart Frame',
    description: 'A cosmic profile frame for strange transmissions and clockwork puzzles.',
    kind: 'PROFILE_FRAME',
    rarity: 'epic',
    styleKey: 'star-chart-frame',
  },
  'extraction-badge': {
    key: 'extraction-badge',
    name: 'Clean Extraction',
    description: 'Took the risky route only after the costs were visible.',
    kind: 'TITLE_BADGE',
    rarity: 'rare',
  },
  'shadow-city-badge': {
    key: 'shadow-city-badge',
    name: 'Shadow City',
    description: 'Balanced rooftop clues and theatrical misdirection without feeding the panic.',
    kind: 'TITLE_BADGE',
    rarity: 'legendary',
  },
  'shadow-city-frame': {
    key: 'shadow-city-frame',
    name: 'Shadow City Frame',
    description: 'A midnight skyline frame for the city’s strangest night case.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'shadow-city-frame',
  },
  'guildmaster-badge': {
    key: 'guildmaster-badge',
    name: 'Guildmaster',
    description: 'Opened the old guild doors and finished the three city trials.',
    kind: 'TITLE_BADGE',
    rarity: 'legendary',
  },
  'guild-arcane-frame': {
    key: 'guild-arcane-frame',
    name: 'Arcane Guild Frame',
    description: 'A rune-lit frame inspired by original hidden-city guild marks.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'guild-arcane-frame',
  },
  'you-had-to-be-there-badge': {
    key: 'you-had-to-be-there-badge',
    name: 'You Had to Be There',
    description: 'Completed the defined Hidden Streets collection for this ruleset version.',
    kind: 'TITLE_BADGE',
    rarity: 'legendary',
  },
  'you-had-to-be-there-frame': {
    key: 'you-had-to-be-there-frame',
    name: 'You Had to Be There Frame',
    description: 'A completion frame for players who chased every supported Hidden Streets path.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'you-had-to-be-there-frame',
  },
} as const satisfies QuestCosmeticCatalog;
