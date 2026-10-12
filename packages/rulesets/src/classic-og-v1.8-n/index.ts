import { classicOgV18M } from '../classic-og-v1.8-m/index.js';
import type { RandomEncounterTrigger, RandomEncounterTriggerRules, Ruleset } from '../types.js';

const priorEncounters = classicOgV18M.randomEncounters!;

function perTurn(trigger: RandomEncounterTriggerRules, chance: number): RandomEncounterTriggerRules {
  return { ...trigger, chance, chanceBasis: 'TURN' };
}

/**
 * Scout, Produce and Travel spend as many turns as the player asks for, so a
 * single roll per action meant a 144-turn scout met the street as often as a
 * 5-turn one. They now roll every turn, at most one encounter an action:
 *   - Scout 0.6%: 20 turns 11%, 50 turns 26%, 144 turns 58%.
 *   - Produce 0.5%: 20 turns 10%, 144 turns 51%.
 *   - Travel 0.8%: a 10-turn run 8%, a 34-turn cross-country run 24%.
 * Store, Turf and Combat cost a few fixed turns and keep their per-action odds.
 * Cooldowns are unchanged.
 */
const triggers = {
  ...priorEncounters.triggers,
  SCOUT: perTurn(priorEncounters.triggers.SCOUT!, 0.006),
  PRODUCE: perTurn(priorEncounters.triggers.PRODUCE!, 0.005),
  TRAVEL: perTurn(priorEncounters.triggers.TRAVEL!, 0.008),
} satisfies Partial<Record<RandomEncounterTrigger, RandomEncounterTriggerRules>>;

export const classicOgV18N = {
  ...classicOgV18M,
  meta: {
    ...classicOgV18M.meta,
    id: 'classic-og-v1.8-n',
    version: '1.8.0-N',
    name: 'Classic OG - Per-Turn Encounters',
  },
  randomEncounters: {
    ...priorEncounters,
    triggers,
  },
} as const satisfies Ruleset;
