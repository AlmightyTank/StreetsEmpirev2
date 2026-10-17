import type { Ruleset } from './types.js';

/**
 * 2.0.0-A Living Streets contract only. This catalog describes potential
 * invitations; it does NOT register another GameEvent type, scheduler, payout
 * path, or quest. A later ruleset version must explicitly opt in.
 */
export const LIVING_STORY_SOURCE_KINDS = [
  'CITY_MEMORY', 'RANDOM_ENCOUNTER', 'CITY_CONDITION', 'PLAYER_ACTIVITY',
] as const;
export type LivingStorySourceKind = typeof LIVING_STORY_SOURCE_KINDS[number];

export const LIVING_CASE_KEYS = [
  'CASE_MISSING_LEDGER',
  'CASE_GHOST_SHIPMENT',
  'CASE_THE_FIFTH_WITNESS',
  'CASE_FALSE_COLORS',
  'CASE_MIDNIGHT_SIGNAL',
] as const;
export type LivingCaseKey = typeof LIVING_CASE_KEYS[number];

/** Invitations are owner-owned even when a related city headline is public. */
export interface LivingStoryDefinition {
  readonly key: string;
  readonly title: string;
  readonly caseKey: LivingCaseKey;
  readonly trigger: {
    /** The existing service which verified and settled the source event. */
    readonly sourceKind: LivingStorySourceKind;
    /** The source's exact saved kind/key, never a client-provided label. */
    readonly eventKinds: readonly string[];
  };
  /** ACTORS can only invite source participants; CITY_PLAYERS requires a public source. */
  readonly audience: 'ACTORS' | 'CITY_PLAYERS';
  /** PUBLIC_SUMMARY allows only verified public city-memory/news, not private clues. */
  readonly visibility: 'OWNER_ONLY' | 'PUBLIC_SUMMARY';
  /** Measured against the round's active clock, not wall time during pauses. */
  readonly expiresAfterActiveMinutes: number;
  /** Ceiling for later reward implementation; zero during this foundation slice. */
  readonly rewardBudgetCents: number;
  /** A definition alone never enables a writer or player action. */
  readonly enabled: boolean;
}

export type LivingStoryCatalog = Readonly<Record<string, LivingStoryDefinition>>;

const KEY = /^[A-Z][A-Z0-9_]{2,63}$/;

export function defineLivingStoryCatalog<T extends LivingStoryCatalog>(catalog: T): T {
  for (const [key, definition] of Object.entries(catalog)) {
    if (!KEY.test(key) || definition.key !== key) throw new Error(`Invalid Living Streets definition key: ${key}`);
    if (!LIVING_CASE_KEYS.includes(definition.caseKey)) throw new Error(`Unknown case key on ${key}`);
    if (!LIVING_STORY_SOURCE_KINDS.includes(definition.trigger.sourceKind)) {
      throw new Error(`Unknown source owner on ${key}`);
    }
    if (!definition.title.trim() || !definition.trigger.eventKinds.length
      || definition.trigger.eventKinds.some((kind) => !kind.trim())
      || new Set(definition.trigger.eventKinds).size !== definition.trigger.eventKinds.length) {
      throw new Error(`Invalid trigger/catalog content on ${key}`);
    }
    if (!Number.isSafeInteger(definition.expiresAfterActiveMinutes)
      || definition.expiresAfterActiveMinutes <= 0
      || !Number.isSafeInteger(definition.rewardBudgetCents)
      || definition.rewardBudgetCents < 0) {
      throw new Error(`Invalid duration or reward ceiling on ${key}`);
    }
    if (definition.audience !== 'ACTORS' && definition.audience !== 'CITY_PLAYERS') {
      throw new Error(`Unknown audience on ${key}`);
    }
    if (definition.visibility !== 'OWNER_ONLY' && definition.visibility !== 'PUBLIC_SUMMARY') {
      throw new Error(`Unknown visibility on ${key}`);
    }
    if (typeof definition.enabled !== 'boolean') throw new Error(`Missing enable flag on ${key}`);
  }
  return catalog;
}

/**
 * Authored starter keys for later slices. Intentionally NOT attached to
 * existing rulesets and disabled until verified settlement adapters exist.
 */
export const LIVING_STORIES_STARTER_CATALOG = defineLivingStoryCatalog({
  STORY_AFTER_THE_SMOKE: {
    key: 'STORY_AFTER_THE_SMOKE',
    title: 'After the Smoke',
    caseKey: 'CASE_THE_FIFTH_WITNESS',
    trigger: { sourceKind: 'CITY_MEMORY', eventKinds: ['war_win'] },
    audience: 'ACTORS',
    visibility: 'OWNER_ONLY',
    expiresAfterActiveMinutes: 24 * 60,
    rewardBudgetCents: 0,
    enabled: false,
  },
} as const satisfies LivingStoryCatalog);

/** A story is available only in the ruleset pinned to the round. */
export function livingStoryCatalogForRuleset(ruleset: Ruleset): LivingStoryCatalog {
  return ruleset.livingStories ?? {};
}
