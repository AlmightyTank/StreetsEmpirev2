import { classicOgV18K } from '../classic-og-v1.8-k/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestCosmeticCatalog, Ruleset } from '../types.js';
import { ACCENT_REWARDS, questAccents } from './accents.js';

const base = classicOgV18K.questDefinitions!;

const questDefinitions = defineQuestCatalog({
  ...base,
  ...Object.fromEntries(Object.entries(ACCENT_REWARDS).map(([questKey, accentKey]) => {
    const definition = base[questKey as keyof typeof base]!;
    return [questKey, {
      ...definition,
      rewards: [...definition.rewards, { kind: 'COSMETIC_UNLOCK' as const, key: accentKey }],
    }];
  })),
});

const cosmetics = {
  ...classicOgV18K.cosmetics!,
  ...questAccents,
} as const satisfies QuestCosmeticCatalog;

/** 1.8.0-L. More accents to earn: six contracts now pay a permanent site accent. */
export const classicOgV18L = {
  ...classicOgV18K,
  meta: {
    ...classicOgV18K.meta,
    id: 'classic-og-v1.8-l',
    version: '1.8.0-L',
    name: 'Classic OG - Quest Accents',
  },
  cosmetics,
  questDefinitions,
} as const satisfies Ruleset;
