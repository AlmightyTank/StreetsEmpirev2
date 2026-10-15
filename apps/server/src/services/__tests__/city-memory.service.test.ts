import { describe, expect, it, vi } from 'vitest';
import { emitCityMemoryEvent, listVisibleCityMemory } from '../city-memory.service.js';

function makeDb(rows: any[] = []) {
  return {
    rows,
    cityMemoryEvent: {
      upsert: vi.fn(async ({ where, create }: any) => {
        let row = rows.find((candidate) => candidate.idempotencyKey === where.idempotencyKey);
        if (!row) {
          row = { id: `event-${rows.length + 1}`, ...create };
          rows.push(row);
        }
        return row;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return rows
          .filter((row) => !where?.roundId || row.roundId === where.roundId)
          .filter((row) => !where?.cityId || row.cityId === where.cityId)
          .sort((a, b) => b.happenedAt.getTime() - a.happenedAt.getTime());
      }),
    },
  } as any;
}

describe('2.0 city-memory', () => {
  it('emits a takeover event once per settle key', async () => {
    const db = makeDb();
    const input = {
      roundId: 'round-1',
      cityId: 'city-1',
      kind: 'takeover',
      actorRoundPlayerIds: ['winner-1', 'loser-1'],
      summary: { blocks: ['b1'], previousOwner: 'loser-1', nextOwner: 'winner-1' },
      idempotencyKey: 'turf-control-event:evt-1',
    };
    const first = await emitCityMemoryEvent(db, input);
    const second = await emitCityMemoryEvent(db, input);
    expect(first.id).toBe(second.id);
    expect(db.rows).toHaveLength(1);
    expect(db.cityMemoryEvent.upsert).toHaveBeenCalledTimes(2);
  });

  it('hides involved-only events from uninvolved viewers', async () => {
    const db = makeDb();
    await emitCityMemoryEvent(db, {
      roundId: 'round-1',
      cityId: 'city-1',
      kind: 'business_flip',
      visibility: 'involved-only',
      actorRoundPlayerIds: ['player-a'],
      idempotencyKey: 'business-flip:1',
    });
    const stranger = await listVisibleCityMemory(db, { roundId: 'round-1', viewerRoundPlayerIds: ['player-b'] });
    const insider = await listVisibleCityMemory(db, { roundId: 'round-1', viewerRoundPlayerIds: ['player-a'] });
    expect(stranger).toHaveLength(0);
    expect(insider).toHaveLength(1);
  });
});
