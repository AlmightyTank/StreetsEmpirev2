import { randomInt } from 'node:crypto';
import { Prisma, type PlayerGun } from '@prisma/client';
import type { CombatCrew } from '@streets/rules-engine';
import type { IndividualItemsRules } from '@streets/rulesets';
import { STREET_SKILLS_V2 } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { appendItemEvent } from './individual-item-history.js';
import { stolenItemHotUntil } from './item-hot-window.js';
import { PlayerSkillService } from './player-skill.service.js';

type AmmoRules = { roundsPerFight: Readonly<Record<'PISTOL' | 'SHOTGUN' | 'TEK9' | 'AK47', number>>; defenderFloor: number; lootShareBps: number };
type Candidate = { row: PlayerGun; unit: number; power: number; rounds: number; jamChance: number; wear: number };
export type IndividualGunReceipt = { id: string; model: string; name: string | null; rounds: number; jammed: boolean; conditionBefore: number; conditionAfter: number };
export type IndividualLootReceipt = { model: string; name: string | null; mods: Array<{ key: string; tier: number }>; condition: number; hotUntil: string | null; recovered: boolean };
export type IndividualCombatPlan = {
  crew: CombatCrew;
  strengthMultiplier: number;
  heatReductionPercent: number;
  roundsSpent: number;
  freeRounds: number;
  receipts: IndividualGunReceipt[];
  settle: (db: Db, roundPlayerId: string) => Promise<void>;
  reserve: (db: Db, roundPlayerId: string, fightId: string) => Promise<IndividualGunReceipt[]>;
};

export async function settleReservedIndividualGuns(db: Db, roundPlayerId: string, receipts: IndividualGunReceipt[]): Promise<void> {
  for (const receipt of receipts) {
    const gun = await db.playerGun.findFirst({ where: { id: receipt.id, roundPlayerId, status: 'LOCKED' } });
    if (!gun) continue;
    const origin = statsRecord(gun.origin);
    delete origin.pendingCombat;
    const stats = statsRecord(gun.stats);
    await db.playerGun.update({ where: { id: gun.id }, data: {
      condition: receipt.conditionAfter,
      status: receipt.conditionAfter === 0 ? 'BROKEN' : 'READY',
      origin: origin as Prisma.InputJsonValue,
      stats: { ...stats, fights: (Number(stats.fights) || 0) + 1,
        roundsFired: (Number(stats.roundsFired) || 0) + receipt.rounds } as Prisma.InputJsonValue,
      history: appendItemEvent(gun.history, { type: 'COMBAT', summary: `Used in a fight and fired ${receipt.rounds} rounds` }),
    } });
  }
}

export async function releaseReservedIndividualGuns(db: Db, roundPlayerId: string, receipts: IndividualGunReceipt[]): Promise<void> {
  for (const receipt of receipts) {
    const gun = await db.playerGun.findFirst({ where: { id: receipt.id, roundPlayerId, status: 'LOCKED' } });
    if (!gun) continue;
    const origin = statsRecord(gun.origin);
    delete origin.pendingCombat;
    await db.playerGun.update({ where: { id: gun.id }, data: { status: gun.condition === 0 ? 'BROKEN' : 'READY', origin: origin as Prisma.InputJsonValue } });
  }
}

const modelKey = (model: string) => model as 'PISTOL' | 'SHOTGUN' | 'TEK9' | 'AK47';
const modList = (value: Prisma.JsonValue): Array<{ key: string; tier: number }> => Array.isArray(value)
  ? value.flatMap((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.key === 'string' && Number.isInteger(entry.tier)
    ? [{ key: entry.key, tier: entry.tier as number }] : [])
  : [];
const statsRecord = (value: Prisma.JsonValue): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const inputJson = (value: Prisma.JsonValue): Prisma.InputJsonValue | typeof Prisma.JsonNull => value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
const effect = (mods: Array<{ key: string; tier: number }>, rules: IndividualItemsRules, model: string, key: string) => {
  const mod = mods.find((entry) => entry.key === key);
  return mod ? rules.guns[modelKey(model)]?.mods.find((entry) => entry.key === key)?.tiers.find((tier) => tier.tier === mod.tier)?.effectPercent ?? 0 : 0;
};

/** Selects ready, non-reserve items best-first, charges ammo per item, and applies deterministic condition rules plus the supplied jam RNG. */
export async function planIndividualCombat(db: Db, roundPlayerId: string, crew: CombatCrew, committed: number,
  model: { weapons: Record<'PISTOL' | 'SHOTGUN' | 'TEK9' | 'AK47', { power: number }>; strength: { perThug: number; weaponPowerExponent: number; moraleFloor: number } },
  rules: IndividualItemsRules, ammo: AmmoRules, availableRounds: number, side: 'ATTACKER' | 'DEFENDER', rng: () => number,
  attackerCapRounds?: number): Promise<IndividualCombatPlan> {
  const rows = await db.playerGun.findMany({ where: { roundPlayerId, status: 'READY', condition: { gt: 0 }, reserve: false }, orderBy: [{ favorite: 'desc' }, { createdAt: 'asc' }] });
  const skills = await PlayerSkillService.effects(db, roundPlayerId, STREET_SKILLS_V2);
  const candidates: Candidate[] = [];
  for (const row of rows) {
    const mods = modList(row.mods);
    const modelRule = rules.guns[modelKey(row.model)];
    if (!modelRule) continue;
    const powerMod = effect(mods, rules, row.model, 'BARREL') + effect(mods, rules, row.model, 'SCOPE');
    const conditionFactor = row.condition < 50 ? 0.5 + row.condition / 100 : 1;
    const power = model.weapons[modelKey(row.model)].power * (1 + powerMod / 100) * conditionFactor;
    const comp = effect(mods, rules, row.model, 'COMPENSATOR');
    const moddedRounds = Math.ceil(ammo.roundsPerFight[modelKey(row.model)] * (100 - comp) / 100);
    const rounds = Math.max(1, Math.floor(skills.scale('AMMO_PER_FIGHT', moddedRounds)));
    const extendedMag = effect(mods, rules, row.model, 'EXTENDED_MAG');
    const baseJam = Math.min(30, 5 + Math.max(0, 50 - row.condition) * 0.5);
    const jamChance = skills.scale('GUN_JAM_CHANCE', baseJam * (1 - extendedMag / 100));
    const reinforced = effect(mods, rules, row.model, 'REINFORCED_FRAME');
    const baseWear = Math.max(1, Math.ceil(modelRule.wearPerFight * (100 - reinforced) / 100));
    const wear = Math.max(1, Math.floor(baseWear * (100 + skills.percent('GUN_WEAR')) / 100));
    for (let unit = 0; unit < row.quantity; unit++) candidates.push({ row, unit, power, rounds, jamChance, wear });
  }
  candidates.sort((a, b) => Number(b.row.favorite) - Number(a.row.favorite) || b.power - a.power || a.row.createdAt.getTime() - b.row.createdAt.getTime() || a.row.id.localeCompare(b.row.id) || a.unit - b.unit);
  const selected: Array<Candidate & { jammed: boolean; conditionAfter: number }> = [];
  let gunsRemaining = committed;
  let roundsRemaining = Math.min(availableRounds, attackerCapRounds ?? availableRounds);
  let roundsSpent = 0;
  let freeRounds = 0;
  let freeDefenderFighters = 0;
  for (const candidate of candidates) {
    if (gunsRemaining <= 0) break;
    const free = side === 'DEFENDER' && freeDefenderFighters < ammo.defenderFloor;
    if (!free && roundsRemaining < candidate.rounds) continue;
    if (free) { freeDefenderFighters += 1; freeRounds += candidate.rounds; }
    else { roundsRemaining -= candidate.rounds; roundsSpent += candidate.rounds; }
    const jammed = rng() * 100 < candidate.jamChance;
    selected.push({ ...candidate, jammed, conditionAfter: Math.max(0, candidate.row.condition - candidate.wear) });
    gunsRemaining -= 1;
  }
  const weaponCounts = { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 };
  for (const gun of selected) if (!gun.jammed) weaponCounts[modelKey(gun.row.model)] += 1;
  const morale = model.strength.moraleFloor + (1 - model.strength.moraleFloor) * crew.thugHappiness / 100;
  const desiredBase = committed * model.strength.perThug + selected.filter((gun) => !gun.jammed).reduce((sum, gun) => sum + gun.power ** model.strength.weaponPowerExponent, 0);
  const simulatedBase = committed * model.strength.perThug + (Object.entries(weaponCounts) as Array<[keyof typeof weaponCounts, number]>).reduce((sum, [key, count]) => sum + count * model.weapons[key].power ** model.strength.weaponPowerExponent, 0);
  const strengthMultiplier = simulatedBase > 0 ? desiredBase / simulatedBase : morale > 0 ? committed * model.strength.perThug / Math.max(1, simulatedBase) : 1;
  const receipts: IndividualGunReceipt[] = [];
  const settled = selected.slice();
  const resultCrew: CombatCrew = { ...crew, weapons: weaponCounts, thugHappiness: crew.thugHappiness };
  const heatReductionPercent = Math.min(25, selected.filter((gun) => !gun.jammed)
    .reduce((sum, gun) => sum + effect(modList(gun.row.mods), rules, gun.row.model, 'SUPPRESSOR'), 0));
  return {
    crew: resultCrew, strengthMultiplier, heatReductionPercent, roundsSpent, freeRounds,
    receipts,
    reserve: async (tx, ownerId, fightId) => {
      const byRow = new Map<string, typeof settled>();
      for (const gun of settled) byRow.set(gun.row.id, [...(byRow.get(gun.row.id) ?? []), gun]);
      const reserved: IndividualGunReceipt[] = [];
      for (const [rowId, used] of byRow) {
        const original = used[0]!.row;
        const remaining = original.quantity - used.length;
        if (remaining > 0) await tx.playerGun.update({ where: { id: rowId }, data: { quantity: remaining } });
        for (let index = 0; index < used.length; index++) {
          const gun = used[index]!;
          const pendingCombat = { fightId, rounds: gun.rounds, jammed: gun.jammed, conditionBefore: original.condition, conditionAfter: gun.conditionAfter };
          const origin = { ...statsRecord(original.origin), pendingCombat };
          const itemData = { model: original.model, name: original.name, condition: original.condition,
            status: 'LOCKED' as const, quantity: 1, mods: inputJson(original.mods), lookKey: original.lookKey,
            origin: origin as Prisma.InputJsonValue, stats: inputJson(original.stats), history: inputJson(original.history), favorite: original.favorite, reserve: false };
          const saved = remaining === 0 && index === 0
            ? await tx.playerGun.update({ where: { id: rowId }, data: itemData })
            : await tx.playerGun.create({ data: { roundPlayerId: ownerId, ...itemData } });
          reserved.push({ id: saved.id, model: original.model, name: original.name, rounds: gun.rounds, jammed: gun.jammed,
            conditionBefore: original.condition, conditionAfter: gun.conditionAfter });
        }
      }
      return reserved;
    },
    settle: async (tx, ownerId) => {
      const byRow = new Map<string, typeof settled>();
      for (const gun of settled) byRow.set(gun.row.id, [...(byRow.get(gun.row.id) ?? []), gun]);
      for (const [rowId, used] of byRow) {
        const original = used[0]!.row;
        // Keep the first item under the original id. Split additional fired copies and leave any unused stack together.
        const fired = used.length;
        const leftover = original.quantity - fired;
        if (original.quantity > 1 && leftover > 0) await tx.playerGun.update({ where: { id: rowId }, data: { quantity: leftover } });
        if (original.quantity > 1 && leftover === 0) await tx.playerGun.update({ where: { id: rowId }, data: { quantity: 1 } });
        const firedUnits = original.quantity === 1 ? used : leftover > 0 ? used : used.slice(1);
        if (original.quantity > 1 && leftover === 0) {
          const first = used[0]!;
          const firstStats = { ...statsRecord(original.stats), fights: (Number(statsRecord(original.stats).fights) || 0) + 1,
            roundsFired: (Number(statsRecord(original.stats).roundsFired) || 0) + first.rounds };
          await tx.playerGun.update({ where: { id: rowId }, data: { condition: first.conditionAfter,
            status: first.conditionAfter === 0 ? 'BROKEN' : 'READY', stats: firstStats,
            history: appendItemEvent(original.history, { type: 'COMBAT', summary: `Used in a fight and fired ${first.rounds} rounds` }) } });
          receipts.push({ id: rowId, model: original.model, name: original.name, rounds: first.rounds, jammed: first.jammed,
            conditionBefore: original.condition, conditionAfter: first.conditionAfter });
        }
        for (let index = 0; index < firedUnits.length; index++) {
          const gun = firedUnits[index]!;
          const nextStats = { ...statsRecord(original.stats), fights: (Number(statsRecord(original.stats).fights) || 0) + 1,
            roundsFired: (Number(statsRecord(original.stats).roundsFired) || 0) + gun.rounds };
          const data = { condition: gun.conditionAfter, status: gun.conditionAfter === 0 ? 'BROKEN' : 'READY', stats: nextStats,
            history: appendItemEvent(original.history, { type: 'COMBAT', summary: `Used in a fight and fired ${gun.rounds} rounds` }) };
          const saved = original.quantity === 1 && index === 0
            ? await tx.playerGun.update({ where: { id: rowId }, data })
            : await tx.playerGun.create({ data: { roundPlayerId: ownerId, model: original.model, name: original.name, ...data,
              mods: inputJson(original.mods), lookKey: original.lookKey, origin: inputJson(original.origin), quantity: 1, favorite: original.favorite, reserve: false } });
          receipts.push({ id: saved.id, model: original.model, name: original.name, rounds: gun.rounds, jammed: gun.jammed, conditionBefore: original.condition, conditionAfter: gun.conditionAfter });
        }
      }
    },
  };
}

export async function lootIndividualGun(db: Db, fromRoundPlayerId: string, toRoundPlayerId: string, now: Date,
  takenFrom: { displayName: string; cityName: string }): Promise<IndividualLootReceipt | null> {
  const candidates = await db.playerGun.findMany({ where: { roundPlayerId: fromRoundPlayerId, status: { not: 'LOCKED' } }, orderBy: [{ condition: 'desc' }, { createdAt: 'asc' }] });
  if (!candidates.length) return null;
  const available = candidates.filter((gun) => !gun.reserve);
  const rowsForLoot = available.length ? available : candidates;
  const priorOwned = rowsForLoot.filter((gun) => {
    const origin = gun.origin && typeof gun.origin === 'object' && !Array.isArray(gun.origin) ? gun.origin as Record<string, unknown> : {};
    return origin.stolenFromRoundPlayerId === toRoundPlayerId && typeof origin.hotUntil === 'string' && Date.parse(origin.hotUntil) > now.getTime();
  });
  const rows = priorOwned.length ? priorOwned : rowsForLoot;
  const totalUnits = rows.reduce((total, row) => total + row.quantity, 0);
  let draw = randomInt(0, totalUnits);
  const gun = rows.find((row) => (draw -= row.quantity) < 0)!;
  const origin = gun.origin && typeof gun.origin === 'object' && !Array.isArray(gun.origin) ? gun.origin as Record<string, unknown> : {};
  const history = Array.isArray(origin.history) ? origin.history : [];
  const recovered = origin.stolenFromRoundPlayerId === toRoundPlayerId && typeof origin.hotUntil === 'string' && Date.parse(origin.hotUntil) > now.getTime();
  const hotUntil = recovered ? null : await stolenItemHotUntil(db, toRoundPlayerId, fromRoundPlayerId, now);
  const nextOrigin: Record<string, unknown> = recovered
    ? { ...origin, kind: 'RECOVERED', history: [...history, { event: 'RECOVERED_BY_OWNER', roundPlayerId: toRoundPlayerId, at: now.toISOString() }] }
    : { ...origin, kind: 'LOOTED', stolenFromRoundPlayerId: fromRoundPlayerId, hotUntil: hotUntil!.toISOString(), history: [...history, { event: 'TAKEN_IN_COMBAT', fromRoundPlayerId, fromName: takenFrom.displayName, cityName: takenFrom.cityName, at: now.toISOString() }] };
  if (recovered) { delete nextOrigin.hotUntil; delete nextOrigin.stolenFromRoundPlayerId; }
  const data = { roundPlayerId: toRoundPlayerId, model: gun.model, name: gun.name, condition: gun.condition, mods: inputJson(gun.mods), lookKey: null,
    origin: nextOrigin as Prisma.InputJsonValue,
    stats: inputJson(gun.stats), history: appendItemEvent(gun.history, { type: recovered ? 'RECOVERED' : 'STOLEN',
      summary: recovered ? 'Recovered by its former owner' : `Taken in combat from ${takenFrom.displayName}`, city: takenFrom.cityName,
      otherPlayer: takenFrom.displayName, at: now }), status: gun.status, quantity: 1, favorite: false, reserve: false };
  if (gun.quantity === 1) await db.playerGun.delete({ where: { id: gun.id } });
  else await db.playerGun.update({ where: { id: gun.id }, data: { quantity: { decrement: 1 } } });
  await db.playerGun.create({ data });
  return { model: gun.model, name: gun.name, mods: modList(gun.mods), condition: gun.condition, hotUntil: hotUntil?.toISOString() ?? null, recovered };
}
