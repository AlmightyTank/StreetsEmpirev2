import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadRuleset, DEFAULT_RULESET_ID } from '@streets/rules-engine';
import type { Db } from '../../utils/db.js';
import { RingService } from '../ring.service.js';
// Account XP has its own tests; here it only needs to accept the award.
vi.mock('../player-experience.service.js', () => ({
  PlayerExperienceService: { award: vi.fn(async () => ({ awardedXp: 0, totalXp: 0, level: 1, unlocked: [] })) },
}));

vi.mock('../net-worth.service.js', () => ({
  NetWorthService: { calculate: () => 9_999_999n },
}));

const now = new Date('2026-10-04T00:00:00Z');

function fakeDb() {
  const defaultRuleset = loadRuleset(DEFAULT_RULESET_ID);
  return {
    ringState: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'ring-1', ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    },
    round: {
      findUnique: vi.fn(async () => ({
        id: 'round-1', status: 'ACTIVE', startsAt: new Date('2026-10-01T00:00:00Z'),
        rulesetId: defaultRuleset.meta.id, rulesetVersion: defaultRuleset.meta.version,
        streetPassOverride: null,
      })),
    },
    roundPlayer: {
      count: vi.fn(async () => 3),
      findMany: vi.fn(async () => [{ id: 'player-2', displayName: 'Bearer' }]),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    gameNews: { create: vi.fn(async () => ({})) },
    playerActivity: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'a1', createdAt: now, ...data })) },
    inAppNotification: { create: vi.fn(async () => ({})) },
    accountCosmeticUnlock: { createMany: vi.fn(async () => ({ count: 1 })) },
    playerProduct: { findMany: vi.fn(async () => []) },
    economyLedgerEntry: { create: vi.fn(async () => ({})) },
  };
}

type FakeDb = ReturnType<typeof fakeDb>;

describe('RingService.maybeSurface', () => {
  it('stays hidden before the round is 48 hours old', async () => {
    const fakes = fakeDb();
    await RingService.maybeSurface(fakes as unknown as Db, 'round-1', new Date('2026-10-02T23:59:59Z'), () => 0);
    expect(fakes.ringState.create).not.toHaveBeenCalled();
    expect(fakes.gameNews.create).not.toHaveBeenCalled();
  });

  it('picks a bearer, hides them for a day, and posts round news', async () => {
    const fakes = fakeDb();
    await RingService.maybeSurface(fakes as unknown as Db, 'round-1', now, () => 0.99);
    expect(fakes.roundPlayer.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 2 }));
    expect(fakes.ringState.create).toHaveBeenCalledWith({
      data: { roundId: 'round-1', status: 'SURFACED', holderRoundPlayerId: 'player-2', surfacedAt: now },
    });
    expect(fakes.roundPlayer.update).toHaveBeenCalledWith({
      where: { id: 'player-2' },
      data: { invisibleUntil: new Date('2026-10-05T00:00:00Z') },
    });
    expect(fakes.gameNews.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roundId: 'round-1', title: 'A strange Ring has surfaced' }),
    });
    expect(fakes.playerActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roundPlayerId: 'player-2', type: 'RING_SURFACED' }),
    });
  });

  it('is a no-op once the Ring exists', async () => {
    const fakes = fakeDb();
    (fakes.ringState.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'ring-1', status: 'SURFACED' });
    await RingService.maybeSurface(fakes as unknown as Db, 'round-1', now);
    expect(fakes.ringState.create).not.toHaveBeenCalled();
  });
});

describe('RingService.transferOnRaidWin', () => {
  function surfacedDb(holderId: string | null) {
    const fakes = fakeDb();
    (fakes.ringState.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ring-1', roundId: 'round-1', status: 'SURFACED', holderRoundPlayerId: holderId,
    });
    (fakes.roundPlayer.findUnique as ReturnType<typeof vi.fn>).mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'player-a' ? { displayName: 'Taker', publicPimpId: 1001 } : { displayName: 'Loser', publicPimpId: 1002 });
    return fakes;
  }

  it('moves the Ring to the raid winner and tells both sides', async () => {
    const fakes: FakeDb = surfacedDb('player-d');
    expect(await RingService.transferOnRaidWin(fakes as unknown as Db, 'round-1', 'player-a', 'player-d', now)).toBe(true);
    expect(fakes.ringState.update).toHaveBeenCalledWith({ where: { roundId: 'round-1' }, data: { holderRoundPlayerId: 'player-a' } });
    expect(fakes.roundPlayer.update).toHaveBeenCalledWith({ where: { id: 'player-a' }, data: { invisibleUntil: null } });
    expect(fakes.playerActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roundPlayerId: 'player-a', type: 'RING_STOLEN' }),
    });
    expect(fakes.playerActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roundPlayerId: 'player-d', type: 'RING_STOLEN' }),
    });
  });

  it('leaves a Ring alone when the loser did not hold it', async () => {
    const fakes: FakeDb = surfacedDb('player-other');
    expect(await RingService.transferOnRaidWin(fakes as unknown as Db, 'round-1', 'player-a', 'player-d', now)).toBe(false);
    expect(fakes.ringState.update).not.toHaveBeenCalled();
  });
});

describe('RingService.destroy', () => {
  function holderDb(citySlug: string, turns = 10) {
    const fakes = fakeDb();
    (fakes.ringState.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ring-1', roundId: 'round-1', status: 'SURFACED', holderRoundPlayerId: 'player-1',
    });
    (fakes.roundPlayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'player-1', roundId: 'round-1', accountId: 'account-1', displayName: 'Bearer',
      cashCents: 1_000_000n, turns, city: { slug: citySlug, name: citySlug === 'detroit' ? 'Detroit' : 'Chicago' },
      whores: 1, thugs: 1, lowRiders: 0, medicine: 0, crack: 0, condoms: 0, beer: 0,
      pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0,
    });
    return fakes;
  }

  it('refuses a bearer outside Detroit', async () => {
    const fakes = holderDb('chicago');
    await expect(RingService.destroy(fakes as unknown as Db, 'player-1', now))
      .rejects.toMatchObject({ code: 'RING_WRONG_CITY' });
  });

  it('refuses a player who does not hold the Ring', async () => {
    const fakes = holderDb('detroit');
    (fakes.ringState.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ring-1', roundId: 'round-1', status: 'SURFACED', holderRoundPlayerId: 'player-other',
    });
    await expect(RingService.destroy(fakes as unknown as Db, 'player-1', now))
      .rejects.toMatchObject({ code: 'RING_NOT_HELD' });
  });

  it('pays the reward, writes the ledger, grants Ring-bearer and posts news', async () => {
    const fakes = holderDb('detroit');
    const result = await RingService.destroy(fakes as unknown as Db, 'player-1', now);
    expect(result).toEqual({ rewardCents: 10_000_000 });
    expect(fakes.roundPlayer.update).toHaveBeenCalledWith({
      where: { id: 'player-1' },
      data: expect.objectContaining({ cashCents: 11_000_000n, turns: 5, invisibleUntil: null }),
    });
    expect(fakes.economyLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roundPlayerId: 'player-1', source: 'RING_DESTROY', amountCents: 10_000_000 }),
    });
    expect(fakes.accountCosmeticUnlock.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ key: 'egg-ring-bearer', sourceQuestKey: 'EASTER_EGG:RING_BEARER' })],
    }));
    expect(fakes.ringState.update).toHaveBeenCalledWith({
      where: { roundId: 'round-1' }, data: { status: 'DESTROYED', destroyedAt: now },
    });
    expect(fakes.gameNews.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roundId: 'round-1', title: 'The Ring is destroyed' }),
    });
  });
});

describe('RingService.grantMyPreciousAtClose', () => {
  it('grants My Precious to whoever still holds a live Ring', async () => {
    const fakes = fakeDb();
    (fakes.ringState.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ring-1', roundId: 'round-1', status: 'SURFACED', holderRoundPlayerId: 'player-1',
    });
    (fakes.roundPlayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ accountId: 'account-1' });
    await RingService.grantMyPreciousAtClose(fakes as unknown as Db, 'round-1', now);
    expect(fakes.accountCosmeticUnlock.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({ key: 'egg-my-precious', sourceQuestKey: 'EASTER_EGG:MY_PRECIOUS' })],
    }));
  });

  it('grants nothing when the Ring was destroyed', async () => {
    const fakes = fakeDb();
    (fakes.ringState.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ring-1', roundId: 'round-1', status: 'DESTROYED', holderRoundPlayerId: 'player-1',
    });
    await RingService.grantMyPreciousAtClose(fakes as unknown as Db, 'round-1', now);
    expect(fakes.accountCosmeticUnlock.createMany).not.toHaveBeenCalled();
  });
});

beforeEach(() => { vi.unstubAllGlobals(); });
