import { describe, expect, it } from 'vitest';
import type { QuestDefinition } from '@streets/rulesets';
import { classicOgV18G } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import {
  communityEventSnapshot,
  communityEventState,
  communityEventWindow,
  activeCommunityEventWindow,
  assertCommunityEventClaim,
  recordCommunityEventClaim,
  recordFirstClassCommunityEventProgress,
} from '../community-event.service.js';

const definition = {
  key: 'EVENT_TEST',
  title: 'Test Event',
  description: 'Test',
  contactKey: null,
  type: 'EVENT',
  category: 'COMMUNITY',
  difficulty: 'CONTRACT',
  prerequisites: [],
  objectives: [{
    id: 'community_sales',
    kind: 'EVENT_SUM',
    description: 'Sell together.',
    target: 1_000,
    params: { eventTypes: ['STORE_SELL'], field: 'totalCents', display: 'CURRENCY' },
  }],
  bonusObjectives: [],
  rewards: [],
  followUpKeys: [],
  repeatability: 'ONCE',
  expiresAfterMinutes: null,
  availability: {
    communityEvent: true,
    roundStartFraction: 0.25,
    roundEndFraction: 0.5,
    personalContributionTarget: 100,
    contributionLabel: 'personal sales',
  },
} as const satisfies QuestDefinition;

describe('CommunityEventService', () => {
  it('turns fractional season windows into exact round timestamps', () => {
    const window = communityEventWindow({
      startsAt: new Date('2026-09-01T00:00:00.000Z'),
      endsAt: new Date('2026-09-29T00:00:00.000Z'),
    }, definition);

    expect(window?.startsAt.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(window?.endsAt.toISOString()).toBe('2026-09-15T00:00:00.000Z');
  });

  it('keeps quarter windows on the active clock when a round was extended by a pause', () => {
    const window = activeCommunityEventWindow({
      startsAt: new Date('2026-09-01T00:00:00.000Z'),
      endsAt: new Date('2026-10-01T00:00:00.000Z'),
      pausedMinutesTotal: 2 * 24 * 60,
    }, definition);

    expect(window?.startsAt.toISOString()).toBe('2026-09-08T00:00:00.000Z');
    expect(window?.endsAt.toISOString()).toBe('2026-09-15T00:00:00.000Z');
  });

  it('parses only complete community-event state', () => {
    const raw = {
      communityEvent: {
        roundId: 'round-a',
        windowStart: '2026-09-08T00:00:00.000Z',
        windowEnd: '2026-09-15T00:00:00.000Z',
        contributionObjectiveId: 'community_sales',
        contributionTarget: 100,
        contributionLabel: 'personal sales',
      },
    };
    expect(communityEventState(raw)).toEqual(raw.communityEvent);
    expect(communityEventState({ communityEvent: { roundId: 'round-a' } })).toBeNull();
  });

  it('aggregates shared progress while keeping the viewer contribution separate', async () => {
    const state = {
      roundId: 'round-a',
      windowStart: '2026-09-08T00:00:00.000Z',
      windowEnd: '2026-09-15T00:00:00.000Z',
      contributionObjectiveId: 'community_sales',
      contributionTarget: 100,
      contributionLabel: 'personal sales',
    };
    const rewardState = { communityEvent: state };
    const db = {
      gameEventParticipation: {
        findMany: async () => [
          {
            roundPlayerId: 'p1',
            progress: { community_sales: { current: 400, target: 1_000, completed: false } },
          },
          {
            roundPlayerId: 'p2',
            progress: { community_sales: { current: 600, target: 1_000, completed: false } },
          },
        ],
      },
    } as unknown as Db;

    const snapshot = await communityEventSnapshot(db, {
      id: 'q1',
      roundPlayerId: 'p1',
      questDefinitionId: 'd1',
      objectiveProgress: { community_sales: { current: 400, target: 1_000, completed: false } },
      rewardState,
      questDefinition: {
        key: definition.key,
        title: definition.title,
        contactKey: null,
        objectives: definition.objectives as unknown as any,
      },
    });

    expect(snapshot?.progress.community_sales).toMatchObject({
      current: 1_000,
      target: 1_000,
      completed: true,
    });
    expect(snapshot?.contributionCurrent).toBe(400);
    expect(snapshot?.contributionTarget).toBe(100);
    expect(snapshot?.contributionFormat).toBe('CURRENCY');
    expect(snapshot?.sharedCompleted).toBe(true);
  });

  it('requires the personal floor even when the shared goal is complete', async () => {
    const state = {
      roundId: 'round-a',
      windowStart: '2026-09-08T00:00:00.000Z',
      windowEnd: '2026-09-15T00:00:00.000Z',
      contributionObjectiveId: 'community_sales',
      contributionTarget: 500,
      contributionLabel: 'personal sales',
    };
    const db = {
      gameEventParticipation: {
        findMany: async () => [
          { roundPlayerId: 'p1', progress: { community_sales: { current: 400, target: 1_000, completed: false } } },
          { roundPlayerId: 'p2', progress: { community_sales: { current: 600, target: 1_000, completed: false } } },
        ],
      },
    } as unknown as Db;
    await expect(assertCommunityEventClaim(db, {
      id: 'q1', roundPlayerId: 'p1', questDefinitionId: 'd1',
      objectiveProgress: {}, rewardState: { communityEvent: state },
      questDefinition: { key: definition.key, title: definition.title, contactKey: null, objectives: definition.objectives as unknown as any },
    })).rejects.toMatchObject({ code: 'COMMUNITY_EVENT_PARTICIPATION_REQUIRED' });
  });

  it('records a single durable reward claim key for retry-safe settlement', async () => {
    const claims: unknown[] = [];
    const db = {
      gameEventOccurrence: { findFirst: async () => ({ id: 'occ-1' }) },
      gameEventParticipation: {
        findUnique: async () => ({ id: 'part-1' }),
        update: async () => undefined,
      },
      gameEventRewardClaim: { createMany: async (args: unknown) => { claims.push(args); } },
      gameEventHistory: { createMany: async () => undefined },
    } as unknown as Db;
    const row = {
      id: 'q1', roundPlayerId: 'p1', questDefinitionId: 'd1', objectiveProgress: {},
      rewardState: { communityEvent: {
        roundId: 'round-a', windowStart: '2026-09-08T00:00:00.000Z', windowEnd: '2026-09-15T00:00:00.000Z',
        contributionObjectiveId: 'community_sales', contributionTarget: 100, contributionLabel: 'sales',
      } },
      questDefinition: { key: definition.key, title: definition.title, contactKey: null, objectives: definition.objectives as unknown as any },
    };
    await recordCommunityEventClaim(db, row, [{ kind: 'CASH', amount: 10 }], new Date('2026-09-10T00:00:00Z'));
    await recordCommunityEventClaim(db, row, [{ kind: 'CASH', amount: 10 }], new Date('2026-09-10T00:00:00Z'));

    expect(claims).toHaveLength(2);
    expect(claims[0]).toMatchObject({ skipDuplicates: true, data: [{ idempotencyKey: 'community:part-1:reward' }] });
  });

  it('writes a player action to one participation receipt without fan-out writes', async () => {
    const updates: unknown[] = [];
    const receiptCreates: unknown[] = [];
    const participation = { id: 'part-1', occurrenceId: 'occ-1', progress: {} };
    const db = {
      roundPlayer: { findUnique: async () => ({ round: { pausedAt: null, pausedMinutesTotal: 0 } }) },
      gameEventParticipation: {
        findFirst: async (args: any) => args.where.occurrence.definition.key === 'EVENT_OPENING_RUSH' ? participation : null,
        update: async (args: unknown) => { updates.push(args); },
      },
      $queryRaw: async () => [],
      gameEventOccurrence: {
        findUnique: async () => ({ startsAt: new Date('2026-09-01T00:00:00Z'), endsAt: new Date('2026-09-08T00:00:00Z') }),
      },
      gameEventProgressReceipt: {
        findUnique: async () => null,
        create: async (args: unknown) => { receiptCreates.push(args); },
      },
    } as unknown as Db;

    const result = await recordFirstClassCommunityEventProgress(db, 'p1', classicOgV18G, {
      sourceKey: 'activity:scout-1',
      event: { type: 'SCOUT', payload: {} },
      at: new Date('2026-09-02T00:00:00Z'),
    });

    expect(result).toEqual({ matched: 1, advanced: 1, duplicate: 0 });
    expect(receiptCreates).toHaveLength(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ where: { id: 'part-1' }, data: { progress: { community_scouts: { current: 1 } } } });
  });
});
