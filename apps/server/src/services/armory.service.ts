import { Prisma, type PlayerGun, type PlayerVehicle, type PrismaClient } from '@prisma/client';
import { collectionCovers, isReleasedItemCosmeticStyle } from '@streets/shared';
import type { ArmoryBulkActionInput, ArmoryBulkActionResult, ArmoryFeatureItemInput, ArmoryFeatureItemResult, ArmoryLookActionInput, ArmoryLookActionResult, ArmoryModActionInput, ArmoryModActionResult, ArmorySavedBuildDto, FeaturedItemDto, IndividualInventoryDto } from '@streets/shared';
import type { IndividualItemsRules, Ruleset } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { assertCommunicationContent, maskOrdinaryProfanity } from './content-moderation.service.js';
import type { Db } from '../utils/db.js';
import { IndividualItemsService } from './individual-items.service.js';
import { itemModRule, normalizeMods, transitionModSet, validateModSet, type ArmoryItemKind } from './armory-mods.js';
import { appendItemEvent, itemEvents, readFeaturedItem } from './individual-item-history.js';

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

function modCatalogDto(catalog: IndividualItemsRules) {
  const map = (rules: Record<string, { size: 'SMALL' | 'MEDIUM' | 'LARGE'; slots: number; mods: readonly { key: string; slot: string; tiers: readonly { tier: 1 | 2 | 3; effectPercent: number }[] }[] }>) => Object.fromEntries(
    Object.entries(rules).map(([model, rule]) => [model, { size: rule.size, slots: rule.slots, mods: rule.mods.map((mod) => ({ key: mod.key, slot: mod.slot, tiers: mod.tiers.map((tier) => ({ ...tier })) })) }]),
  );
  return { guns: map(catalog.guns), vehicles: map(catalog.vehicles), costs: catalog.modCosts };
}

function buildDto(row: { id: string; name: string; kind: string; model: string; mods: Prisma.JsonValue }): ArmorySavedBuildDto {
  return { id: row.id, name: row.name, kind: row.kind as 'GUN' | 'VEHICLE', model: row.model as ArmorySavedBuildDto['model'], mods: normalizeMods(row.mods) };
}

function normalizedName(name: string): string {
  return name.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function modsJson(mods: Array<{ key: string; tier: number }>): Prisma.InputJsonArray {
  return mods.map(({ key, tier }) => ({ key, tier }));
}

function gunCopyData(roundPlayerId: string, gun: PlayerGun, mods: Array<{ key: string; tier: number }>) {
  return {
    roundPlayerId, quantity: gun.quantity, model: gun.model, name: gun.name, condition: gun.condition,
    mods: modsJson(mods), lookKey: gun.lookKey, origin: jsonInput(gun.origin), stats: jsonInput(gun.stats), history: jsonInput(gun.history), status: gun.status,
    favorite: gun.favorite, reserve: gun.reserve,
  };
}

function vehicleCopyData(roundPlayerId: string, vehicle: { quantity: number; model: string; name: string | null; plate: string | null; condition: number; mods: Prisma.JsonValue; lookKey: string | null; origin: Prisma.JsonValue; stats: Prisma.JsonValue; history: Prisma.JsonValue; status: string }, mods: Array<{ key: string; tier: number }>) {
  return {
    roundPlayerId, quantity: vehicle.quantity, model: vehicle.model, name: vehicle.name, plate: vehicle.plate, condition: vehicle.condition,
    mods: modsJson(mods), lookKey: vehicle.lookKey, origin: jsonInput(vehicle.origin), stats: jsonInput(vehicle.stats), history: jsonInput(vehicle.history), status: vehicle.status,
  };
}

async function writeGunMods(db: Db, roundPlayerId: string, gun: PlayerGun, mods: Array<{ key: string; tier: number }>, quantity: number) {
  const data = { ...gunCopyData(roundPlayerId, gun, mods), history: appendItemEvent(gun.history, { type: 'MODIFIED', summary: 'Changed weapon modifications' }) };
  if (quantity >= gun.quantity) {
    await db.playerGun.update({ where: { id: gun.id }, data: { mods: data.mods, history: data.history } });
    return;
  }
  await db.playerGun.update({ where: { id: gun.id }, data: { quantity: { decrement: quantity } } });
  await db.playerGun.create({ data: { ...data, quantity } });
}

async function writeVehicleMods(db: Db, roundPlayerId: string, vehicle: PlayerVehicle, mods: Array<{ key: string; tier: number }>, quantity: number) {
  const data = { ...vehicleCopyData(roundPlayerId, vehicle, mods), history: appendItemEvent(vehicle.history, { type: 'MODIFIED', summary: 'Changed vehicle modifications' }) };
  if (quantity >= vehicle.quantity) {
    await db.playerVehicle.update({ where: { id: vehicle.id }, data: { mods: data.mods, history: data.history } });
    return;
  }
  await db.playerVehicle.update({ where: { id: vehicle.id }, data: { quantity: { decrement: quantity } } });
  await db.playerVehicle.create({ data: { ...data, quantity } });
}

async function renameGun(db: Db, roundPlayerId: string, id: string, name: string) {
  const gun = await db.playerGun.findFirst({ where: { id, roundPlayerId } });
  if (!gun) throw AppError.notFound('ARMORY_ITEM_NOT_FOUND', 'That gun is no longer in your armory.');
  if (gun.quantity === 1) {
    return db.playerGun.update({ where: { id }, data: { name, history: appendItemEvent(gun.history, { type: 'NAMED', summary: `Named ${name}` }) } });
  }
  await db.playerGun.update({ where: { id }, data: { quantity: { decrement: 1 } } });
  return db.playerGun.create({
    data: {
      roundPlayerId, model: gun.model, name, condition: gun.condition, mods: jsonInput(gun.mods),
      lookKey: gun.lookKey, origin: jsonInput(gun.origin), stats: jsonInput(gun.stats), history: appendItemEvent(gun.history, { type: 'NAMED', summary: `Named ${name}` }), status: gun.status,
      favorite: gun.favorite, reserve: gun.reserve,
    },
  });
}

async function renameVehicle(db: Db, roundPlayerId: string, id: string, name: string) {
  const vehicle = await db.playerVehicle.findFirst({ where: { id, roundPlayerId } });
  if (!vehicle) throw AppError.notFound('GARAGE_ITEM_NOT_FOUND', 'That vehicle is no longer in your garage.');
  if (vehicle.quantity === 1) return db.playerVehicle.update({ where: { id }, data: { name, history: appendItemEvent(vehicle.history, { type: 'NAMED', summary: `Named ${name}` }) } });
  await db.playerVehicle.update({ where: { id }, data: { quantity: { decrement: 1 } } });
  return db.playerVehicle.create({
    data: {
      roundPlayerId, model: vehicle.model, name, plate: vehicle.plate, condition: vehicle.condition,
      mods: jsonInput(vehicle.mods), lookKey: vehicle.lookKey, origin: jsonInput(vehicle.origin), stats: jsonInput(vehicle.stats), history: appendItemEvent(vehicle.history, { type: 'NAMED', summary: `Named ${name}` }), status: vehicle.status,
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
      mods: jsonInput(gun.mods), lookKey: gun.lookKey, origin: jsonInput(gun.origin), stats: jsonInput(gun.stats), history: jsonInput(gun.history), status: gun.status,
      favorite: flags.favorite, reserve: flags.reserve,
    },
  });
}

function combineKey(row: PlayerGun | PlayerVehicle, kind: 'GUN' | 'VEHICLE'): string {
  const common = [row.model, row.name, row.condition, row.mods, row.lookKey, row.status];
  return JSON.stringify(kind === 'GUN' && 'favorite' in row ? [...common, row.favorite, row.reserve] : common);
}

export const ArmoryService = {
  async catalog(prisma: PrismaClient, roundPlayerId: string, accountId: string, ruleset: Ruleset): Promise<IndividualInventoryDto> {
    const catalog = ruleset.individualItems;
    if (!catalog?.enabled) {
      return {
        enabled: false, maxGuns: 0, maxVehicles: 0,
        summary: { gunCount: 0, vehicleCount: 0, gunsByModel: { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 }, vehiclesByModel: { SEDAN: 0, LOW_RIDER: 0, VAN: 0 }, conditionBands: { guns: [0, 0, 0, 0, 0], vehicles: [0, 0, 0, 0, 0] } },
        resources: { cashCents: 0, vehicleParts: 0 },
        modCatalog: { guns: {} as IndividualInventoryDto['modCatalog']['guns'], vehicles: {} as IndividualInventoryDto['modCatalog']['vehicles'], costs: {} as IndividualInventoryDto['modCatalog']['costs'] },
        builds: [], looks: [], featuredItem: null,
        guns: [], vehicles: [],
      };
    }
    const [summary, guns, vehicles, player, builds, unlocks, profile] = await Promise.all([
      prisma.playerArmorySummary.findUnique({ where: { roundPlayerId } }),
      prisma.playerGun.findMany({ where: { roundPlayerId }, orderBy: [{ model: 'asc' }, { condition: 'desc' }, { createdAt: 'asc' }] }),
      prisma.playerVehicle.findMany({ where: { roundPlayerId }, orderBy: [{ model: 'asc' }, { condition: 'desc' }, { createdAt: 'asc' }] }),
      prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { cashCents: true, vehicleParts: true } }),
      prisma.playerArmoryBuild.findMany({ where: { roundPlayerId }, orderBy: [{ kind: 'asc' }, { model: 'asc' }, { name: 'asc' }] }),
      prisma.accountCosmeticUnlock.findMany({ where: { accountId, kind: 'ITEM_COLLECTION' }, select: { key: true, styleKey: true, title: true, rarity: true } }),
      prisma.accountProfile.findUnique({ where: { accountId }, select: { famousItem: true } }),
    ]);
    const gunDtos = guns.map((row) => ({
      id: row.id, model: row.model as 'PISTOL' | 'SHOTGUN' | 'TEK9' | 'AK47', name: row.name, condition: row.condition,
      mods: itemMods(row.mods), lookKey: row.lookKey, origin: jsonRecord(row.origin), stats: jsonRecord(row.stats) as Record<string, number>, history: itemEvents(row.history),
      status: row.status as 'READY' | 'BROKEN' | 'LOCKED', quantity: row.quantity, favorite: row.favorite, reserve: row.reserve,
    }));
    const vehicleDtos = vehicles.map((row) => ({
      id: row.id, model: row.model as 'SEDAN' | 'LOW_RIDER' | 'VAN', name: row.name, plate: row.plate, condition: row.condition,
      mods: itemMods(row.mods), lookKey: row.lookKey, origin: jsonRecord(row.origin), stats: jsonRecord(row.stats) as Record<string, number>, history: itemEvents(row.history),
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
    return {
      enabled: true, maxGuns: catalog.maxGuns, maxVehicles: catalog.maxVehicles, summary: summaryDto(totals),
      resources: { cashCents: Number(player?.cashCents ?? 0n), vehicleParts: player?.vehicleParts ?? 0 },
      modCatalog: modCatalogDto(catalog) as IndividualInventoryDto['modCatalog'],
      builds: builds.map(buildDto), featuredItem: readFeaturedItem(profile?.famousItem), looks: unlocks.flatMap((unlock) => {
        const key = unlock.styleKey ?? unlock.key;
        return isReleasedItemCosmeticStyle(key) ? [{ key, title: unlock.title, rarity: unlock.rarity }] : [];
      }), guns: gunDtos, vehicles: vehicleDtos,
    };
  },

  setLook(prisma: PrismaClient, roundPlayerId: string, accountId: string, input: ArmoryLookActionInput) {
    return ActionService.run<ArmoryLookActionResult>(prisma, roundPlayerId, {
      action: 'ARMORY_LOOK_ACTION', actionId: input.actionId,
      execute: async ({ tx, current, ruleset }) => {
        requireCatalog(ruleset);
        if (new Set(input.items.map(({ kind, id }) => `${kind}:${id}`)).size !== input.items.length) {
          throw AppError.badRequest('DUPLICATE_ARMORY_SELECTION', 'Remove duplicate items from your selection.');
        }
        const unlocks = input.lookKey ? await tx.accountCosmeticUnlock.findMany({ where: { accountId, kind: 'ITEM_COLLECTION' }, select: { key: true, styleKey: true } }) : [];
        const owned = unlocks.some((row) => (row.styleKey ?? row.key) === input.lookKey);
        if (input.lookKey && (!owned || !isReleasedItemCosmeticStyle(input.lookKey))) {
          throw new AppError(403, 'ITEM_LOOK_NOT_OWNED', 'Unlock that collection before using its look.');
        }
        const guns = input.items.filter((item) => item.kind === 'GUN');
        const vehicles = input.items.filter((item) => item.kind === 'VEHICLE');
        const [gunRows, vehicleRows] = await Promise.all([
          guns.length ? tx.playerGun.findMany({ where: { roundPlayerId, id: { in: guns.map(({ id }) => id) } } }) : [],
          vehicles.length ? tx.playerVehicle.findMany({ where: { roundPlayerId, id: { in: vehicles.map(({ id }) => id) } } }) : [],
        ]);
        if (gunRows.length !== guns.length || vehicleRows.length !== vehicles.length) throw AppError.notFound('ARMORY_ITEM_NOT_FOUND', 'One or more selected items are no longer in your inventory.');
        const targetRows = [...gunRows, ...vehicleRows];
        for (const row of targetRows) {
          if (row.quantity !== 1 || row.status !== 'READY') throw AppError.conflict('ARMORY_ITEM_UNAVAILABLE', 'Looks can be changed on one ready item at a time.');
          const cosmeticKey = row.model;
          if (input.lookKey && !collectionCovers(input.lookKey, cosmeticKey)) throw AppError.badRequest('ITEM_LOOK_INCOMPATIBLE', 'That look was designed for a different item.');
        }
        for (const item of guns) {
          const row = gunRows.find((entry) => entry.id === item.id)!;
          if (row.lookKey === input.lookKey) continue;
          const history = appendItemEvent(row.history, { type: 'LOOK_CHANGED', summary: input.lookKey ? `Applied ${input.lookKey} look` : 'Returned to the stock look' });
          await tx.playerGun.update({ where: { id: row.id }, data: { lookKey: input.lookKey, history } });
        }
        for (const item of vehicles) {
          const row = vehicleRows.find((entry) => entry.id === item.id)!;
          if (row.lookKey === input.lookKey) continue;
          const history = appendItemEvent(row.history, { type: 'LOOK_CHANGED', summary: input.lookKey ? `Applied ${input.lookKey} look` : 'Returned to the stock look' });
          await tx.playerVehicle.update({ where: { id: row.id }, data: { lookKey: input.lookKey, history } });
        }
        return { next: current, result: { updated: targetRows.length, lookKey: input.lookKey } };
      },
    });
  },

  feature(prisma: PrismaClient, roundPlayerId: string, accountId: string, input: ArmoryFeatureItemInput) {
    return ActionService.run<ArmoryFeatureItemResult>(prisma, roundPlayerId, {
      action: 'ARMORY_FEATURE_ITEM', actionId: input.actionId,
      execute: async ({ tx, current, ruleset }) => {
        requireCatalog(ruleset);
        let featuredItem: FeaturedItemDto | null = null;
        if (input.item) {
          const row = input.item.kind === 'GUN'
            ? await tx.playerGun.findFirst({ where: { id: input.item.id, roundPlayerId } })
            : await tx.playerVehicle.findFirst({ where: { id: input.item.id, roundPlayerId } });
          if (!row || row.quantity !== 1 || row.status !== 'READY') throw AppError.conflict('FEATURED_ITEM_UNAVAILABLE', 'Choose one ready item from your armory or garage.');
          const owner = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { round: { select: { name: true } } } });
          const history = appendItemEvent(row.history, { type: 'FEATURED', summary: 'Featured on profile' });
          const stats = jsonRecord(row.stats) as Record<string, number>;
          featuredItem = { id: row.id, kind: input.item.kind, model: row.model, name: row.name, lookKey: row.lookKey, condition: row.condition,
            mods: itemMods(row.mods), stats, history: itemEvents(history), roundName: owner?.round.name ?? 'Current round' };
          if (input.item.kind === 'GUN') await tx.playerGun.update({ where: { id: row.id }, data: { history } });
          else await tx.playerVehicle.update({ where: { id: row.id }, data: { history } });
        }
        const famousItem = featuredItem ? featuredItem as unknown as Prisma.InputJsonValue : Prisma.JsonNull;
        await tx.accountProfile.upsert({ where: { accountId }, create: { accountId, famousItem }, update: { famousItem } });
        return { next: current, result: { featuredItem } };
      },
    });
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
        if (input.action === 'COMBINE') {
          let mergedStacks = 0;
          for (const [kind, rows] of [['GUN', guns], ['VEHICLE', vehicles]] as const) {
            const groups = new Map<string, Array<PlayerGun | PlayerVehicle>>();
            for (const row of rows) {
              const key = combineKey(row, kind);
              const group = groups.get(key) ?? [];
              group.push(row);
              groups.set(key, group);
            }
            for (const group of groups.values()) {
              if (group.length < 2) continue;
              const target = group[0]!;
              const quantity = group.reduce((sum, row) => sum + row.quantity, 0);
              if (kind === 'GUN') {
                await tx.playerGun.update({ where: { id: target.id }, data: { quantity } });
                await tx.playerGun.deleteMany({ where: { roundPlayerId, id: { in: group.slice(1).map((row) => row.id) } } });
              } else {
                await tx.playerVehicle.update({ where: { id: target.id }, data: { quantity } });
                await tx.playerVehicle.deleteMany({ where: { roundPlayerId, id: { in: group.slice(1).map((row) => row.id) } } });
              }
              mergedStacks += group.length - 1;
            }
          }
          if (!mergedStacks) throw AppError.conflict('NO_COMBINABLE_ARMORY_STACKS', 'Select matching stacks to combine.');
          await IndividualItemsService.refreshSummary(tx, roundPlayerId);
          return { next: current, result: { action: input.action, updated: mergedStacks, names } };
        }
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

  customize(prisma: PrismaClient, roundPlayerId: string, input: ArmoryModActionInput) {
    return ActionService.run<ArmoryModActionResult>(prisma, roundPlayerId, {
      action: 'ARMORY_MOD_ACTION', actionId: input.actionId,
      execute: async ({ tx, current, ruleset }) => {
        const catalog = requireCatalog(ruleset);
        if (input.action === 'DELETE_BUILD') {
          const build = await tx.playerArmoryBuild.findFirst({ where: { id: input.buildId!, roundPlayerId } });
          if (!build) throw AppError.notFound('ARMORY_BUILD_NOT_FOUND', 'That saved build is no longer available.');
          await tx.playerArmoryBuild.delete({ where: { id: build.id } });
          return { next: current, result: { action: input.action, updated: 1, affectedItems: 0, partsSpent: 0, partsRefunded: 0, cashSpentCents: 0, build: buildDto(build) } };
        }

        const items = input.items ?? [];
        if (new Set(items.map(({ kind, id }) => `${kind}:${id}`)).size !== items.length) {
          throw AppError.badRequest('DUPLICATE_ARMORY_SELECTION', 'Remove duplicate items from your selection.');
        }
        const gunIds = items.filter(({ kind }) => kind === 'GUN').map(({ id }) => id);
        const vehicleIds = items.filter(({ kind }) => kind === 'VEHICLE').map(({ id }) => id);
        const [guns, vehicles] = await Promise.all([
          gunIds.length ? tx.playerGun.findMany({ where: { roundPlayerId, id: { in: gunIds } } }) : [],
          vehicleIds.length ? tx.playerVehicle.findMany({ where: { roundPlayerId, id: { in: vehicleIds } } }) : [],
        ]);
        if (guns.length !== gunIds.length || vehicles.length !== vehicleIds.length) throw AppError.notFound('ARMORY_ITEM_NOT_FOUND', 'One or more selected items are no longer in your inventory. Refresh and try again.');

        if (input.action === 'SAVE_BUILD') {
          const item = items[0]!;
          const gun = item.kind === 'GUN' ? guns[0] : undefined;
          const vehicle = item.kind === 'VEHICLE' ? vehicles[0] : undefined;
          const model = gun?.model ?? vehicle?.model;
          const currentMods = normalizeMods(gun?.mods ?? vehicle?.mods);
          const rule = itemModRule(catalog, item.kind, model!);
          const mods = validateModSet(currentMods, rule);
          const requested = input.name!.trim();
          assertCommunicationContent(requested, '');
          const name = maskOrdinaryProfanity(requested).slice(0, 40).trim();
          if (!name) throw AppError.badRequest('INVALID_BUILD_NAME', 'Enter a name for this build.');
          const nameNormalized = normalizedName(name);
          const existing = await tx.playerArmoryBuild.findFirst({ where: { roundPlayerId, kind: item.kind, model, nameNormalized } });
          if (!existing && await tx.playerArmoryBuild.count({ where: { roundPlayerId } }) >= 50) {
            throw AppError.conflict('ARMORY_BUILD_LIMIT', 'You can save up to 50 armory builds. Delete one before saving another.');
          }
          const saved = existing
            ? await tx.playerArmoryBuild.update({ where: { id: existing.id }, data: { name, mods: modsJson(mods) } })
            : await tx.playerArmoryBuild.create({ data: { roundPlayerId, name, nameNormalized, kind: item.kind, model: model!, mods: modsJson(mods) } });
          return { next: current, result: { action: input.action, updated: 1, affectedItems: 0, partsSpent: 0, partsRefunded: 0, cashSpentCents: 0, build: buildDto(saved) } };
        }

        const kind = items[0]?.kind;
        const models = new Set([...guns.map(({ model }) => model), ...vehicles.map(({ model }) => model)]);
        if (!kind || (kind === 'GUN' ? vehicles.length > 0 : guns.length > 0) || models.size !== 1) {
          throw AppError.badRequest('MIXED_ARMORY_SELECTION', 'Select items of one type and model for a mod action.');
        }
        const model = [...models][0]!;
        const itemRule = itemModRule(catalog, kind, model);
        const targetRows = kind === 'GUN' ? guns : vehicles;
        for (const row of targetRows) {
          if (row.status !== 'READY') throw AppError.conflict('ARMORY_ITEM_UNAVAILABLE', 'Only ready equipment can be modified.');
          const origin = jsonRecord(row.origin);
          if (typeof origin.hotUntil === 'string' && Date.parse(origin.hotUntil) > Date.now()) {
            throw AppError.conflict('ARMORY_ITEM_HOT', 'That item is hot and cannot be modified until its recovery window ends.');
          }
        }
        const build = input.action === 'APPLY_BUILD'
          ? await tx.playerArmoryBuild.findFirst({ where: { id: input.buildId!, roundPlayerId } })
          : null;
        if (input.action === 'APPLY_BUILD') {
          if (!build) throw AppError.notFound('ARMORY_BUILD_NOT_FOUND', 'That saved build is no longer available.');
          if (build.kind !== kind || build.model !== model) throw AppError.badRequest('ARMORY_BUILD_MODEL_MISMATCH', 'That build is for a different equipment model.');
        }
        const targetMods = build ? validateModSet(normalizeMods(build.mods), itemRule) : null;
        const installRule = input.action === 'INSTALL_MOD' ? itemRule.mods.find(({ key }) => key === input.modKey) : null;
        if (input.action === 'INSTALL_MOD' && (!installRule || !installRule.tiers.some(({ tier }) => tier === input.tier))) {
          throw AppError.badRequest('INVALID_ARMORY_MOD', 'That modification or tier is not available for this item.');
        }
        let partsSpent = 0;
        let partsRefunded = 0;
        let cashSpentCents = 0;
        let affectedItems = 0;
        const updates: Array<{ kind: ArmoryItemKind; row: PlayerGun | PlayerVehicle; mods: Array<{ key: string; tier: number }>; quantity: number }> = [];
        for (const row of targetRows) {
          const before = validateModSet(normalizeMods(row.mods), itemRule);
          let desired: Array<{ key: string; tier: number }>;
          if (input.action === 'INSTALL_MOD') {
            const occupiedSlot = installRule!.slot;
            desired = [...before.filter((mod) => itemRule.mods.find(({ key }) => key === mod.key)?.slot !== occupiedSlot), { key: input.modKey!, tier: input.tier! }];
          } else if (input.action === 'REMOVE_MOD') {
            desired = before.filter(({ key }) => key !== input.modKey);
          } else {
            desired = targetMods!;
          }
          const transition = transitionModSet(before, desired, itemRule, catalog.modCosts);
          if (JSON.stringify(before) === JSON.stringify(transition.mods)) continue;
           const quantity = input.scope === 'STACK' ? row.quantity : 1;
           updates.push({ kind, row, mods: transition.mods, quantity });
           affectedItems += quantity;
           partsSpent += transition.partsSpent * quantity;
           partsRefunded += transition.partsRefunded * quantity;
           cashSpentCents += transition.cashSpentCents * quantity;
        }
        if (!updates.length) throw AppError.conflict('ARMORY_MOD_NO_CHANGE', 'The selected equipment already has that setup.');
        if (current.cashCents < BigInt(cashSpentCents)) throw AppError.conflict('NOT_ENOUGH_CASH', 'You do not have enough cash for that modification.');
        const vehicleParts = current.vehicleParts ?? 0;
        if (vehicleParts + partsRefunded < partsSpent) throw AppError.conflict('NOT_ENOUGH_VEHICLE_PARTS', 'You do not have enough parts for that modification.');
        for (const update of updates) {
           if (update.kind === 'GUN') await writeGunMods(tx, roundPlayerId, update.row as PlayerGun, update.mods, update.quantity);
           else await writeVehicleMods(tx, roundPlayerId, update.row as PlayerVehicle, update.mods, update.quantity);
        }
        await IndividualItemsService.refreshSummary(tx, roundPlayerId);
        return {
          next: { ...current, cashCents: current.cashCents - BigInt(cashSpentCents), vehicleParts: vehicleParts + partsRefunded - partsSpent },
          result: {
            action: input.action, updated: updates.length, affectedItems, partsSpent, partsRefunded, cashSpentCents,
            build: build ? buildDto(build) : null,
          },
        };
      },
    });
  },
};
