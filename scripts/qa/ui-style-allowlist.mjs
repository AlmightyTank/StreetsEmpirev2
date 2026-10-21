/**
 * Intentional visual surfaces that may own literal colors. Standard controls,
 * layout chrome and interactive states are deliberately absent from this list.
 */
export const APPROVED_ART_FILES = [
  { pattern: /^casino(?:-experience)?\.css$/, reason: 'Casino cards, reels, felt and game boards.' },
  { pattern: /^city-blocks\.css$/, reason: 'Turf map roads, water and ownership visualization.' },
  { pattern: /^collection\.css$/, reason: 'Owned cosmetic previews and collection artwork.' },
  { pattern: /^drop-shop\.css$/, reason: 'The Drop item shop: rarity-filled tiles, set banners, the showcase stage and its shop-yellow purchase calls.' },
  { pattern: /^drop-art\.css$/, reason: 'The Drop cosmetic artwork: profile frames and shop previews.' },
  { pattern: /^birthday\.css$/, reason: 'Birthday art: the cake, gift confetti, the birthday frame and the Birthday Bash shell theme.' },
  { pattern: /^drop-shells\.css$/, reason: 'The Drop shell themes: theme token definitions, surfaces and scene art, like site-themes.css.' },
  { pattern: /^dashboard-(?:cinematic|final-polish)\.css$/, reason: 'Command Center illustration and cinematic treatment.' },
  { pattern: /^easter-eggs\.css$/, reason: 'Optional decorative effects.' },
  { pattern: /^encounter-cinema\.css$/, reason: 'Full-screen encounter artwork.' },
  { pattern: /^page-identities\.css$/, reason: 'Decorative route identity art tokens and motifs.' },
  { pattern: /^profile(?:-hover)?\.css$/, reason: 'Player-owned frames, cosmetics and profile previews.' },
  { pattern: /^site-themes\.css$/, reason: 'Premium theme token definitions and decorative effects.' },
  { pattern: /^street-sign-builder\.css$/, reason: 'Player-authored street-sign artwork preview: the metal face, trim, bolts, and bundled display type styles use design-specific colors.' },
];

export const APPROVED_SEMANTIC_SELECTORS = [
  { pattern: /(?:good|success|positive|complete|ready|online|pass)/i, reason: 'Positive semantic status.' },
  { pattern: /(?:warn|warning|pending|review|heat)/i, reason: 'Warning semantic status.' },
  { pattern: /(?:bad|danger|error|failed|negative|offline|arrest)/i, reason: 'Danger semantic status.' },
  { pattern: /(?:rarity|district|faction|owner|condition)/i, reason: 'Data-driven category identity.' },
  { pattern: /(?:skill-band--full|skill-band--half|skill-band--quarter|skill-perk__soon)/i, reason: 'Street-skill progress and upcoming unlock status.' },
  { pattern: /\.se-quests-boardtools__filter(?::hover|--active)/i, reason: 'Selected/hovered quest filter uses the configured accent token.' },
];

export function approvedArtFile(fileName) {
  return APPROVED_ART_FILES.some(({ pattern }) => pattern.test(fileName));
}

export function approvedSemanticSelector(selector) {
  return APPROVED_SEMANTIC_SELECTORS.some(({ pattern }) => pattern.test(selector));
}
