import { describe, expect, it } from 'vitest';
import type { PlayerVehicle } from '@prisma/client';
import { classicOgV25A } from '@streets/rulesets';
import { armorAdjustedDamage, modPercent, readRunVehicles, reserveRunVehicles, returnRunVehicles, selectRunVehicles, transferReadyVehicles } from '../individual-vehicles.service.js';

const row = (id: string, model: string, values: Record<string, unknown> = {}) => ({
  id, roundPlayerId: 'player', model, name: null, plate: null, condition: 100, mods: [], lookKey: null, origin: {}, stats: {}, status: 'READY', quantity: 1,
  createdAt: new Date(0), updatedAt: new Date(0), ...values,
}) as unknown as PlayerVehicle;

function vehicleDb(initial: PlayerVehicle[]) {
  const records = new Map(initial.map((vehicle) => [vehicle.id, { ...vehicle }]));
  let nextId = 0;
  return {
    records,
    playerSkill: { findMany: async () => [] },
    playerVehicle: {
      findMany: async ({ where }: any = {}) => [...records.values()].filter((vehicle) => (!where?.roundPlayerId || vehicle.roundPlayerId === where.roundPlayerId) && (!where?.status || vehicle.status === where.status)),
      groupBy: async () => [...new Set([...records.values()].map((vehicle) => vehicle.model))].map((model) => ({ model, _sum: { quantity: [...records.values()].filter((vehicle) => vehicle.model === model).reduce((sum, vehicle) => sum + vehicle.quantity, 0) } })),
      findUnique: async ({ where }: any) => records.get(where.id) ?? null,
      findFirst: async ({ where }: any) => { const current = records.get(where.id); return current && current.roundPlayerId === where.roundPlayerId && (!where.status || current.status === where.status) ? current : null; },
      updateMany: async ({ where, data }: any) => {
        const current = records.get(where.id);
        if (!current || (where.status && current.status !== where.status) || (where.quantity?.gte && current.quantity < where.quantity.gte)) return { count: 0 };
        const changed = { ...current, ...data, ...(data.quantity?.decrement ? { quantity: current.quantity - data.quantity.decrement } : {}) };
        records.set(where.id, changed);
        return { count: 1 };
      },
      update: async ({ where, data }: any) => { const changed = { ...records.get(where.id)!, ...data }; records.set(where.id, changed); return changed; },
      create: async ({ data }: any) => { const created = { ...row(`reserved-${++nextId}`, data.model, data), ...data }; records.set(created.id, created); return created; },
      delete: async ({ where }: any) => { records.delete(where.id); return {}; },
    },
    playerGun: { groupBy: async () => [], findMany: async () => [] },
    playerArmorySummary: { upsert: async () => ({}) },
  };
}

describe('individual run vehicles', () => {
  it('selects exact ready copies, reserves only those copies, and returns condition wear with per-vehicle status', async () => {
    const db = vehicleDb([row('stack', 'LOW_RIDER', { quantity: 3, mods: [{ key: 'ARMOR', tier: 3 }] }), row('away', 'VAN', { status: 'ON_RUN' })]);
    const selection = await selectRunVehicles(db as never, 'player', classicOgV25A, { LOW_RIDER: 2, SEDAN: 0, VAN: 0 });
    expect(selection?.loadout).toEqual({ LOW_RIDER: 2, SEDAN: 0, VAN: 0 });
    const reserved = await reserveRunVehicles(db as never, selection!);
    expect(reserved).toHaveLength(2);
    expect(db.records.get('stack')).toMatchObject({ quantity: 1, status: 'READY' });
    expect([...db.records.values()].filter((vehicle) => vehicle.status === 'ON_RUN')).toHaveLength(3);
    const returned = await returnRunVehicles(db as never, 'player', reserved, {
      damaged: { LOW_RIDER: 1, SEDAN: 0, VAN: 0 }, disabled: { LOW_RIDER: 0, SEDAN: 0, VAN: 0 },
    });
    expect(returned).toHaveLength(2);
    expect(returned.filter((vehicle) => vehicle.status === 'DAMAGED')).toHaveLength(1);
    expect(returned.every((vehicle) => vehicle.condition === 99)).toBe(true);
  });

  it('uses the best cargo-to-fee fleet and exposes vehicle mod effects', async () => {
    const db = vehicleDb([
      row('van', 'VAN', { mods: [{ key: 'CARGO', tier: 3 }, { key: 'FUEL_TANK', tier: 2 }] }),
      row('sedan', 'SEDAN'), row('low', 'LOW_RIDER'),
    ]);
    const selection = await selectRunVehicles(db as never, 'player', classicOgV25A, { LOW_RIDER: 1, SEDAN: 0, VAN: 0 }, undefined, true);
    expect(selection?.rows[0]?.row.id).toBe('sedan');
    const runItems = readRunVehicles([{ id: 'van', model: 'VAN', mods: [{ key: 'CARGO', tier: 3 }], condition: 100 } as never]);
    expect(modPercent(runItems[0]!, 'CARGO')).toBe(15);
  });

  it('keeps armor reduction deterministic for repeated settlement of the same trouble', () => {
    const before = { damaged: { LOW_RIDER: 0, SEDAN: 0, VAN: 0 }, disabled: { LOW_RIDER: 0, SEDAN: 0, VAN: 0 } };
    const after = { damaged: { LOW_RIDER: 1, SEDAN: 0, VAN: 0 }, disabled: { LOW_RIDER: 0, SEDAN: 0, VAN: 0 } };
    const items = [readRunVehicles([{ id: 'car', model: 'LOW_RIDER', mods: [{ key: 'ARMOR', tier: 3 }] } as never])[0]!];
    expect(armorAdjustedDamage('run-1', items, before, after, 'damaged')).toEqual(armorAdjustedDamage('run-1', items, before, after, 'damaged'));
  });

  it('recovers the attacker’s own hot vehicle before taking another ride and clears its hot status', async () => {
    const hot = row('own-hot', 'SEDAN', { roundPlayerId: 'holder', origin: { stolenFromRoundPlayerId: 'attacker', hotUntil: '2026-10-22T12:00:00.000Z', history: [] } });
    const other = row('other', 'LOW_RIDER', { roundPlayerId: 'holder' });
    const db = vehicleDb([hot, other]);
    const receipts = await transferReadyVehicles(db as never, 'holder', 'attacker', 1, new Date('2026-10-21T12:00:00.000Z'), () => 0.99);
    expect(receipts[0]).toMatchObject({ id: 'own-hot', recovered: true });
    expect(db.records.get('own-hot')).toMatchObject({ roundPlayerId: 'attacker', lookKey: null, origin: { kind: 'RECOVERED' } });
    expect(db.records.get('own-hot')?.origin).not.toHaveProperty('hotUntil');
  });
});
