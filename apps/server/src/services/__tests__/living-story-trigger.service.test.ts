import { afterEach, describe, expect, it, vi } from 'vitest';
import { classicOgV30D, classicOgV30E, livingStoryCatalogForRuleset } from '@streets/rulesets';
import { emitCityMemoryEvent } from '../city-memory.service.js';
import { LIVING_STORY_LIMITS, listPublicStoryOpportunities, livingStreetsInvitationsEnabled, optInPublicStory, tryOfferLivingStory } from '../living-story-trigger.service.js';

afterEach(() => vi.unstubAllEnvs());

function setup() {
  const now = new Date();
  const round = {
    id: 'round-1', rulesetId: 'classic-og-v3.0-e', rulesetVersion: '3.0.0-E',
    status: 'ACTIVE', pausedAt: null as Date | null, pausedMinutesTotal: 0,
  };
  const players = [
    { id: 'player-a', roundId: round.id, cityId: 'detroit' },
    { id: 'player-b', roundId: round.id, cityId: 'detroit' },
    { id: 'player-c', roundId: round.id, cityId: 'chicago' },
  ];
  const memories: any[] = [];
  const cases: any[] = [];
  const db: any = {
    round: { findUnique: vi.fn(async () => round) },
    roundPlayer: { findUnique: vi.fn(async ({ where }: any) => players.find((p) => p.id === where.id) ?? null) },
    cityMemoryEvent: {
      upsert: vi.fn(async ({ where, create }: any) => {
        let row = memories.find((m) => m.idempotencyKey === where.idempotencyKey);
        if (!row) { row = { id: 'memory-' + (memories.length + 1), ...create }; memories.push(row); }
        return row;
      }),
      findUnique: vi.fn(async ({ where }: any) => memories.find((m) => m.id === where.id) ?? null),
      findMany: vi.fn(async ({ where, take }: any) => memories
        .filter((m) => m.roundId === where.roundId && m.cityId === where.cityId && m.visibility === where.visibility
          && where.kind.in.includes(m.kind) && m.happenedAtActive >= where.happenedAtActive.gte)
        .sort((a, b) => b.happenedAt.getTime() - a.happenedAt.getTime()).slice(0, take)),
    },
    criminalCaseFile: {
      findUnique: vi.fn(async ({ where }: any) => cases.find((c) => c.offerDedupeKey === where.offerDedupeKey) ?? null),
      findMany: vi.fn(async ({ where }: any) => cases
        .filter((c) => c.ownerId === where.ownerId && c.roundId === where.roundId
          && where.sourceMemoryId.in.includes(c.sourceMemoryId))
        .map((c) => ({ sourceMemoryId: c.sourceMemoryId, storyKey: c.storyKey }))),
      count: vi.fn(async ({ where }: any) => cases.filter((c) =>
        (!where.roundId || c.roundId === where.roundId)
        && (!where.ownerId || c.ownerId === where.ownerId)
        && (!where.cityId || c.cityId === where.cityId)
        && (!where.offeredAtActive?.gte || c.offeredAtActive >= where.offeredAtActive.gte)).length),
      upsert: vi.fn(async ({ where, create }: any) => {
        let row = cases.find((c) => c.offerDedupeKey === where.offerDedupeKey);
        if (!row) {
          row = { id: 'case-' + (cases.length + 1), ...create,
            status: 'AVAILABLE', evidence: [], createdAt: now, acceptedAt: null,
            solvedAt: null, chosenBranch: null, closedAt: null };
          cases.push(row);
        }
        return row;
      }),
    },
    $queryRaw: vi.fn(async () => [{ locked: 1 }]),
  };
  return { db, now, round, players, memories, cases };
}

describe('Living Streets 2.0.0-C settled triggers', () => {
  it('defaults on for compatibility and accepts explicit kill-switch values', () => {
    expect(livingStreetsInvitationsEnabled(undefined)).toBe(true);
    expect(livingStreetsInvitationsEnabled('true')).toBe(true);
    for (const value of ['0', 'false', 'off', 'disabled', ' FALSE ']) {
      expect(livingStreetsInvitationsEnabled(value)).toBe(false);
    }
  });

  it('pauses new invitations and public opt-ins while preserving source receipts', async () => {
    const { db, now, round, cases, memories } = setup();
    vi.stubEnv('LIVING_STREETS_ENABLED', 'false');
    const memory = await emitCityMemoryEvent(db, {
      roundId: round.id, cityId: 'detroit', kind: 'war_win', visibility: 'involved-only',
      actorRoundPlayerIds: ['player-a'], idempotencyKey: 'war:paused-rollout', happenedAt: now,
    });
    expect(await tryOfferLivingStory(db, { ownerId: 'player-a', memoryId: memory.id,
      storyKey: 'STORY_AFTER_THE_SMOKE', now })).toBe(false);
    expect(await listPublicStoryOpportunities(db, {
      roundId: round.id, ownerId: 'player-a', cityId: 'detroit', now,
    })).toEqual([]);
    expect(await optInPublicStory(db, { roundId: round.id, ownerId: 'player-a',
      cityId: 'detroit', memoryId: memory.id, now })).toBe(false);
    expect(cases).toHaveLength(0);
    expect(memories).toHaveLength(1); // canonical source receipts remain intact
  });

  it('pins opt-in definitions without modifying a historical ruleset', () => {
    expect(livingStoryCatalogForRuleset(classicOgV30D)).toEqual({});
    expect(classicOgV30E.meta.eventSystem?.cityConditions).toBe('FIRST_CLASS');
    const enabled = Object.values(livingStoryCatalogForRuleset(classicOgV30E));
    expect(enabled).toHaveLength(5);
    expect(enabled.every((definition) => definition.enabled && definition.rewardBudgetCents === 0)).toBe(true);
    expect(enabled.find((def) => def.key === 'STORY_FALSE_COLORS')?.audience).toBe('CITY_PLAYERS');
  });

  it('invites one verified block-war participant exactly once across source retries', async () => {
    const { db, now, cases, memories } = setup();
    const input = {
      roundId: 'round-1', cityId: 'detroit', kind: 'war_win', visibility: 'involved-only',
      actorRoundPlayerIds: ['player-a', 'player-b'], idempotencyKey: 'block-war:xyz',
      happenedAt: now,
    };
    const first = await emitCityMemoryEvent(db, input);
    const second = await emitCityMemoryEvent(db, input);
    expect(first.id).toBe(second.id);
    expect(memories).toHaveLength(1);
    expect(cases).toHaveLength(1);
    expect(cases[0].ownerId).toBe('player-a');
    expect(cases[0].caseKey).toBe('CASE_THE_FIFTH_WITNESS');
    expect(cases[0].offeredAtActive).toBeInstanceOf(Date);
    expect(db.$queryRaw).toHaveBeenCalled();
  });

  it('publishes actorless takeover only as a voluntary city opportunity, with privacy', async () => {
    const { db, now, cases } = setup();
    await emitCityMemoryEvent(db, {
      roundId: 'round-1', cityId: 'detroit', kind: 'takeover',
      actorRoundPlayerIds: [], visibility: 'public',
      idempotencyKey: 'takeover:one', happenedAt: now,
    });
    expect(cases).toHaveLength(0);
    const list = await listPublicStoryOpportunities(db, {
      roundId: 'round-1', ownerId: 'player-b', cityId: 'detroit', now,
    });
    expect(list).toMatchObject([{ storyKey: 'STORY_FALSE_COLORS', caseKey: 'CASE_FALSE_COLORS' }]);
    expect(cases).toHaveLength(0); // GET never writes
    expect(await optInPublicStory(db, { roundId: 'round-1', ownerId: 'player-b',
      cityId: 'detroit', memoryId: 'memory-1', now })).toBe(true);
    expect(cases).toHaveLength(1);
    expect((await listPublicStoryOpportunities(db, { roundId: 'round-1',
      ownerId: 'player-b', cityId: 'detroit', now }))).toHaveLength(0);
    expect(await optInPublicStory(db, { roundId: 'round-1', ownerId: 'player-c',
      cityId: 'chicago', memoryId: 'memory-1', now })).toBe(false);
  });

  it('enforces the active-clock cooldown, city/owner budgets and disabled rounds', async () => {
    const { db, now, cases, round, memories } = setup();
    const input = { roundId: 'round-1', cityId: 'detroit', kind: 'war_win',
      visibility: 'involved-only', actorRoundPlayerIds: ['player-a'] };
    const first = await emitCityMemoryEvent(db, {
      ...input, idempotencyKey: 'war:one', happenedAt: now,
    });
    const next = await emitCityMemoryEvent(db, {
      ...input, idempotencyKey: 'war:two', happenedAt: now,
    });
    expect(cases).toHaveLength(1);
    expect(await tryOfferLivingStory(db, { ownerId: 'player-a', memoryId: next.id,
      storyKey: 'STORY_AFTER_THE_SMOKE', now })).toBe(false);
    expect(await tryOfferLivingStory(db, { ownerId: 'player-a', memoryId: first.id,
      storyKey: 'STORY_AFTER_THE_SMOKE', now })).toBe(true); // replay costs nothing
    round.pausedAt = now;
    expect(await tryOfferLivingStory(db, { ownerId: 'player-b', memoryId: first.id,
      storyKey: 'STORY_AFTER_THE_SMOKE', now })).toBe(false);
    round.pausedAt = null;
    cases.push(...Array.from({ length: LIVING_STORY_LIMITS.maxPerRound }, (_, i) => ({
      id: 'old-' + i, roundId: round.id, cityId: 'detroit', ownerId: 'other-' + i,
      offerDedupeKey: 'old-' + i, offeredAtActive: new Date(now.getTime() - 8 * 3_600_000),
    })));
    const offer = await emitCityMemoryEvent(db, { ...input,
      idempotencyKey: 'war:three', actorRoundPlayerIds: ['player-b'], happenedAt: now });
    expect(await tryOfferLivingStory(db, { ownerId: 'player-b', memoryId: offer.id,
      storyKey: 'STORY_AFTER_THE_SMOKE', now })).toBe(false);
    expect(memories).toHaveLength(3);
  });
});
