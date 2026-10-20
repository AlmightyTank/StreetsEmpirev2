import type { Prisma } from '@prisma/client';
import {
  clampVehicleDamage,
  hashParts,
  markRunVehicles,
  noVehicleDamage,
  racketStorePrice,
  seededRng,
  readRacketEffects,
  vehicleServiceDiscount,
  type Ruleset,
  type VehicleDamage,
  type VehicleServiceDiscount,
} from '@streets/rules-engine';
import type { VehicleClassId } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { FactionService } from './faction.service.js';
import { PlayerSkillService } from './player-skill.service.js';

export type VehicleLoadout = { LOW_RIDER: number; SEDAN: number; VAN: number };
const emptyLoadout = (): VehicleLoadout => ({ LOW_RIDER: 0, SEDAN: 0, VAN: 0 });

function readCounts(value: unknown): VehicleLoadout {
  const result = emptyLoadout();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of ['LOW_RIDER', 'SEDAN', 'VAN'] as const) {
      const count = (value as Record<string, unknown>)[key];
      if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0) result[key] = count;
    }
  }
  return result;
}

/** Legacy runs that do not have a valid class breakdown remain all Low-Riders. */
export function readVehicleLoadout(value: Prisma.JsonValue | undefined, expectedTotal: number): VehicleLoadout {
  const result = readCounts(value);
  const total = result.LOW_RIDER + result.SEDAN + result.VAN;
  return total === expectedTotal ? result : { ...emptyLoadout(), LOW_RIDER: expectedTotal };
}

/** Keep class ownership in step when a road incident removes cars from a run. */
export function trimVehicleLoadout(loadout: VehicleLoadout, targetTotal: number): VehicleLoadout {
  const result = { ...loadout };
  let remove = Math.max(0, result.LOW_RIDER + result.SEDAN + result.VAN - targetTotal);
  for (const key of ['LOW_RIDER', 'SEDAN', 'VAN'] as const) {
    const lost = Math.min(result[key], remove);
    result[key] -= lost;
    remove -= lost;
  }
  return result;
}

export function addLowRiders(loadout: VehicleLoadout, count: number): VehicleLoadout {
  return { ...loadout, LOW_RIDER: loadout.LOW_RIDER + Math.max(0, count) };
}

export function vehicleLoadoutJson(loadout: VehicleLoadout): Prisma.InputJsonValue {
  return { ...loadout };
}

/**
 * 1.5.0-C. What part of a run's loadout comes home Damaged or Disabled. Always read
 * against the loadout as it stands, so a car taken off the run takes its record with it.
 */
export function readVehicleDamage(value: Prisma.JsonValue | undefined, loadout: VehicleLoadout): VehicleDamage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return noVehicleDamage();
  return clampVehicleDamage(loadout, { damaged: readCounts(value.damaged), disabled: readCounts(value.disabled) });
}

export function vehicleDamageJson(damage: VehicleDamage): Prisma.InputJsonValue {
  return { damaged: { ...damage.damaged }, disabled: { ...damage.disabled } };
}

export const hasVehicleDamage = (damage: VehicleDamage) =>
  Object.values(damage.damaged).some((count) => count > 0) || Object.values(damage.disabled).some((count) => count > 0);

/** The RoundPlayer columns behind each class and condition. */
export const VEHICLE_FIELDS = {
  LOW_RIDER: { ready: 'lowRiders', damaged: 'damagedLowRiders', disabled: 'disabledLowRiders' },
  SEDAN: { ready: 'sedans', damaged: 'damagedSedans', disabled: 'disabledSedans' },
  VAN: { ready: 'vans', damaged: 'damagedVans', disabled: 'disabledVans' },
} as const;

/**
 * 1.5.0-C. Road trouble puts some of a run's vehicles out of action. They keep driving
 * with the run and come home to the garage. Returns the run as it now stands.
 */
/**
 * Wheels: each vehicle about to be marked has the passive's chance to come through
 * clean. The roll is seeded by the run and the damage already on it, so settling the
 * same trouble again marks the same cars.
 */
async function skilledDamageCount(tx: Db, ruleset: Ruleset, runId: string, state: 'damaged' | 'disabled', count: number, before: object): Promise<number> {
  const owner = await tx.run.findUnique({ where: { id: runId }, select: { roundPlayerId: true } });
  const pct = owner ? (await PlayerSkillService.effects(tx, owner.roundPlayerId, ruleset.streetSkills)).percent('VEHICLE_DAMAGE') : 0;
  if (pct >= 0) return count;
  const rng = seededRng(hashParts(runId, 'skill-vehicle-damage', state, JSON.stringify(before)));
  let marked = 0;
  for (let index = 0; index < count; index++) if (rng() * 100 >= -pct) marked++;
  return marked;
}

export async function damageRunVehicles<T extends { id: string; lowRiders: number; vehicleLoadout: Prisma.JsonValue; vehicleDamage: Prisma.JsonValue }>(
  tx: Db, ruleset: Ruleset, run: T, state: 'damaged' | 'disabled', count: number,
): Promise<T> {
  if (!ruleset.vehicleCatalog?.service || count <= 0) return run;
  const loadout = readVehicleLoadout(run.vehicleLoadout, run.lowRiders);
  const before = readVehicleDamage(run.vehicleDamage, loadout);
  const damage = markRunVehicles(ruleset, loadout, before, state, await skilledDamageCount(tx, ruleset, run.id, state, count, before));
  await tx.run.update({ where: { id: run.id }, data: { vehicleDamage: vehicleDamageJson(damage) } });
  return { ...run, vehicleDamage: vehicleDamageJson(damage) as Prisma.JsonValue };
}

export interface VehicleServiceDiscounts {
  REPAIR: VehicleServiceDiscount;
  RECOVER: VehicleServiceDiscount;
}

/**
 * 1.5.0-D. What the road lane takes off this crew's garage service right now: its running
 * Auto Garage and Chop Shop rackets, and its Road Saints MC standing. Rounds without road
 * specialization never read standing.
 */
export async function vehicleServiceDiscounts(db: Db, roundPlayerId: string, ruleset: Ruleset, racketEffects: Prisma.JsonValue): Promise<VehicleServiceDiscounts> {
  const effects = readRacketEffects(racketEffects);
  const specialized = Boolean(ruleset.vehicleCatalog?.service?.specialization);
  const roadSaintsTier = specialized ? (await FactionService.tiers(db, roundPlayerId, ruleset)).ROAD_SAINTS ?? null : null;
  return {
    REPAIR: vehicleServiceDiscount(ruleset, 'REPAIR', { racketEffects: effects, roadSaintsTier }),
    RECOVER: vehicleServiceDiscount(ruleset, 'RECOVER', { racketEffects: effects, roadSaintsTier }),
  };
}

/** 1.5.0-D. Charlie's price for a class vehicle, after any Stolen Low-Riders discount. */
export function vehiclePurchaseCents(ruleset: Ruleset, classId: VehicleClassId, listCents: number, racketEffects: Prisma.JsonValue): { cents: number; discountPercent: number } {
  const discountPercent = racketStorePrice(ruleset, readRacketEffects(racketEffects), 'CHARLIE', classId).buyDiscountPercent;
  return { cents: Math.floor(listCents * (100 - discountPercent) / 100), discountPercent };
}
