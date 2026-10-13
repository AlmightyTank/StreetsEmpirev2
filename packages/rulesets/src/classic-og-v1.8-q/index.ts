import { classicOgV18P } from '../classic-og-v1.8-p/index.js';
import { BLACKWOOD_COSMETICS } from '../hidden-streets-cosmetics.js';
import { defineQuestCatalog, questCosmeticProblems } from '../quest-definitions.js';
import type { QuestCosmeticCatalog, QuestDefinitionCatalog, Ruleset } from '../types.js';

const cosmetics = {
  ...classicOgV18P.cosmetics!,
  ...BLACKWOOD_COSMETICS,
} as const satisfies QuestCosmeticCatalog;

const base = classicOgV18P.questDefinitions as QuestDefinitionCatalog;
const blackwoodGate = base.SECRET_BLACKWOOD_GATE!;

const questDefinitions = defineQuestCatalog({
  ...base,
  SECRET_BLACKWOOD_GATE: {
    ...blackwoodGate,
    rewards: [
      ...blackwoodGate.rewards,
      { kind: 'COSMETIC_UNLOCK', key: 'blackwood-gate-badge' },
      { kind: 'COSMETIC_UNLOCK', key: 'blackwood-gate-frame' },
    ],
  },
});

const cosmeticProblems = questCosmeticProblems(questDefinitions, cosmetics);
if (cosmeticProblems.length) {
  throw new Error(`Invalid quest cosmetic rewards:\n- ${cosmeticProblems.join('\n- ')}`);
}

/** 1.8.0-Q — Hidden Streets Slice D: Blackwood reward cosmetics. */
export const classicOgV18Q = {
  ...classicOgV18P,
  meta: {
    ...classicOgV18P.meta,
    id: 'classic-og-v1.8-q',
    version: '1.8.0-Q',
    name: 'Classic OG - Hidden Streets Rewards',
  },
  cosmetics,
  questDefinitions,
} as const satisfies Ruleset;
