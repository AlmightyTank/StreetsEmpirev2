import { describe, expect, it } from 'vitest';
import type { Db } from '../../utils/db.js';
import { QuestProgressService } from '../quest-progress.service.js';

type Row = {
  id: string;
  roundPlayerId: string;
  status: 'ACTIVE' | 'READY_TO_TURN_IN' | 'EXPIRED';
  objectiveProgress: unknown;
  bonusProgress: unknown;
  completedAt: Date | null;
  expiresAt: Date | null;
  questDefinition: {
    objectives: unknown;
    bonusObjectives: unknown;
  };
};

function fixture(rowOverrides: Partial<Row> = {}) {
  const row: Row = {
    id: 'pq-1',
    roundPlayerId: 'player-1',
    status: 'ACTIVE',
    objectiveProgress: {},
    bonusProgress: {},
    completedAt: null,
    expiresAt: null,
    questDefinition: {
      objectives: [
        { id: 'turns', kind: 'SPEND_TURNS', description: 'Scout 12 turns.', target: 12, params: { eventTypes: ['SCOUT'] } },
      ],
      bonusObjectives: [
        { id: 'recruit', kind: 'RECRUIT_CREW', description: 'Recruit someone.', target: 1, params: { eventTypes: ['SCOUT'] } },
      ],
    },
    ...rowOverrides,
  };

  const receipts = new Map<string, { id: string; applied: unknown }>();
  let receiptSequence = 0;

  let currentPlayerState = {
    cashCents: 100000n,
    turns: 20,
    payoutPercent: 50,
    whores: 5,
    thugs: 5,
    woundedThugs: 0,
    busyThugs: 0,
    postedThugs: 0,
    condoms: 100,
    medicine: 20,
    crack: 50,
    beer: 25,
    pistols: 5,
    shotguns: 0,
    tek9s: 0,
    ak47s: 0,
    lowRiders: 1,
    shotgunUnlocked: false,
    tek9Unlocked: false,
    ak47Unlocked: false,
    heat: 0,
    netWorthCents: 500000n,
    hideoutSafeRoomLevel: 0,
    hideoutLookoutsLevel: 0,
    hideoutWorkshopLevel: 0,
    hideoutBackOfficeLevel: 0,
    hideoutGarageLevel: 0,
    allianceId: null as string | null,
    city: { slug: 'new-york' },
  };

  const db = {
    $queryRaw: async () => [],
    roundPlayer: {
      findUnique: async () => currentPlayerState,
    },
    playerQuest: {
      findMany: async () => row.status === 'ACTIVE' || row.status === 'READY_TO_TURN_IN' ? [{ id: row.id }] : [],
      findUnique: async () => row,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row, data);
        return row;
      },
    },
    questProgressReceipt: {
      findUnique: async ({ where }: { where: { playerQuestId_sourceKey: { playerQuestId: string; sourceKey: string } } }) => {
        const key = `${where.playerQuestId_sourceKey.playerQuestId}:${where.playerQuestId_sourceKey.sourceKey}`;
        return receipts.get(key) ?? null;
      },
      create: async ({ data }: { data: { playerQuestId: string; sourceKey: string; applied: unknown } }) => {
        const key = `${data.playerQuestId}:${data.sourceKey}`;
        const value = { id: `receipt-${++receiptSequence}`, applied: data.applied };
        receipts.set(key, value);
        return value;
      },
    },
  } as unknown as Db;

  return {
    db,
    row,
    receipts,
    setPlayerState: (overrides: Partial<typeof currentPlayerState>) => {
      currentPlayerState = { ...currentPlayerState, ...overrides };
    },
  };
}

describe('QuestProgressService', () => {
  it('advances required and bonus objectives and readies the quest', async () => {
    const { db, row, receipts } = fixture();
    const at = new Date('2026-09-22T03:00:00Z');

    const result = await QuestProgressService.emit(db, row.roundPlayerId, {
      sourceKey: 'activity:a1',
      type: 'SCOUT',
      payload: { turns: 12, whores: 1, thugs: 0 },
      at,
    });

    expect(result).toMatchObject({ considered: 1, matched: 1, advanced: 1, readied: 1, duplicate: 0 });
    expect(row.status).toBe('READY_TO_TURN_IN');
    expect(row.completedAt).toEqual(at);
    expect(row.objectiveProgress).toEqual({
      turns: { current: 12, target: 12, completed: true },
    });
    expect(row.bonusProgress).toEqual({
      recruit: { current: 1, target: 1, completed: true },
    });
    expect(receipts.size).toBe(1);
  });

  it('does not apply the same source event twice', async () => {
    const { db, row } = fixture({
      questDefinition: {
        objectives: [
          { id: 'turns', kind: 'SPEND_TURNS', description: 'Scout 12 turns.', target: 12, params: { eventTypes: ['SCOUT'] } },
        ],
        bonusObjectives: [],
      },
    });

    const signal = { sourceKey: 'activity:same', type: 'SCOUT', payload: { turns: 5 } } as const;
    await QuestProgressService.emit(db, row.roundPlayerId, signal);
    const second = await QuestProgressService.emit(db, row.roundPlayerId, signal);

    expect(row.objectiveProgress).toEqual({
      turns: { current: 5, target: 12, completed: false },
    });
    expect(second.duplicate).toBe(1);
    expect(second.advanced).toBe(0);
  });

  it('ignores unrelated activity without writing a receipt', async () => {
    const { db, row, receipts } = fixture();
    const result = await QuestProgressService.emit(db, row.roundPlayerId, {
      sourceKey: 'activity:not-relevant',
      type: 'STORE_BUY',
      payload: { quantity: 100 },
    });

    expect(result.matched).toBe(0);
    expect(result.advanced).toBe(0);
    expect(receipts.size).toBe(0);
    expect(row.objectiveProgress).toEqual({});
  });

  it('expires a timed quest before applying a late event', async () => {
    const { db, row, receipts } = fixture({
      expiresAt: new Date('2026-09-22T02:59:00Z'),
    });

    const result = await QuestProgressService.emit(db, row.roundPlayerId, {
      sourceKey: 'activity:late',
      type: 'SCOUT',
      payload: { turns: 12 },
      at: new Date('2026-09-22T03:00:00Z'),
    });

    expect(row.status).toBe('EXPIRED');
    expect(result.expired).toBe(1);
    expect(result.advanced).toBe(0);
    expect(receipts.size).toBe(0);
  });

  it('keeps accepting bonus progress after required objectives are ready to turn in', async () => {
    const { db, row } = fixture({
      status: 'READY_TO_TURN_IN',
      completedAt: new Date('2026-09-22T02:00:00Z'),
      objectiveProgress: { turns: { current: 12, target: 12, completed: true } },
      bonusProgress: { recruit: { current: 0, target: 1, completed: false } },
    });

    const result = await QuestProgressService.emit(db, row.roundPlayerId, {
      sourceKey: 'activity:bonus',
      type: 'SCOUT',
      payload: { turns: 1, whores: 1, thugs: 0 },
    });

    expect(result.advanced).toBe(1);
    expect(result.readied).toBe(0);
    expect(row.status).toBe('READY_TO_TURN_IN');
    expect(row.bonusProgress).toEqual({
      recruit: { current: 1, target: 1, completed: true },
    });
  });

  it('tracks current-state requirements and reopens a quest if the state falls', async () => {
    const { db, row, setPlayerState } = fixture({
      questDefinition: {
        objectives: [
          { id: 'thugs', kind: 'STATE_AT_LEAST', description: 'Own 5 thugs.', target: 5, params: { field: 'thugs' } },
        ],
        bonusObjectives: [],
      },
    });

    const first = await QuestProgressService.emit(db, row.roundPlayerId, {
      sourceKey: 'activity:state-up',
      type: 'SCOUT',
      payload: {},
    });
    expect(first.readied).toBe(1);
    expect(row.status).toBe('READY_TO_TURN_IN');

    setPlayerState({ thugs: 3, pistols: 3, netWorthCents: 400000n });

    const second = await QuestProgressService.emit(db, row.roundPlayerId, {
      sourceKey: 'activity:state-down',
      type: 'RAID_DEFENSE',
      payload: { won: false },
    });

    expect(second.reopened).toBe(1);
    expect(row.status).toBe('ACTIVE');
    expect(row.completedAt).toBeNull();
    expect(row.objectiveProgress).toEqual({
      thugs: { current: 3, target: 5, completed: false },
    });
  });

});
