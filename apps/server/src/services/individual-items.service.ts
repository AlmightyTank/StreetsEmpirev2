import type { IndividualItemsRules, ResourceField } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { appendItemEvent } from './individual-item-history.js';

const GUN_FIELDS = { pistols: 'PISTOL', shotguns: 'SHOTGUN', tek9s: 'TEK9', ak47s: 'AK47' } as const;
const VEHICLE_FIELDS = { sedans: 'SEDAN', lowRiders: 'LOW_RIDER', vans: 'VAN' } as const;
function countFrom(rows: Array<{ quantity: number }>): number {
  return rows.reduce((total, row) => total + row.quantity, 0);
}

export const IndividualItemsService = {
  async seed(db: Db, roundPlayerId: string, start: Partial<Record<ResourceField, number>>, catalog: IndividualItemsRules) {
    for (const [field, model] of Object.entries(GUN_FIELDS) as Array<[keyof typeof GUN_FIELDS, (typeof GUN_FIELDS)[keyof typeof GUN_FIELDS]]>) {
      const quantity = start[field] ?? 0;
      if (quantity > 0) await db.playerGun.create({ data: { roundPlayerId, model, quantity, origin: { kind: 'STARTING_KIT' }, history: appendItemEvent([], { type: 'ACQUIRED', summary: 'Joined the round with this weapon' }) } });
    }
    for (const [field, model] of Object.entries(VEHICLE_FIELDS) as Array<[keyof typeof VEHICLE_FIELDS, (typeof VEHICLE_FIELDS)[keyof typeof VEHICLE_FIELDS]]>) {
      const quantity = start[field] ?? 0;
      if (quantity > 0) await db.playerVehicle.create({ data: { roundPlayerId, model, quantity, origin: { kind: 'STARTING_KIT' }, history: appendItemEvent([], { type: 'ACQUIRED', summary: 'Joined the round with this vehicle' }) } });
    }
    await this.refreshSummary(db, roundPlayerId);
    const [guns, vehicles] = await Promise.all([
      db.playerGun.aggregate({ where: { roundPlayerId }, _sum: { quantity: true } }),
      db.playerVehicle.aggregate({ where: { roundPlayerId }, _sum: { quantity: true } }),
    ]);
    if ((guns._sum.quantity ?? 0) > catalog.maxGuns || (vehicles._sum.quantity ?? 0) > catalog.maxVehicles) {
      throw AppError.conflict('ARMORY_CAP_EXCEEDED', 'The starting kit exceeds this round’s armory capacity.');
    }
  },

  async refreshSummary(db: Db, roundPlayerId: string) {
    const [gunRows, vehicleRows, gunConditions, vehicleConditions] = await Promise.all([
      db.playerGun.groupBy({ by: ['model'], where: { roundPlayerId }, _sum: { quantity: true } }),
      db.playerVehicle.groupBy({ by: ['model'], where: { roundPlayerId }, _sum: { quantity: true } }),
      db.playerGun.findMany({ where: { roundPlayerId }, select: { condition: true, quantity: true } }),
      db.playerVehicle.findMany({ where: { roundPlayerId }, select: { condition: true, quantity: true } }),
    ]);
    const guns = Object.fromEntries(gunRows.map((row) => [row.model, row._sum.quantity ?? 0]));
    const vehicles = Object.fromEntries(vehicleRows.map((row) => [row.model, row._sum.quantity ?? 0]));
    const bands = (rows: Array<{ condition: number; quantity: number }>) => {
      const counts = [0, 0, 0, 0, 0];
      for (const row of rows) counts[Math.min(4, Math.floor(row.condition / 20))]! += row.quantity;
      return counts;
    };
    const gunBands = bands(gunConditions);
    const vehicleBands = bands(vehicleConditions);
    const counts = {
      pistolCount: guns.PISTOL ?? 0, shotgunCount: guns.SHOTGUN ?? 0, tek9Count: guns.TEK9 ?? 0, ak47Count: guns.AK47 ?? 0,
      sedanCount: vehicles.SEDAN ?? 0, lowRiderCount: vehicles.LOW_RIDER ?? 0, vanCount: vehicles.VAN ?? 0,
      gunsCondition0To19: gunBands[0]!, gunsCondition20To39: gunBands[1]!, gunsCondition40To59: gunBands[2]!, gunsCondition60To79: gunBands[3]!, gunsCondition80To100: gunBands[4]!,
      vehiclesCondition0To19: vehicleBands[0]!, vehiclesCondition20To39: vehicleBands[1]!, vehiclesCondition40To59: vehicleBands[2]!, vehiclesCondition60To79: vehicleBands[3]!, vehiclesCondition80To100: vehicleBands[4]!,
    };
    await db.playerArmorySummary.upsert({
      where: { roundPlayerId },
      create: { roundPlayerId, ...counts, gunCount: countFrom(gunRows.map((row) => ({ quantity: row._sum.quantity ?? 0 }))), vehicleCount: countFrom(vehicleRows.map((row) => ({ quantity: row._sum.quantity ?? 0 }))) },
      update: { ...counts, gunCount: countFrom(gunRows.map((row) => ({ quantity: row._sum.quantity ?? 0 }))), vehicleCount: countFrom(vehicleRows.map((row) => ({ quantity: row._sum.quantity ?? 0 }))) },
    });
  },

  async trade(db: Db, roundPlayerId: string, field: string, direction: 'buy' | 'sell', quantity: number, catalog: IndividualItemsRules) {
    const gunModel = (GUN_FIELDS as Record<string, string>)[field];
    const vehicleModel = (VEHICLE_FIELDS as Record<string, string>)[field];
    if (!gunModel && !vehicleModel) return;
    const model = gunModel ?? vehicleModel!;
    const isGun = Boolean(gunModel);
    if (direction === 'buy') {
      const aggregate = isGun
        ? await db.playerGun.aggregate({ where: { roundPlayerId }, _sum: { quantity: true } })
        : await db.playerVehicle.aggregate({ where: { roundPlayerId }, _sum: { quantity: true } });
      const current = aggregate._sum.quantity ?? 0;
      const cap = isGun ? catalog.maxGuns : catalog.maxVehicles;
      if (current + quantity > cap) throw AppError.conflict('ARMORY_CAP_EXCEEDED', `That purchase exceeds the ${isGun ? 'gun' : 'vehicle'} capacity of ${cap.toLocaleString('en-US')}.`);
      if (isGun) {
        const existing = await db.playerGun.findFirst({ where: { roundPlayerId, model, name: null, condition: 100, status: 'READY', mods: { equals: [] }, origin: { equals: { kind: 'PURCHASED' } } }, orderBy: { createdAt: 'asc' } });
        if (existing) await db.playerGun.update({ where: { id: existing.id }, data: { quantity: { increment: quantity }, history: appendItemEvent(existing.history, { type: 'ACQUIRED', summary: `Bought ${quantity} weapon${quantity === 1 ? '' : 's'}` }) } });
        else await db.playerGun.create({ data: { roundPlayerId, model, quantity, origin: { kind: 'PURCHASED' }, history: appendItemEvent([], { type: 'ACQUIRED', summary: `Bought ${quantity} weapon${quantity === 1 ? '' : 's'}` }) } });
      } else {
        const existing = await db.playerVehicle.findFirst({ where: { roundPlayerId, model, name: null, condition: 100, status: 'READY', mods: { equals: [] }, origin: { equals: { kind: 'PURCHASED' } } }, orderBy: { createdAt: 'asc' } });
        if (existing) await db.playerVehicle.update({ where: { id: existing.id }, data: { quantity: { increment: quantity }, history: appendItemEvent(existing.history, { type: 'ACQUIRED', summary: `Bought ${quantity} vehicle${quantity === 1 ? '' : 's'}` }) } });
        else await db.playerVehicle.create({ data: { roundPlayerId, model, quantity, origin: { kind: 'PURCHASED' }, history: appendItemEvent([], { type: 'ACQUIRED', summary: `Bought ${quantity} vehicle${quantity === 1 ? '' : 's'}` }) } });
      }
    } else {
      let remaining = quantity;
      let hotGunsPresent = false;
      let lockedGunsPresent = false;
      let vehiclesOnRunPresent = false;
      let hotVehiclesPresent = false;
      if (isGun) {
        const rows = await db.playerGun.findMany({ where: { roundPlayerId, model }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] });
        lockedGunsPresent = rows.some((row) => row.status === 'LOCKED');
        const sellableRows = rows.filter((row) => row.status !== 'LOCKED' && (() => {
          const origin = row.origin && typeof row.origin === 'object' && !Array.isArray(row.origin) ? row.origin as Record<string, unknown> : {};
          return !(typeof origin.hotUntil === 'string' && Date.parse(origin.hotUntil) > Date.now());
        })());
        hotGunsPresent = sellableRows.length < rows.length;
        for (const row of sellableRows) {
          if (!remaining) break;
          const take = Math.min(remaining, row.quantity);
          if (take === row.quantity) await db.playerGun.delete({ where: { id: row.id } });
          else await db.playerGun.update({ where: { id: row.id }, data: { quantity: { decrement: take } } });
          remaining -= take;
        }
      } else {
        const rows = await db.playerVehicle.findMany({ where: { roundPlayerId, model }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }] });
        vehiclesOnRunPresent = rows.some((row) => row.status === 'ON_RUN');
        const sellableRows = rows.filter((row) => {
          if (row.status === 'ON_RUN') return false;
          const origin = row.origin && typeof row.origin === 'object' && !Array.isArray(row.origin) ? row.origin as Record<string, unknown> : {};
          const hot = typeof origin.hotUntil === 'string' && Date.parse(origin.hotUntil) > Date.now();
          if (hot) hotVehiclesPresent = true;
          return !hot;
        });
        for (const row of sellableRows) {
          if (!remaining) break;
          const take = Math.min(remaining, row.quantity);
          if (take === row.quantity) await db.playerVehicle.delete({ where: { id: row.id } });
          else await db.playerVehicle.update({ where: { id: row.id }, data: { quantity: { decrement: take } } });
          remaining -= take;
        }
      }
      if (remaining && lockedGunsPresent) throw AppError.conflict('ARMORY_ITEM_LOCKED', 'A gun dispatched to a pending fight cannot be sold yet.');
      if (remaining && vehiclesOnRunPresent) throw AppError.conflict('ARMORY_VEHICLE_ON_RUN', 'A vehicle assigned to a run cannot be sold until it returns.');
      if (remaining && hotVehiclesPresent) throw AppError.conflict('ARMORY_ITEM_HOT', 'Hot vehicles cannot be sold until their recovery window ends.');
      if (remaining && hotGunsPresent) throw AppError.conflict('ARMORY_ITEM_HOT', 'Hot guns cannot be sold until their recovery window ends.');
      if (remaining) throw AppError.conflict('ARMORY_INVENTORY_MISMATCH', 'The individual item inventory does not match the store balance.');
    }
    await this.refreshSummary(db, roundPlayerId);
  },
};
