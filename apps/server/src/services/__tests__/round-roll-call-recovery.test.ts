import { describe, expect, it } from 'vitest';
import type { PrismaClient, Round } from '@prisma/client';
import { RoundRollCallRecoveryService } from '../round-roll-call-recovery.service.js';
import { RoundRollCallService } from '../round-roll-call.service.js';

const DAY = 86_400_000;
const START = new Date('2026-10-01T18:00:00Z');
const at = (day: number) => new Date(START.getTime() + (day - 1) * DAY + 3_600_000);
const ACTIVE_ROUND = {
  id: 'r1', startsAt: START, endsAt: new Date(START.getTime() + 28 * DAY),
  status: 'ACTIVE', pausedAt: null, pausedMinutesTotal: 0,
} as Round;

function harness(regularDays: number[], options: { joinedAt?: Date; round?: Round } = {}) {
  const round = options.round ?? ACTIVE_ROUND;
  const joinedAt = options.joinedAt ?? START;
  const stamps = new Map<number, { dayIndex: number; checkedInAt: Date; source: string }>(
    regularDays.map((day) => [day, { dayIndex: day, checkedInAt: at(day), source: 'LOGIN' }]),
  );
  const recoveries: { roundPlayerId: string; dayIndex: number; actionId: string; createdAt: Date }[] = [];
  const unlocks = new Set<string>();
  const tx = {
    $queryRaw: async () => [],
    round: { findUnique: async () => round },
    roundPlayer: {
      findUnique: async () => ({ id: 'p1', roundId: round.id, accountId: 'a1', createdAt: joinedAt }),
    },
    roundLoginCheckIn: {
      findMany: async () => [...stamps.values()].sort((a,b) => a.dayIndex-b.dayIndex),
      count: async () => stamps.size,
      create: async ({ data }: { data: { dayIndex: number; source: string; checkedInAt: Date } }) => {
        if (stamps.has(data.dayIndex)) throw new Error('unique stamp violation');
        stamps.set(data.dayIndex, data);
      },
    },
    roundLoginRecovery: {
      findMany: async () => [...recoveries],
      findUnique: async ({ where }: { where: { roundPlayerId_actionId: { actionId: string } } }) =>
        recoveries.find((r) => r.actionId === where.roundPlayerId_actionId.actionId) ?? null,
      create: async ({ data }: { data: { dayIndex: number; actionId: string; createdAt: Date; roundPlayerId: string } }) => {
        recoveries.push(data);
      },
    },
    accountCosmeticUnlock: {
      upsert: async ({ create }: { create: { key: string } }) => { unlocks.add(create.key); },
    },
  };
  return {
    db: { ...tx, $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient,
    stamps, recoveries, unlocks, round,
  };
}

describe('Round Roll Call Slice E bounded recovery', () => {
  it('keeps seven built-in missed days untouched and requires a genuine login', async () => {
    const h = harness([1,10,11]);
    const before = await RoundRollCallRecoveryService.status(h.db, h.round, 'p1', at(12));
    expect(before.eligible).toBe(true);
    expect(before.nextDayIndex).toBe(2);
    expect(before.used).toBe(0);
    const withinAllowance = harness([7,8,9,10,11]);
    const status = await RoundRollCallRecoveryService.status(withinAllowance.db, withinAllowance.round, 'p1', at(12));
    expect(status.eligible).toBe(false);
    expect(status.reason).toBe('allowance');
    const neverLoggedIn = harness([]);
    const noStamp = await RoundRollCallRecoveryService.status(neverLoggedIn.db, neverLoggedIn.round, 'p1', at(12));
    expect(noStamp.reason).toBe('genuine_stamp');
  });

  it('recovers only a completed past day, audits the player and replays the same UUID safely', async () => {
    const h = harness([1,10,11]);
    const actionId = '11111111-1111-4111-8111-111111111111';
    const result = await RoundRollCallRecoveryService.recover(h.db, 'r1', 'p1', 'a1', actionId, at(12));
    expect(result.recorded).toBe(true);
    expect(result.dayIndex).toBe(2);
    expect(h.stamps.get(2)?.source).toBe('RECOVERY');
    expect(h.recoveries).toHaveLength(1);
    const replay = await RoundRollCallRecoveryService.recover(h.db, 'r1', 'p1', 'a1', actionId, at(12));
    expect(replay.recorded).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(h.recoveries).toHaveLength(1);
    await expect(RoundRollCallRecoveryService.recover(
      h.db, 'r1', 'p1', 'a1', '22222222-2222-4222-8222-222222222222', at(12),
    )).rejects.toMatchObject({ code: 'ROUND_ROLL_CALL_RECOVERY_UNAVAILABLE' });
  });

  it('never recovers missed days before the account joined the round', async () => {
    const h = harness([10,11], { joinedAt: at(10) });
    const status = await RoundRollCallRecoveryService.status(h.db, h.round, 'p1', at(12));
    expect(status.reason).toBe('no_eligible_day');
  });

  it('permits at most two distinct recovered days, and only beyond the native allowance', async () => {
    const h = harness([1,11,12]);
    const first = await RoundRollCallRecoveryService.recover(h.db, 'r1', 'p1', 'a1', 'a', at(13));
    expect(first.dayIndex).toBe(2);
    // Another completed missing day has passed; the deficit is beyond 7 again.
    const second = await RoundRollCallRecoveryService.recover(h.db, 'r1', 'p1', 'a1', 'b', at(14));
    expect(second.dayIndex).toBe(3);
    const status = await RoundRollCallRecoveryService.status(h.db, h.round, 'p1', at(25));
    expect(status.used).toBe(2);
    expect(status.remaining).toBe(0);
    expect(status.reason).toBe('limit');
    await expect(RoundRollCallRecoveryService.recover(h.db, 'r1', 'p1', 'a1', 'c', at(25)))
      .rejects.toMatchObject({ code: 'ROUND_ROLL_CALL_RECOVERY_UNAVAILABLE' });
  });

  it('refuses paused/ended rounds and wrong accounts', async () => {
    const h = harness([1,10,11]);
    await expect(RoundRollCallRecoveryService.recover(h.db, 'r1', 'p1', 'other', 'x', at(12)))
      .rejects.toMatchObject({ code: 'NOT_IN_ROUND' });
    const paused = harness([9,10,11], { round: { ...ACTIVE_ROUND, pausedAt: at(11) } });
    expect((await RoundRollCallRecoveryService.status(paused.db, paused.round, 'p1', at(12))).reason).toBe('closed');
    await expect(RoundRollCallRecoveryService.recover(paused.db, 'r1', 'p1', 'a1', 'x', at(12)))
      .rejects.toMatchObject({ code: 'ROUND_ROLL_CALL_RECOVERY_UNAVAILABLE' });
  });

  it('anchors enrollment by the first real round stamp even after a five-day admin pause', async () => {
    const pausedRound = {
      ...ACTIVE_ROUND,
      endsAt: new Date(START.getTime() + 33 * DAY),
      pausedMinutesTotal: 5 * 24 * 60,
    } as Round;
    const h = harness([10,11], { round: pausedRound, joinedAt: at(15) });
    const status = await RoundRollCallRecoveryService.status(h.db, pausedRound, 'p1', at(18));
    expect(status.eligible).toBe(true);
    expect(status.nextDayIndex).toBe(12);
    const repaired = await RoundRollCallRecoveryService.recover(h.db, 'r1', 'p1', 'a1', 'paused', at(18));
    expect(repaired.dayIndex).toBe(12);
  });

  it('does not change round-length targets or grant final cosmetics before the required stamps', async () => {
    const h = harness([1,10,11]);
    await RoundRollCallRecoveryService.recover(h.db, 'r1', 'p1', 'a1', 'x', at(12));
    const view = await RoundRollCallService.view(h.db, h.round, 'p1', at(12));
    expect(view.stamps).toBe(4);
    expect(view.requiredStamps).toBe(21);
    expect(h.unlocks.size).toBe(0);
  });
});
