import { createHash } from 'node:crypto';
import { activeRoundEventTime, livingStoryCatalogForRuleset } from '@streets/rulesets';
import type { LivingStorySourceKind, Ruleset } from '@streets/rulesets';

/**
 * Read-only contract for later source adapters. Construct VerifiedStorySource
 * from server-owned settlement records, never from request bodies or a UI event.
 * No database writes, scheduling, claim or grant paths live in Slice A.
 */
export interface VerifiedStorySource {
  readonly roundId: string;
  readonly cityId: string;
  readonly sourceKind: LivingStorySourceKind;
  readonly sourceId: string;
  readonly eventKind: string;
  readonly visibility: 'public' | 'involved-only';
  readonly actorRoundPlayerIds: readonly string[];
  /** Active-round-clock timestamp captured when the source settled. */
  readonly happenedAtActive: Date;
}

export interface LivingStoryViewerContext {
  readonly roundId: string;
  readonly cityId: string;
  readonly roundPlayerId: string;
  readonly roundClock: { readonly pausedAt: Date | null; readonly pausedMinutesTotal: number };
  readonly now: Date;
}

export type LivingStoryOfferDecision =
  | { readonly eligible: true; readonly dedupeKey: string; readonly expiresAtActive: Date }
  | { readonly eligible: false; readonly reason:
    'NOT_PINNED' | 'DISABLED' | 'WRONG_SOURCE' | 'WRONG_ROUND' | 'WRONG_CITY'
    | 'PRIVATE_SOURCE' | 'NOT_INVOLVED' | 'ROUND_PAUSED' | 'INVALID_SOURCE' | 'NOT_YET_SETTLED' | 'EXPIRED' };

export function livingStoryDedupeKey(input: {
  rulesetId: string;
  rulesetVersion: string;
  roundId: string;
  sourceKind: LivingStorySourceKind;
  sourceId: string;
  definitionKey: string;
  ownerRoundPlayerId: string;
}): string {
  // JSON encoding keeps delimiters inside IDs from causing key collisions.
  return 'living-story:' + createHash('sha256').update(JSON.stringify([
    input.rulesetId, input.rulesetVersion, input.roundId, input.sourceKind,
    input.sourceId, input.definitionKey, input.ownerRoundPlayerId,
  ])).digest('hex');
}

/**
 * Authorization/eligibility preview only. Caller must recheck under the
 * authoritative action transaction when B/C introduce persistence.
 */
export function evaluateLivingStoryOffer(
  ruleset: Ruleset,
  definitionKey: string,
  source: VerifiedStorySource,
  viewer: LivingStoryViewerContext,
): LivingStoryOfferDecision {
  const definition = livingStoryCatalogForRuleset(ruleset)[definitionKey];
  if (!definition) return { eligible: false, reason: 'NOT_PINNED' };
  if (!definition.enabled) return { eligible: false, reason: 'DISABLED' };
  if (definition.trigger.sourceKind !== source.sourceKind
    || !definition.trigger.eventKinds.includes(source.eventKind)) {
    return { eligible: false, reason: 'WRONG_SOURCE' };
  }
  if (viewer.roundId !== source.roundId) return { eligible: false, reason: 'WRONG_ROUND' };
  if (viewer.cityId !== source.cityId) return { eligible: false, reason: 'WRONG_CITY' };
  if (!source.sourceId.trim() || !source.roundId.trim() || !source.cityId.trim()
    || !viewer.roundPlayerId.trim()
    || !Number.isFinite(source.happenedAtActive.getTime())
    || !Number.isFinite(viewer.now.getTime())) {
    return { eligible: false, reason: 'INVALID_SOURCE' };
  }
  const involved = source.actorRoundPlayerIds.includes(viewer.roundPlayerId);
  if (source.visibility === 'involved-only' && !involved) {
    return { eligible: false, reason: 'PRIVATE_SOURCE' };
  }
  if (definition.audience === 'ACTORS' && !involved) {
    return { eligible: false, reason: 'NOT_INVOLVED' };
  }
  if (definition.audience === 'CITY_PLAYERS' && source.visibility !== 'public') {
    return { eligible: false, reason: 'PRIVATE_SOURCE' };
  }
  if (definition.visibility === 'PUBLIC_SUMMARY' && source.visibility !== 'public') {
    return { eligible: false, reason: 'PRIVATE_SOURCE' };
  }
  if (viewer.roundClock.pausedAt) return { eligible: false, reason: 'ROUND_PAUSED' };
  const activeNow = activeRoundEventTime(viewer.roundClock, viewer.now);
  if (source.happenedAtActive.getTime() > activeNow.getTime()) {
    return { eligible: false, reason: 'NOT_YET_SETTLED' };
  }
  const expiresAtActive = new Date(
    source.happenedAtActive.getTime() + definition.expiresAfterActiveMinutes * 60_000,
  );
  if (expiresAtActive <= activeNow) return { eligible: false, reason: 'EXPIRED' };

  return {
    eligible: true,
    expiresAtActive,
    dedupeKey: livingStoryDedupeKey({
      rulesetId: ruleset.meta.id,
      rulesetVersion: ruleset.meta.version,
      roundId: source.roundId,
      sourceKind: source.sourceKind,
      sourceId: source.sourceId,
      definitionKey,
      ownerRoundPlayerId: viewer.roundPlayerId,
    }),
  };
}
