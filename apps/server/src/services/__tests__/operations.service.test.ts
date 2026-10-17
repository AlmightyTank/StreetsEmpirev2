import { describe, expect, it, vi } from 'vitest';
import { ActivityService } from '../activity.service.js';
import { OPERATION_SOURCES } from '../operation-catalog.js';
import { OperationRepairService } from '../operation-repair.service.js';
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
      { id: 'leader-1', roundId: 'round-1', publicPimpId: 1, displayName: 'Leader', cashCents: 100_000n, accountId: 'acct-1', allianceId: null as string | null, crack: 0 },
      { id: 'player-2', roundId: 'round-1', publicPimpId: 2, displayName: 'Wheel', cashCents: 0n, accountId: 'acct-2', allianceId: null as string | null, crack: 0 },
      { id: 'player-3', roundId: 'round-1', publicPimpId: 3, displayName: 'Muscle', cashCents: 0n, accountId: 'acct-3', allianceId: 'allied' as string | null, crack: 0 },
    ],
    round: {
      id: 'round-1',
      rulesetId: 'classic-og-v2.1-c',
      rulesetVersion: '2.1.0-C',
      pausedAt: null as Date | null,
      pausedMinutesTotal: 0,
      underworldOperationsEnabled: false,
    },
    ledger: [] as any[],
    memory: [] as any[],
    transitions: [] as any[],
    blocks: [] as any[],
    stocks: [] as any[],
    runs: [] as any[],
    wars: [] as any[],
    pushes: [] as any[],
    rumors: [] as any[],
    claims: [] as any[],
    grants: [] as any[],
    movements: [] as any[],
    legacy: [] as any[],
    products: [] as any[],
  };
  const matches = (row: any, where: any): boolean => {
    if (!where) return true;
    for (const [key, value] of Object.entries(where)) {
      if (key === 'OR') {
        if (!((value as any[]) ?? []).some((branch) => matches(row, branch))) return false;
        continue;
      }
      if (key === 'AND') {
        if (!((value as any[]) ?? []).every((branch) => matches(row, branch))) return false;
        continue;
      }
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        if ('gt' in (value as any) && !(row[key] > (value as any).gt)) return false;
        if ('gte' in (value as any) && !(row[key] >= (value as any).gte)) return false;
        if ('lte' in (value as any) && !(row[key] <= (value as any).lte)) return false;
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
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const row of state.operations) {
          if (where.id && row.id !== where.id) continue;
          if (typeof where.status === 'string' && row.status !== where.status) continue;
          if (where.status?.in && !where.status.in.includes(row.status)) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      }),
      findMany: vi.fn(async () => state.operations.filter((row) => matches(row, {}))),
    },
    operationTransition: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `tr-${state.transitions.length + 1}`, createdAt: new Date(), ...data };
        state.transitions.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: any) => state.transitions.filter((row) => matches(row, where))),
    },
    operationSourceClaim: {
      create: vi.fn(async ({ data }: any) => {
        if (state.claims.some((row) => row.roundId === data.roundId && row.sourceKind === data.sourceKind && row.sourceId === data.sourceId)) {
          throw { code: 'P2002' };
        }
        const row = { id: `claim-${state.claims.length + 1}`, ...data };
        state.claims.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const key = where.roundId_sourceKind_sourceId;
        return state.claims.find((row) => row.roundId === key.roundId && row.sourceKind === key.sourceKind && row.sourceId === key.sourceId) ?? null;
      }),
    },
    operationGrant: {
      create: vi.fn(async ({ data }: any) => {
        if (state.grants.some((row) => row.operationId === data.operationId && row.roundPlayerId === data.roundPlayerId && row.kind === data.kind)) {
          throw { code: 'P2002' };
        }
        state.grants.push(data);
        return data;
      }),
    },
    round: {
      findUnique: vi.fn(async () => state.round),
      update: vi.fn(async ({ data }: any) => Object.assign(state.round, data)),
    },
    playerBlock: {
      findFirst: vi.fn(async ({ where }: any) => state.blocks.find((row) => matches(row, where)) ?? null),
    },
    supplyStock: {
      findUnique: vi.fn(async ({ where }: any) => {
        const stock = state.stocks.find((row) => row.id === where.id);
        return stock ? {
          ...stock,
          warehouse: {
            roundPlayerId: stock.ownerId ?? 'leader-1',
            citySlug: stock.citySlug ?? 'vice-city',
          },
        } : null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.stocks.find((entry) => entry.id === where.id)!;
        if (data.quantity?.increment) row.quantity += data.quantity.increment;
        if (data.quantity?.decrement) row.quantity -= data.quantity.decrement;
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const row = state.stocks.find((entry) => entry.id === where.id);
        if (!row || (where.quantity?.gte !== undefined && row.quantity < where.quantity.gte)) return { count: 0 };
        if (data.quantity?.decrement) row.quantity -= data.quantity.decrement;
        return { count: 1 };
      }),
    },
    supplyMovement: {
      create: vi.fn(async ({ data }: any) => {
        if (state.movements.some((row) => row.roundPlayerId === data.roundPlayerId && row.requestKey === data.requestKey)) throw { code: 'P2002' };
        state.movements.push(data);
        return data;
      }),
    },
    run: {
      findUnique: vi.fn(async ({ where }: any) => state.runs.find((row) => row.id === where.id) ?? null),
    },
    blockWar: {
      findUnique: vi.fn(async ({ where }: any) => state.wars.find((row) => row.id === where.id) ?? null),
    },
    turfPush: {
      findUnique: vi.fn(async ({ where }: any) => state.pushes.find((row) => row.id === where.id) ?? null),
    },
    intelRumor: {
      findUnique: vi.fn(async ({ where }: any) => state.rumors.find((row) => row.id === where.id) ?? null),
    },
    legacyEntry: {
      findUnique: vi.fn(async ({ where }: any) => state.legacy.find((row) => row.idempotencyKey === where.idempotencyKey) ?? null),
      create: vi.fn(async ({ data }: any) => {
        if (state.legacy.some((row) => row.idempotencyKey === data.idempotencyKey)) throw { code: 'P2002' };
        state.legacy.push(data);
        return data;
      }),
    },
    playerProduct: {
      findMany: vi.fn(async () => state.products),
      upsert: vi.fn(async ({ create }: any) => {
        state.products.push(create);
        return create;
      }),
    },
    economyLedgerEntry: {
      create: vi.fn(async ({ data }: any) => {
        state.ledger.push(data);
        return data;
      }),
      findMany: vi.fn(async ({ where }: any) => state.ledger.filter((row) => matches(row, where))),
    },
    operationParticipant: {
      findMany: vi.fn(async ({ where }: any) => state.seats.filter((seat) => matches(seat, where))),
      findFirst: vi.fn(async ({ where }: any) => state.seats.find((seat) => matches(seat, where)) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        let seat = state.seats.find((entry) => entry.operationId === where.operationId_role.operationId && entry.role === where.operationId_role.role);
        if (!seat) {
          seat = { id: `seat-${state.seats.length + 1}`, createdAt: new Date(), ...create };
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
      create: vi.fn(async ({ data }: any) => {
        if (state.seats.some((seat) => seat.operationId === data.operationId && seat.role === data.role)) throw { code: 'P2002' };
        const seat = { id: `seat-${state.seats.length + 1}`, createdAt: new Date(), ...data };
        state.seats.push(seat);
        return seat;
      }),
      delete: vi.fn(async ({ where }: any) => {
        const index = state.seats.findIndex((seat) => seat.id === where.id);
        const [seat] = state.seats.splice(index, 1);
        return seat;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = state.seats.length;
        state.seats = state.seats.filter((seat) => !matches(seat, where));
        return { count: before - state.seats.length };
      }),
    },
    roundPlayer: {
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        const row = state.players.find((entry) => entry.id === where.id);
        if (!row) throw new Error('not found');
        return row;
      }),
      findFirst: vi.fn(async ({ where }: any) => state.players.find((entry) => matches(entry, where)) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.players.find((entry) => entry.id === where.id)!;
        if (data.cashCents?.increment !== undefined) row.cashCents += BigInt(data.cashCents.increment);
        if (data.cashCents?.decrement !== undefined) row.cashCents -= BigInt(data.cashCents.decrement);
        if (data.crack !== undefined) row.crack = data.crack;
        return row;
      }),
      findMany: vi.fn(async ({ where }: any) => state.players.filter((entry) => {
        if (where?.id?.in) return where.id.in.includes(entry.id);
        return matches(entry, where);
      })),
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
    state.seats[0]!.expiresAt = new Date(Date.now() - 1_000);
    await expect(OperationsService.answer(db, 'player-2', { operationId: started.id, accept: true }))
      .rejects.toMatchObject({ code: 'OPERATION_INVITE_MISSING' });
    const reopened = await OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'driver' });
    expect(reopened.roles.driver.status).toBe('LOCKED');
    expect(reopened.roles.driver.displayName).toBe('Leader');
  });

  it('rejects a second corner takeover inside the leader cooldown', async () => {
    const { db } = makeDb();
    await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', district: 'CASINO' });
    await expect(OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', district: 'LOW_RENT' }))
      .rejects.toMatchObject({ code: 'OPERATION_COOLDOWN' });
  });

  it('splits the $1,500 pot evenly and a second execute does not pay again', async () => {
    const { db, state } = makeDb();
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', district: 'CASINO' });
    await OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'driver' });
    await OperationsService.lock(db, 'player-2', { operationId: started.id, role: 'enforcer' });
    await OperationsService.lock(db, 'player-3', { operationId: started.id, role: 'intel' });
    const done = await OperationsService.execute(db, 'leader-1', { operationId: started.id });
    expect(done.report!.success).toBe(true);
    expect(done.report!.payoutCents).toBe(50_000);
    expect(state.ledger).toHaveLength(3);
    expect(state.ledger.every((row) => Number(row.amountCents) === 50_000)).toBe(true);
    const again = await OperationsService.execute(db, 'leader-1', { operationId: started.id });
    expect(again.report).toEqual(done.report);
    expect(state.ledger).toHaveLength(3);
    expect(again.catalogVersion).toBeNull();
    expect(again.label).toBe('Corner takeover');
    expect(again.roles.driver.status).toBe('LOCKED');
  });

  it('rejects a seat change after the operation is reported', async () => {
    const { db } = makeDb();
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', district: 'CASINO' });
    await OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'driver' });
    await OperationsService.lock(db, 'player-2', { operationId: started.id, role: 'enforcer' });
    await OperationsService.lock(db, 'player-3', { operationId: started.id, role: 'intel' });
    await OperationsService.execute(db, 'leader-1', { operationId: started.id });
    await expect(OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'driver' }))
      .rejects.toMatchObject({ code: 'OPERATION_BAD_STAGE' });
  });
});

function enableCatalog(state: { round: { rulesetId: string; rulesetVersion: string; underworldOperationsEnabled: boolean } }) {
  state.round.rulesetId = 'classic-og-v2.2-a';
  state.round.rulesetVersion = '2.2.0-A';
  state.round.underworldOperationsEnabled = true;
}

describe('2.2.0 underworld operations', () => {
  it('names existing source ids and refuses templates the round is not pinned to', async () => {
    expect(OPERATION_SOURCES).toEqual({
      supplyStock: 'supply-stock',
      shipment: 'run',
      blockWar: 'block-war',
      turfPush: 'turf-push',
      intelRumor: 'intel-rumor',
    });
    const { db, state } = makeDb();
    const before = state.players[0]!.cashCents;
    await expect(OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: 'stock-1' }))
      .rejects.toMatchObject({ code: 'OPERATION_UNKNOWN_TEMPLATE' });
    expect(state.players[0]!.cashCents).toBe(before);
    expect(state.operations).toHaveLength(0);
  });

  it('refuses the four new templates while the flag is off', async () => {
    const { db, state } = makeDb();
    state.round.rulesetId = 'classic-og-v2.2-a';
    state.round.rulesetVersion = '2.2.0-A';
    for (const template of ['STASH_RECOVERY', 'CONVOY_PROTECTION', 'BLOCK_DEFENSE', 'BIG_SCORE'] as const) {
      await expect(OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template, supplyStockId: 'stock-1', runId: 'run-1', escort: 1, routeRisk: 'LOW', threatKind: 'block-war', threatId: 'war-1' }))
        .rejects.toMatchObject({ code: 'OPERATION_FLAG_OFF' });
    }
    expect(state.operations).toHaveLength(0);
  });

  it('recovers a stash once, including a second execute and a second operation', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    state.stocks.push({ id: 'stock-1', warehouseId: 'wh-1', productKey: 'CRACK', quantity: 5 });
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: 'stock-1' });
    expect(started.bands!.success.payoutCents).toBe(30_000);
    expect(started.catalogVersion).toBe('2.2.0-A');
    const ready = await OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'runner' });
    expect(ready.status).toBe('READY');
    vi.mocked(ActivityService.log).mockClear();
    const done = await OperationsService.execute(db, 'leader-1', { operationId: started.id });
    expect(done.report!.band).toBe('success');
    expect(ActivityService.log).toHaveBeenCalledTimes(1);
    expect(state.stocks[0]!.quantity).toBe(0);
    expect(state.players[0]!.crack).toBe(5);
    expect(state.movements).toHaveLength(1);
    const again = await OperationsService.execute(db, 'leader-1', { operationId: started.id });
    expect(again.report!.totalPayoutCents).toBe(done.report!.totalPayoutCents);
    expect(state.stocks[0]!.quantity).toBe(0);
    expect(state.players[0]!.crack).toBe(5);
    state.operations[0]!.createdAt = new Date(Date.now() - 48 * 3_600_000);
    state.stocks[0]!.quantity = 5;
    const second = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: 'stock-1' });
    await OperationsService.lock(db, 'leader-1', { operationId: second.id, role: 'runner' });
    const missed = await OperationsService.execute(db, 'leader-1', { operationId: second.id });
    expect(missed.report!.band).toBe('failure');
    expect(state.players[0]!.crack).toBe(5);
    expect(state.movements).toHaveLength(1);
  });

  it('keeps stock put when recovery expires or the flag drops mid-job', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    state.stocks.push({ id: 'stock-1', warehouseId: 'wh-1', productKey: 'CRACK', quantity: 5 });
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: 'stock-1' });
    state.round.underworldOperationsEnabled = false;
    await OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'runner' });
    state.operations[0]!.createdAt = new Date(Date.now() - 48 * 3_600_000);
    const expired = await OperationsService.execute(db, 'leader-1', { operationId: started.id });
    expect(expired.status).toBe('EXPIRED');
    expect(state.stocks[0]!.quantity).toBe(5);
    expect(state.players[0]!.crack).toBe(0);
  });

  it('rejects a second claim on the same seat', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    state.stocks.push({ id: 'stock-1', warehouseId: 'wh-1', productKey: 'CRACK', quantity: 5 });
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: 'stock-1' });
    const raced = await Promise.allSettled([
      OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'runner' }),
      OperationsService.lock(db, 'player-2', { operationId: started.id, role: 'runner' }),
    ]);
    expect(raced.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(raced.filter((result) => result.status === 'rejected').every((result) => (result.reason as { code?: string }).code === 'OPERATION_ROLE_TAKEN')).toBe(true);
    expect(state.seats.filter((seat) => seat.role === 'runner' && (seat.status === 'LOCKED' || seat.status === 'ACCEPTED'))).toHaveLength(1);
  });

  it('releases a seat, cancels with a refund, and will not cancel a receipt', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    const before = state.players[0]!.cashCents;
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'BIG_SCORE' });
    expect(state.players[0]!.cashCents).toBe(before - 5_000n);
    await OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'intel' });
    const released = await OperationsService.release(db, 'leader-1', { operationId: started.id, role: 'intel' });
    expect(released.seats.find((seat) => seat.role === 'intel')!.status).toBe('OPEN');
    const cancelled = await OperationsService.cancel(db, 'leader-1', { operationId: started.id });
    expect(cancelled.status).toBe('CANCELLED');
    expect(state.players[0]!.cashCents).toBe(before);
    state.operations[0]!.status = 'REPORTED';
    state.operations[0]!.report = { success: false, stages: [], payoutCents: 0 };
    await expect(OperationsService.cancel(db, 'leader-1', { operationId: started.id }))
      .rejects.toMatchObject({ code: 'OPERATION_BAD_STAGE' });
    expect(state.ledger.filter((row) => row.source === 'OPERATION_PAYOUT')).toHaveLength(0);
  });

  it('blocks invites, keeps alliance seats optional, and lets a solo player finish', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    state.blocks.push({ id: 'block-1', blockerAccountId: 'acct-2', blockedAccountId: 'acct-1' });
    state.stocks.push({ id: 'stock-1', warehouseId: 'wh-1', productKey: 'CRACK', quantity: 5 });
    const stash = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: 'stock-1' });
    vi.mocked(ActivityService.log).mockClear();
    await expect(OperationsService.invite(db, 'leader-1', { operationId: stash.id, role: 'runner', targetPublicPimpId: 2 }))
      .rejects.toMatchObject({ code: 'OPERATION_BLOCKED' });
    expect(ActivityService.log).not.toHaveBeenCalled();
    state.wars.push({ id: 'war-1', roundId: 'round-1', status: 'SIEGE', defenderId: 'leader-1', attackerId: 'player-2' });
    const defense = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'BLOCK_DEFENSE', threatKind: 'block-war', threatId: 'war-1' });
    await expect(OperationsService.lock(db, 'player-2', { operationId: defense.id, role: 'enforcer' }))
      .rejects.toMatchObject({ code: 'OPERATION_ALLIANCE' });
    state.players[0]!.allianceId = 'allied';
    await OperationsService.lock(db, 'player-3', { operationId: defense.id, role: 'enforcer' });
    const solo = await OperationsService.lock(db, 'leader-1', { operationId: stash.id, role: 'runner' });
    expect(solo.status).toBe('READY');
    const done = await OperationsService.execute(db, 'leader-1', { operationId: stash.id });
    expect(done.report!.band).toBe('success');
    expect(state.players[0]!.allianceId).toBe('allied');
  });

  it('does not burn an invite while the round is paused', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    state.runs.push({ id: 'run-1', status: 'ACTIVE', roundPlayer: { roundId: 'round-1' } });
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'CONVOY_PROTECTION', runId: 'run-1', escort: 2, routeRisk: 'HIGH' });
    vi.mocked(ActivityService.log).mockClear();
    const ledgerBefore = state.ledger.length;
    await OperationsService.invite(db, 'leader-1', { operationId: started.id, role: 'escort', targetPublicPimpId: 2 });
    expect(ActivityService.log).toHaveBeenCalledTimes(1);
    state.seats[0]!.expiresAt = new Date(Date.now() - 3_600_000);
    state.round.pausedAt = new Date(Date.now() - 48 * 3_600_000);
    const answered = await OperationsService.answer(db, 'player-2', { operationId: started.id, accept: true });
    expect(answered.seats.find((seat) => seat.role === 'escort')!.status).toBe('ACCEPTED');
    expect(state.ledger).toHaveLength(ledgerBefore);
    expect(ActivityService.log).toHaveBeenCalledTimes(1);
  });

  it('cites a settled shipment and a live threat once, without a second cargo or threat reward', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    state.runs.push({ id: 'run-1', status: 'RETURNED', roundPlayer: { roundId: 'round-1' } });
    const convoy = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'CONVOY_PROTECTION', runId: 'run-1', escort: 3, routeRisk: 'BALANCED' });
    await OperationsService.lock(db, 'leader-1', { operationId: convoy.id, role: 'driver' });
    await OperationsService.lock(db, 'player-2', { operationId: convoy.id, role: 'escort' });
    const first = await OperationsService.execute(db, 'leader-1', { operationId: convoy.id });
    expect(first.report!.source).toMatchObject({ kind: 'run', id: 'run-1', escort: 3, routeRisk: 'BALANCED' });
    expect(first.report!.totalPayoutCents).toBeLessThanOrEqual(40_000);
    state.operations[0]!.createdAt = new Date(Date.now() - 48 * 3_600_000);
    const copy = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'CONVOY_PROTECTION', runId: 'run-1', escort: 1, routeRisk: 'LOW' });
    await OperationsService.lock(db, 'leader-1', { operationId: copy.id, role: 'driver' });
    const second = await OperationsService.execute(db, 'leader-1', { operationId: copy.id });
    expect(second.report!.band).toBe('failure');
    expect(second.report!.source).toBeNull();
    state.wars.push({ id: 'war-1', roundId: 'round-1', status: 'OPENING', defenderId: 'leader-1', attackerId: 'player-2' });
    await expect(OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'BLOCK_DEFENSE' }))
      .rejects.toMatchObject({ code: 'OPERATION_NO_THREAT' });
    const defense = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'BLOCK_DEFENSE', threatKind: 'block-war', threatId: 'war-1' });
    await OperationsService.lock(db, 'leader-1', { operationId: defense.id, role: 'defender' });
    const held = await OperationsService.execute(db, 'leader-1', { operationId: defense.id });
    expect(held.report!.source).toMatchObject({ kind: 'block-war', id: 'war-1' });
    expect(held.report!.totalPayoutCents).toBeLessThanOrEqual(25_000);
  });

  it('ignores a late window cite and pays a partial band inside the snapshot', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    state.rumors.push({ id: 'rumor-1', roundId: 'round-1' });
    const score = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'BIG_SCORE' });
    await OperationsService.lock(db, 'leader-1', { operationId: score.id, role: 'intel' });
    await OperationsService.cite(db, 'leader-1', { operationId: score.id, windowKey: 'intel', sourceKind: 'intel-rumor', sourceId: 'rumor-1' });
    const late = await OperationsService.cite(db, 'leader-1', { operationId: score.id, windowKey: 'intel', sourceKind: 'intel-rumor', sourceId: 'rumor-1' });
    expect(late.checklist.filter((item) => item.key === 'intel' && item.done)).toHaveLength(1);
    expect(late.checklist.find((item) => item.key === 'intel')!.sourceKinds).toEqual(['intel-rumor']);
    expect(late.canCite).toBe(true);
    const partial = await OperationsService.execute(db, 'leader-1', { operationId: score.id });
    expect(partial.report!.band).toBe('partial');
    expect(partial.report!.totalPayoutCents).toBe(4_000);
    expect(state.legacy).toHaveLength(0);
    const ledger = state.ledger.filter((row) => row.source === 'OPERATION_PAYOUT');
    expect(ledger.reduce((sum, row) => sum + Number(row.amountCents), 0)).toBe(partial.report!.totalPayoutCents);
  });

  it('grants The Big Score milestone once', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    state.rumors.push({ id: 'rumor-1', roundId: 'round-1' });
    state.runs.push({ id: 'run-9', status: 'RETURNED', roundPlayer: { roundId: 'round-1' } });
    state.pushes.push({ id: 'push-1', roundId: 'round-1', status: 'PENDING', defenderId: 'leader-1' });
    const score = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'BIG_SCORE' });
    await OperationsService.lock(db, 'leader-1', { operationId: score.id, role: 'intel' });
    await OperationsService.cite(db, 'leader-1', { operationId: score.id, windowKey: 'intel', sourceKind: 'intel-rumor', sourceId: 'rumor-1' });
    await OperationsService.cite(db, 'leader-1', { operationId: score.id, windowKey: 'prep', sourceKind: 'run', sourceId: 'run-9' });
    await OperationsService.cite(db, 'leader-1', { operationId: score.id, windowKey: 'action', sourceKind: 'turf-push', sourceId: 'push-1' });
    const done = await OperationsService.execute(db, 'leader-1', { operationId: score.id });
    expect(done.report!.band).toBe('success');
    expect(state.legacy).toHaveLength(1);
    expect(state.legacy[0].idempotencyKey).toBe('operation:op-1:milestone:acct-1');
    await OperationsService.execute(db, 'leader-1', { operationId: score.id });
    expect(state.legacy).toHaveLength(1);
  });

  it('does not farm a repeated failure', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    state.stocks.push({ id: 'stock-1', warehouseId: 'wh-1', productKey: 'CRACK', quantity: 5 });
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: 'stock-1' });
    await OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'runner' });
    state.stocks[0]!.quantity = 0;
    const failed = await OperationsService.execute(db, 'leader-1', { operationId: started.id });
    expect(failed.report!.band).toBe('failure');
    expect(failed.report!.totalPayoutCents).toBe(0);
    state.operations[0]!.createdAt = new Date(Date.now() - 48 * 3_600_000);
    state.stocks[0]!.quantity = 5;
    const again = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: 'stock-1' });
    await OperationsService.lock(db, 'leader-1', { operationId: again.id, role: 'runner' });
    state.stocks[0]!.quantity = 0;
    await OperationsService.execute(db, 'leader-1', { operationId: again.id });
    expect(state.ledger.filter((row) => row.source === 'OPERATION_PAYOUT')).toHaveLength(0);
    expect(state.players[0]!.crack).toBe(0);
  });

  it('stops invite floods and records a capped grant', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    state.runs.push({ id: 'run-1', status: 'ACTIVE', roundPlayer: { roundId: 'round-1' } });
    for (let index = 0; index < 4; index += 1) {
      const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'CONVOY_PROTECTION', runId: 'run-1', escort: 1, routeRisk: 'LOW' });
      state.operations[state.operations.length - 1].createdAt = new Date(Date.now() - 48 * 3_600_000);
      await OperationsService.invite(db, 'leader-1', { operationId: started.id, role: 'escort', targetPublicPimpId: 2 });
    }
    const extra = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'CONVOY_PROTECTION', runId: 'run-1', escort: 1, routeRisk: 'LOW' });
    await expect(OperationsService.invite(db, 'leader-1', { operationId: extra.id, role: 'escort', targetPublicPimpId: 2 }))
      .rejects.toMatchObject({ code: 'OPERATION_COLLUSION' });
    state.stocks.push({ id: 'stock-1', warehouseId: 'wh-1', productKey: 'CRACK', quantity: 5 });
    const stash = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: 'stock-1' });
    await OperationsService.lock(db, 'leader-1', { operationId: stash.id, role: 'runner' });
    const paid = await OperationsService.execute(db, 'leader-1', { operationId: stash.id });
    expect(paid.report!.capApplied).toBe(false);
    state.operations.find((row) => row.id === stash.id).createdAt = new Date(Date.now() - 48 * 3_600_000);
    state.stocks.push({ id: 'stock-2', warehouseId: 'wh-1', productKey: 'CRACK', quantity: 5 });
    const capped = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: 'stock-2' });
    await OperationsService.lock(db, 'leader-1', { operationId: capped.id, role: 'runner' });
    const limited = await OperationsService.execute(db, 'leader-1', { operationId: capped.id });
    expect(limited.report!.capApplied).toBe(true);
    expect(limited.report!.totalPayoutCents).toBe(0);
  });

  it('repairs from the transition history and does not repay a receipt', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    const score = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'BIG_SCORE' });
    const history = await OperationRepairService.history(db, score.id);
    expect(history.length).toBeGreaterThan(0);
    expect(history.some((row) => row.toStatus === 'CREW_LOCK')).toBe(true);
    const finished = await OperationRepairService.repair(db, score.id, 'finish');
    expect(finished.report!.band).toBe('failure');
    expect(finished.report!.totalPayoutCents).toBe(0);
    const payouts = state.ledger.filter((row) => row.source === 'OPERATION_PAYOUT').length;
    const again = await OperationRepairService.repair(db, score.id, 'finish');
    expect(again.report).toEqual(finished.report);
    const expired = await OperationRepairService.repair(db, score.id, 'expire');
    const cancelled = await OperationRepairService.repair(db, score.id, 'cancel');
    expect(expired.status).toBe('REPORTED');
    expect(cancelled.status).toBe('REPORTED');
    expect(state.ledger.filter((row) => row.source === 'OPERATION_PAYOUT')).toHaveLength(payouts);
  });

  it('settles many duplicate executes without cloning stock', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    state.stocks.push({ id: 'stock-1', warehouseId: 'wh-1', productKey: 'CRACK', quantity: 5 });
    const started = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: 'stock-1' });
    await OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'runner' });
    const results = await Promise.allSettled(Array.from({ length: 25 }, () => OperationsService.execute(db, 'leader-1', { operationId: started.id })));
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    const quiet = await OperationsService.execute(db, 'leader-1', { operationId: started.id });
    expect(quiet.status).toBe('REPORTED');
    expect(state.stocks[0]!.quantity).toBe(0);
    expect(state.players[0]!.crack).toBe(5);
    expect(state.movements).toHaveLength(1);
    expect(state.grants.filter((row) => row.kind === 'CASH')).toHaveLength(1);
    state.round.underworldOperationsEnabled = false;
    const cancelled = await OperationsService.start(db, 'leader-1', { citySlug: 'vice-city', template: 'BIG_SCORE' }).catch((error) => error);
    expect(cancelled.code).toBe('OPERATION_FLAG_OFF');
    await OperationRepairService.setFlag(db, 'round-1', true);
    expect(state.round.underworldOperationsEnabled).toBe(true);
  });
  it('rejects foreign, wrong-city, and wrong-product stash IDs without moving inventory', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    const attempt = (stockId: string) => OperationsService.start(db, 'leader-1', {
      citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: stockId,
    });
    state.stocks.push(
      { id: 'foreign', warehouseId: 'wh-2', ownerId: 'player-2', productKey: 'CRACK', quantity: 5 },
      { id: 'remote', warehouseId: 'wh-3', ownerId: 'leader-1', citySlug: 'elsewhere', productKey: 'CRACK', quantity: 5 },
      { id: 'wrong-product', warehouseId: 'wh-1', ownerId: 'leader-1', productKey: 'BEER', quantity: 5 },
    );
    for (const id of ['foreign', 'remote', 'wrong-product']) {
      await expect(attempt(id)).rejects.toMatchObject({ code: 'OPERATION_STOCK_SHORT' });
    }
    expect(state.operations).toHaveLength(0);
    expect(state.stocks.every((stock) => stock.quantity === 5)).toBe(true);
    expect(state.movements).toHaveLength(0);
    expect(state.ledger).toHaveLength(0);
  });

  it('rechecks stash ownership when executing, even after a valid operation started', async () => {
    const { db, state } = makeDb();
    enableCatalog(state);
    state.stocks.push({ id: 'stock-1', warehouseId: 'wh-1', ownerId: 'leader-1', productKey: 'CRACK', quantity: 5 });
    const started = await OperationsService.start(db, 'leader-1', {
      citySlug: 'vice-city', template: 'STASH_RECOVERY', supplyStockId: 'stock-1',
    });
    await OperationsService.lock(db, 'leader-1', { operationId: started.id, role: 'runner' });
    state.stocks[0]!.ownerId = 'player-2';
    await OperationsService.execute(db, 'leader-1', { operationId: started.id });
    expect(state.stocks[0]!.quantity).toBe(5);
    expect(state.players[0]!.crack).toBe(0);
    expect(state.movements).toHaveLength(0);
  });

});
