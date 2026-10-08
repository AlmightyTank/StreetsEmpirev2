import type { FactionKey, QuestCosmeticCatalog } from '../types.js';

/**
 * 1.4.0-F. Each faction's look. Connected brings its title and accent, Inner Circle its frame.
 * Earned once per account and kept; they only change how a profile looks.
 */
export const factionCosmetics = {
  'kings-friend': { key: 'kings-friend', name: 'Friend of the Kings', description: 'Reached Connected with the Kings.', kind: 'TITLE_BADGE', rarity: 'rare' },
  'kings-gold': { key: 'kings-gold', name: 'Kings Gold', description: 'The Kings’ colors, earned at Connected.', kind: 'ACCENT', rarity: 'rare', styleKey: 'kings-gold' },
  'kings-crown-frame': { key: 'kings-crown-frame', name: 'Kings Crown Frame', description: 'A gold crown frame for the Kings’ Inner Circle.', kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'kings-crown-frame' },

  'outfit-associate': { key: 'outfit-associate', name: 'Outfit Associate', description: 'Reached Connected with the Outfit.', kind: 'TITLE_BADGE', rarity: 'rare' },
  'outfit-oxblood': { key: 'outfit-oxblood', name: 'Outfit Oxblood', description: 'The Outfit’s colors, earned at Connected.', kind: 'ACCENT', rarity: 'rare', styleKey: 'outfit-oxblood' },
  'outfit-pinstripe-frame': { key: 'outfit-pinstripe-frame', name: 'Pinstripe Frame', description: 'A pinstripe frame for the Outfit’s Inner Circle.', kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'outfit-pinstripe-frame' },

  'saints-prospect': { key: 'saints-prospect', name: 'Saints Prospect', description: 'Reached Connected with Road Saints MC.', kind: 'TITLE_BADGE', rarity: 'rare' },
  'saints-chrome': { key: 'saints-chrome', name: 'Saints Chrome', description: 'Road Saints MC’s colors, earned at Connected.', kind: 'ACCENT', rarity: 'rare', styleKey: 'saints-chrome' },
  'saints-patch-frame': { key: 'saints-patch-frame', name: 'Patch Frame', description: 'A leather-and-chrome frame for Road Saints MC’s Inner Circle.', kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'saints-patch-frame' },

  'cartel-partner': { key: 'cartel-partner', name: 'Line Partner', description: 'Reached Connected with the Cartel Line.', kind: 'TITLE_BADGE', rarity: 'rare' },
  'cartel-jade': { key: 'cartel-jade', name: 'Cartel Jade', description: 'The Cartel Line’s colors, earned at Connected.', kind: 'ACCENT', rarity: 'rare', styleKey: 'cartel-jade' },
  'cartel-pipeline-frame': { key: 'cartel-pipeline-frame', name: 'Pipeline Frame', description: 'A jade frame for the Cartel Line’s Inner Circle.', kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'cartel-pipeline-frame' },

  'civic-contributor': { key: 'civic-contributor', name: 'Civic Contributor', description: 'Reached Connected with Civic Handshake.', kind: 'TITLE_BADGE', rarity: 'rare' },
  'civic-seal': { key: 'civic-seal', name: 'Civic Seal', description: 'Civic Handshake’s colors, earned at Connected.', kind: 'ACCENT', rarity: 'rare', styleKey: 'civic-seal' },
  'civic-seal-frame': { key: 'civic-seal-frame', name: 'Seal Frame', description: 'An embossed seal frame for Civic Handshake’s Inner Circle.', kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'civic-seal-frame' },
} as const satisfies QuestCosmeticCatalog;

/** Which cosmetics each tier awards, per faction. */
export const factionTierCosmetics: Record<'CONNECTED' | 'INNER_CIRCLE', Record<FactionKey, readonly string[]>> = {
  CONNECTED: {
    KINGS: ['kings-friend', 'kings-gold'],
    OUTFIT: ['outfit-associate', 'outfit-oxblood'],
    ROAD_SAINTS: ['saints-prospect', 'saints-chrome'],
    CARTEL_LINE: ['cartel-partner', 'cartel-jade'],
    CIVIC_HANDSHAKE: ['civic-contributor', 'civic-seal'],
  },
  INNER_CIRCLE: {
    KINGS: ['kings-crown-frame'],
    OUTFIT: ['outfit-pinstripe-frame'],
    ROAD_SAINTS: ['saints-patch-frame'],
    CARTEL_LINE: ['cartel-pipeline-frame'],
    CIVIC_HANDSHAKE: ['civic-seal-frame'],
  },
};
