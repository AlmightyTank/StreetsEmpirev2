import type { Ruleset } from '@streets/rules-engine';
import type { NpcGangRules } from '@streets/rulesets';

/**
 * NPC gang rules with server defaults. Rulesets may override any field, and each
 * nested group (turf, migration, escalation) merges field by field.
 */
export const DEFAULT_NPC_GANG_RULES: NpcGangRules = {
  enabled: true,
  tickMinutes: 5,
  maxActionsPerTick: 6,
  maxPerCity: 4,
  retaliationHours: 24,
  revengeAggressionBoost: 20,
  revengeIntentBonus: 30,
  turf: {
    enabled: true,
    minAmbition: 50,
    maxBlocksPerGang: 1,
    maxNpcBlocksPerCity: 2,
    reinforceBelowMinimum: 1.25,
    supplyHours: 12,
    abandonAfterLosses: 3,
    lossWindowHours: 24,
    pressureIntentBonus: 15,
  },
  migration: {
    enabled: true,
    tiers: ['VETERAN', 'KINGPIN'],
    evaluateEveryHours: 6,
    minStayHours: 36,
    activeHumanHours: 24,
    quietBelowHumans: 2,
    humansPerGang: 3,
    hostileLosses: 4,
    betterByHumans: 4,
    packingHours: 36,
  },
  escalation: {
    enabled: true,
    windowHours: 48,
    halfLifeHours: 12,
    attackWin: 8,
    profitBonus: 4,
    attackLoss: 10,
    defendWin: 4,
    defendLoss: 8,
    blockedPenalty: 3,
    maxMomentum: 50,
    aggressionPerPoint: 0.4,
    maxAggressionShift: 20,
    maxPaceShift: 0.25,
    hotAt: 20,
    coolAt: -20,
    dormantBelow: -30,
    overTargetedHits: 5,
    overTargetedHours: 24,
    dormantMinHours: 8,
    dormantMaxHours: 24,
  },
};

export function npcRules(ruleset: Ruleset): NpcGangRules {
  return {
    ...DEFAULT_NPC_GANG_RULES,
    ...ruleset.npcGangs,
    turf: { ...DEFAULT_NPC_GANG_RULES.turf, ...ruleset.npcGangs?.turf },
    migration: { ...DEFAULT_NPC_GANG_RULES.migration, ...ruleset.npcGangs?.migration },
    escalation: { ...DEFAULT_NPC_GANG_RULES.escalation, ...ruleset.npcGangs?.escalation },
  };
}
