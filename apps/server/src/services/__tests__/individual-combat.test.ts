import { describe, expect, it } from 'vitest';
import type { PlayerGun } from '@prisma/client';
import { classicOgV25A } from '@streets/rulesets';
import { IndividualItemsService } from '../individual-items.service.js';
import { lootIndividualGun, planIndividualCombat, releaseReservedIndividualGuns, settleReservedIndividualGuns } from '../individual-combat.service.js';

const row = (id: string, model: string, values: Record<string, unknown> = {}) => ({
  id, roundPlayerId: 'player', model, name: null, condition: 100, mods: [], lookKey: null, origin: {}, stats: {},
  status: 'READY', quantity: 1, favorite: false, reserve: false, createdAt: new Date(0), updatedAt: new Date(0), ...values,
}) as unknown as PlayerGun;
const crew = { thugs: 4, thugHappiness: 100, weapons: { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 } };
const model = classicOgV25A.combat!;
const ammo = { roundsPerFight: { PISTOL: 10, SHOTGUN: 10, TEK9: 10, AK47: 10 }, defenderFloor: 1, lootShareBps: 0 };
function mockDb(rows: PlayerGun[]) {
  return { playerGun: { findMany: async () => rows, update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ ...rows.find((gun) => gun.id === where.id), ...data }), create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'created', ...data }) } };
}

describe('individual gun combat plans', () => {
  it('puts favourites first, then selects the strongest available gun and skips reserves', async () => {
    const guns = [row('pistol', 'PISTOL', { favorite: true }), row('ak', 'AK47'), row('reserve-ak', 'AK47', { reserve: true })];
    const favoritePlan = await planIndividualCombat(mockDb(guns) as never, 'player', crew, 1, model, classicOgV25A.individualItems!, ammo, 10, 'ATTACKER', () => 0.99);
    expect(favoritePlan.crew.weapons.PISTOL).toBe(1);
    expect(favoritePlan.roundsSpent).toBe(10);
    const strongestPlan = await planIndividualCombat(mockDb(guns.map((gun) => ({ ...gun, favorite: false } as PlayerGun))) as never,
      'player', crew, 1, model, classicOgV25A.individualItems!, ammo, 10, 'ATTACKER', () => 0.99);
    expect(strongestPlan.crew.weapons.AK47).toBe(1);
  });

  it('charges ammo for a jammed gun and applies reinforced-frame wear per item', async () => {
    const guns = [row('ak', 'AK47', { condition: 40, mods: [{ key: 'REINFORCED_FRAME', tier: 3 }] })];
    const plan = await planIndividualCombat(mockDb(guns) as never, 'player', crew, 1, model, classicOgV25A.individualItems!, ammo, 10, 'ATTACKER', () => 0);
    expect(plan.crew.weapons.AK47).toBe(0);
    expect(plan.roundsSpent).toBe(10);
    const db = mockDb(guns) as any;
    await plan.settle(db, 'player');
    expect(plan.receipts[0]).toMatchObject({ id: 'ak', rounds: 10, jammed: true, conditionBefore: 40, conditionAfter: 38 });
  });

  it('reserves only the selected copy and applies wear at landing, or releases it without wear on cancellation', async () => {
    const stacked = row('stacked-ak', 'AK47', { quantity: 2 });
    const records = new Map<string, any>([[stacked.id, { ...stacked }]]);
    let created = 0;
    const db = { playerGun: {
      findMany: async () => [...records.values()].filter((gun) => gun.status === 'READY'),
      findFirst: async ({ where }: any) => records.get(where.id) ?? null,
      update: async ({ where, data }: any) => { const gun = { ...records.get(where.id), ...data }; records.set(where.id, gun); return gun; },
      create: async ({ data }: any) => { const gun = { ...row(`reserved-${++created}`, data.model, data), ...data }; records.set(gun.id, gun); return gun; },
    } } as any;
    const plan = await planIndividualCombat(db, 'player', crew, 1, model, classicOgV25A.individualItems!, ammo, 10, 'ATTACKER', () => 0.99);
    const reserved = await plan.reserve(db, 'player', 'fight-1');
    expect(records.get('stacked-ak')).toMatchObject({ quantity: 1, status: 'READY' });
    expect(records.get(reserved[0]!.id)).toMatchObject({ quantity: 1, status: 'LOCKED', origin: { pendingCombat: { fightId: 'fight-1' } } });
    await settleReservedIndividualGuns(db, 'player', reserved);
    expect(records.get(reserved[0]!.id)).toMatchObject({ status: 'READY', condition: 96, stats: { fights: 1, roundsFired: 10 } });

    const second = await planIndividualCombat(db, 'player', crew, 1, model, classicOgV25A.individualItems!, ammo, 10, 'ATTACKER', () => 0.99);
    const pending = await second.reserve(db, 'player', 'fight-2');
    await releaseReservedIndividualGuns(db, 'player', pending);
    expect(records.get(pending[0]!.id)).toMatchObject({ status: 'READY', condition: 96 });
    expect(records.get(pending[0]!.id).origin).not.toHaveProperty('pendingCombat');
  });

  it('does not sell a gun while a queued fight has it reserved', async () => {
    const locked = row('locked-ak', 'AK47', { status: 'LOCKED', origin: { pendingCombat: { fightId: 'fight-1' } } });
    const db = { playerGun: { findMany: async () => [locked] } };
    await expect(IndividualItemsService.trade(db as never, 'player', 'ak47s', 'sell', 1, classicOgV25A.individualItems!))
      .rejects.toMatchObject({ code: 'ARMORY_ITEM_LOCKED' });
  });

  it('moves a gun with its mods and history, clears its Drop look, and marks it hot', async () => {
    const now = new Date('2026-10-21T12:00:00.000Z');
    const ownedGun = row('taken-ak', 'AK47', { name: 'Widowmaker', lookKey: 'gold-ak', mods: [{ key: 'BARREL', tier: 2 }],
      origin: { kind: 'PURCHASED', history: [{ event: 'OLD' }] } });
    let created: Record<string, unknown> | null = null;
    const db = { playerGun: { findMany: async () => [ownedGun], delete: async () => ({}), create: async ({ data }: { data: Record<string, unknown> }) => { created = data; return data; } } };
    const receipt = await lootIndividualGun(db as never, 'holder', 'victim', now, { displayName: 'The Holder', cityName: 'Detroit' });
    expect(receipt).toMatchObject({ model: 'AK47', name: 'Widowmaker', condition: 100, mods: [{ key: 'BARREL', tier: 2 }], recovered: false });
    expect((created as any).lookKey).toBeNull();
    expect((created as any).origin).toMatchObject({ stolenFromRoundPlayerId: 'holder', hotUntil: '2026-10-22T12:00:00.000Z' });
    expect((created as any).origin.history.at(-1)).toMatchObject({ fromName: 'The Holder', cityName: 'Detroit' });
    expect((created as any).favorite).toBe(false);
    expect((created as any).reserve).toBe(false);
  });

  it('returns the victim’s own hot gun cleanly when they recover it', async () => {
    const now = new Date('2026-10-21T12:00:00.000Z');
    const ownedGun = row('stolen-ak', 'AK47', { origin: { stolenFromRoundPlayerId: 'victim', hotUntil: '2026-10-22T12:00:00.000Z', history: [] } });
    let created: Record<string, unknown> | null = null;
    const db = { playerGun: { findMany: async () => [ownedGun], delete: async () => ({}), create: async ({ data }: { data: Record<string, unknown> }) => { created = data; return data; } } };
    const receipt = await lootIndividualGun(db as never, 'holder', 'victim', now, { displayName: 'The Holder', cityName: 'Detroit' });
    expect(receipt).toMatchObject({ recovered: true, hotUntil: null });
    expect(created).not.toHaveProperty('origin.hotUntil');
    expect(created).not.toHaveProperty('origin.stolenFromRoundPlayerId');
  });
});
