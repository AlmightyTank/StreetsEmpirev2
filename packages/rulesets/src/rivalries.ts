import type { Ruleset } from './types.js';

export const RIVALRY_SOURCE_KINDS = ['COMBAT', 'RETALIATION', 'TURF', 'BLOCK_WAR'] as const;
export type RivalrySourceKind = typeof RIVALRY_SOURCE_KINDS[number];

export const RIVALRY_OUTCOMES = ['WIN', 'LOSS', 'TURF_FLIP', 'MATERIAL_CONSEQUENCE', 'DRAW'] as const;
export type RivalryOutcome = typeof RIVALRY_OUTCOMES[number];

export interface RivalryRules {
  readonly enabled: boolean;
  readonly catalogVersion: string;
  readonly eligibleSources: readonly RivalrySourceKind[];
  readonly minimumDistinctEvents: number;
  readonly mutualityThreshold: number;
  readonly cooldownMinutes: number;
  readonly maxSourcesPerRelationship: number;
  readonly maxTargetConcentration: number;
  readonly outcomeWeights: Readonly<Record<RivalryOutcome, number>>;
  readonly vendetta: {
    readonly enabled: boolean;
    readonly maxActiveMinutes: number;
    readonly maxChoices: number;
    readonly maxStrength: number;
  };
  readonly feud: {
    readonly enabled: boolean;
    readonly maxActiveMinutes: number;
    readonly maxRewardCents: number;
    readonly repeatTargetCooldownMinutes: number;
  };
  readonly fairPlayAwards: readonly string[];
}

const KEY = /^[A-Z][A-Z0-9_]{2,63}$/;

export function defineRivalryRules<T extends RivalryRules>(rules: T): T {
  if (!rules.catalogVersion.trim()) throw new Error('Rivalry catalog version is required');
  if (!rules.eligibleSources.length || rules.eligibleSources.some((kind) => !RIVALRY_SOURCE_KINDS.includes(kind))) {
    throw new Error('Rivalry catalog contains an invalid source kind');
  }
  if (!Number.isSafeInteger(rules.minimumDistinctEvents) || rules.minimumDistinctEvents < 2) {
    throw new Error('Rivalry distinct-event threshold must be at least two');
  }
  if (!Number.isSafeInteger(rules.cooldownMinutes) || rules.cooldownMinutes < 0
    || !Number.isSafeInteger(rules.maxSourcesPerRelationship) || rules.maxSourcesPerRelationship < rules.minimumDistinctEvents
    || !Number.isSafeInteger(rules.maxTargetConcentration) || rules.maxTargetConcentration < 1) {
    throw new Error('Rivalry limits are invalid');
  }
  for (const outcome of RIVALRY_OUTCOMES) {
    const weight = rules.outcomeWeights[outcome];
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) throw new Error(`Invalid rivalry outcome weight: ${outcome}`);
  }
  if (!Number.isSafeInteger(rules.vendetta.maxActiveMinutes) || rules.vendetta.maxActiveMinutes <= 0
    || !Number.isSafeInteger(rules.vendetta.maxChoices) || rules.vendetta.maxChoices < 1
    || !Number.isSafeInteger(rules.vendetta.maxStrength) || rules.vendetta.maxStrength < 1) {
    throw new Error('Rivalry vendetta bounds are invalid');
  }
  if (!Number.isSafeInteger(rules.feud.maxActiveMinutes) || rules.feud.maxActiveMinutes <= 0
    || !Number.isSafeInteger(rules.feud.maxRewardCents) || rules.feud.maxRewardCents < 0
    || !Number.isSafeInteger(rules.feud.repeatTargetCooldownMinutes) || rules.feud.repeatTargetCooldownMinutes < 0) {
    throw new Error('Rivalry feud bounds are invalid');
  }
  if (rules.fairPlayAwards.some((key) => !KEY.test(key)) || new Set(rules.fairPlayAwards).size !== rules.fairPlayAwards.length) {
    throw new Error('Rivalry award keys are invalid');
  }
  return rules;
}

export const RIVALRY_2_5_CATALOG = defineRivalryRules({
  enabled: false,
  catalogVersion: 'rivalries-2.5.0-a',
  eligibleSources: RIVALRY_SOURCE_KINDS,
  minimumDistinctEvents: 2,
  mutualityThreshold: 0.35,
  cooldownMinutes: 30,
  maxSourcesPerRelationship: 24,
  maxTargetConcentration: 3,
  outcomeWeights: { WIN: 10, LOSS: 8, TURF_FLIP: 16, MATERIAL_CONSEQUENCE: 12, DRAW: 4 },
  vendetta: { enabled: false, maxActiveMinutes: 24 * 60, maxChoices: 3, maxStrength: 3 },
  feud: { enabled: false, maxActiveMinutes: 7 * 24 * 60, maxRewardCents: 0, repeatTargetCooldownMinutes: 24 * 60 },
  fairPlayAwards: [],
} as const);

export function rivalryRulesForRuleset(ruleset: Ruleset): RivalryRules | null {
  return ruleset.rivalries ?? null;
}
