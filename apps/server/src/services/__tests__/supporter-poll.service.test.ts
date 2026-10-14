import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SupporterPollService } from '../supporter-poll.service.js';

type Row = Record<string, any>;

function fakeDb() {
  const now = new Date('2026-10-20T00:00:00Z');
  const state = {
    supporterSince: new Date('2026-10-01T00:00:00Z'),
    polls: [{
      id: 'poll-1',
      title: 'June drop theme',
      description: 'Pick the vibe.',
      options: [{ key: 'noir', label: 'Neon noir' }, { key: 'gold', label: 'Cartel gold' }],
      status: 'open',
      opensAt: new Date('2026-10-01T00:00:00Z'),
      closesAt: null,
      createdAt: now,
    }],
    votes: [] as Row[],
  };
  const db: Row = {
    state,
    accountCosmeticUnlock: {
      findFirst: async () => state.supporterSince ? { awardedAt: state.supporterSince } : null,
    },
    supporterPoll: {
      findFirst: async ({ where, include }: Row) => {
        const poll = state.polls.find((row) => row.id === where.id || (row.status === where.status && row.opensAt <= where.opensAt.lte));
        if (!poll) return null;
        const votes = include?.votes?.where?.accountId
          ? state.votes.filter((vote) => vote.pollId === poll.id && vote.accountId === include.votes.where.accountId)
          : state.votes.filter((vote) => vote.pollId === poll.id);
        return { ...poll, votes };
      },
      create: async ({ data, include }: Row) => {
        const row = { id: `poll-${state.polls.length + 1}`, createdAt: now, ...data };
        state.polls.push(row);
        return { ...row, votes: include?.votes ? [] : undefined };
      },
    },
    supporterVote: {
      create: async ({ data }: Row) => {
        if (state.votes.some((vote) => vote.pollId === data.pollId && vote.accountId === data.accountId)) {
          const error = new Error('Unique constraint failed') as Error & { code: string };
          error.code = 'P2002';
          throw error;
        }
        const row = { id: `vote-${state.votes.length + 1}`, createdAt: now, ...data };
        state.votes.push(row);
        return row;
      },
    },
    adminAuditLog: { create: async ({ data }: Row) => data },
  };
  return db as Row & { state: typeof state };
}

describe('SupporterPollService', () => {
  it('records one vote per supporter account and fails cleanly on duplicate vote', async () => {
    const db = fakeDb();
    const prisma = db as unknown as PrismaClient;

    const first = await SupporterPollService.vote(prisma, 'account-1', 'poll-1', 'noir', new Date('2026-10-20T00:00:00Z'));
    expect(first.poll?.myVote).toBe('noir');
    expect(db.state.votes).toHaveLength(1);

    await expect(SupporterPollService.vote(prisma, 'account-1', 'poll-1', 'gold', new Date('2026-10-20T00:00:00Z')))
      .rejects.toMatchObject({ code: 'ALREADY_VOTED' });
    expect(db.state.votes).toHaveLength(1);
  });

  it('hides polls from accounts without supporter rewards', async () => {
    const db = fakeDb();
    db.state.supporterSince = null as unknown as Date;

    await expect(SupporterPollService.vote(db as unknown as PrismaClient, 'account-1', 'poll-1', 'noir'))
      .rejects.toMatchObject({ code: 'SUPPORTER_ONLY' });
    expect(await SupporterPollService.list(db as unknown as PrismaClient, 'account-1')).toEqual({ hasRewards: false, poll: null });
  });
});
