import { describe, expect, it } from 'vitest';
import type { Ruleset } from '@streets/rulesets';
import { LIVING_STORIES_STARTER_CATALOG } from '@streets/rulesets';
import { evaluateLivingStoryOffer, livingStoryDedupeKey } from '../living-story-contract.service.js';

const story = { ...LIVING_STORIES_STARTER_CATALOG.STORY_AFTER_THE_SMOKE, enabled: true } as const;
const ruleset = {
  meta: { id: 'stories-test', version: '2.0.0-A' },
  livingStories: { STORY_AFTER_THE_SMOKE: story },
} as unknown as Ruleset;
const source = {
  roundId: 'round-1', cityId: 'detroit', sourceKind: 'CITY_MEMORY' as const,
  sourceId: 'city-memory-900', eventKind: 'war_win',
  visibility: 'involved-only' as const, actorRoundPlayerIds: ['player-a'],
  happenedAtActive: new Date('2026-10-16T10:00:00.000Z'),
};
const viewer = {
  roundId: 'round-1', cityId: 'detroit', roundPlayerId: 'player-a',
  now: new Date('2026-10-16T11:00:00.000Z'),
  roundClock: { pausedAt: null, pausedMinutesTotal: 0 },
};

describe('2.0.0-A Living Streets offer authorization', () => {
  it('accepts only pinned, enabled, verified settled sources', () => {
    const good = evaluateLivingStoryOffer(ruleset, story.key, source, viewer);
    expect(good).toMatchObject({ eligible: true, expiresAtActive: new Date('2026-10-17T10:00:00.000Z') });
    expect(evaluateLivingStoryOffer({ ...ruleset, livingStories: undefined }, story.key, source, viewer))
      .toEqual({ eligible: false, reason: 'NOT_PINNED' });
    expect(evaluateLivingStoryOffer({ ...ruleset, livingStories: LIVING_STORIES_STARTER_CATALOG }, story.key, source, viewer))
      .toEqual({ eligible: false, reason: 'DISABLED' });
    expect(evaluateLivingStoryOffer(ruleset, story.key, { ...source, eventKind: 'convoy' }, viewer))
      .toEqual({ eligible: false, reason: 'WRONG_SOURCE' });
    expect(evaluateLivingStoryOffer(ruleset, story.key, { ...source, sourceId: '' }, viewer))
      .toEqual({ eligible: false, reason: 'INVALID_SOURCE' });
    expect(evaluateLivingStoryOffer(ruleset, story.key, { ...source, happenedAtActive: new Date('2026-10-17T00:00:00Z') }, viewer))
      .toEqual({ eligible: false, reason: 'NOT_YET_SETTLED' });
  });
  it('never leaks involved-only source to another player or round', () => {
    expect(evaluateLivingStoryOffer(ruleset, story.key, source, { ...viewer, roundPlayerId: 'player-b' }))
      .toEqual({ eligible: false, reason: 'PRIVATE_SOURCE' });
    expect(evaluateLivingStoryOffer(ruleset, story.key, { ...source, visibility: 'public' }, { ...viewer, roundPlayerId: 'player-b' }))
      .toEqual({ eligible: false, reason: 'NOT_INVOLVED' });
    expect(evaluateLivingStoryOffer(ruleset, story.key, source, { ...viewer, roundId: 'round-2' }))
      .toEqual({ eligible: false, reason: 'WRONG_ROUND' });
    expect(evaluateLivingStoryOffer(ruleset, story.key, source, { ...viewer, cityId: 'boston' }))
      .toEqual({ eligible: false, reason: 'WRONG_CITY' });
  });
  it('freezes story expiry on paused rounds and uses the active clock after resuming', () => {
    const paused = { ...viewer, now: new Date('2026-10-18T13:00:00Z'), roundClock: { pausedAt: new Date('2026-10-16T12:00:00Z'), pausedMinutesTotal: 0 } };
    expect(evaluateLivingStoryOffer(ruleset, story.key, source, paused))
      .toEqual({ eligible: false, reason: 'ROUND_PAUSED' });
    const resumed = { ...viewer, now: new Date('2026-10-18T13:00:00Z'), roundClock: { pausedAt: null, pausedMinutesTotal: 49 * 60 } };
    expect(evaluateLivingStoryOffer(ruleset, story.key, source, resumed)).toMatchObject({ eligible: true });
    expect(evaluateLivingStoryOffer(ruleset, story.key, source, { ...viewer, now: new Date('2026-10-17T10:00:00Z') }))
      .toEqual({ eligible: false, reason: 'EXPIRED' });
  });
  it('derives a stable owner-scoped idempotency key without delimiter collisions', () => {
    const good = evaluateLivingStoryOffer(ruleset, story.key, source, viewer);
    expect(good.eligible).toBe(true);
    if (!good.eligible) return;
    expect(good.dedupeKey).toBe(evaluateLivingStoryOffer(ruleset, story.key, source, viewer).eligible
      ? (evaluateLivingStoryOffer(ruleset, story.key, source, viewer) as typeof good).dedupeKey : '');
    expect(good.dedupeKey).toMatch(/^living-story:[a-f0-9]{64}$/);
    const parts = { rulesetId: 'r', rulesetVersion: '1', roundId: 'a|b', sourceKind: 'CITY_MEMORY' as const,
      sourceId: 'c', definitionKey: story.key, ownerRoundPlayerId: 'player-a' };
    expect(livingStoryDedupeKey(parts)).not.toBe(livingStoryDedupeKey({ ...parts, roundId: 'a', sourceId: 'b|c' }));
    expect(livingStoryDedupeKey(parts)).not.toBe(livingStoryDedupeKey({ ...parts, ownerRoundPlayerId: 'player-b' }));
    expect(livingStoryDedupeKey(parts)).not.toBe(livingStoryDedupeKey({ ...parts, rulesetVersion: '2' }));
  });
  it('prevents public summaries of private intel even for an involved actor', () => {
    const city = { ...story, audience: 'CITY_PLAYERS' as const, visibility: 'PUBLIC_SUMMARY' as const };
    const publicRuleset = { ...ruleset, livingStories: { STORY_AFTER_THE_SMOKE: city } } as Ruleset;
    expect(evaluateLivingStoryOffer(publicRuleset, city.key, source, viewer))
      .toEqual({ eligible: false, reason: 'PRIVATE_SOURCE' });
    expect(evaluateLivingStoryOffer(publicRuleset, city.key, { ...source, visibility: 'public' }, { ...viewer, roundPlayerId: 'player-b' }))
      .toMatchObject({ eligible: true });
  });
});
