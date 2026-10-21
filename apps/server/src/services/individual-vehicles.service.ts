import type { Prisma, PlayerVehicle } from '@prisma/client';
import { hashParts, seededRng, type Ruleset } from '@streets/rules-engine';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { IndividualItemsService } from './individual-items.service.js';
import { appendItemEvent } from './individual-item-history.js';
import type { VehicleLoadout } from './vehicle-fleet.service.js';

export type IndividualVehicleSnapshot = {
  id: string;
  model: 'LOW_RIDER' | 'SEDAN' | 'VAN';
  name: string | null;
  plate: string | null;
  condition: number;
  mods: Array<{ key: string; tier: number }>;
  status?: 'READY' | 'DAMAGED' | 'DISABLED';
  recovered?: boolean;
};
export type VehicleSelection = { rows: Array<{ row: PlayerVehicle; quantity: number }>; loadout: VehicleLoadout };
const CLASSES = ['LOW_RIDER', 'SEDAN', 'VAN'] as const;
const emptyLoadout = (): VehicleLoadout => ({ LOW_RIDER: 0, SEDAN: 0, VAN: 0 });
function jsonRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function vehicleMods(value: unknown): Array<{ key: string; tier: number }> {
  return Array.isArray(value) ? value.flatMap((part) => {
    const row = jsonRecord(part);
    return typeof row.key === 'string' && Number.isInteger(row.tier) ? [{ key: row.key, tier: Number(row.tier) }] : [];
  }) : [];
}
export function modPercent(snapshot: Pick<IndividualVehicleSnapshot, 'mods'>, key: string): number {
  const values = key === 'FUEL_TANK' ? [10, 20, 30] : [5, 10, 15];
  return snapshot.mods.filter((mod) => mod.key === key).reduce((sum, mod) => sum + (values[mod.tier - 1] ?? 0), 0);
}
export function vehicleCargoCapacity(ruleset: Ruleset, loadout: VehicleLoadout, cargoShare: number, vehicles: IndividualVehicleSnapshot[]): number {
  const base = ruleset.travel?.cargoPerLowRider ?? 0;
  if (!vehicles.length) return Math.floor(base * Object.values(loadout).reduce((sum, count) => sum + count, 0) * (1 + Math.max(0, cargoShare)));
  return Math.floor(vehicles.reduce((sum, vehicle) => {
    const cls = ruleset.vehicleCatalog?.classes.find((entry) => entry.id === vehicle.model);
    const classCapacity = base * (cls?.cargoPercent ?? 100) / 100;
    return sum + classCapacity * (1 + Math.max(0, cargoShare)) * (1 + modPercent(vehicle, 'CARGO') / 100);
  }, 0));
}
export function readRunVehicles(value: Prisma.JsonValue | undefined): IndividualVehicleSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((part) => {
    const row = jsonRecord(part);
    if (typeof row.id !== 'string' || !CLASSES.includes(row.model as (typeof CLASSES)[number])) return [];
    return [{ id: row.id, model: row.model as IndividualVehicleSnapshot['model'], name: typeof row.name === 'string' ? row.name : null,
      plate: typeof row.plate === 'string' ? row.plate : null, condition: typeof row.condition === 'number' ? row.condition : 100, mods: vehicleMods(row.mods),
      ...(row.status === 'READY' || row.status === 'DAMAGED' || row.status === 'DISABLED' ? { status: row.status } : {}) }];
  });
}

export function hiddenCompartmentsStopCut(vehicles: IndividualVehicleSnapshot[]): number {
  const percent = vehicles.length ? vehicles.reduce((sum, vehicle) => sum + modPercent(vehicle, 'HIDDEN_COMPARTMENTS'), 0) / vehicles.length : 0;
  return Math.min(0.25, Math.max(0, percent / 100));
}

export function armorAdjustedDamage<T extends { damaged: VehicleLoadout; disabled: VehicleLoadout }>(runId: string, vehicles: IndividualVehicleSnapshot[], before: T, after: T, state: 'damaged' | 'disabled'): T {
  if (!vehicles.length) return after;
  const result = { damaged: { ...after.damaged }, disabled: { ...after.disabled } } as T;
  const rng = seededRng(hashParts(runId, 'vehicle-armor', state, JSON.stringify(before)));
  for (const model of CLASSES) {
    const delta = state === 'damaged'
      ? Math.max(0, after.damaged[model] - before.damaged[model])
      : Math.max(0, after.disabled[model] - before.disabled[model]);
    const candidates = vehicles.filter((vehicle) => vehicle.model === model).sort((a, b) => a.id.localeCompare(b.id));
    const armor = candidates.length ? candidates.reduce((sum, vehicle) => sum + modPercent(vehicle, 'ARMOR'), 0) / candidates.length : 0;
    let protectedCount = 0;
    for (let index = 0; index < delta; index++) if (rng() * 100 < armor) protectedCount++;
    if (!protectedCount) continue;
    if (state === 'damaged') result.damaged[model] = Math.max(0, result.damaged[model] - protectedCount);
    else {
      const promotedFromDamage = Math.min(protectedCount, Math.max(0, before.damaged[model] - after.damaged[model]));
      result.disabled[model] = Math.max(0, result.disabled[model] - protectedCount);
      result.damaged[model] += promotedFromDamage;
    }
  }
  return result;
}

/** Resolve an explicit garage selection or the best ready vehicles for a requested class mix. */
export async function selectRunVehicles(db: Db, roundPlayerId: string, ruleset: Ruleset, requested: VehicleLoadout, explicitIds?: string[], autoFleet = false): Promise<VehicleSelection | null> {
  if (!ruleset.individualItems?.enabled) return null;
  const rows = await db.playerVehicle.findMany({ where: { roundPlayerId, status: 'READY' }, orderBy: [{ condition: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] });
  const loadout = emptyLoadout();
  const picked = new Map<string, { row: PlayerVehicle; quantity: number }>();
  if (explicitIds?.length) {
    const byId = new Map(rows.map((row) => [row.id, row]));
    for (const id of explicitIds) {
      const row = byId.get(id);
      if (!row) throw AppError.conflict('VEHICLE_NOT_READY', 'One of the selected vehicles is no longer ready in your garage.');
      const selection = picked.get(id) ?? { row, quantity: 0 };
      selection.quantity++;
      if (selection.quantity > row.quantity) throw AppError.badRequest('VEHICLE_SELECTION_EXCEEDS_STACK', 'The selected quantity exceeds that garage stack.');
      picked.set(id, selection);
      loadout[row.model as keyof VehicleLoadout]++;
    }
  } else if (autoFleet) {
    const count = requested.LOW_RIDER + requested.SEDAN + requested.VAN;
    const score = (row: PlayerVehicle) => {
      const cls = ruleset.vehicleCatalog?.classes.find((entry) => entry.id === row.model);
      const mods = vehicleMods(row.mods);
      const cargo = (cls?.cargoPercent ?? 100) * (1 + mods.filter((m) => m.key === 'CARGO').reduce((s, m) => s + m.tier * 0.05, 0));
      const fee = cls?.runFeeCents ?? 1;
      return cargo / fee;
    };
    const candidates = rows.flatMap((row) => Array.from({ length: row.quantity }, () => row)).sort((a, b) => score(b) - score(a) || b.condition - a.condition || a.id.localeCompare(b.id)).slice(0, count);
    for (const row of candidates) { const item = picked.get(row.id) ?? { row, quantity: 0 }; item.quantity++; picked.set(row.id, item); loadout[row.model as keyof VehicleLoadout]++; }
    if (candidates.length !== count) throw AppError.badRequest('NOT_ENOUGH_VEHICLES', 'You do not have enough ready vehicles for the selected fleet size.');
  } else {
    for (const cls of CLASSES) {
      let remaining = requested[cls];
      for (const row of rows.filter((item) => item.model === cls)) {
        if (!remaining) break;
        const quantity = Math.min(remaining, row.quantity);
        picked.set(row.id, { row, quantity }); loadout[cls] += quantity; remaining -= quantity;
      }
      if (remaining) throw AppError.badRequest('NOT_ENOUGH_VEHICLES', `You do not have ${requested[cls]} ready ${cls.replace('_', ' ').toLowerCase()} vehicles in your garage.`);
    }
  }
  if (!loadout.LOW_RIDER && !loadout.SEDAN && !loadout.VAN) throw AppError.badRequest('NO_VEHICLES_SELECTED', 'Choose at least one vehicle for this run.');
  return { rows: [...picked.values()], loadout };
}

/** Split stack rows and mark the exact vehicles away. Caller stores returned snapshots on Run. */
export async function reserveRunVehicles(db: Db, selection: VehicleSelection): Promise<IndividualVehicleSnapshot[]> {
  const result: IndividualVehicleSnapshot[] = [];
  for (const { row, quantity } of selection.rows) {
    const count = await db.playerVehicle.updateMany({ where: { id: row.id, status: 'READY', quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } } });
    if (count.count !== 1) throw AppError.conflict('VEHICLE_NOT_READY', 'A selected vehicle changed while the run was loading. Refresh the garage and try again.');
    if (row.quantity === quantity) await db.playerVehicle.delete({ where: { id: row.id } });
    for (let index = 0; index < quantity; index++) {
      const saved = await db.playerVehicle.create({ data: { roundPlayerId: row.roundPlayerId, model: row.model, name: row.name, plate: row.plate,
        condition: row.condition, mods: row.mods as Prisma.InputJsonValue, lookKey: row.lookKey, origin: row.origin as Prisma.InputJsonValue,
        stats: row.stats as Prisma.InputJsonValue, history: row.history as Prisma.InputJsonValue, status: 'ON_RUN', quantity: 1 } });
      result.push({ id: saved.id, model: saved.model as IndividualVehicleSnapshot['model'], name: saved.name, plate: saved.plate, condition: saved.condition, mods: vehicleMods(saved.mods) });
    }
  }
  return result;
}

/** Return the saved cars with one run of wear and the actual road trouble assigned to specific items. */
export async function returnRunVehicles(db: Db, roundPlayerId: string, vehicles: IndividualVehicleSnapshot[], trouble: { damaged: VehicleLoadout; disabled: VehicleLoadout }): Promise<Array<IndividualVehicleSnapshot & { status: 'READY' | 'DAMAGED' | 'DISABLED' }>> {
  if (!vehicles.length) return [];
  const remaining: Record<'damaged' | 'disabled', VehicleLoadout> = { damaged: { ...trouble.damaged }, disabled: { ...trouble.disabled } };
  const returned: Array<IndividualVehicleSnapshot & { status: 'READY' | 'DAMAGED' | 'DISABLED' }> = [];
  for (const vehicle of [...vehicles].sort((a, b) => a.model.localeCompare(b.model) || a.id.localeCompare(b.id))) {
    let status: 'READY' | 'DAMAGED' | 'DISABLED' = 'READY';
    if (remaining.disabled[vehicle.model] > 0) { remaining.disabled[vehicle.model]--; status = 'DISABLED'; }
    else if (remaining.damaged[vehicle.model] > 0) { remaining.damaged[vehicle.model]--; status = 'DAMAGED'; }
    const condition = Math.max(0, vehicle.condition - 1);
    const finalStatus = condition === 0 ? 'DISABLED' : status;
    const current = await db.playerVehicle.findFirst({ where: { id: vehicle.id, roundPlayerId, status: 'ON_RUN' } });
    if (!current) continue;
    const stats = jsonRecord(current.stats);
    await db.playerVehicle.update({ where: { id: vehicle.id }, data: { condition, status: finalStatus, stats: { ...stats, runs: Number(stats.runs ?? 0) + 1 } as Prisma.InputJsonValue,
      history: appendItemEvent(current.history, { type: 'RUN', summary: `Returned from a run at ${condition}% condition` }) } });
    returned.push({ ...vehicle, condition, status: finalStatus });
  }
  await IndividualItemsService.refreshSummary(db, roundPlayerId);
  return returned;
}

export async function loseRunVehicles(db: Db, roundPlayerId: string, vehicles: IndividualVehicleSnapshot[], count: number): Promise<IndividualVehicleSnapshot[]> {
  const lost = new Set<string>();
  for (const vehicle of [...vehicles].sort((a, b) => a.model.localeCompare(b.model) || a.id.localeCompare(b.id))) {
    if (count <= 0) break;
    await db.playerVehicle.deleteMany({ where: { id: vehicle.id, roundPlayerId, status: 'ON_RUN' } });
    lost.add(vehicle.id); count--;
  }
  if (lost.size) await IndividualItemsService.refreshSummary(db, roundPlayerId);
  return vehicles.filter((vehicle) => !lost.has(vehicle.id));
}

export async function serviceGarageVehicles(db: Db, roundPlayerId: string, model: string, status: 'DAMAGED' | 'DISABLED', quantity: number, scrap: boolean): Promise<void> {
  const rows = await db.playerVehicle.findMany({ where: { roundPlayerId, model, status }, orderBy: [{ condition: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
  let remaining = quantity;
  for (const row of rows) {
    if (!remaining) break;
    const take = Math.min(remaining, row.quantity);
    if (scrap) {
      if (take === row.quantity) await db.playerVehicle.delete({ where: { id: row.id } });
      else await db.playerVehicle.update({ where: { id: row.id }, data: { quantity: { decrement: take } } });
    } else if (take === row.quantity) {
      await db.playerVehicle.update({ where: { id: row.id }, data: { status: 'READY', condition: 100,
        history: appendItemEvent(row.history, { type: 'REPAIRED', summary: `Repaired vehicle to 100% condition` }) } });
    } else {
      await db.playerVehicle.update({ where: { id: row.id }, data: { quantity: { decrement: take } } });
      await db.playerVehicle.create({ data: { roundPlayerId, model: row.model, name: row.name, plate: row.plate, condition: 100, mods: row.mods as Prisma.InputJsonValue,
        lookKey: row.lookKey, origin: row.origin as Prisma.InputJsonValue, stats: row.stats as Prisma.InputJsonValue,
        history: appendItemEvent(row.history, { type: 'REPAIRED', summary: 'Repaired vehicle to 100% condition' }), status: 'READY', quantity: take } });
    }
    remaining -= take;
  }
  await IndividualItemsService.refreshSummary(db, roundPlayerId);
}

export async function transferReadyVehicles(db: Db, fromRoundPlayerId: string, toRoundPlayerId: string, quantity: number, now: Date, rng: () => number = Math.random): Promise<IndividualVehicleSnapshot[]> {
  const rows = await db.playerVehicle.findMany({ where: { roundPlayerId: fromRoundPlayerId, status: 'READY', model: { in: [...CLASSES] } }, orderBy: [{ condition: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
  const pool = rows.flatMap((row) => {
    const origin = jsonRecord(row.origin);
    const recovered = origin.stolenFromRoundPlayerId === toRoundPlayerId && typeof origin.hotUntil === 'string' && Date.parse(origin.hotUntil) > now.getTime();
    return Array.from({ length: row.quantity }, () => ({ row, recovered }));
  }).sort((a, b) => Number(b.recovered) - Number(a.recovered));
  const stolen: IndividualVehicleSnapshot[] = [];
  const hotUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  while (quantity > 0 && pool.length) {
    const recoveryPriority = pool[0]?.recovered;
    const eligibleCount = pool.filter((item) => item.recovered === recoveryPriority).length;
    const pick = Math.min(eligibleCount - 1, Math.floor(rng() * eligibleCount));
    const selected = pool.splice(pick, 1)[0];
    if (!selected) continue;
    const { row, recovered } = selected;
    const current = await db.playerVehicle.findUnique({ where: { id: row.id } });
    if (!current || current.roundPlayerId !== fromRoundPlayerId || current.status !== 'READY' || current.quantity < 1) continue;
    const previousOrigin = jsonRecord(current.origin);
    const history = Array.isArray(previousOrigin.history) ? previousOrigin.history : [];
    const origin = recovered
      ? Object.fromEntries(Object.entries({ ...previousOrigin, kind: 'RECOVERED', history: [...history, { event: 'RECOVERED_FROM_PLAYER', fromRoundPlayerId, at: now.toISOString() }] }).filter(([key]) => !['stolenFromRoundPlayerId', 'stolenAt', 'hotUntil'].includes(key)))
      : { ...previousOrigin, kind: 'STOLEN', stolenFromRoundPlayerId: fromRoundPlayerId, stolenAt: now.toISOString(), hotUntil: hotUntil.toISOString(), history: [...history, { event: 'STOLEN', fromRoundPlayerId, at: now.toISOString() }] };
    let saved: PlayerVehicle;
    if (current.quantity === 1) {
      saved = await db.playerVehicle.update({ where: { id: current.id }, data: { roundPlayerId: toRoundPlayerId, lookKey: null, origin: origin as Prisma.InputJsonValue,
        history: appendItemEvent(current.history, { type: recovered ? 'RECOVERED' : 'STOLEN', summary: recovered ? 'Recovered by its former owner' : 'Taken in a ride theft', otherPlayer: recovered ? fromRoundPlayerId : toRoundPlayerId, at: now }) } });
    } else {
      await db.playerVehicle.update({ where: { id: current.id }, data: { quantity: { decrement: 1 } } });
      saved = await db.playerVehicle.create({ data: { roundPlayerId: toRoundPlayerId, model: current.model, name: current.name, plate: current.plate, condition: current.condition,
        mods: current.mods as Prisma.InputJsonValue, lookKey: null, origin: origin as Prisma.InputJsonValue, stats: current.stats as Prisma.InputJsonValue,
        history: appendItemEvent(current.history, { type: recovered ? 'RECOVERED' : 'STOLEN', summary: recovered ? 'Recovered by its former owner' : 'Taken in a ride theft', otherPlayer: recovered ? fromRoundPlayerId : toRoundPlayerId, at: now }), status: 'READY', quantity: 1 } });
    }
    stolen.push({ id: saved.id, model: saved.model as IndividualVehicleSnapshot['model'], name: saved.name, plate: saved.plate, condition: saved.condition, mods: vehicleMods(saved.mods), ...(recovered ? { recovered: true } : {}) });
    quantity--;
  }
  if (stolen.length) { await IndividualItemsService.refreshSummary(db, fromRoundPlayerId); await IndividualItemsService.refreshSummary(db, toRoundPlayerId); }
  return stolen;
}

export async function transferRunVehicle(db: Db, fromRoundPlayerId: string, toRoundPlayerId: string, vehicle: IndividualVehicleSnapshot, status: 'READY' | 'ON_RUN', now: Date): Promise<IndividualVehicleSnapshot> {
  const current = await db.playerVehicle.findFirst({ where: { id: vehicle.id, roundPlayerId: fromRoundPlayerId, status: 'ON_RUN', quantity: 1 } });
  if (!current) throw AppError.conflict('RUN_VEHICLE_CHANGED', 'That vehicle is no longer on the run.');
  const previousOrigin = jsonRecord(current.origin);
  const history = Array.isArray(previousOrigin.history) ? previousOrigin.history : [];
  const recovered = previousOrigin.stolenFromRoundPlayerId === toRoundPlayerId && typeof previousOrigin.hotUntil === 'string' && Date.parse(previousOrigin.hotUntil) > now.getTime();
  const origin = recovered
    ? Object.fromEntries(Object.entries({ ...previousOrigin, kind: 'RECOVERED', history: [...history, { event: 'RECOVERED_FROM_PLAYER', fromRoundPlayerId, at: now.toISOString() }] }).filter(([key]) => !['stolenFromRoundPlayerId', 'stolenAt', 'hotUntil'].includes(key)))
    : { ...previousOrigin, kind: 'STOLEN', stolenFromRoundPlayerId: fromRoundPlayerId, stolenAt: now.toISOString(), hotUntil: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(), history: [...history, { event: 'STOLEN', fromRoundPlayerId, at: now.toISOString() }] };
  await db.playerVehicle.update({ where: { id: current.id }, data: { roundPlayerId: toRoundPlayerId, status, lookKey: null, origin: origin as Prisma.InputJsonValue,
    history: appendItemEvent(current.history, { type: recovered ? 'RECOVERED' : 'STOLEN', summary: recovered ? 'Recovered by its former owner' : 'Lost in a convoy fight', otherPlayer: recovered ? fromRoundPlayerId : toRoundPlayerId, at: now }) } });
  await IndividualItemsService.refreshSummary(db, fromRoundPlayerId);
  await IndividualItemsService.refreshSummary(db, toRoundPlayerId);
  return { ...vehicle, status: status === 'READY' ? 'READY' : undefined, ...(recovered ? { recovered: true } : {}) };
}
