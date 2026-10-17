import { describe, expect, it } from 'vitest';
import type { PrismaClient, Round } from '@prisma/client';
import { RoundRollCallService } from '../round-roll-call.service.js';

const START = new Date('2026-10-01T18:00:00Z');
const HOUR = 3_600_000;
const DAY = 86_400_000;
const round = { id: 'r1', startsAt: START, endsAt: new Date(START.getTime() + 28 * DAY), status: 'ACTIVE' } as Round;

function database(playerExists = true) {
  const days = new Set<number>();
  const unlocked = new Set<string>();
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray) => sql.join('').includes('RoundPlayer') && playerExists ? [{ id: 'p1' }] : [],
    round: { findUnique: async () => round },
    roundPlayer: { findUniqueOrThrow: async () => ({ accountId: 'a1' }) },
    accountCosmeticUnlock: { upsert: async ({ create }: { create: { key: string } }) => { unlocked.add(create.key); } },
    roundLoginCheckIn: {
      findMany: async () => [...days].map((dayIndex) => ({ dayIndex })),
      count: async () => days.size,
      createMany: async ({ data }: { data: { dayIndex: number }[] }) => {
        const day = data[0]!.dayIndex;
        const count = days.has(day) ? 0 : 1;
        days.add(day);
        return { count };
      },
    },
  };
  return { db: { ...tx, $transaction: (fn: (transaction: unknown) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient, days, unlocked };
}

describe('round roll call check-ins', () => {
  it('is idempotent and retains progress despite a skipped day', async () => {
    const { db } = database();
    const first = await RoundRollCallService.checkIn(db, 'r1', 'p1', new Date(START.getTime() + HOUR));
    const retry = await RoundRollCallService.checkIn(db, 'r1', 'p1', new Date(START.getTime() + 2 * HOUR));
    await RoundRollCallService.checkIn(db, 'r1', 'p1', new Date(START.getTime() + 2 * DAY + HOUR));
    const view = await RoundRollCallService.view(db, round, 'p1', new Date(START.getTime() + 3 * DAY));
    expect(first.recorded).toBe(true);
    expect(retry.recorded).toBe(false);
    expect(view.stamps).toBe(2);
    expect(view.missedCompletedDays).toBe(1);
    expect(view.allowanceRemaining).toBe(6);
  });
  it('checks round membership under the player row lock before recording a stamp', async () => {
    const { db } = database();
    const first = await RoundRollCallService.checkIn(db, 'r1', 'p1', new Date(START.getTime() + HOUR));
    expect(first.recorded).toBe(true);
    // An unknown player must not gain a stamp via a forged call.
    const missing = database(false);
    await expect(RoundRollCallService.checkIn(missing.db, 'r1', 'p1', new Date(START.getTime() + HOUR)))
      .rejects.toMatchObject({ code: 'NOT_IN_ROUND' });
    expect(missing.days.size).toBe(0);
  });

  it('can finish on round day 28 after skipping the first seven days', async () => {
    const { db, unlocked } = database();
    for (let day = 8; day <= 28; day++) {
      const now = new Date(START.getTime() + (day - 1) * DAY + HOUR);
      await RoundRollCallService.checkIn(db, 'r1', 'p1', now);
    }
    const result = await RoundRollCallService.view(db, round, 'p1', new Date(START.getTime() + 27 * DAY + HOUR));
    expect(result.stamps).toBe(21);
    expect(result.completed).toBe(true);
    expect([...unlocked].sort()).toEqual(['round-roll-call-obsidian-signal-crew', 'round-roll-call-obsidian-signal-theme']);
    expect(result.allowanceRemaining).toBe(0);
    const extra = await RoundRollCallService.checkIn(db, 'r1', 'p1', new Date(START.getTime() + 27 * DAY + 2 * HOUR));
    expect(extra.recorded).toBe(false);
    expect(unlocked.size).toBe(2);
  });

});
