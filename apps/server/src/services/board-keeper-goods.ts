import type { Prisma } from '@prisma/client';
import { PLAYER_BOARD_KEEPER_GOODS, type Ruleset } from '@streets/rules-engine';
import type { PlayerBoardKeeperKey } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { appendItemEvent } from './individual-item-history.js';
import { IndividualItemsService } from './individual-items.service.js';

/**
 * The Board G: moving guns, low-riders and ammo. Each keeper good is a player column; on rounds
 * with an armory and garage, guns and cars are also individual item rows that must move with it.
 * The Board trades them as interchangeable units, so only clean ones go up: full condition, no
 * mods or name, ready (not locked into a fight or out on a run) and not hot. A buyer gets a fresh
 * stack marked as bought from the Board.
 */

type Keeper = (typeof PLAYER_BOARD_KEEPER_GOODS)[PlayerBoardKeeperKey];
type ItemRow = { id: string; quantity: number; origin: Prisma.JsonValue; history: Prisma.JsonValue };

const BOARD_ORIGIN = { kind: 'BOARD' } as const;

function keeper(key: string): Keeper {
  return PLAYER_BOARD_KEEPER_GOODS[key as PlayerBoardKeeperKey];
}

function individualOn(where: Keeper, ruleset: Ruleset): boolean {
  return where.individual !== null && ruleset.individualItems?.enabled === true;
}

function isHot(origin: Prisma.JsonValue, now: Date): boolean {
  const value = origin && typeof origin === 'object' && !Array.isArray(origin) ? (origin as Record<string, unknown>).hotUntil : undefined;
  return typeof value === 'string' && Date.parse(value) > now.getTime();
}

/** Clean rows of this model, oldest first. */
async function cleanRows(db: Db, roundPlayerId: string, where: Keeper, key: string, now: Date): Promise<ItemRow[]> {
  const filter = { roundPlayerId, model: key, name: null, condition: 100, status: 'READY', mods: { equals: [] } } as const;
  const select = { id: true, quantity: true, origin: true, history: true } as const;
  const rows = where.individual === 'GUN'
    ? await db.playerGun.findMany({ where: filter, select, orderBy: { createdAt: 'asc' } })
    : await db.playerVehicle.findMany({ where: filter, select, orderBy: { createdAt: 'asc' } });
  return rows.filter((row) => !isHot(row.origin, now));
}

async function column(db: Db, roundPlayerId: string, where: Keeper): Promise<number> {
  const player = await db.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { [where.field]: true } as Record<string, true> });
  return Number((player as Record<string, unknown>)[where.field] ?? 0);
}

/** Units of a keeper good the player could list: their column, or only the clean items when guns and cars are individual. */
export async function keeperHeld(db: Db, roundPlayerId: string, key: string, ruleset: Ruleset, now = new Date()): Promise<number> {
  const where = keeper(key);
  const held = await column(db, roundPlayerId, where);
  if (!individualOn(where, ruleset)) return held;
  const clean = (await cleanRows(db, roundPlayerId, where, key, now)).reduce((sum, row) => sum + row.quantity, 0);
  return Math.min(held, clean);
}

/** Whether the player already has a stack of this good, so a new one needs no stash cell. */
export async function keeperHasStack(db: Db, roundPlayerId: string, key: string): Promise<boolean> {
  return (await column(db, roundPlayerId, keeper(key))) > 0;
}

/** Take clean units off the player: the column, and the item rows with it. */
export async function keeperTake(db: Db, roundPlayerId: string, key: string, units: number, ruleset: Ruleset, now = new Date()): Promise<void> {
  const where = keeper(key);
  if ((await keeperHeld(db, roundPlayerId, key, ruleset, now)) < units) {
    throw AppError.badRequest('NOT_ENOUGH_TO_LIST', 'Only clean, ready, undamaged units can go on the Board.');
  }
  await db.roundPlayer.update({ where: { id: roundPlayerId }, data: { [where.field]: { decrement: units } } });
  if (!individualOn(where, ruleset)) return;
  let remaining = units;
  for (const row of await cleanRows(db, roundPlayerId, where, key, now)) {
    if (!remaining) break;
    const take = Math.min(remaining, row.quantity);
    if (where.individual === 'GUN') {
      if (take === row.quantity) await db.playerGun.delete({ where: { id: row.id } });
      else await db.playerGun.update({ where: { id: row.id }, data: { quantity: { decrement: take } } });
    } else if (take === row.quantity) await db.playerVehicle.delete({ where: { id: row.id } });
    else await db.playerVehicle.update({ where: { id: row.id }, data: { quantity: { decrement: take } } });
    remaining -= take;
  }
  await IndividualItemsService.refreshSummary(db, roundPlayerId);
}

/**
 * Give units to the player: the column, and a fresh Board stack. `enforceCap` refuses a buyer
 * whose armory or garage is full; a seller's own stack coming home is never refused.
 */
export async function keeperGive(db: Db, roundPlayerId: string, key: string, units: number, ruleset: Ruleset, options: { enforceCap: boolean; summary: string }): Promise<void> {
  const where = keeper(key);
  const catalog = ruleset.individualItems;
  if (individualOn(where, ruleset) && catalog && options.enforceCap) {
    const isGun = where.individual === 'GUN';
    const aggregate = isGun
      ? await db.playerGun.aggregate({ where: { roundPlayerId }, _sum: { quantity: true } })
      : await db.playerVehicle.aggregate({ where: { roundPlayerId }, _sum: { quantity: true } });
    const cap = isGun ? catalog.maxGuns : catalog.maxVehicles;
    if ((aggregate._sum.quantity ?? 0) + units > cap) {
      throw AppError.conflict('ARMORY_CAP_EXCEEDED', `That would take you past the ${isGun ? 'gun' : 'vehicle'} capacity of ${cap.toLocaleString('en-US')}.`);
    }
  }
  await db.roundPlayer.update({ where: { id: roundPlayerId }, data: { [where.field]: { increment: units } } });
  if (!individualOn(where, ruleset)) return;
  const filter = { roundPlayerId, model: key, name: null, condition: 100, status: 'READY', mods: { equals: [] }, origin: { equals: BOARD_ORIGIN } } as const;
  const event = { type: 'ACQUIRED' as const, summary: options.summary };
  if (where.individual === 'GUN') {
    const existing = await db.playerGun.findFirst({ where: filter, orderBy: { createdAt: 'asc' } });
    if (existing) await db.playerGun.update({ where: { id: existing.id }, data: { quantity: { increment: units }, history: appendItemEvent(existing.history, event) } });
    else await db.playerGun.create({ data: { roundPlayerId, model: key, quantity: units, origin: BOARD_ORIGIN, history: appendItemEvent([], event) } });
  } else {
    const existing = await db.playerVehicle.findFirst({ where: filter, orderBy: { createdAt: 'asc' } });
    if (existing) await db.playerVehicle.update({ where: { id: existing.id }, data: { quantity: { increment: units }, history: appendItemEvent(existing.history, event) } });
    else await db.playerVehicle.create({ data: { roundPlayerId, model: key, quantity: units, origin: BOARD_ORIGIN, history: appendItemEvent([], event) } });
  }
  await IndividualItemsService.refreshSummary(db, roundPlayerId);
}
