import type { QuestCosmeticCatalog } from '../types.js';

/**
 * Phase Y-E site themes.
 *
 * These are presentation packs for the entire authenticated player shell.
 * They intentionally are not attached to Jobs yet; Phase Y-F seasonal/event
 * content can award the same permanent cosmetic keys without changing the
 * renderer or account settings contract.
 */
export const siteThemeCosmetics = {
  'neon-vice': {
    key: 'neon-vice',
    name: 'Neon Vice',
    description: 'A Miami nightlife theme with hot neon, black glass and club-sign glow across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'neon-vice',
  },
  'motor-city-iron': {
    key: 'motor-city-iron',
    name: 'Motor City Iron',
    description: 'A Detroit garage theme with worn steel, rust, chrome trim and industrial light across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'motor-city-iron',
  },
  'rain-city-wire': {
    key: 'rain-city-wire',
    name: 'Rain City Wire',
    description: 'A Seattle noir theme with rain, wet asphalt, surveillance green and wire-room glow across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'rain-city-wire',
  },
  'open-road': {
    key: 'open-road',
    name: 'Open Road',
    description: 'An interstate travel theme with route-map lines, motel-sign color and dashboard light across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'open-road',
  },
  'blue-heat': {
    key: 'blue-heat',
    name: 'Blue Heat',
    description: 'A police-pressure theme with cold siren light, case-file blues and warning-tape trim across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'blue-heat',
  },
  'back-office': {
    key: 'back-office',
    name: 'Back Office',
    description: 'A ledger-room theme with cash-bag shadows, stamped-paper texture and desk-lamp amber across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'back-office',
  },
  'casino-floor': {
    key: 'casino-floor',
    name: 'Casino Floor',
    description: 'A casino-floor theme with felt green, brass rails, chip-table red and warm marquee light across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'casino-floor',
  },
  'federal-case': {
    key: 'federal-case',
    name: 'Federal Case',
    description: 'A law-pressure theme with file-folder amber, cold evidence blue and stamped-paper trim across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'federal-case',
  },
  'midnight-market': {
    key: 'midnight-market',
    name: 'Midnight Market',
    description: 'A high-market theme with blacktop shadows, booth-light cyan and premium gold accents across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'midnight-market',
  },
  'winter-christmas-2026': {
    key: 'winter-christmas-2026',
    name: 'Winter Lights',
    description: 'A Christmas/winter site theme with string lights, falling snow, frosted edges and snowman silhouettes across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'winter-lights',
  },
  'halloween-moon-2026': {
    key: 'halloween-moon-2026',
    name: 'Halloween Moon',
    description: 'A Halloween site theme with a full moon, bats, a witch silhouette, drifting fog and dark seasonal trim across the player-facing game.',
    kind: 'SITE_THEME',
    rarity: 'epic',
    styleKey: 'halloween-moon',
  },
  'dragon-ice-theme': {
    key: 'dragon-ice-theme',
    name: 'Ice Dragon',
    description: 'A full game-shell theme with a glacial dragon, drifting snow, frozen blue panels and icy highlights.',
    kind: 'SITE_THEME',
    rarity: 'legendary',
    styleKey: 'dragon-ice',
  },
  'dragon-fire-theme': {
    key: 'dragon-fire-theme',
    name: 'Fire Dragon',
    description: 'A full game-shell theme with a fire dragon, rising embers, heated panels and molten orange highlights.',
    kind: 'SITE_THEME',
    rarity: 'legendary',
    styleKey: 'dragon-fire',
  },
} as const satisfies QuestCosmeticCatalog;
