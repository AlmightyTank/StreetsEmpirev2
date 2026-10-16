import { describe, expect, it, vi } from 'vitest';
import { OperationsService } from '../operations.service.js';

vi.mock('../activity.service.js', () => ({
  ActivityService: {
    log: vi.fn(async () => ({ id: 'activity-1' })),
  },
}));

function makeDb() {
  const state = {
    operations: [] as any[],
    seats: [] as any[],
    players: [
      { id: 'leader-1', roundId: 'round-1', publicPimpId: 1, displayName: 'Leader', cashCents: 0n },
      { id: 'player-2', roundId: 'round-1', publicPimpId: 2, displayName: 'Wheel', cashCents: 0n },
      { id: 'player-3', roundId: 'round-1', publicPimpId: 3, displayName: 'Muscle', cashCents: 0n },
    ],
    ledger: [] as any[],
    memory: [] as any[],
  };
  const matches = (row: any, where: any): boolean => {
    if (!where) return true;
    for (const [key, value] of Object.entries(where)) {
      if (key === 'OR' || key === 'AND') continue;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if ('gt' in (value as any) && !(row[key] > (value as any).gt)) return false;
        if ('in' in (value as any) && !(value as any).in.includes(row[key])) return false;
        continue;
      }
      if (row[key] !== value) return false;
    }
    return true;
  };
  const db = {
    operation: {
      create: vi.fn(async ({ data, include }: any) => {
        const row = { id: `op-${state.operations.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data, city: { slug: 'vice-city', name: 'Vice City' } };
        state.operations.push(row);
        return attach(row);
      }),
      findFirst: vi.fn(async ({ where }: any) => state.operations.find((row) => matches(row, where)) ?? null),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        const row = state.operations.find((entry) => entry.id === where.id);
        if (!row) throw new Error('not found');
        return attach(row);
      }),
      update: vi.fn(async ({ where, data, include }: any) => {
        const row = state.operations.find((entry) => entry.id === where.id)!;
        Object.assign(row, data);
        return attach(row);
      }),
      findMany: vi.fn(async () => []),
    },
    operationParticipant: {
      findMany: vi.fn(async ({ where }: any) => state.seats.filter((seat) => matches(seat, where))),
      findFirst: vi.fn(async ({ where }: any) => state.seats.find((seat) => matches(seat, where)) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        let seat = state.seats.find((entry) => entry.operationId === where.operationId_role.operationId && entry.role === where.operationId_role.role);
        if (!seat) {
          seat = { id: `seat-${state.seats.length + 1}`, ...create };
          state.seats.push(seat);
        } else Object.assign(seat, update);
        return seat;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const seat = state.seats.find((entry) => entry.id === where.id)!;
        Object.assign(seat, data);
        return seat;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const seat of state.seats) {
          if (!matches(seat, where)) continue;
          if (where.expiresAt?.lte && !(seat.expiresAt <= where.expiresAt.lte)) continue;
          Object.assign(seat, data);
          count += 1;
        }
        return { count };
      }),
    },
    roundPlayer: {
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        const row = state.players.find((entry) => entry.id === where.id);
        if (!row) throw new Error('not found');
        return row;
      }),
      findFirst: vi.fn(async ({ where }: any) => state.players.find((entry) => matches(entry, where)) ?? null),
      findMany: vi.fn(async ({ where }: any) => state.players.filter((entry) => matches(entry, where))),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.players.find((entry) => entry.id === where.id)!;
        if (data.cashCents?.increment !== undefined) row.cashCents += BigInt(data.cashCents.increment);
        return row;
      }),
    },
    city: {
      findUnique: vi.fn(async () => ({ id: 'city-1', slug: 'vice-city', name: 'Vice City' })),
    },
    cityMemoryEvent: {
      upsert: vi.fn(async ({ create }: any) => {
        const row = { id: `mem-${state.memory.length + 1}`, ...create };
        state.memory.push(row);
        return row;
      }),
    },
    economyLedgerEntry: {
      create: vi.fn(async ({ data }: any) => {
        state.ledger.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (cb: any) => cb(db)),
  } as any;
  function attach(row: any) {
    return {
      ...row,
      city: { slug: 'vice-city', name: 'Vice City' },
      participants: state.seats
        .filter((seat) => seat.operationId === row.id)
        .map((seat) => ({ ...seat, roundPlayer: { id: seat.roundPlayerId, displayName: state.players.find((p) => p.id === seat.roundPlayerId)?.displayName ?? '?' } })),
    };
  }
  return { db, state };
}

describe('2.0 criminal-operations', () => {
  it('runs intel -> crew lock -> ready -> executing -> reported', async () => {
    const { db, state } = makeDb();
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', district: 'CASINO' });
    expect(started.status).toBe('CREW_LOCK');
    await OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'driver' });
    await OperationsService.lock(db, 'player-2', { operationId: started.id, role: 'enforcer' });
    const ready = await OperationsService.lock(db, 'player-3', { operationId: started.id, role: 'intel' });
    expect(ready.status).toBe('READY');
    const done = await OperationsService.execute(db, 'leader-1', { operationId: started.id });
    expect(done.status).toBe('REPORTED');
    expect(done.report).not.toBeNull();
    expect(done.report!.stages).toHaveLength(4);
    expect(done.report!.stages.every((stage) => !stage.detail.includes('nobody showed'))).toBe(true);
    expect(done.report!.stages.some((stage) => stage.wentWrong)).toBe(true);
    expect(done.report!.stages.some((stage) => !stage.wentWrong)).toBe(true);
    expect(state.memory).toHaveLength(1);
    expect(state.memory[0].kind).toBe('operation_complete');
  });

  it('rejects executing before the crew is locked', async () => {
    const { db } = makeDb();
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', district: 'CASINO' });
    await expect(OperationsService.execute(db, 'leader-1', { operationId: started.id })).rejects.toMatchObject({ code: 'OPERATION_NOT_READY' });
  });

  it('supports async co-op invites with accept', async () => {
    const { db } = makeDb();
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', district: 'CASINO' });
    await OperationsService.invite(db, 'leader-1', { operationId: started.id, role: 'driver', targetPublicPimpId: 2 });
    const answered = await OperationsService.answer(db, 'player-2', { operationId: started.id, accept: true });
    expect(answered.roles.driver.status).toBe('ACCEPTED');
    expect(answered.roles.driver.displayName).toBe('Wheel');
  });

  it('does not count a pending invite as a ready crew member', async () => {
    const { db } = makeDb();
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', district: 'CASINO' });
    await OperationsService.invite(db, 'leader-1', { operationId: started.id, role: 'driver', targetPublicPimpId: 2 });
    await OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'enforcer' });
    const waiting = await OperationsService.lock(db, 'player-3', { operationId: started.id, role: 'intel' });
    expect(waiting.status).toBe('CREW_LOCK');
    const ready = await OperationsService.answer(db, 'player-2', { operationId: started.id, accept: true });
    expect(ready.status).toBe('READY');
  });

  it('expires an unanswered invite and opens the role again', async () => {
    const { db, state } = makeDb();
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', district: 'CASINO' });
    await OperationsService.invite(db, 'leader-1', { operationId: started.id, role: 'driver', targetPublicPimpId: 2 });
    state.seats[0].expiresAt = new Date(Date.now() - 1_000);
    await expect(OperationsService.answer(db, 'player-2', { operationId: started.id, accept: true }))
      .rejects.toMatchObject({ code: 'OPERATION_INVITE_MISSING' });
    const reopened = await OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'driver' });
    expect(reopened.roles.driver.status).toBe('LOCKED');
    expect(reopened.roles.driver.displayName).toBe('Leader');
  });
});
