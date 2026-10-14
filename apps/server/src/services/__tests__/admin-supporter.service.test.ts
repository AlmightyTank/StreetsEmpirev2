import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SUPPORTER_COSMETICS } from '@streets/rulesets';
import { AppError } from '../../utils/errors.js';

const grantSupporterRewards = vi.fn();
vi.mock('../admin-account.service.js', () => ({ AdminAccountService: { grantSupporterRewards } }));

const { AdminSupporterService } = await import('../admin-supporter.service.js');

const COLLECTION = 'supporter-midnight-chrome';
const CARD = 'midnight-chrome-frame';
const ACCENT = 'supporter-banner-accent';
const ALL = Object.keys(SUPPORTER_COSMETICS);
const actor = { id: 'admin-1', username: 'Boss' };

type Unlock = { accountId: string; key: string; sourceQuestKey: string; awardedAt: Date };
type Account = { id: string; username: string; usernameNormalized: string; isActive: boolean; lastLoginAt: Date | null };

function account(id: string, username: string): Account {
  return { id, username, usernameNormalized: username.toLowerCase(), isActive: true, lastLoginAt: null };
}

function supporterUnlock(accountId: string, key: string, day: number): Unlock {
  return { accountId, key, sourceQuestKey: 'supporter', awardedAt: new Date(`2026-10-${String(day).padStart(2, '0')}T12:00:00Z`) };
}

function fakePrisma(accounts: Account[], unlocks: Unlock[], avatarFrames: Record<string, string> = {}) {
  return {
    accountCosmeticUnlock: {
      findMany: async ({ where }: { where: { sourceQuestKey?: string; accountId?: { in: string[] }; key?: { in: string[] } } }) =>
        unlocks
          .filter((row) => (where.sourceQuestKey === undefined || row.sourceQuestKey === where.sourceQuestKey)
            && (!where.accountId || where.accountId.in.includes(row.accountId))
            && (!where.key || where.key.in.includes(row.key)))
          .sort((a, b) => a.awardedAt.getTime() - b.awardedAt.getTime()),
      groupBy: async () => [],
    },
    account: {
      findMany: async ({ where }: { where: { id?: { in: string[] }; usernameNormalized?: { in: string[] } } }) =>
        accounts.filter((row) => (!where.id || where.id.in.includes(row.id))
          && (!where.usernameNormalized || where.usernameNormalized.in.includes(row.usernameNormalized))),
    },
    supporterMembership: { findMany: async () => [] },
    supporterPayment: { findMany: async () => [] },
    accountProfile: {
      count: async () => 0,
      findMany: async ({ where }: { where: { accountId: { in: string[] } } }) =>
        where.accountId.in.map((accountId) => ({ accountId, activeAvatarFrameKey: avatarFrames[accountId] ?? null })),
    },
  } as unknown as PrismaClient;
}

beforeEach(() => {
  grantSupporterRewards.mockReset();
});

describe('AdminSupporterService.list', () => {
  it('lists every supporter, newest first, with missing rewards and whether they wear the card', async () => {
    const prisma = fakePrisma(
      [account('a', 'Alice'), account('b', 'Bob'), account('c', 'Carol')],
      [
        supporterUnlock('a', COLLECTION, 1), supporterUnlock('a', CARD, 1), supporterUnlock('a', ACCENT, 1),
        supporterUnlock('b', COLLECTION, 5),
      ],
      { a: CARD },
    );

    const result = await AdminSupporterService.list(prisma);

    expect(result.rewards.map((reward) => reward.key)).toEqual(ALL);
    expect(result.supporters.map((row) => [row.username, row.rewardKeys, row.missingKeys, row.wearingCard])).toEqual([
      ['Bob', [COLLECTION], [CARD, ACCENT], false],
      ['Alice', ALL, [], true],
    ]);    expect(result.supporters[1]!.since).toBe('2026-10-01T12:00:00.000Z');
    expect(result.missingCount).toBe(1);
    expect(result.supporters.every((row) => row.membership === null)).toBe(true);
    expect(result).toMatchObject({ activeCount: 0, checkoutEnabled: false, payments: [] });
  });

  it('shows tenure badges on the roster without touching reward counts', async () => {
    const prisma = fakePrisma(
      [account('a', 'Alice'), account('b', 'Bob')],
      [
        supporterUnlock('a', COLLECTION, 1), supporterUnlock('a', CARD, 1),
        supporterUnlock('b', COLLECTION, 2),
        { accountId: 'a', key: 'supporter-tenure-3', sourceQuestKey: 'supporter', awardedAt: new Date('2027-01-20T00:00:00Z') },
      ],
    );

    const result = await AdminSupporterService.list(prisma);

    expect(result.tenure.map((badge) => badge.key)).toEqual(['supporter-tenure-3', 'supporter-tenure-6', 'supporter-tenure-12']);
    expect(result.supporters.map((row) => [row.username, row.tenureKeys])).toEqual([
      ['Bob', []],
      ['Alice', ['supporter-tenure-3']],
    ]);
    expect(result.supporters[0]!.rewardKeys).toEqual([COLLECTION]);
  });
});

describe('AdminSupporterService.grant', () => {
  const prisma = () => fakePrisma(
    [account('a', 'Alice'), account('b', 'Bob'), account('c', 'Carol'), account('admin-1', 'Boss')],
    [supporterUnlock('b', COLLECTION, 1), supporterUnlock('b', CARD, 1), supporterUnlock('b', ACCENT, 1), supporterUnlock('c', COLLECTION, 2)],
  );

  it('previews a pasted list without granting anything', async () => {
    const result = await AdminSupporterService.grant(prisma(), actor, {
      usernames: ['@alice', 'BOB', 'carol', 'ghost', 'boss', 'Alice'],
      dryRun: true,
    });

    expect(result.rows.map((row) => [row.input, row.status, row.rewardKeys])).toEqual([
      ['alice', 'new', ALL],
      ['BOB', 'already', []],
      ['carol', 'missing-rewards', [CARD, ACCENT]],
      ['ghost', 'not-found', []],
      ['boss', 'self', []],
      ['Alice', 'duplicate', []],
    ]);
    expect(result.rows[0]!.username).toBe('Alice');
    expect(result).toMatchObject({ dryRun: true, granted: 0 });
    expect(grantSupporterRewards).not.toHaveBeenCalled();
  });

  it('needs a reason to commit', async () => {
    await expect(AdminSupporterService.grant(prisma(), actor, { usernames: ['alice'] }))
      .rejects.toMatchObject({ code: 'REASON_REQUIRED' });
  });

  it('grants only the accounts that need rewards and keeps a failure on its own row', async () => {
    grantSupporterRewards.mockImplementation(async (_prisma, _actor, accountId: string) => {
      if (accountId === 'c') throw AppError.conflict('SUPPORTER_ALREADY_GRANTED', 'Carol already has every supporter reward.');
      return ALL;
    });

    const result = await AdminSupporterService.grant(prisma(), actor, {
      usernames: ['alice', 'bob', 'carol'],
      reason: 'Ko-fi supporters, October',
    });

    expect(grantSupporterRewards.mock.calls.map((call) => [call[2], call[3]])).toEqual([
      ['a', 'Ko-fi supporters, October'],
      ['c', 'Ko-fi supporters, October'],
    ]);
    expect(result.granted).toBe(1);
    expect(result.rows.map((row) => [row.input, row.rewardKeys, row.error])).toEqual([
      ['alice', ALL, null],
      ['bob', [], null],
      ['carol', [], 'Carol already has every supporter reward.'],
    ]);
  });
});

describe('AdminSupporterService.backfill', () => {
  it('gives each supporter the rewards added since their grant', async () => {
    const prisma = fakePrisma(
      [account('a', 'Alice'), account('b', 'Bob')],
      [supporterUnlock('a', COLLECTION, 1), supporterUnlock('a', CARD, 1), supporterUnlock('b', COLLECTION, 2)],
    );

    const preview = await AdminSupporterService.backfill(prisma, actor, { dryRun: true });
    expect(preview.rows.map((row) => [row.username, row.status, row.rewardKeys])).toEqual([
      ['Bob', 'missing-rewards', [CARD, ACCENT]],
      ['Alice', 'missing-rewards', [ACCENT]],
    ]);
    expect(grantSupporterRewards).not.toHaveBeenCalled();

    grantSupporterRewards.mockResolvedValueOnce([CARD, ACCENT]).mockResolvedValueOnce([ACCENT]);
    const done = await AdminSupporterService.backfill(prisma, actor, { reason: 'New reward released' });
    expect(grantSupporterRewards.mock.calls.map((call) => [call[2], call[3]])).toEqual([
      ['b', 'New reward released'],
      ['a', 'New reward released'],
    ]);
    expect(done.granted).toBe(2);
  });
});
