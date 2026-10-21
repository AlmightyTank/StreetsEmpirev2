import { Prisma, type PlayerGun, type PrismaClient } from '@prisma/client';
import type { ArmoryBulkActionInput, ArmoryBulkActionResult, IndividualInventoryDto } from '@streets/shared';
import type { IndividualItemsRules, Ruleset } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { assertCommunicationContent, maskOrdinaryProfanity } from './content-moderation.service.js';
import type { Db } from '../utils/db.js';
import { IndividualItemsService } from './individual-items.service.js';

function requireCatalog(ruleset: Ruleset): IndividualItemsRules {
  if (!ruleset.individualItems?.enabled) throw AppError.conflict('INDIVIDUAL_ARMORY_DISABLED', 'Individual armory management is not available in this round.');
  return ruleset.individualItems;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function itemMods(value: unknown): Array<{ key: string; tier: number }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const row = jsonRecord(entry);
    return typeof row.key === 'string' && typeof row.tier === 'number' ? [{ key: row.key, tier: row.tier }] : [];
  });
}

function jsonInput(value: Prisma.JsonValue): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
}

function summaryDto(summary: {
  gunCount: number; vehicleCount: number; pistolCount: number; shotgunCount: number; tek9Count: number; ak47Count: number;
  sedanCount: number; lowRiderCount: number; vanCount: number;
  gunsCondition0To19: number; gunsCondition20To39: number; gunsCondition40To59: number; gunsCondition60To79: number; gunsCondition80To100: number;
  vehiclesCondition0To19: number; vehiclesCondition20To39: number; vehiclesCondition40To59: number; vehiclesCondition60To79: number; vehiclesCondition80To100: number;
}) {
  return {
    gunCount: summary.gunCount,
    vehicleCount: summary.vehicleCount,
    gunsByModel: { PISTOL: summary.pistolCount, SHOTGUN: summary.shotgunCount, TEK9: summary.tek9Count, AK47: summary.ak47Count },
    vehiclesByModel: { SEDAN: summary.sedanCount, LOW_RIDER: summary.lowRiderCount, VAN: summary.vanCount },
    conditionBands: {
      guns: [summary.gunsCondition0To19, summary.gunsCondition20To39, summary.gunsCondition40To59, summary.gunsCondition60To79, summary.gunsCondition80To100],
      vehicles: [summary.vehiclesCondition0To19, summary.vehiclesCondition20To39, summary.vehiclesCondition40To59, summary.vehiclesCondition60To79, summary.vehiclesCondition80To100],
    },
  };
}

async function renameGun(db: Db, roundPlayerId: string, id: string, name: string) {
  const gun = await db.playerGun.findFirst({ where: { id, roundPlayerId } });
  if (!gun) throw AppError.notFound('ARMORY_ITEM_NOT_FOUND', 'That gun is no longer in your armory.');
  if (gun.quantity === 1) {
    return db.playerGun.update({ where: { id }, data: { name } });
  }
  await db.playerGun.update({ where: { id }, data: { quantity: { decrement: 1 } } });
  return db.playerGun.create({
    data: {
      roundPlayerId, model: gun.model, name, condition: gun.condition, mods: jsonInput(gun.mods),
      lookKey: gun.lookKey, origin: jsonInput(gun.origin), stats: jsonInput(gun.stats), status: gun.status,
      favorite: gun.favorite, reserve: gun.reserve,
    },
  });
}

async function renameVehicle(db: Db, roundPlayerId: string, id: string, name: string) {
  const vehicle = await db.playerVehicle.findFirst({ where: { id, roundPlayerId } });
  if (!vehicle) throw AppError.notFound('GARAGE_ITEM_NOT_FOUND', 'That vehicle is no longer in your garage.');
  if (vehicle.quantity === 1) return db.playerVehicle.update({ where: { id }, data: { name } });
  await db.playerVehicle.update({ where: { id }, data: { quantity: { decrement: 1 } } });
  return db.playerVehicle.create({
    data: {
      roundPlayerId, model: vehicle.model, name, plate: vehicle.plate, condition: vehicle.condition,
      mods: jsonInput(vehicle.mods), lookKey: vehicle.lookKey, origin: jsonInput(vehicle.origin), stats: jsonInput(vehicle.stats), status: vehicle.status,
    },
  });
}

async function updateGunFlags(db: Db, roundPlayerId: string, gun: PlayerGun, flags: { favorite: boolean; reserve: boolean }) {
  if (gun.quantity === 1) {
    await db.playerGun.update({ where: { id: gun.id }, data: flags });
    return;
  }
  await db.playerGun.update({ where: { id: gun.id }, data: { quantity: { decrement: 1 } } });
  await db.playerGun.create({
    data: {
      roundPlayerId, model: gun.model, name: gun.name, condition: gun.condition,
      mods: jsonInput(gun.mods), lookKey: gun.lookKey, origin: jsonInput(gun.origin), stats: jsonInput(gun.stats), status: gun.status,
      favorite: flags.favorite, reserve: flags.reserve,
    },
  });
}

export const ArmoryService = {
  async catalog(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<IndividualInventoryDto> {
    const catalog = ruleset.individualItems;
    if (!catalog?.enabled) {
      return {
        enabled: false, maxGuns: 0, maxVehicles: 0,
        summary: { gunCount: 0, vehicleCount: 0, gunsByModel: { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 }, vehiclesByModel: { SEDAN: 0, LOW_RIDER: 0, VAN: 0 }, conditionBands: { guns: [0, 0, 0, 0, 0], vehicles: [0, 0, 0, 0, 0] } },
        guns: [], vehicles: [],
      };
    }
    const [summary, guns, vehicles] = await Promise.all([
      prisma.playerArmorySummary.findUnique({ where: { roundPlayerId } }),
      prisma.playerGun.findMany({ where: { roundPlayerId }, orderBy: [{ model: 'asc' }, { condition: 'desc' }, { createdAt: 'asc' }] }),
      prisma.playerVehicle.findMany({ where: { roundPlayerId }, orderBy: [{ model: 'asc' }, { condition: 'desc' }, { createdAt: 'asc' }] }),
    ]);
    const gunDtos = guns.map((row) => ({
      id: row.id, model: row.model as 'PISTOL' | 'SHOTGUN' | 'TEK9' | 'AK47', name: row.name, condition: row.condition,
      mods: itemMods(row.mods), lookKey: row.lookKey, origin: jsonRecord(row.origin), stats: jsonRecord(row.stats) as Record<string, number>,
      status: row.status as 'READY' | 'BROKEN' | 'LOCKED', quantity: row.quantity, favorite: row.favorite, reserve: row.reserve,
    }));
    const vehicleDtos = vehicles.map((row) => ({
      id: row.id, model: row.model as 'SEDAN' | 'LOW_RIDER' | 'VAN', name: row.name, plate: row.plate, condition: row.condition,
      mods: itemMods(row.mods), lookKey: row.lookKey, origin: jsonRecord(row.origin), stats: jsonRecord(row.stats) as Record<string, number>,
      status: row.status as 'READY' | 'DAMAGED' | 'DISABLED' | 'ON_RUN', quantity: row.quantity,
    }));
    const totals = summary ?? {
      gunCount: gunDtos.reduce((sum, row) => sum + row.quantity, 0), vehicleCount: vehicleDtos.reduce((sum, row) => sum + row.quantity, 0),
      pistolCount: 0, shotgunCount: 0, tek9Count: 0, ak47Count: 0, sedanCount: 0, lowRiderCount: 0, vanCount: 0,
      gunsCondition0To19: 0, gunsCondition20To39: 0, gunsCondition40To59: 0, gunsCondition60To79: 0, gunsCondition80To100: 0,
      vehiclesCondition0To19: 0, vehiclesCondition20To39: 0, vehiclesCondition40To59: 0, vehiclesCondition60To79: 0, vehiclesCondition80To100: 0,
    };
    if (!summary) {
      for (const item of gunDtos) totals[`${item.model === 'PISTOL' ? 'pistol' : item.model === 'SHOTGUN' ? 'shotgun' : item.model === 'TEK9' ? 'tek9' : 'ak47'}Count` as 'pistolCount' | 'shotgunCount' | 'tek9Count' | 'ak47Count'] += item.quantity;
      for (const item of vehicleDtos) totals[`${item.model === 'SEDAN' ? 'sedan' : item.model === 'LOW_RIDER' ? 'lowRider' : 'van'}Count` as 'sedanCount' | 'lowRiderCount' | 'vanCount'] += item.quantity;
    }
    return { enabled: true, maxGuns: catalog.maxGuns, maxVehicles: catalog.maxVehicles, summary: summaryDto(totals), guns: gunDtos, vehicles: vehicleDtos };
  },

  update(prisma: PrismaClient, roundPlayerId: string, input: ArmoryBulkActionInput) {
    return ActionService.run<ArmoryBulkActionResult>(prisma, roundPlayerId, {
      action: 'ARMORY_BULK_ACTION', actionId: input.actionId,
      execute: async ({ tx, current, ruleset }) => {
        requireCatalog(ruleset);
        const items = input.items;
        if (new Set(items.map(({ kind, id }) => `${kind}:${id}`)).size !== items.length) {
          throw AppError.badRequest('DUPLICATE_ARMORY_SELECTION', 'Remove duplicate items from your selection.');
        }
        const gunIds = items.filter((item) => item.kind === 'GUN').map((item) => item.id);
        const vehicleIds = items.filter((item) => item.kind === 'VEHICLE').map((item) => item.id);
        const [guns, vehicles] = await Promise.all([
          gunIds.length ? tx.playerGun.findMany({ where: { roundPlayerId, id: { in: gunIds } } }) : [],
          vehicleIds.length ? tx.playerVehicle.findMany({ where: { roundPlayerId, id: { in: vehicleIds } } }) : [],
        ]);
        if (guns.length !== gunIds.length || vehicles.length !== vehicleIds.length) throw AppError.notFound('ARMORY_ITEM_NOT_FOUND', 'One or more selected items are no longer in your inventory. Refresh and try again.');
        let names: string[] = [];
        if (input.action === 'RENAME') {
          const requested = input.name!.trim();
          assertCommunicationContent(requested, '');
          const masked = maskOrdinaryProfanity(requested).slice(0, 40).trim();
          if (!masked) throw AppError.badRequest('INVALID_ITEM_NAME', 'Enter a name for the item.');
          names = [];
          for (const [index, item] of items.entries()) {
            const suffix = items.length > 1 ? ` ${index + 1}` : '';
            const name = `${masked.slice(0, 40 - suffix.length)}${suffix}`;
            if (item.kind === 'GUN') await renameGun(tx, roundPlayerId, item.id, name);
            else await renameVehicle(tx, roundPlayerId, item.id, name);
            names.push(name);
          }
        } else {
          const data = input.action === 'FAVORITE'
            ? { favorite: true, reserve: false }
            : input.action === 'RESERVE'
              ? { favorite: false, reserve: true }
              : { favorite: false, reserve: false };
          for (const gun of guns) await updateGunFlags(tx, roundPlayerId, gun, data);
        }
        await IndividualItemsService.refreshSummary(tx, roundPlayerId);
        return {
          next: current,
          result: { action: input.action, updated: items.length, names },
        };
      },
    });
  },
};
