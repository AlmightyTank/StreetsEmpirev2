import type { BlockWar, BlockWarFight, BlockWarSquad, Business, Prisma, PrismaClient, Turf, TurfOutpost } from '@prisma/client';
import {
  alliedShare,
  allyCutCents,
  blockTier,
  blockWarFatigue,
  businessStaff,
  controlAfterBreak,
  decayHeat,
  fatigueAfter,
  regenerateTurns,
  hashParts,
  hoursToFullControl,
  isScarred,
  loadRulesetForRound,
  racketGetawayShare,
  readRacketEffects,
  sackLootCents,
  sackedLevel,
  seededRng,
  siegeControlAfter,
  simulateRaid,
  splitWounds,
  tierAfterTake,
  torchResult,
  turfPushCombatModel,
  warTruceHours,
  type Ruleset,
} from '@streets/rules-engine';
import type { BusinessKey, WeaponKey } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { lockRoundPlayer } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { accountsShareNetwork } from './admin-signals.service.js';
import { staffColumns } from './business.service.js';
import { LawService } from './law.service.js';
import { CombatRecoveryService } from './combat-recovery.service.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { ProductInventoryService } from './product-inventory.service.js';
import {
  addCornerGuns,
  cornerGunWorthCents,
  gunsFromTurf,
  outpostBoxWorthCents,
  releaseCornerGuns,
  subtractCornerGuns,
  turfGunData,
  type CornerGuns,
} from './turf.service.js';
import { endTurfHold, startTurfHold } from './turf-history.service.js';
import { recordTerritoryControlChange, territoryControlForCity } from './turf-territory.service.js';

/**
 * 1.1.0-D. Block wars settle lazily, the way turf pushes do: whenever anyone in the war
 * acts or reads, and on a one-minute sweep so a war ends on time with everyone offline.
 * `advance` walks the war's events in time order (fights landing, torches burning down,
 * Control reaching 100, the time limit) up to now.
 *
 * Only the holder's row and the block are written while a war settles. Everyone else's
 * committed thugs, guns, loot and Heat come back through their own credit pass, under
 * their own lock, exactly like a push squad.
 */

type Weapons = Record<WeaponKey, number>;
type CombatModel = NonNullable<ReturnType<typeof turfPushCombatModel>>;
interface OutpostLoot {
  cashCents: number;
  beer: number;
  products: Record<string, number>;
}
export interface WarCrewSnapshot {
  thugHappiness: number;
  weapons: Weapons;
  /** 1.1.0-E. An alliance squad borrowed from this outpost corner instead of home. */
  sourceOutpost?: { turfId: string; outpostId: string };
  /** Capped exposed stock from an outpost captured by a Take. */
  outpostLoot?: OutpostLoot;
}

const HOUR_MS = 3_600_000;
const NO_WEAPONS: Weapons = { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 };
const EMPTY_GUNS: CornerGuns = { pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const crewOf = (value: Prisma.JsonValue) => value as unknown as WarCrewSnapshot;
const fromWeapons = (w: Weapons): CornerGuns => ({ pistols: w.PISTOL ?? 0, shotguns: w.SHOTGUN ?? 0, tek9s: w.TEK9 ?? 0, ak47s: w.AK47 ?? 0 });
const toWeapons = (g: CornerGuns): Weapons => ({ PISTOL: g.pistols, SHOTGUN: g.shotguns, TEK9: g.tek9s, AK47: g.ak47s });
const addWeapons = (a: Weapons, b: Weapons): Weapons => ({ PISTOL: a.PISTOL + b.PISTOL, SHOTGUN: a.SHOTGUN + b.SHOTGUN, TEK9: a.TEK9 + b.TEK9, AK47: a.AK47 + b.AK47 });

/** 1.1.0-E uses the same exposed-share and hard loot caps as a 0.6.0-D outpost capture. */
function outpostCaptureLoot(
  ruleset: Ruleset,
  box: Pick<TurfOutpost, 'cashCents' | 'beer' | 'products'>,
): OutpostLoot {
  const rules = ruleset.turf?.outposts;
  if (!rules) return { cashCents: 0, beer: 0, products: {} };
  const products = box.products as Record<string, number>;
  let productRoom = rules.lootProductCap;
  const lootedProducts: Record<string, number> = {};
  for (const key of Object.keys(products).sort()) {
    if (productRoom <= 0) break;
    const quantity = Math.max(0, products[key] ?? 0);
    const take = Math.min(productRoom, Math.floor(quantity * rules.lootShare));
    if (take > 0) {
      lootedProducts[key] = take;
      productRoom -= take;
    }
  }
  return {
    cashCents: Math.min(rules.lootCashCapCents, Math.floor(Number(box.cashCents) * rules.lootShare)),
    beer: Math.min(rules.lootBeerCap, Math.floor(box.beer * rules.lootShare)),
    products: lootedProducts,
  };
}

function hasOutpostLoot(loot: OutpostLoot): boolean {
  return loot.cashCents > 0 || loot.beer > 0 || Object.values(loot.products).some((quantity) => quantity > 0);
}

export const ACTIVE_WAR = { not: 'ENDED' } as const;

/** The best guns first: what a squad of `count` from this snapshot fights (or stays posted) with. */
export function pickWeapons(snapshot: WarCrewSnapshot, count: number, model: CombatModel | null): Weapons {
  const out: Weapons = { ...NO_WEAPONS };
  let left = Math.max(0, count);
  const keys = (['AK47', 'TEK9', 'SHOTGUN', 'PISTOL'] as WeaponKey[])
    .sort((a, b) => (model ? model.weapons[b].power - model.weapons[a].power : 0));
  for (const key of keys) {
    if (left <= 0) break;
    const take = Math.min(snapshot.weapons[key] ?? 0, left);
    out[key] = take;
    left -= take;
  }
  return out;
}

function engagement(groups: Array<{ key: string; size: number }>, cap: number): Record<string, number> {
  const engaged: Record<string, number> = {};
  let left = cap;
  for (const group of groups) {
    const count = Math.min(Math.max(0, group.size), Math.max(0, left));
    engaged[group.key] = count;
    left -= count;
  }
  return engaged;
}

function scarred(ruleset: Ruleset, capturedAts: readonly Date[], now: Date): boolean {
  const window = ruleset.business?.fatigue.scarredWindowHours ?? 0;
  const since = now.getTime() - window * HOUR_MS;
  return isScarred(ruleset, capturedAts.filter((at) => at.getTime() >= since).length);
}

/**
 * The block's war fatigue right now. While a war is on it only climbs (every fight and
 * every hour of siege); in peace it heals, slower on a block that keeps changing hands.
 */
export function blockFatigueNow(
  ruleset: Ruleset,
  turf: Pick<Turf, 'fatigue' | 'fatigueAt' | 'capturedAts'>,
  war: Pick<BlockWar, 'fatigueAtStart' | 'fights' | 'siegeHours' | 'status' | 'controlAt'> | null,
  now: Date,
): { percent: number; scarred: boolean } {
  const isScar = scarred(ruleset, turf.capturedAts, now);
  if (war && war.status !== 'ENDED') {
    const live = war.status === 'SIEGE' && war.controlAt ? Math.max(0, (now.getTime() - war.controlAt.getTime()) / HOUR_MS) : 0;
    return {
      percent: blockWarFatigue(ruleset, { startFatigue: war.fatigueAtStart, fights: war.fights, siegeHours: war.siegeHours + live, outcome: 'DEFENDED' }),
      scarred: isScar,
    };
  }
  const hours = Math.max(0, (now.getTime() - turf.fatigueAt.getTime()) / HOUR_MS);
  return { percent: fatigueAfter(ruleset, turf.fatigue, hours, isScar), scarred: isScar };
}

async function lockWar(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "BlockWar" WHERE id = ${id} FOR UPDATE`;
}
async function lockBlock(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Turf" WHERE id = ${id} FOR UPDATE`;
}
async function lockOutpost(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "TurfOutpost" WHERE id = ${id} FOR UPDATE`;
}

/** Send a squad home: everyone not wounded or posted walks back through the owner's credit. */
/**
 * Loot, an ally's cut and Heat are paid through a row of their own, so they reach the
 * player's credit pass even when every squad they sent has already come home.
 */
async function payout(
  tx: Db,
  warId: string,
  playerId: string,
  side: 'ATTACKER' | 'DEFENDER',
  role: string,
  cents: number,
  heat: number,
  outpostLoot?: OutpostLoot,
  sourceOutpost?: WarCrewSnapshot['sourceOutpost'],
): Promise<void> {
  if (cents <= 0 && heat <= 0 && !outpostLoot) return;
  await tx.blockWarSquad.create({
    data: {
      warId, playerId, side, role, sent: 0, thugs: 0, active: false,
      crew: json({
        thugHappiness: 0,
        weapons: NO_WEAPONS,
        ...(outpostLoot ? { outpostLoot } : {}),
        ...(sourceOutpost ? { sourceOutpost } : {}),
      }),
      payoutCents: BigInt(Math.max(0, cents)), heat: Math.max(0, heat),
    },
  });
}

async function release(tx: Db, squads: readonly BlockWarSquad[]): Promise<void> {
  const ids = squads.filter((squad) => squad.active).map((squad) => squad.id);
  if (ids.length) await tx.blockWarSquad.updateMany({ where: { id: { in: ids } }, data: { active: false, thugs: 0 } });
}

/** A business that lost levels sheds the staff its new level cannot take; they go home. */
async function shedStaff(tx: Db, ruleset: Ruleset, row: Business, level: number, holderId: string): Promise<number> {
  const required = businessStaff(ruleset, row.kind as BusinessKey, level);
  const keep = level > 0 ? Math.min(row.staff, required) : 0;
  const shed = row.staff - keep;
  if (shed > 0 && row.staffOwnerId === holderId) {
    const columns = staffColumns(ruleset, row.kind as BusinessKey, shed);
    await tx.roundPlayer.update({
      where: { id: holderId },
      data: { businessThugs: { decrement: columns.businessThugs }, businessWhores: { decrement: columns.businessWhores } },
    });
  }
  return keep;
}

interface WarState {
  war: BlockWar;
  turf: Turf & { city: { id: string; slug: string }; outpost: TurfOutpost | null };
  base: Ruleset;
  model: CombatModel;
}

function siegeShare(squads: readonly BlockWarSquad[]): number {
  const declarer = squads.filter((squad) => squad.active && squad.side === 'ATTACKER' && squad.role === 'DECLARER').reduce((sum, squad) => sum + squad.thugs, 0);
  const ally = squads.filter((squad) => squad.active && squad.side === 'ATTACKER' && squad.role === 'ALLY').reduce((sum, squad) => sum + squad.thugs, 0);
  return alliedShare(declarer, ally);
}

/** Advance a siege's Control (and its hours) to `to`. */
function tick(state: WarState, squads: readonly BlockWarSquad[], to: Date): void {
  const { war } = state;
  if (war.status !== 'SIEGE' || !war.controlAt || to <= war.controlAt) return;
  const hours = (to.getTime() - war.controlAt.getTime()) / HOUR_MS;
  war.control = siegeControlAfter(state.base, war.control, hours, siegeShare(squads));
  war.siegeHours += hours;
  war.controlAt = to;
}

/** The siege is over (broken, or the war ended with the holder keeping the block): the hold clock resumes. */
function siegePause(state: WarState, at: Date): Partial<Turf> {
  const since = state.war.siegeSince;
  if (!since || !state.turf.heldSince) return { siegedSince: null };
  const paused = Math.max(0, at.getTime() - since.getTime());
  return { siegedSince: null, heldSince: new Date(state.turf.heldSince.getTime() + paused) };
}

async function burnTorch(tx: Db, state: WarState, row: Business, at: Date): Promise<void> {
  const holderId = state.turf.holderId;
  if (!holderId || row.torchById !== holderId || row.level <= 0) {
    await tx.business.update({ where: { id: row.id }, data: { torchUntil: null, torchById: null } });
    return;
  }
  const result = torchResult(state.base, row.kind as BusinessKey, row.level);
  const staff = await shedStaff(tx, state.base, row, result.level, holderId);
  await tx.business.update({
    where: { id: row.id },
    data: { level: result.level, staff, staffTarget: Math.min(row.staffTarget, staff), torchUntil: null, torchById: null, ...(result.level === 0 ? { racket: null, racketSince: null } : {}) },
  });
  if (result.salvageCents > 0) {
    await tx.roundPlayer.update({ where: { id: holderId }, data: { cashCents: { increment: BigInt(result.salvageCents) } } });
    await EconomyLedgerService.record(tx, holderId, [{
      source: 'BUSINESS_TORCH', label: `Torched ${state.base.business!.catalog[row.kind as BusinessKey].name} · salvage`,
      amountCents: BigInt(result.salvageCents), metadata: { warId: state.war.id, lot: row.lot, levelFrom: row.level, levelTo: result.level },
    }], at);
  }
  await ActivityService.log(tx, holderId, 'BUSINESS_TORCH', json({
    warId: state.war.id, district: state.turf.district, lot: row.lot, kind: row.kind,
    name: state.base.business!.catalog[row.kind as BusinessKey].name, done: true, levelFrom: row.level, levelTo: result.level, salvageCents: result.salvageCents,
  }));
}

async function resolveFight(tx: Db, state: WarState, fight: BlockWarFight, at: Date): Promise<void> {
  const { war, turf, base, model } = state;
  const squads = await tx.blockWarSquad.findMany({ where: { warId: war.id, active: true }, orderBy: { createdAt: 'asc' } });
  const defender = await tx.roundPlayer.findUniqueOrThrow({ where: { id: war.defenderId } });

  const attackers = squads.filter((squad) => squad.side === 'ATTACKER' && squad.thugs > 0);
  const helpers = squads.filter((squad) => squad.side === 'DEFENDER' && squad.fightId === fight.id && squad.thugs > 0);
  const cornerSnapshot: WarCrewSnapshot = { thugHappiness: defender.thugHappiness, weapons: toWeapons(gunsFromTurf(turf)) };
  const attackerGroups = attackers.map((squad) => ({ key: squad.id, size: squad.thugs, snapshot: crewOf(squad.crew) }));
  const defenderGroups = [
    { key: 'corner', size: turf.cornerThugs, snapshot: cornerSnapshot },
    ...helpers.map((squad) => ({ key: squad.id, size: squad.thugs, snapshot: crewOf(squad.crew) })),
  ];
  const attackerEngaged = engagement(attackerGroups, model.squadCap);
  const defenderEngaged = engagement(defenderGroups, model.squadCap);
  const side = (groups: typeof attackerGroups, engaged: Record<string, number>) => {
    let weapons: Weapons = { ...NO_WEAPONS };
    let count = 0;
    let morale = 0;
    for (const group of groups) {
      const engagedCount = engaged[group.key] ?? 0;
      if (engagedCount <= 0) continue;
      count += engagedCount;
      morale += engagedCount * group.snapshot.thugHappiness;
      weapons = addWeapons(weapons, pickWeapons(group.snapshot, engagedCount, model));
    }
    return { thugs: count, thugHappiness: count > 0 ? Math.round(morale / count) : 50, weapons };
  };
  const attack = side(attackerGroups, attackerEngaged);
  const defend = side(defenderGroups, defenderEngaged);

  let attackerWon: boolean;
  let attackerWounds = 0;
  let defenderWounds = 0;
  let strength: { attacker: number; defender: number } | null = null;
  if (attack.thugs <= 0) attackerWon = false;
  else if (defend.thugs <= 0) attackerWon = true;
  else {
    // The holder's side always fights on home ground: it is still the holder's block, even
    // when the holder is the one breaking a siege.
    const result = simulateRaid({
      attacker: attack,
      defender: defend,
      attackingThugs: attack.thugs,
      attackerTurns: model.turnCost,
      defenderCashCents: 0n,
    }, model, seededRng(hashParts(war.id, fight.id, 'block-war-fight')));
    attackerWon = result.winner === 'ATTACKER';
    attackerWounds = result.wounds.attacker;
    defenderWounds = result.wounds.defender;
    strength = { attacker: Math.round(result.effectiveStrength.attacker), defender: Math.round(result.effectiveStrength.defender) };
  }
  const recoverAt = new Date(at.getTime() + model.wounds.recoveryMinutes * 60_000);

  const attackerSplit = splitWounds(attackerWounds, attackerEngaged);
  if (!attackerWon && fight.kind !== 'BREAK') {
    // 1.1.0-C: a declarer's Getaway cars get some of a beaten squad home unhurt.
    const declarer = attackers.find((squad) => squad.role === 'DECLARER');
    if (declarer && (attackerSplit[declarer.id] ?? 0) > 0) {
      const effects = await tx.roundPlayer.findUnique({ where: { id: declarer.playerId }, select: { racketEffects: true } });
      const wounds = attackerSplit[declarer.id]!;
      attackerSplit[declarer.id] = wounds - Math.floor(wounds * racketGetawayShare(base, readRacketEffects(effects?.racketEffects)));
    }
  }
  const defenderSplit = splitWounds(defenderWounds, defenderEngaged);
  for (const squad of [...attackers, ...helpers]) {
    const wounds = Math.min(squad.thugs, (attackerSplit[squad.id] ?? 0) + (defenderSplit[squad.id] ?? 0));
    if (wounds <= 0) continue;
    squad.thugs -= wounds;
    squad.wounded += wounds;
    await tx.blockWarSquad.update({ where: { id: squad.id }, data: { thugs: squad.thugs, wounded: squad.wounded, recoverAt } });
  }

  // Wounded corner thugs go home to recover, and their guns go back to the arsenal.
  const cornerWounds = Math.min(turf.cornerThugs, defenderSplit.corner ?? 0);
  if (cornerWounds > 0) {
    const guns = releaseCornerGuns(gunsFromTurf(turf), cornerWounds);
    const worth = cornerGunWorthCents(base, guns);
    await tx.roundPlayer.update({
      where: { id: defender.id },
      data: {
        postedThugs: Math.max(0, defender.postedThugs - cornerWounds),
        pistols: defender.pistols + guns.pistols, shotguns: defender.shotguns + guns.shotguns,
        tek9s: defender.tek9s + guns.tek9s, ak47s: defender.ak47s + guns.ak47s,
        postedNetWorthCents: defender.postedNetWorthCents >= worth ? defender.postedNetWorthCents - worth : 0n,
      },
    });
    await CombatRecoveryService.add(tx, defender.id, null, cornerWounds, recoverAt);
    const left = subtractCornerGuns(gunsFromTurf(turf), guns);
    turf.cornerThugs -= cornerWounds;
    Object.assign(turf, turfGunData(left));
    await tx.turf.update({ where: { id: turf.id }, data: { cornerThugs: turf.cornerThugs, ...turfGunData(left) } });
  }

  // An ally fought if any of their thugs were engaged.
  for (const squad of [...attackers, ...helpers]) {
    if (squad.role !== 'ALLY') continue;
    const engaged = (attackerEngaged[squad.id] ?? 0) + (defenderEngaged[squad.id] ?? 0);
    if (engaged <= 0) continue;
    if (squad.side === 'ATTACKER') war.attackerAllyFought = true;
    else war.defenderAllyFought = true;
  }
  war.fights += 1;

  const holderWon = !attackerWon;
  if (fight.kind === 'BREAK') {
    await release(tx, helpers);
    if (holderWon) {
      // The siege is broken: Control falls back, the occupiers go home wounded.
      war.control = controlAfterBreak(base, war.control);
      await release(tx, attackers);
      const pause = siegePause(state, at);
      Object.assign(turf, pause);
      await tx.turf.update({ where: { id: turf.id }, data: pause });
      war.status = 'BETWEEN';
      war.siegeSince = null;
      war.controlAt = null;
      war.nextAssaultAt = new Date(at.getTime() + base.business!.wars.resiegeCooldownHours * HOUR_MS);
    }
  } else {
    await release(tx, helpers);
    if (attackerWon) {
      war.status = 'SIEGE';
      war.siegeSince = at;
      war.controlAt = at;
      turf.siegedSince = at;
      await tx.turf.update({ where: { id: turf.id }, data: { siegedSince: at } });
    } else {
      await release(tx, attackers);
      war.status = 'BETWEEN';
      war.nextAssaultAt = new Date(at.getTime() + base.business!.wars.resiegeCooldownHours * HOUR_MS);
    }
  }

  const result = {
    kind: fight.kind, attackerWon, strength,
    attackers: attack.thugs, defenders: defend.thugs, corner: defenderEngaged.corner ?? 0,
    attackerWounds: Object.values(attackerSplit).reduce((sum, value) => sum + value, 0),
    defenderWounds, cornerWounds, control: Math.round(war.control),
  };
  await tx.blockWarFight.update({ where: { id: fight.id }, data: { status: 'LANDED', result: json(result) } });
  const payload = json({ warId: war.id, district: turf.district, fightId: fight.id, ...result });
  const told = new Set([war.attackerId, war.defenderId, ...attackers.map((squad) => squad.playerId), ...helpers.map((squad) => squad.playerId)]);
  for (const playerId of told) await ActivityService.log(tx, playerId, 'BLOCK_WAR_FIGHT', payload);
}

export type WarEnding = { winner: 'ATTACKER' | 'DEFENDER' | null; reason: 'CONTROL' | 'CONCEDED' | 'WITHDREW' | 'TIMEOUT' | 'ABANDONED' | 'CUTOFF' };

/** End a war at `at`, hand out the war goal, and set the truce and the block's fatigue. */
async function endWar(tx: Db, state: WarState, at: Date, ending: WarEnding): Promise<void> {
  const { war, turf, base } = state;
  const rules = base.business!;
  const squads = await tx.blockWarSquad.findMany({ where: { warId: war.id, active: true }, orderBy: { createdAt: 'asc' } });
  const pending = await tx.blockWarFight.findMany({ where: { warId: war.id, status: 'PENDING' } });
  if (pending.length) await tx.blockWarFight.updateMany({ where: { id: { in: pending.map((fight) => fight.id) } }, data: { status: 'CANCELLED' } });

  const attackerWon = ending.winner === 'ATTACKER';
  const outcome = attackerWon
    ? (ending.reason === 'CONCEDED' ? 'CONCEDE' : war.goal)
    : 'DEFENDED';
  const fatigue = blockWarFatigue(base, { startFatigue: war.fatigueAtStart, fights: war.fights, siegeHours: war.siegeHours, outcome });
  const businesses = await tx.business.findMany({ where: { turfId: turf.id }, orderBy: { lot: 'asc' } });
  const takes = attackerWon && war.goal === 'TAKE';

  // Torches still burning: a Take catches them before they finish; otherwise they finish now.
  for (const row of businesses.filter((entry) => entry.torchUntil)) {
    if (takes) await tx.business.update({ where: { id: row.id }, data: { torchUntil: null, torchById: null } });
    else await burnTorch(tx, state, row, at);
  }

  const defender = await tx.roundPlayer.findUniqueOrThrow({ where: { id: war.defenderId } });
  const capturedOutpost = takes && base.business?.outposts && turf.outpost?.ownerId === defender.id ? turf.outpost : null;
  const capturedOutpostWorth = capturedOutpost
    ? outpostBoxWorthCents(base, {
        cashCents: capturedOutpost.cashCents,
        beer: capturedOutpost.beer,
        products: capturedOutpost.products as Record<string, number>,
      })
    : 0n;
  const capturedOutpostLoot = capturedOutpost ? outpostCaptureLoot(base, capturedOutpost) : null;
  const result: Record<string, unknown> = { winner: ending.winner, reason: ending.reason, goal: war.goal, fatigue: Math.round(fatigue), fights: war.fights, siegeHours: Math.round(war.siegeHours * 10) / 10 };
  let turfData: Prisma.TurfUncheckedUpdateInput = { fatigue, fatigueAt: at, siegedSince: null };

  if (takes) {
    // The defender's corner crew goes home hurt, with its guns; staff come home on the
    // defender's next business settle and the uncollected registers are lost (1.1.0-B).
    const cornerGuns = gunsFromTurf(turf);
    const worth = cornerGunWorthCents(base, cornerGuns);
    await tx.roundPlayer.update({
      where: { id: defender.id },
      data: {
        postedThugs: Math.max(0, defender.postedThugs - turf.cornerThugs),
        pistols: defender.pistols + cornerGuns.pistols, shotguns: defender.shotguns + cornerGuns.shotguns,
        tek9s: defender.tek9s + cornerGuns.tek9s, ak47s: defender.ak47s + cornerGuns.ak47s,
        postedNetWorthCents: defender.postedNetWorthCents >= worth ? defender.postedNetWorthCents - worth : 0n,
        ...(capturedOutpost ? {
          outpostNetWorthCents: defender.outpostNetWorthCents >= capturedOutpostWorth
            ? defender.outpostNetWorthCents - capturedOutpostWorth
            : 0n,
        } : {}),
      },
    });
    const model = state.model;
    await CombatRecoveryService.add(tx, defender.id, null, turf.cornerThugs, new Date(at.getTime() + model.wounds.recoveryMinutes * 60_000));

    // The declarer's squad stays on as the new corner crew, with its best guns.
    const declarer = squads.find((squad) => squad.role === 'DECLARER' && squad.side === 'ATTACKER');
    const posted = declarer?.thugs ?? 0;
    const postedGuns = declarer ? fromWeapons(pickWeapons(crewOf(declarer.crew), posted, model)) : { ...EMPTY_GUNS };
    if (declarer) await tx.blockWarSquad.update({ where: { id: declarer.id }, data: { posted, thugs: 0, active: false } });

    // One tier down from what the holder had built, the clock starting at that tier.
    const heldHours = turf.heldSince ? Math.max(0, (at.getTime() - turf.heldSince.getTime() - (war.siegeSince ? at.getTime() - war.siegeSince.getTime() : 0)) / HOUR_MS) : 0;
    const tier = blockTier(base, { heldHours, levels: businesses.map((row) => row.level) });
    const after = tierAfterTake(base, tier);

    // An account linked to the holder cannot capture a built block: it starts from nothing.
    const attacker = await tx.roundPlayer.findUniqueOrThrow({ where: { id: war.attackerId }, select: { accountId: true } });
    if (await accountsShareNetwork(tx, attacker.accountId, defender.accountId, at)) {
      await tx.business.updateMany({ where: { turfId: turf.id }, data: { level: 0, racket: null, racketSince: null } });
      result.linkedReset = true;
    }

    const controlBefore = await territoryControlForCity(tx, war.roundId, turf.cityId, base);
    if (capturedOutpost) {
      // The box cannot remain attached to a block whose holder changed. As with a turf push,
      // only the capped exposed share survives as loot; the rest is lost with the remote box.
      if (capturedOutpost.cashCents > 0n) {
        await EconomyLedgerService.record(tx, defender.id, [{
          source: 'TURF_PUSH_DEFENSE',
          label: 'Outpost cash lost · block war',
          amountCents: -capturedOutpost.cashCents,
          metadata: { warId: war.id, turfId: turf.id },
        }], at);
      }
      await tx.turfOutpost.delete({ where: { id: capturedOutpost.id } });
      turf.outpost = null;
      if (capturedOutpostLoot && hasOutpostLoot(capturedOutpostLoot)) {
        await payout(tx, war.id, war.attackerId, 'ATTACKER', 'OUTPOST_LOOT', capturedOutpostLoot.cashCents, 0, capturedOutpostLoot);
        result.outpostLoot = capturedOutpostLoot;
      }
    }
    await endTurfHold(tx, turf.id, at);
    turfData = {
      ...turfData,
      holderId: war.attackerId,
      cornerThugs: posted,
      ...turfGunData(postedGuns),
      heldSince: new Date(at.getTime() - after.heldHours * HOUR_MS),
      shieldUntil: new Date(at.getTime() + warTruceHours(base, 'TAKE') * HOUR_MS),
      upkeepAt: at,
      localsAt: at,
      localsReclaimAt: null,
      capturedAts: [...turf.capturedAts, at],
    };
    await tx.turf.update({ where: { id: turf.id }, data: turfData });
    await startTurfHold(tx, turf.id, at);
    await recordTerritoryControlChange(tx, { roundId: war.roundId, cityId: turf.cityId, ruleset: base, before: controlBefore, at });
    Object.assign(result, { tierBefore: tier, tierAfter: after.tier, posted });
    turfData = {};
  } else if (attackerWon && war.goal === 'SACK') {
    // A share of the registers, capped, and every business a level down. The holder keeps the block.
    const total = businesses.reduce((sum, row) => sum + Number(row.registerCents), 0);
    const loot = sackLootCents(base, total);
    let taken = 0;
    for (const [index, row] of businesses.entries()) {
      const share = index === businesses.length - 1
        ? loot - taken
        : total > 0 ? Math.floor(Number(row.registerCents) * loot / total) : 0;
      const take = Math.min(Number(row.registerCents), Math.max(0, share));
      taken += take;
      const level = sackedLevel(base, row.level);
      const staff = row.level > 0 ? await shedStaff(tx, base, row, level, defender.id) : row.staff;
      await tx.business.update({
        where: { id: row.id },
        data: { registerCents: row.registerCents - BigInt(take), level, staff, staffTarget: Math.min(row.staffTarget, staff), ...(level === 0 ? { racket: null, racketSince: null } : {}) },
      });
    }
    const allyCut = war.attackerAllyId ? allyCutCents(base, taken, war.attackerCut, war.attackerAllyFought) : 0;
    // The ally may have fought in an earlier assault and already been released by the time
    // a later assault wins the Sack. Read any squad they sent, not just the active set, so
    // an outpost-sourced ally's payout still returns to that outpost.
    const allySquad = war.attackerAllyId
      ? await tx.blockWarSquad.findFirst({
          where: { warId: war.id, playerId: war.attackerAllyId, role: 'ALLY' },
          orderBy: { createdAt: 'asc' },
        })
      : null;
    const allySource = allySquad ? crewOf(allySquad.crew).sourceOutpost : undefined;
    await payout(tx, war.id, war.attackerId, 'ATTACKER', 'DECLARER', taken - allyCut, rules.wars.sackHeat ?? 0);
    if (allyCut > 0 && war.attackerAllyId) {
      await payout(tx, war.id, war.attackerAllyId, 'ATTACKER', 'ALLY', allyCut, 0, undefined, allySource);
    }
    turfData = { ...turfData, ...siegePause(state, at), shieldUntil: new Date(at.getTime() + warTruceHours(base, 'SACK') * HOUR_MS) };
    Object.assign(result, { lootCents: taken, allyCutCents: allyCut });
  } else {
    // The holder keeps the block: a truce, and the hold clock picks up where it paused.
    turfData = {
      ...turfData,
      ...siegePause(state, at),
      ...(ending.winner === 'DEFENDER' ? { shieldUntil: new Date(at.getTime() + warTruceHours(base, 'DEFENDED') * HOUR_MS) } : {}),
    };
  }

  // The winning side's ally earns its cut of the block's business income during the truce.
  if (ending.winner && (takes || ending.winner === 'DEFENDER')) {
    const side = ending.winner === 'ATTACKER' ? 'attacker' : 'defender';
    const allyId = side === 'attacker' ? war.attackerAllyId : war.defenderAllyId;
    const fought = side === 'attacker' ? war.attackerAllyFought : war.defenderAllyFought;
    const cut = side === 'attacker' ? war.attackerCut : war.defenderCut;
    if (allyId && fought && cut > 0) {
      const until = new Date(at.getTime() + warTruceHours(base, 'DEFENDED') * HOUR_MS);
      await tx.turf.update({ where: { id: turf.id }, data: { warCutPlayerId: allyId, warCutShare: cut, warCutUntil: until } });
      result.allyCut = { playerId: allyId, share: cut, until: until.toISOString() };
    }
  }

  if (Object.keys(turfData).length) await tx.turf.update({ where: { id: turf.id }, data: turfData });
  await release(tx, squads.filter((squad) => !(takes && squad.role === 'DECLARER' && squad.side === 'ATTACKER')));

  war.status = 'ENDED';
  war.winner = ending.winner;
  war.endReason = ending.reason;
  war.endedAt = at;
  await tx.blockWar.update({
    where: { id: war.id },
    data: {
      status: 'ENDED', winner: ending.winner, endReason: ending.reason, endedAt: at, result: json(result),
      control: war.control, controlAt: war.controlAt, siegeHours: war.siegeHours, fights: war.fights,
      attackerAllyFought: war.attackerAllyFought, defenderAllyFought: war.defenderAllyFought,
    },
  });
  const payload = json({ warId: war.id, district: turf.district, ...result });
  const told = new Set([war.attackerId, war.defenderId, war.attackerAllyId, war.defenderAllyId].filter((id): id is string => Boolean(id)));
  for (const playerId of told) await ActivityService.log(tx, playerId, 'BLOCK_WAR_ENDED', payload);
}

/**
 * Walk one war forward to `now`. Locks the holder, then the war, then the block - the same
 * order as the holder's own actions.
 */
async function advanceIn(tx: Db, warId: string, now: Date, ending?: WarEnding): Promise<boolean> {
  const head = await tx.blockWar.findUnique({ where: { id: warId }, select: { defenderId: true, status: true } });
  if (!head || head.status === 'ENDED') return false;
  await lockRoundPlayer(tx, head.defenderId);
  await lockWar(tx, warId);
  const war = await tx.blockWar.findUniqueOrThrow({ where: { id: warId }, include: { round: true } });
  if (war.status === 'ENDED') return false;
  await lockBlock(tx, war.turfId);
  const turf = await tx.turf.findUniqueOrThrow({ where: { id: war.turfId }, include: { city: { select: { id: true, slug: true } }, outpost: true } });
  const base = loadRulesetForRound(war.round);
  const model = turfPushCombatModel(base);
  if (!model || !base.business) return false;
  const state: WarState = { war, turf, base, model };

  for (let step = 0; step < 100; step++) {
    // The block left the holder some other way (released, crackdown): the war is moot.
    if (turf.holderId !== war.defenderId) {
      await endWar(tx, state, now < war.endsBy ? now : war.endsBy, { winner: null, reason: 'ABANDONED' });
      return true;
    }
    const squads = await tx.blockWarSquad.findMany({ where: { warId, active: true } });
    const fight = await tx.blockWarFight.findFirst({ where: { warId, status: 'PENDING' }, orderBy: { landsAt: 'asc' } });
    const torch = await tx.business.findFirst({ where: { turfId: turf.id, torchUntil: { not: null } }, orderBy: { torchUntil: 'asc' } });
    const fullAt = war.status === 'SIEGE' && war.controlAt
      ? new Date(war.controlAt.getTime() + hoursToFullControl(base, war.control, siegeShare(squads)) * HOUR_MS)
      : null;
    const events: Array<{ at: Date; kind: 'FULL' | 'TORCH' | 'FIGHT' | 'TIMEOUT' }> = [];
    if (fullAt) events.push({ at: fullAt, kind: 'FULL' });
    if (torch?.torchUntil) events.push({ at: torch.torchUntil, kind: 'TORCH' });
    if (fight) events.push({ at: fight.landsAt, kind: 'FIGHT' });
    events.push({ at: war.endsBy, kind: 'TIMEOUT' });
    const order = { FULL: 0, TORCH: 1, FIGHT: 2, TIMEOUT: 3 } as const;
    events.sort((a, b) => a.at.getTime() - b.at.getTime() || order[a.kind] - order[b.kind]);
    const next = events[0]!;

    if (next.at > now) {
      if (ending) {
        tick(state, squads, now);
        await endWar(tx, state, now, ending);
        return true;
      }
      tick(state, squads, now);
      break;
    }
    tick(state, squads, next.at);
    if (next.kind === 'FULL') {
      war.control = 100;
      await endWar(tx, state, next.at, { winner: 'ATTACKER', reason: 'CONTROL' });
      return true;
    }
    if (next.kind === 'TIMEOUT') {
      await endWar(tx, state, war.endsBy, { winner: 'DEFENDER', reason: 'TIMEOUT' });
      return true;
    }
    if (next.kind === 'TORCH') {
      await burnTorch(tx, state, torch!, next.at);
      continue;
    }
    await resolveFight(tx, state, fight!, next.at);
  }

  await tx.blockWar.update({
    where: { id: war.id },
    data: {
      status: war.status, control: war.control, controlAt: war.controlAt, siegeSince: war.siegeSince,
      siegeHours: war.siegeHours, fights: war.fights, nextAssaultAt: war.nextAssaultAt,
      attackerAllyFought: war.attackerAllyFought, defenderAllyFought: war.defenderAllyFought,
    },
  });
  return true;
}

/** A transaction of its own from the client; inside one already (no `$transaction`), run there. */
function inTransaction<T>(db: PrismaClient | Db, run: (tx: Db) => Promise<T>): Promise<T> {
  return typeof (db as PrismaClient).$transaction === 'function'
    ? (db as PrismaClient).$transaction((tx) => run(tx as Db), { timeout: 20_000, maxWait: 10_000 })
    : run(db as Db);
}

export const BlockWarSettleService = {
  /** Bring one war up to date; with `ending`, end it now that way (concede, withdraw). */
  advance(db: PrismaClient | Db, warId: string, now: Date = new Date(), ending?: WarEnding): Promise<boolean> {
    return inTransaction(db, (tx) => advanceIn(tx, warId, now, ending));
  },

  /** Every war this player is in, before the player acts or reads. */
  async settleDueFor(prisma: PrismaClient, playerId: string, now: Date = new Date()): Promise<number> {
    const wars = await prisma.blockWar.findMany({
      where: {
        status: ACTIVE_WAR,
        OR: [
          { attackerId: playerId }, { defenderId: playerId }, { attackerAllyId: playerId }, { defenderAllyId: playerId },
          { squads: { some: { playerId, active: true } } },
        ],
      },
      select: { id: true },
      take: 10,
    });
    for (const war of wars) await BlockWarSettleService.advance(prisma, war.id, now);
    return wars.length;
  },

  /** The minute sweep: every live war, so wars end on time with nobody online. */
  async sweep(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
    const wars = await prisma.blockWar.findMany({ where: { status: ACTIVE_WAR }, select: { id: true }, take: 200 });
    for (const war of wars) await BlockWarSettleService.advance(prisma, war.id, now);
    return wars.length;
  },

  /** At the standings cutoff, every war is settled to the cutoff and whatever is left ends there. */
  async resolveRoundAtCutoff(tx: Db, roundId: string, cutoff: Date): Promise<number> {
    const wars = await tx.blockWar.findMany({ where: { roundId, status: ACTIVE_WAR }, select: { id: true } });
    for (const war of wars) {
      await advanceIn(tx, war.id, cutoff);
      await advanceIn(tx, war.id, cutoff, { winner: 'DEFENDER', reason: 'CUTOFF' });
    }
    return wars.length;
  },

  /**
   * Bring this player's committed thugs home: the wounded to recovery as they are hurt, the
   * rest (and the guns) when the squad is released; on a Take the declarer's survivors stay
   * posted on the new corner. Loot, the ally's cut and Heat land with the final credit.
   */
  async credit(tx: Db, playerId: string, now: Date = new Date()): Promise<void> {
    const squads = await tx.blockWarSquad.findMany({
      where: { playerId, OR: [{ gunsCreditedAt: null }, { payoutCents: { gt: 0n } }] },
      orderBy: { createdAt: 'asc' },
    });
    if (!squads.length) return;
    const pending = squads.filter((squad) =>
      squad.sent - squad.thugs > squad.creditedThugs
      || squad.wounded > squad.creditedWounded
      || !squad.active
      || squad.payoutCents > 0n);
    if (!pending.length) return;
    const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: playerId }, include: { round: true } });
    const ruleset = loadRulesetForRound(player.round);
    const model = turfPushCombatModel(ruleset);
    let busyThugs = player.busyThugs;
    let postedThugs = player.postedThugs;
    let postedNetWorthCents = player.postedNetWorthCents;
    let outpostNetWorthCents = player.outpostNetWorthCents;
    let cashCents = player.cashCents;
    let beer = player.beer;
    const productLoot: Record<string, number> = {};
    let heat = player.heat;
    let heatAdded = 0;
    const caseHeat: Array<{ squadId: string; warId: string; heat: number }> = [];
    let guns: CornerGuns = { pistols: player.pistols, shotguns: player.shotguns, tek9s: player.tek9s, ak47s: player.ak47s };

    for (const squad of pending) {
      const away = squad.sent - squad.thugs;
      const back = Math.max(0, away - squad.creditedThugs);
      busyThugs = Math.max(0, busyThugs - back);
      const wounds = Math.max(0, squad.wounded - squad.creditedWounded);
      if (wounds > 0) await CombatRecoveryService.add(tx, playerId, null, wounds, squad.recoverAt ?? now);
      const done = !squad.active;
      const snapshot = crewOf(squad.crew);
      let payoutRemaining = squad.payoutCents;

      if (done && !squad.gunsCreditedAt) {
        const committed = fromWeapons(snapshot.weapons);
        let staying = fromWeapons(pickWeapons(snapshot, squad.posted, model));

        // E outpost allies go back to the corner they borrowed the squad from. Wounded
        // thugs and their guns come home; survivors and their guns resume outpost duty.
        if (snapshot.sourceOutpost && squad.role === 'ALLY') {
          await lockBlock(tx, snapshot.sourceOutpost.turfId);
          const source = await tx.turf.findUnique({
            where: { id: snapshot.sourceOutpost.turfId },
            include: { outpost: true },
          });
          const stillOwned = source?.holderId === playerId
            && source.outpost?.id === snapshot.sourceOutpost.outpostId
            && source.outpost.ownerId === playerId;
          if (stillOwned && source) {
            const survivors = Math.max(0, squad.sent - squad.wounded);
            staying = fromWeapons(pickWeapons(snapshot, survivors, model));
            const nextGuns = addCornerGuns(gunsFromTurf(source), staying);
            await tx.turf.update({
              where: { id: source.id },
              data: { cornerThugs: source.cornerThugs + survivors, ...turfGunData(nextGuns) },
            });
            postedThugs += survivors;
          } else {
            staying = { ...EMPTY_GUNS };
          }
        }

        const home = subtractCornerGuns(committed, staying);
        guns = addCornerGuns(guns, home);
        const worth = cornerGunWorthCents(ruleset, home);
        postedNetWorthCents = postedNetWorthCents >= worth ? postedNetWorthCents - worth : 0n;
        if (!snapshot.sourceOutpost) postedThugs += squad.posted;

        if (snapshot.outpostLoot) {
          beer += snapshot.outpostLoot.beer;
          for (const [key, quantity] of Object.entries(snapshot.outpostLoot.products)) {
            productLoot[key] = (productLoot[key] ?? 0) + quantity;
          }
        }
        if (squad.heat > 0) {
          heatAdded += squad.heat;
          caseHeat.push({ squadId: squad.id, warId: squad.warId, heat: squad.heat });
        }
      }

      if (done && payoutRemaining > 0n) {
        let paid = payoutRemaining;
        let paidToOutpost = false;
        if (snapshot.sourceOutpost && squad.role === 'ALLY') {
          await lockOutpost(tx, snapshot.sourceOutpost.outpostId);
          const box = await tx.turfOutpost.findUnique({
            where: { id: snapshot.sourceOutpost.outpostId },
            include: { turf: { select: { holderId: true } } },
          });
          if (box?.ownerId === playerId && box.turf.holderId === playerId && ruleset.turf?.outposts) {
            const room = BigInt(ruleset.turf.outposts.cashCapCents) - box.cashCents;
            paid = room > 0n ? (payoutRemaining < room ? payoutRemaining : room) : 0n;
            if (paid > 0n) {
              const beforeWorth = outpostBoxWorthCents(ruleset, {
                cashCents: box.cashCents, beer: box.beer, products: box.products as Record<string, number>,
              });
              const afterCash = box.cashCents + paid;
              const afterWorth = outpostBoxWorthCents(ruleset, {
                cashCents: afterCash, beer: box.beer, products: box.products as Record<string, number>,
              });
              await tx.turfOutpost.update({ where: { id: box.id }, data: { cashCents: afterCash } });
              outpostNetWorthCents += afterWorth - beforeWorth;
              paidToOutpost = true;
            }
          }
        }

        // If the source outpost no longer exists, do not strand a won payout forever:
        // it falls back home. A live but full box keeps the unpaid remainder queued.
        if (!paidToOutpost && snapshot.sourceOutpost) {
          const box = await tx.turfOutpost.findUnique({
            where: { id: snapshot.sourceOutpost.outpostId },
            include: { turf: { select: { holderId: true } } },
          });
          const live = box?.ownerId === playerId && box.turf.holderId === playerId;
          if (!live) {
            paid = payoutRemaining;
            cashCents += paid;
          }
        } else if (!snapshot.sourceOutpost) {
          cashCents += paid;
        }

        if (paid > 0n) {
          payoutRemaining -= paid;
          const isAlly = squad.role === 'ALLY';
          const isOutpost = squad.role === 'OUTPOST_LOOT';
          await EconomyLedgerService.record(tx, playerId, [{
            source: isAlly ? 'BLOCK_WAR_CUT' : 'BLOCK_WAR_SACK',
            label: isAlly
              ? paidToOutpost ? 'Block war · ally cut to outpost' : 'Block war · ally cut'
              : isOutpost ? 'Block war · captured outpost' : 'Block war · sacked registers',
            amountCents: paid,
            metadata: { warId: squad.warId, ...(paidToOutpost ? { outpostId: snapshot.sourceOutpost!.outpostId } : {}) },
          }], now);
        }
      }

      await tx.blockWarSquad.update({
        where: { id: squad.id },
        data: {
          creditedThugs: squad.creditedThugs + back,
          creditedWounded: squad.creditedWounded + wounds,
          payoutCents: payoutRemaining,
          ...(done && !squad.gunsCreditedAt ? { gunsCreditedAt: now } : {}),
        },
      });
    }
    // New Heat lands on a balance cooled to now: the turn clock is settled first, the same
    // regeneration the action would do, so the Heat is not cooled for hours before it existed.
    const clock: { turns?: number; lastTurnCalculationAt?: Date } = {};
    if (heatAdded > 0 && ruleset.heat) {
      const regen = regenerateTurns({ turns: player.turns, lastTurnCalculationAt: player.lastTurnCalculationAt }, now, ruleset);
      heat = Math.min(ruleset.heat.max, decayHeat(heat, regen.intervalsProcessed, ruleset.heat) + heatAdded);
      Object.assign(clock, { turns: regen.turns, lastTurnCalculationAt: regen.lastTurnCalculationAt });
    }
    if (Object.keys(productLoot).length > 0) {
      await ProductInventoryService.adjust(tx, playerId, ruleset, productLoot);
    }
    await tx.roundPlayer.update({
      where: { id: playerId },
      data: { busyThugs, postedThugs, postedNetWorthCents, outpostNetWorthCents, cashCents, beer, heat, ...guns, ...clock },
    });
    // 1.3.0-A/B: a sack's Heat, and from B the sack itself, build a Case in the block's city.
    if (caseHeat.length && ruleset.law && ruleset.heat) {
      const wars = await tx.blockWar.findMany({
        where: { id: { in: [...new Set(caseHeat.map((row) => row.warId))] } },
        select: { id: true, turf: { select: { cityId: true } } },
      });
      const cityOf = new Map(wars.map((war) => [war.id, war.turf.cityId]));
      await LawService.recordHeat(tx, playerId, ruleset, caseHeat.flatMap((row) => {
        const cityId = cityOf.get(row.warId);
        return cityId ? [{ cityId, heat: row.heat, points: ruleset.law?.evidence?.sack ?? 0, source: 'SACK' as const, sourceKey: `sack:${row.squadId}` }] : [];
      }), now);
    }
  },
};
