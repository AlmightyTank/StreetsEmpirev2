import { describe, expect, it } from 'vitest';
import type { QuestDefinition } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import {
  communityEventSnapshot,
  communityEventState,
  communityEventWindow,
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
      playerQuest: {
        findMany: async () => [
          {
            objectiveProgress: { community_sales: { current: 400, target: 1_000, completed: false } },
            rewardState,
          },
          {
            objectiveProgress: { community_sales: { current: 600, target: 1_000, completed: false } },
            rewardState,
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
});
