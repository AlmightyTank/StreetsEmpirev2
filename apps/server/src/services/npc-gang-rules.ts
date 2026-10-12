import type { Ruleset } from '@streets/rules-engine';
import { NPC_GANG_PERSONALITIES, NPC_GANG_ROSTER, type NpcGangRules } from '@streets/rulesets';

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
  personalities: NPC_GANG_PERSONALITIES,
  defaultPersonality: 'cautious-hustlers',
  rewards: {
    enabled: true,
    bountyCents: { SCRUB: 150_000, STREET: 300_000, VETERAN: 600_000, KINGPIN: 1_200_000 },
    defenseShare: 0.5,
    wantedHours: 24,
    maxPerPlayerPerDay: 3,
    perCrewCooldownHours: 24,
    maxPerCrewPerDay: 4,
    reliefHours: 6,
    retireAfterDormancies: 3,
    retireBelowThugs: 3,
  },
  roster: NPC_GANG_ROSTER,
  spawn: {
    enabled: true,
    minCrews: 2,
    maxCrews: 10,
    humansPerCrew: 4,
    activeHumanHours: 72,
    spawnEveryMinutes: 45,
  },
  progression: {
    enabled: true,
    netWorthMultiple: { STREET: 2, VETERAN: 5, KINGPIN: 12 },
  },
};

export function npcRules(ruleset: Ruleset): NpcGangRules {
  return {
    ...DEFAULT_NPC_GANG_RULES,
    ...ruleset.npcGangs,
    turf: { ...DEFAULT_NPC_GANG_RULES.turf, ...ruleset.npcGangs?.turf },
    migration: { ...DEFAULT_NPC_GANG_RULES.migration, ...ruleset.npcGangs?.migration },
    escalation: { ...DEFAULT_NPC_GANG_RULES.escalation, ...ruleset.npcGangs?.escalation },
    personalities: { ...DEFAULT_NPC_GANG_RULES.personalities, ...ruleset.npcGangs?.personalities },
    rewards: {
      ...DEFAULT_NPC_GANG_RULES.rewards,
      ...ruleset.npcGangs?.rewards,
      bountyCents: { ...DEFAULT_NPC_GANG_RULES.rewards.bountyCents, ...ruleset.npcGangs?.rewards?.bountyCents },
    },
    spawn: { ...DEFAULT_NPC_GANG_RULES.spawn, ...ruleset.npcGangs?.spawn },
    progression: {
      ...DEFAULT_NPC_GANG_RULES.progression,
      ...ruleset.npcGangs?.progression,
      netWorthMultiple: { ...DEFAULT_NPC_GANG_RULES.progression.netWorthMultiple, ...ruleset.npcGangs?.progression?.netWorthMultiple },
    },
  };
}
