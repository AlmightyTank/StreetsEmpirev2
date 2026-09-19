import type { ConvoyBackup, ConvoyTail, Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  CONVOY_JOB,
  RAID_JOB,
  backupMinutes,
  cargoUnits,
  convoyBands,
  convoyCombatModel,
  convoyLoot,
  convoyRules,
  equipCombatSquad,
  hashParts,
  headsUpMinutes,
  homeBackupThugs,
  hoursFromHome,
  loadRulesetForRound,
  planWorkSupply,
  reachAt,
  reachSpans,
  reachWindows,
  reconLookaheadMinutes,
  runCapacity,
  runPosition,
  seededRng,
  simulateRaid,
  splitWounds,
  type ReachWindow,
  type Ruleset,
  type RunStopPlan,
} from '@streets/rules-engine';
import type { WeaponKey } from '@streets/rulesets';
import {
  convoyBackupSchema,
  convoyCallSchema,
  convoyReconSchema,
  convoyTailSchema,
  type ConvoyBackupResult,
  type ConvoyReconResult,
  type ConvoyReportDto,
  type ConvoyTailDto,
  type ConvoyTailResult,
  type ConvoyTargetDto,
  type ConvoysDto,
  type GameActionResult,
  type RoundPlayerDto,
} from '@streets/shared';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs } from './action.service.js';
import { ActivityService } from './activity.service.js';
import { accountsShareNetwork } from './admin-signals.service.js';
import { allianceTargetBlock } from './alliance.service.js';
import { CombatRecoveryService } from './combat-recovery.service.js';
import { PlayerStateService } from './player-state.service.js';
import { CRACK, ProductInventoryService } from './product-inventory.service.js';
import { RUN_INCLUDE, awayWorth, cargoOf, takeFromRun, toStopPlans, type LoadedRun } from './run-settle.service.js';
import { WorkSupplyService } from './work-supply.service.js';

type Weapons = Record<WeaponKey, number>;
/** A side of a convoy fight as it set out: morale, the guns it carries, and any supply boost. */
interface CrewSnapshot {
  thugHappiness: number;
  weapons: Weapons;
  boost?: { strength: number; wounds: number } | null;
}

/** Stored on a landed tail: the fight and what moved. */
interface TailResult {
  escaped: boolean;
  won: boolean;
  squad: number;
  attackerWounds: number;
  defenders: { escorts: number; homeBackup: number; sentBackup: number; allyBackup: number };
  defenderWounds: number;
  strength?: { attacker: number; defender: number };
  loot: { cashCents: string; cargo: Record<string, number> };
  lowRider: number;
  recoverAt: string | null;
}

const RECENT_MS = 24 * 60 * 60_000;
const NO_WEAPONS: Weapons = { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 };

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
/** Guns by weapon key, from anything counting them in fields: a player's home arsenal or a run's escorts. */
const weaponsOf = (holder: Pick<RoundPlayer, 'pistols' | 'shotguns' | 'tek9s' | 'ak47s'>): Weapons => ({ PISTOL: holder.pistols, SHOTGUN: holder.shotguns, TEK9: holder.tek9s, AK47: holder.ak47s });
const addWeapons = (a: Weapons, b: Weapons): Weapons => ({ PISTOL: a.PISTOL + b.PISTOL, SHOTGUN: a.SHOTGUN + b.SHOTGUN, TEK9: a.TEK9 + b.TEK9, AK47: a.AK47 + b.AK47 });
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function requireConvoys(ruleset: Ruleset): { rules: NonNullable<ReturnType<typeof convoyRules>>; model: NonNullable<ReturnType<typeof convoyCombatModel>> } {
  const rules = convoyRules(ruleset);
  const model = convoyCombatModel(ruleset);
  if (!rules || !model) throw AppError.conflict('CONVOYS_DISABLED', 'Nobody hits runs on the road this round.');
  return { rules, model };
}

/** The guns a squad of `thugs` carries out of an arsenal: the best first, one each. */
function armedSquad(ruleset: Ruleset, player: RoundPlayer, thugs: number): Weapons {
  const model = ruleset.combat!;
  const fit = Math.max(thugs, fitThugs(player));
  const squad = equipCombatSquad({ thugs: fit, thugHappiness: player.thugHappiness, weapons: weaponsOf(player) }, Math.min(thugs, model.squadCap), model);
  return { ...NO_WEAPONS, ...squad.equipment };
}

/**
 * Walk a run's itinerary city by city, each tagged with the stop whose leg reaches it, so
 * a window can name the towns either side of it: the route through, never the destination.
 */
function routeAround(ruleset: Ruleset, stops: readonly RunStopPlan[], window: ReachWindow): { fromName: string | null; toName: string | null } {
  const nodes: Array<{ city: string; stopIndex: number }> = [{ city: stops[0]!.route[0]!, stopIndex: -1 }];
  stops.forEach((stop, stopIndex) => stop.route.slice(1).forEach((city) => nodes.push({ city, stopIndex })));
  const index = window.kind === 'leaving'
    ? nodes.findIndex((node, at) => node.city === window.city && (nodes[at + 1]?.stopIndex ?? -2) === window.stopIndex)
    : nodes.findIndex((node) => node.city === window.city && node.stopIndex === window.stopIndex);
  if (index < 0) return { fromName: null, toName: null };
  const name = (at: number) => (nodes[at] ? cityName(ruleset, nodes[at]!.city) : null);
  return { fromName: name(index - 1), toName: name(index + 1) };
}

function reportFor(result: TailResult, role: 'attacker' | 'owner' | 'ally'): ConvoyReportDto {
  const attacking = role === 'attacker';
  const sign = attacking ? 1 : -1;
  return {
    escaped: result.escaped,
    won: result.escaped ? null : attacking ? result.won : !result.won,
    attackers: result.squad,
    defenders: result.defenders,
    yourWounds: attacking ? result.attackerWounds : result.defenderWounds,
    opponentWounds: attacking ? result.defenderWounds : result.attackerWounds,
    cashCents: sign * Number(result.loot.cashCents),
    cargo: Object.fromEntries(Object.entries(result.loot.cargo).map(([key, units]) => [key, sign * units])),
    lowRider: sign * result.lowRider,
  };
}

/** Whether an owner's lookouts see a tail on their run yet: only in its last minutes. */
function ownerSees(ruleset: Ruleset, owner: Pick<RoundPlayer, 'hideoutLookoutsLevel'>, tail: Pick<ConvoyTail, 'landsAt'>, now: Date): boolean {
  return tail.landsAt.getTime() - now.getTime() <= headsUpMinutes(ruleset, owner.hideoutLookoutsLevel) * 60_000;
}

/** What an area recon keeps about a run it found. */
type ReconTarget = Omit<ConvoyTargetDto, 'blockedReason' | 'tailed'>;

/**
 * Every run that is near, or coming near within `lookaheadMs`, where the player lives, and
 * every run in reach of where the player's own run is right now.
 */
async function scanTargets(db: Db | PrismaClient, ruleset: Ruleset, player: RoundPlayer & { city: { slug: string } }, roundId: string, now: Date, lookaheadMs: number): Promise<ReconTarget[]> {
  const myCity = player.city.slug;
  const mine = await db.run.findFirst({ where: { roundPlayerId: player.id, status: 'ACTIVE' }, include: RUN_INCLUDE });
  const myReach = mine ? reachAt(reachWindows(ruleset, toStopPlans(mine.stops)), now) : [];
  const runs = await db.run.findMany({
    where: { status: 'ACTIVE', roundPlayerId: { not: player.id }, roundPlayer: { roundId } },
    include: { ...RUN_INCLUDE, roundPlayer: { include: { alliance: { select: { tag: true } } } } },
  });
  const targets: ReconTarget[] = [];
  for (const run of runs) {
    const owner = run.roundPlayer;
    const stops = toStopPlans(run.stops);
    const position = runPosition(ruleset, stops, now);
    if (position.phase === 'home') continue;
    const windows = reachWindows(ruleset, stops);
    const reachNow = reachAt(windows, now);
    const homeWindow = windows.find((window) => window.city === myCity && window.to.getTime() > now.getTime() && window.from.getTime() < now.getTime() + lookaheadMs);
    const runWindow = !homeWindow || homeWindow.from > now ? reachNow.find((window) => myReach.some((own) => own.city === window.city)) : undefined;
    const window = runWindow && (!homeWindow || homeWindow.from > now) ? runWindow : homeWindow;
    if (!window) continue;
    const span = reachSpans(windows).find((entry) => entry.city === window.city && entry.from <= window.from && entry.to >= window.to)
      ?? { city: window.city, from: window.from, to: window.to, kinds: [window.kind] };
    targets.push({
      runId: run.id,
      owner: { publicPimpId: owner.publicPimpId, displayName: owner.displayName, allianceTag: owner.alliance?.tag ?? null },
      city: window.city,
      cityName: cityName(ruleset, window.city),
      source: window === runWindow ? 'RUN' : 'HOME',
      routeHere: routeAround(ruleset, stops, window),
      kinds: span.kinds,
      inReachFrom: span.from.toISOString(),
      inReachUntil: span.to.toISOString(),
      inReachNow: span.from <= now && now < span.to,
      position: { phase: position.phase, cityName: cityName(ruleset, position.city), progress: position.progress },
      bands: convoyBands({ cashCents: run.cashCents, cargoUnits: cargoUnits(cargoOf(run)), capacity: runCapacity(ruleset, run.lowRiders), escorts: Math.max(0, run.escortThugs - run.woundedEscorts) }),
    });
  }
  return targets.sort((a, b) => Number(b.inReachNow) - Number(a.inReachNow) || a.inReachFrom.localeCompare(b.inReachFrom));
}

/** Why a player cannot start a tail at all right now, before any target is picked. */
function squadBlock(ruleset: Ruleset, player: RoundPlayer, turns: number, now: Date): string | null {
  const rules = convoyRules(ruleset);
  if (!rules) return 'Nobody hits runs on the road this round.';
  if (player.lockedUntil && player.lockedUntil > now) return 'You are locked up.';
  if (player.movingUntil && player.movingUntil > now) return 'You are moving house.';
  if (turns < rules.turnCost) return `A tail costs ${rules.turnCost} turns.`;
  return null;
}

/**
 * 0.5.0-E. Convoys: tailing and hitting runs near a city.
 *
 * Every side of a convoy fight is settled under its own player's lock and nobody
 * else's, so tails can never deadlock, even two runs tailing each other:
 * - starting a tail commits the squad (its thugs become busy) under the attacker's lock;
 * - backup rides out under the sender's lock the same way;
 * - the hit lands under the run owner's lock, in the run's settle, whoever is online;
 * - the attacker's side (loot, the squad home, its wounds) and each ally's (their thugs
 *   home, their wounds) are delivered at that player's next settle.
 */
export const ConvoyService = {
  /** Start a tail: commit the squad, spend the turns, and warn the owner. */
  tail(prisma: PrismaClient, attackerId: string, rawInput: unknown, now?: Date): Promise<GameActionResult<ConvoyTailResult>> {
    const input = convoyTailSchema.parse(rawInput);
    return ActionService.run<ConvoyTailResult>(prisma, attackerId, {
      action: 'CONVOY_TAIL',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now: at }) => {
        const base = loadRulesetForRound(round);
        const { rules, model } = requireConvoys(base);
        const run = await tx.run.findUnique({ where: { id: input.runId }, include: { ...RUN_INCLUDE, roundPlayer: true } });
        if (!run || run.status !== 'ACTIVE' || run.roundPlayer.roundId !== round.id) throw AppError.notFound('RUN_NOT_FOUND', 'That run is not on the road.');
        const owner = run.roundPlayer;
        if (owner.id === attackerId || owner.accountId === player.accountId) throw AppError.badRequest('OWN_RUN', 'That is your own run.');
        const allied = allianceTargetBlock(player, owner, at);
        if (allied) throw AppError.conflict('ALLIED', allied);
        if (await accountsShareNetwork(tx, player.accountId, owner.accountId, at)) {
          throw AppError.conflict('LINKED_ACCOUNTS', 'You have played from the same network as this crew, so you cannot hit their runs.');
        }
        const blocked = squadBlock(base, player, current.turns, at);
        if (blocked) throw AppError.conflict('TAIL_BLOCKED', blocked);
        // Only a run your recon of the area found, while that recon is still good.
        const recon = await tx.convoyRecon.findUnique({ where: { roundPlayerId: attackerId } });
        const found = recon && recon.expiresAt > at && (recon.targets as unknown as ReconTarget[]).some((target) => target.runId === run.id);
        if (!found) throw AppError.conflict('NOT_SPOTTED', 'Recon the area first: you have not spotted that run.');
        assertTurns(current.turns, rules.turnCost);
        if (run.lastHitAt && run.lastHitAt.getTime() + rules.rehitMinutes * 60_000 > at.getTime()) throw AppError.conflict('RECENTLY_HIT', 'That run was hit a moment ago. Nobody gets it again for a while.');
        if (await tx.convoyTail.findFirst({ where: { runId: run.id, status: 'PENDING' } })) throw AppError.conflict('ALREADY_TAILED', 'Someone is already on that run.');
        if (await tx.convoyTail.findFirst({ where: { attackerId, status: 'PENDING' } })) throw AppError.conflict('SQUAD_OUT', 'Your squad is already on a tail.');

        // Where it can be reached from: home first, then the attacker's own run where it is.
        const stops = toStopPlans(run.stops);
        const reach = reachAt(reachWindows(base, stops), at);
        let source: 'HOME' | 'RUN' | null = null;
        let city = '';
        let maxSquad = 0;
        let attackerRunId: string | null = null;
        let runGuns: Weapons | null = null;
        if (reach.some((window) => window.city === player.city.slug)) {
          source = 'HOME';
          city = player.city.slug;
          maxSquad = Math.min(fitThugs(current), model.squadCap);
        } else {
          const mine = await tx.run.findFirst({ where: { roundPlayerId: attackerId, status: 'ACTIVE' }, include: RUN_INCLUDE });
          const shared = mine ? reachAt(reachWindows(base, toStopPlans(mine.stops)), at).find((window) => reach.some((other) => other.city === window.city)) : undefined;
          if (mine && shared) {
            source = 'RUN';
            city = shared.city;
            attackerRunId = mine.id;
            maxSquad = Math.min(mine.escortThugs - mine.woundedEscorts, model.squadCap);
            runGuns = weaponsOf(mine);
          }
        }
        if (!source) throw AppError.conflict('OUT_OF_REACH', 'That run is not near where you live, or near your run.');
        if (maxSquad < 1) throw AppError.badRequest('NO_SQUAD', source === 'RUN' ? 'Your run has no fit escorts to send.' : 'You have no fit thugs to send.', { squad: 'Nobody to send.' });
        if (input.squad > maxSquad) throw AppError.badRequest('SQUAD_TOO_BIG', `Send at most ${maxSquad}.`, { squad: `At most ${maxSquad}.` });

        // The squad takes its guns from home and, from home, burns its raid supply going out.
        let next = { ...current, turns: current.turns - rules.turnCost };
        let boost: CrewSnapshot['boost'] = null;
        if (source === 'HOME' && ruleset.combatSupply) {
          const policy = await tx.workSupplyPolicy.findUnique({ where: { roundPlayerId_job: { roundPlayerId: attackerId, job: RAID_JOB } } });
          if (policy) {
            const products = await ProductInventoryService.read(tx, attackerId, ruleset);
            const supply = planWorkSupply({ job: RAID_JOB, role: 'fighters', workers: input.squad, turns: 1, ruleset, policy, inventory: { ...products, [CRACK]: current.crack } });
            await WorkSupplyService.consume(tx, attackerId, ruleset, supply);
            boost = { strength: supply.takeMultiplier, wounds: supply.woundMultiplier };
            next = { ...next, crack: next.crack - (supply.consumed[CRACK] ?? 0), heat: ruleset.heat ? Math.min(ruleset.heat.max, next.heat + Math.round(supply.heat)) : next.heat };
          }
        }
        // A squad from home takes the best of the home arsenal; a run's escorts fight with the guns they carry.
        const crewSnapshot: CrewSnapshot = { thugHappiness: player.thugHappiness, weapons: runGuns ?? armedSquad(base, player, input.squad), boost };
        if (source === 'HOME') next = { ...next, busyThugs: current.busyThugs + input.squad };

        const landsAt = new Date(at.getTime() + rules.warningMinutes * 60_000);
        const tail = await tx.convoyTail.create({
          data: {
            runId: run.id, ownerId: owner.id, attackerId, source, attackerRunId, city, squad: input.squad,
            attackerCrew: json(crewSnapshot), turnsSpent: rules.turnCost, actionId: input.actionId, startedAt: at, landsAt,
          },
        });
        // Nobody is told. The owner's lookouts may spot it in its last minutes.
        const result: ConvoyTailResult = { tailId: tail.id, landsAt: landsAt.toISOString(), city, cityName: cityName(base, city), squad: input.squad, turns: rules.turnCost };
        return { next, result, activity: { type: 'CONVOY_TAIL', payload: json({ ...result, owner: owner.displayName }) } };
      },
    }, now);
  },

  /**
   * Send thugs to a tailed run's fight: the owner from home, if they can get there before
   * the hit, or an ally who lives where the run is, once the owner has called for help.
   */
  backup(prisma: PrismaClient, senderId: string, rawInput: unknown, now?: Date): Promise<GameActionResult<ConvoyBackupResult>> {
    const input = convoyBackupSchema.parse(rawInput);
    return ActionService.run<ConvoyBackupResult>(prisma, senderId, {
      action: 'CONVOY_BACKUP',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, now: at }) => {
        const base = loadRulesetForRound(round);
        const { model } = requireConvoys(base);
        const tail = await tx.convoyTail.findUnique({ where: { id: input.tailId }, include: { run: { include: RUN_INCLUDE }, owner: true } });
        if (!tail || tail.owner.roundId !== round.id) throw AppError.notFound('TAIL_NOT_FOUND', 'That tail is gone.');
        if (tail.status !== 'PENDING' || tail.landsAt <= at) throw AppError.conflict('TAIL_OVER', 'Too late: that hit has already landed.');
        if (await tx.convoyBackup.findUnique({ where: { tailId_playerId: { tailId: tail.id, playerId: senderId } } })) throw AppError.conflict('ALREADY_SENT', 'You already sent help.');
        const kind: 'OWNER' | 'ALLY' = tail.ownerId === senderId ? 'OWNER' : 'ALLY';
        if (kind === 'OWNER' && !ownerSees(base, player, tail, at)) throw AppError.notFound('TAIL_NOT_FOUND', 'Nobody you can see is on your run.');
        const max = await sendLimit(tx, base, tail, player, current, at);
        if (max.reason) throw AppError.conflict('CANNOT_SEND', max.reason);
        const thugs = Math.min(input.thugs, max.max);
        if (input.thugs > max.max) throw AppError.badRequest('TOO_MANY', `Send at most ${max.max}.`, { thugs: `At most ${max.max}.` });
        await tx.convoyBackup.create({
          data: { tailId: tail.id, playerId: senderId, kind, thugs, crew: json({ thugHappiness: player.thugHappiness, weapons: armedSquad(base, player, Math.min(thugs, model.squadCap)) }), sentAt: at },
        });
        const result: ConvoyBackupResult = { tailId: tail.id, thugs, landsAt: tail.landsAt.toISOString() };
        return {
          next: { ...current, busyThugs: current.busyThugs + thugs },
          result,
          activity: { type: 'CONVOY_BACKUP', payload: json({ ...result, owner: tail.owner.displayName, city: cityName(base, tail.city), kind }) },
        };
      },
    }, now);
  },

  /** The owner calls on their allies who live where the run is. They get a push. */
  async callAllies(prisma: PrismaClient, ownerId: string, rawInput: unknown, now: Date = new Date()): Promise<{ called: number }> {
    const input = convoyCallSchema.parse(rawInput);
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, ownerId);
      const tail = await tx.convoyTail.findUnique({ where: { id: input.tailId }, include: { owner: { include: { round: true } } } });
      if (!tail || tail.ownerId !== ownerId) throw AppError.notFound('TAIL_NOT_FOUND', 'That tail is not on your run.');
      if (tail.status !== 'PENDING' || tail.landsAt <= now) throw AppError.conflict('TAIL_OVER', 'Too late: that hit has already landed.');
      const base = loadRulesetForRound(tail.owner.round);
      if (!ownerSees(base, tail.owner, tail, now)) throw AppError.notFound('TAIL_NOT_FOUND', 'Nobody you can see is on your run.');
      if (!tail.owner.allianceId) throw AppError.conflict('NO_ALLIANCE', 'You have no alliance to call.');
      if (tail.alliesCalledAt) return { called: 0 };
      // In game only: allies who live there see the call on their Travel page.
      const city = await tx.city.findUnique({ where: { slug: tail.city }, select: { id: true } });
      const called = city ? await tx.roundPlayer.count({ where: { allianceId: tail.owner.allianceId, cityId: city.id, id: { not: ownerId }, roundId: tail.owner.roundId } }) : 0;
      await tx.convoyTail.update({ where: { id: tail.id }, data: { alliesCalledAt: now } });
      return { called };
    });
  },

  /**
   * Land every tail on a run whose window has closed, in order. Called from the run's
   * settle, under the owner's lock, before road stops and before the run comes home, so a
   * tail always lands or fails on the run as it was, whoever reads first. Returns the run as
   * it stands after.
   */
  async landTails(tx: Db, ownerId: string, ruleset: Ruleset, loaded: LoadedRun, stops: readonly RunStopPlan[], now: Date): Promise<LoadedRun> {
    const model = convoyCombatModel(ruleset);
    const rules = convoyRules(ruleset);
    if (!model || !rules) return loaded;
    const due = await tx.convoyTail.findMany({
      where: { runId: loaded.id, status: 'PENDING', landsAt: { lte: now } },
      include: { backups: true, attacker: { select: { displayName: true } } },
      orderBy: { landsAt: 'asc' },
    });
    let run = loaded;
    const windows = reachWindows(ruleset, stops);
    for (const tail of due) {
      const at = tail.landsAt;
      const names = { attacker: tail.attacker.displayName };
      const ownerBackups = tail.backups.filter((backup) => backup.kind === 'OWNER');
      const allyBackups = tail.backups.filter((backup) => backup.kind === 'ALLY');
      const owner = await tx.roundPlayer.findUniqueOrThrow({ where: { id: ownerId } });
      const sentByOwner = ownerBackups.reduce((sum, backup) => sum + backup.thugs, 0);
      const inReach = runPosition(ruleset, stops, at).phase !== 'home' && reachAt(windows, at).some((window) => window.city === tail.city);

      if (!inReach) {
        const result: TailResult = { escaped: true, won: false, squad: tail.squad, attackerWounds: 0, defenders: { escorts: 0, homeBackup: 0, sentBackup: sentByOwner, allyBackup: 0 }, defenderWounds: 0, loot: { cashCents: '0', cargo: {} }, lowRider: 0, recoverAt: null };
        await creditOwnerBackups(tx, owner, ownerBackups, 0, null, now);
        await tx.convoyTail.update({ where: { id: tail.id }, data: { status: 'ESCAPED', settledAt: now, result: json(result) } });
        await ActivityService.log(tx, ownerId, 'CONVOY_DEFENSE', json({ tailId: tail.id, attacker: names.attacker, city: cityName(ruleset, tail.city), escaped: true }));
        continue;
      }

      // Who stands in the way: the escorts still fit, the crew at home that rides out on its
      // own when the run is near home, and whoever was sent.
      const escorts = Math.max(0, run.escortThugs - run.woundedEscorts);
      const homeBackup = homeBackupThugs(ruleset, run.homeCity, hoursFromHome(ruleset, stops, run.homeCity, at), fitThugs(owner));
      const allySent = allyBackups.reduce((sum, backup) => sum + backup.thugs, 0);
      const groups: Record<string, number> = { escorts, home: homeBackup, owner: sentByOwner, ...Object.fromEntries(allyBackups.map((backup) => [`ally:${backup.playerId}`, backup.thugs])) };
      const defenders = escorts + homeBackup + sentByOwner + allySent;
      const allyWeapons = allyBackups.reduce((sum, backup) => addWeapons(sum, (backup.crew as unknown as CrewSnapshot).weapons ?? NO_WEAPONS), NO_WEAPONS);

      // The escorts burn their CONVOY supply from the trunk.
      let defenderBoost: CrewSnapshot['boost'] = null;
      if (ruleset.combatSupply && escorts > 0) {
        const policy = await tx.workSupplyPolicy.findUnique({ where: { roundPlayerId_job: { roundPlayerId: ownerId, job: CONVOY_JOB } } });
        if (policy) {
          const supply = planWorkSupply({ job: CONVOY_JOB, role: 'fighters', workers: escorts, turns: 1, ruleset, policy, inventory: cargoOf(run) });
          if (Object.keys(supply.consumed).length) run = await takeFromRun(tx, ownerId, ruleset, run, { seized: supply.consumed, fineCents: 0n });
          defenderBoost = { strength: supply.takeMultiplier, wounds: supply.woundMultiplier };
        }
      }

      const attackerCrew = tail.attackerCrew as unknown as CrewSnapshot;
      const rng = seededRng(hashParts(tail.id, 'convoy'));
      const fight = simulateRaid({
        attacker: { thugs: tail.squad, thugHappiness: attackerCrew.thugHappiness, weapons: attackerCrew.weapons },
        // The escorts carry their own guns; the crew riding out from home takes the best of the home arsenal.
        defender: { thugs: defenders, thugHappiness: owner.thugHappiness, weapons: addWeapons(addWeapons(weaponsOf(run), weaponsOf(owner)), allyWeapons) },
        attackerBoost: attackerCrew.boost ?? undefined,
        defenderBoost: defenderBoost ?? undefined,
        attackingThugs: Math.min(tail.squad, model.squadCap),
        attackerTurns: model.turnCost,
        defenderCashCents: 0n,
      }, model, rng);
      const won = fight.winner === 'ATTACKER';
      const wounds = splitWounds(fight.wounds.defender, groups);
      const recoverAt = new Date(at.getTime() + model.wounds.recoveryMinutes * 60_000);

      let lootCash = 0n;
      let lootCargo: Record<string, number> = {};
      let lowRider = 0;
      if (won) {
        const loot = convoyLoot(ruleset, { runCashCents: run.cashCents, cargo: cargoOf(run), fitAttackers: tail.squad - fight.wounds.attacker, rng });
        lootCash = loot.cashCents;
        lootCargo = loot.cargo;
        run = await takeFromRun(tx, ownerId, ruleset, run, { seized: loot.cargo, fineCents: loot.cashCents });
        const escortDown = escorts === 0 || (wounds.escorts ?? 0) >= escorts;
        if (escortDown && run.lowRiders > 1 && rng() < rules.loot.lowRiderChance) {
          lowRider = 1;
          run = { ...run, lowRiders: run.lowRiders - 1 };
          await tx.run.update({ where: { id: run.id }, data: { lowRiders: run.lowRiders } });
          await tx.roundPlayer.update({ where: { id: ownerId }, data: { awayNetWorthCents: awayWorth(ruleset, run, cargoOf(run)) } });
        }
      }

      const escortWounds = Math.min(escorts, wounds.escorts ?? 0);
      run = { ...run, woundedEscorts: run.woundedEscorts + escortWounds, lastHitAt: at };
      await tx.run.update({ where: { id: run.id }, data: { woundedEscorts: run.woundedEscorts, lastHitAt: at } });
      // The crew from home comes back with its wounds now; the owner's own backup with it.
      await CombatRecoveryService.add(tx, ownerId, null, wounds.home ?? 0, recoverAt);
      await creditOwnerBackups(tx, owner, ownerBackups, wounds.owner ?? 0, recoverAt, now);
      for (const backup of allyBackups) {
        await tx.convoyBackup.update({ where: { id: backup.id }, data: { wounded: Math.min(backup.thugs, wounds[`ally:${backup.playerId}`] ?? 0) } });
      }

      const result: TailResult = {
        escaped: false,
        won,
        squad: tail.squad,
        attackerWounds: fight.wounds.attacker,
        defenders: { escorts, homeBackup, sentBackup: sentByOwner, allyBackup: allySent },
        defenderWounds: fight.wounds.defender,
        strength: { attacker: Math.round(fight.effectiveStrength.attacker), defender: Math.round(fight.effectiveStrength.defender) },
        loot: { cashCents: lootCash.toString(), cargo: lootCargo },
        lowRider,
        recoverAt: recoverAt.toISOString(),
      };
      await tx.convoyTail.update({ where: { id: tail.id }, data: { status: 'LANDED', settledAt: now, result: json(result) } });
      await ActivityService.log(tx, ownerId, 'CONVOY_DEFENSE', json({ tailId: tail.id, attacker: names.attacker, city: cityName(ruleset, tail.city), held: !won, cashCents: -Number(lootCash), cargo: lootCargo, lowRider }));
    }
    return run;
  },

  /**
   * Deliver what has come back to a player: a squad from a tail that has landed or lost
   * its run (with its loot and wounds), and thugs sent as an ally's backup. Called under
   * their lock, before they are read.
   */
  async credit(tx: Db, playerId: string, now: Date): Promise<void> {
    const tails = await tx.convoyTail.findMany({ where: { attackerId: playerId, status: { in: ['LANDED', 'ESCAPED'] }, attackerCreditedAt: null }, include: { owner: { select: { displayName: true } } } });
    const backups = await tx.convoyBackup.findMany({ where: { playerId, creditedAt: null, kind: 'ALLY', tail: { status: { in: ['LANDED', 'ESCAPED'] } } } });
    if (!tails.length && !backups.length) return;
    const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: playerId }, include: { round: true } });
    const ruleset = loadRulesetForRound(player.round);
    let busy = player.busyThugs;
    for (const tail of tails) {
      const result = tail.result as unknown as TailResult;
      const cash = BigInt(result.loot.cashCents);
      const cargo = result.loot.cargo;
      const recoverAt = result.recoverAt ? new Date(result.recoverAt) : now;
      const attackerRun = tail.source === 'RUN' && tail.attackerRunId ? await tx.run.findUnique({ where: { id: tail.attackerRunId }, include: RUN_INCLUDE }) : null;
      if (attackerRun?.status === 'ACTIVE') {
        // A run's escorts hit it: the haul goes in its own trunk and wallet, as far as the trunk holds.
        const held = cargoOf(attackerRun);
        let room = Math.max(0, runCapacity(ruleset, attackerRun.lowRiders) - cargoUnits(held));
        for (const [key, units] of Object.entries(cargo)) {
          const fits = Math.min(units, room);
          room -= fits;
          if (fits <= 0) continue;
          held[key] = (held[key] ?? 0) + fits;
          await tx.runCargo.upsert({ where: { runId_productKey: { runId: attackerRun.id, productKey: key } }, create: { runId: attackerRun.id, productKey: key, quantity: fits, startQuantity: 0 }, update: { quantity: { increment: fits } } });
        }
        const woundedEscorts = Math.min(attackerRun.escortThugs, attackerRun.woundedEscorts + result.attackerWounds);
        const cashCents = attackerRun.cashCents + cash;
        await tx.run.update({ where: { id: attackerRun.id }, data: { cashCents, woundedEscorts, lowRiders: attackerRun.lowRiders + result.lowRider } });
        await tx.roundPlayer.update({ where: { id: playerId }, data: { awayNetWorthCents: awayWorth(ruleset, { ...attackerRun, cashCents, lowRiders: attackerRun.lowRiders + result.lowRider }, held) } });
      } else {
        // From home, or a run that has since come home: the squad, the haul and its wounds come home.
        if (tail.source === 'HOME') busy = Math.max(0, busy - tail.squad);
        await CombatRecoveryService.add(tx, playerId, null, result.attackerWounds, recoverAt);
        const rows = Object.fromEntries(Object.entries(cargo).filter(([key, units]) => key !== CRACK && units > 0));
        if (Object.keys(rows).length) await ProductInventoryService.adjust(tx, playerId, ruleset, rows);
        await tx.roundPlayer.update({ where: { id: playerId }, data: { cashCents: { increment: cash }, crack: { increment: cargo[CRACK] ?? 0 }, lowRiders: { increment: result.lowRider } } });
      }
      await tx.convoyTail.update({ where: { id: tail.id }, data: { attackerCreditedAt: now } });
      await ActivityService.log(tx, playerId, 'CONVOY_ATTACK', json({ tailId: tail.id, owner: tail.owner.displayName, city: cityName(ruleset, tail.city), escaped: result.escaped, won: result.won, cashCents: Number(cash), cargo, lowRider: result.lowRider, wounds: result.attackerWounds }));
    }
    for (const backup of backups) {
      busy = Math.max(0, busy - backup.thugs);
      const tail = await tx.convoyTail.findUniqueOrThrow({ where: { id: backup.tailId }, select: { result: true } });
      const result = tail.result as unknown as TailResult | null;
      await CombatRecoveryService.add(tx, playerId, null, backup.wounded, result?.recoverAt ? new Date(result.recoverAt) : now);
      await tx.convoyBackup.update({ where: { id: backup.id }, data: { creditedAt: now } });
    }
    if (busy !== player.busyThugs) await tx.roundPlayer.update({ where: { id: playerId }, data: { busyThugs: busy } });
  },

  /**
   * Land every tail that is due and involves this player, as attacker, owner or backup,
   * each in the owner's own transaction. A tail lands when its window closes, whoever
   * reads first; this is how the attacker's or an ally's page makes it land.
   */
  async settleDueFor(prisma: PrismaClient, playerId: string, now: Date = new Date()): Promise<void> {
    const due = await prisma.convoyTail.findMany({
      where: { status: 'PENDING', landsAt: { lte: now }, OR: [{ attackerId: playerId }, { ownerId: playerId }, { backups: { some: { playerId } } }] },
      select: { ownerId: true },
    });
    for (const ownerId of new Set(due.map((row) => row.ownerId))) await PlayerStateService.settle(prisma, ownerId, { markActive: false, now });
  },

  /** Land every due tail in every round: the alerts poller runs this, so a landing is pushed even if nobody is on. */
  async sweep(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
    const due = await prisma.convoyTail.findMany({ where: { status: 'PENDING', landsAt: { lte: now } }, select: { ownerId: true }, take: 200 });
    const owners = [...new Set(due.map((row) => row.ownerId))];
    for (const ownerId of owners) await PlayerStateService.settle(prisma, ownerId, { markActive: false, now });
    return owners.length;
  },

  /** The one convoy line a player's status needs: a tail their lookouts have spotted on their run, or an ally's call to answer. */
  async alertFor(db: Db | PrismaClient, player: Pick<RoundPlayer, 'id' | 'allianceId' | 'cityId' | 'hideoutLookoutsLevel'>, ruleset: Ruleset, now: Date): Promise<RoundPlayerDto['convoyAlert']> {
    if (!convoyRules(ruleset)) return null;
    // Only what the lookouts see: a tail in its last minutes.
    const seeUntil = new Date(now.getTime() + headsUpMinutes(ruleset, player.hideoutLookoutsLevel) * 60_000);
    const tailed = await db.convoyTail.findFirst({ where: { ownerId: player.id, status: 'PENDING', landsAt: { gt: now, lte: seeUntil } }, orderBy: { landsAt: 'asc' } });
    if (tailed) return { kind: 'tailed', cityName: cityName(ruleset, tailed.city), landsAt: tailed.landsAt.toISOString() };
    if (!player.allianceId) return null;
    const city = await db.city.findUnique({ where: { id: player.cityId }, select: { slug: true } });
    const call = city ? await db.convoyTail.findFirst({
      where: { status: 'PENDING', landsAt: { gt: now }, city: city.slug, alliesCalledAt: { not: null }, owner: { allianceId: player.allianceId }, ownerId: { not: player.id }, backups: { none: { playerId: player.id } } },
      orderBy: { landsAt: 'asc' },
    }) : null;
    return call ? { kind: 'call', cityName: cityName(ruleset, call.city), landsAt: call.landsAt.toISOString() } : null;
  },

  /**
   * Recon the area: for turns, every run coming near, in town or leaving where you live
   * (as far ahead as your lookouts see) and in reach of your own run where it is. It is a
   * snapshot: it goes stale, and only a run it found can be tailed.
   */
  recon(prisma: PrismaClient, playerId: string, rawInput: unknown, now?: Date): Promise<GameActionResult<ConvoyReconResult>> {
    const input = convoyReconSchema.parse(rawInput);
    return ActionService.run<ConvoyReconResult>(prisma, playerId, {
      action: 'CONVOY_RECON',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, now: at }) => {
        const base = loadRulesetForRound(round);
        const { rules } = requireConvoys(base);
        assertTurns(current.turns, rules.recon.turnCost);
        const lookahead = reconLookaheadMinutes(base, player.hideoutLookoutsLevel);
        const targets = await scanTargets(tx, base, player, round.id, at, lookahead * 60_000);
        const expiresAt = new Date(at.getTime() + rules.recon.freshMinutes * 60_000);
        await tx.convoyRecon.upsert({
          where: { roundPlayerId: playerId },
          create: { roundPlayerId: playerId, seenAt: at, expiresAt, targets: json(targets) },
          update: { seenAt: at, expiresAt, targets: json(targets) },
        });
        return {
          next: { ...current, turns: current.turns - rules.recon.turnCost },
          result: { found: targets.length, lookaheadMinutes: lookahead, expiresAt: expiresAt.toISOString(), turns: rules.recon.turnCost },
        };
      },
    }, now);
  },

  /** Everything the convoys panel shows: your last recon of the area, and the tails you are part of. */
  async page(prisma: PrismaClient, playerId: string, now: Date = new Date()): Promise<ConvoysDto> {
    await ConvoyService.settleDueFor(prisma, playerId, now);
    const settled = await PlayerStateService.settle(prisma, playerId, { markActive: false, now });
    const { player, round } = settled;
    const base = loadRulesetForRound(round);
    const rules = convoyRules(base);
    const model = convoyCombatModel(base);
    const myCity = player.city.slug;
    const squad = { fit: model ? Math.min(fitThugs(player), model.squadCap) : 0, turns: player.turns, city: myCity, cityName: cityName(base, myCity), blockedReason: squadBlock(base, player, player.turns, now) };
    if (!rules || !model) return { enabled: false, rules: null, recon: null, squad, run: null, targets: [], tails: [] };

    const mine = await prisma.run.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, include: RUN_INCLUDE });
    const myRunPosition = mine ? runPosition(base, toStopPlans(mine.stops), now) : null;
    // What your last recon found, as it was then; who is tailed or blocked is as it is now.
    const recon = await prisma.convoyRecon.findUnique({ where: { roundPlayerId: playerId } });
    const fresh = recon && recon.expiresAt > now ? recon : null;
    const seen = (fresh?.targets as unknown as ReconTarget[] | undefined) ?? [];
    const live = seen.length ? await prisma.run.findMany({
      where: { id: { in: seen.map((target) => target.runId) } },
      select: { id: true, status: true, lastHitAt: true, roundPlayer: true, tails: { where: { status: 'PENDING' }, select: { id: true } } },
    }) : [];
    const linked = new Map<string, boolean>();
    const targets: ConvoyTargetDto[] = [];
    for (const target of seen) {
      const run = live.find((entry) => entry.id === target.runId);
      if (!run || run.status !== 'ACTIVE') continue;
      const owner = run.roundPlayer;
      if (!linked.has(owner.accountId)) linked.set(owner.accountId, await accountsShareNetwork(prisma, player.accountId, owner.accountId, now));
      const inReachNow = new Date(target.inReachFrom) <= now && now < new Date(target.inReachUntil);
      targets.push({
        ...target,
        inReachNow,
        tailed: run.tails.length > 0,
        blockedReason: allianceTargetBlock(player, owner, now)
          ?? (linked.get(owner.accountId) ? 'You have played from the same network as this crew.' : null)
          ?? (run.tails.length ? 'Someone is already on it.' : null)
          ?? (run.lastHitAt && run.lastHitAt.getTime() + rules.rehitMinutes * 60_000 > now.getTime() ? 'It was hit a moment ago.' : null)
          ?? (!inReachNow ? (new Date(target.inReachUntil) <= now ? 'Gone by now.' : 'Not in reach yet.') : null)
          ?? (target.source === 'RUN' && (!mine || mine.escortThugs - mine.woundedEscorts < 1) ? 'Your run has no fit escorts.' : null)
          ?? squad.blockedReason
          ?? (target.source === 'HOME' && squad.fit < 1 ? 'You have no fit thugs to send.' : null),
      });
    }

    const since = new Date(now.getTime() - RECENT_MS);
    const tails = await prisma.convoyTail.findMany({
      where: {
        OR: [
          { attackerId: playerId, OR: [{ status: 'PENDING' }, { startedAt: { gte: since } }] },
          { ownerId: playerId, OR: [{ status: 'PENDING' }, { startedAt: { gte: since } }] },
          { backups: { some: { playerId } }, startedAt: { gte: since } },
          ...(player.allianceId ? [{ status: 'PENDING' as const, city: myCity, alliesCalledAt: { not: null }, owner: { allianceId: player.allianceId }, ownerId: { not: playerId } }] : []),
        ],
      },
      include: { backups: true, attacker: { select: { publicPimpId: true, displayName: true } }, owner: true, run: { include: RUN_INCLUDE } },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    const tailDtos: ConvoyTailDto[] = [];
    for (const tail of tails) {
      const role: ConvoyTailDto['role'] = tail.attackerId === playerId ? 'attacker' : tail.ownerId === playerId ? 'owner' : 'ally';
      // Nobody tells the owner: a tail on their run shows only once their lookouts spot it.
      if (role === 'owner' && tail.status === 'PENDING' && !ownerSees(base, player, tail, now)) continue;
      const pending = tail.status === 'PENDING' && tail.landsAt > now;
      const limit = pending && role !== 'attacker' && !tail.backups.some((backup) => backup.playerId === playerId)
        ? await sendLimit(prisma, base, tail, player, player, now)
        : null;
      tailDtos.push({
        id: tail.id,
        role,
        status: tail.status,
        city: tail.city,
        cityName: cityName(base, tail.city),
        startedAt: tail.startedAt.toISOString(),
        landsAt: tail.landsAt.toISOString(),
        squad: tail.squad,
        source: tail.source === 'RUN' ? 'RUN' : 'HOME',
        attacker: tail.attacker,
        owner: { publicPimpId: tail.owner.publicPimpId, displayName: tail.owner.displayName },
        backup: {
          owner: tail.backups.filter((backup) => backup.kind === 'OWNER').reduce((sum, backup) => sum + backup.thugs, 0),
          allies: tail.backups.filter((backup) => backup.kind === 'ALLY').reduce((sum, backup) => sum + backup.thugs, 0),
        },
        alliesCalled: tail.alliesCalledAt !== null,
        sendBackup: role === 'owner' && limit ? { max: limit.max, minutes: limit.minutes, reason: limit.reason } : null,
        answer: role === 'ally' && limit ? { max: limit.max, reason: limit.reason } : null,
        voided: tail.voidedAt !== null,
        report: tail.result ? reportFor(tail.result as unknown as TailResult, role) : null,
      });
    }

    return {
      enabled: true,
      rules: {
        warningMinutes: rules.warningMinutes, turnCost: rules.turnCost, squadCap: model.squadCap, rehitMinutes: rules.rehitMinutes,
        reconTurnCost: rules.recon.turnCost, reconFreshMinutes: rules.recon.freshMinutes,
        lookaheadMinutes: reconLookaheadMinutes(base, player.hideoutLookoutsLevel), headsUpMinutes: headsUpMinutes(base, player.hideoutLookoutsLevel),
      },
      recon: fresh ? { seenAt: fresh.seenAt.toISOString(), expiresAt: fresh.expiresAt.toISOString() } : null,
      squad,
      run: mine && myRunPosition && myRunPosition.phase !== 'home' ? { escorts: Math.max(0, mine.escortThugs - mine.woundedEscorts), cityName: cityName(base, myRunPosition.city) } : null,
      targets,
      tails: tailDtos,
    };
  },
};

/**
 * How many thugs a player can send to a tail's fight, and why not. The owner's backup has
 * to drive from home and get there before the hit; an ally has to live where the run is
 * and have been called.
 */
async function sendLimit(
  db: Db | PrismaClient,
  ruleset: Ruleset,
  tail: ConvoyTail & { run: LoadedRun; owner: RoundPlayer; backups?: ConvoyBackup[] },
  player: RoundPlayer & { city: { slug: string } },
  current: { turns: number; thugs: number; woundedThugs: number; busyThugs: number },
  now: Date,
): Promise<{ max: number; minutes: number; reason: string | null }> {
  const model = ruleset.combat!;
  const fit = Math.min(fitThugs(current), model.squadCap);
  const left = (tail.landsAt.getTime() - now.getTime()) / 60_000;
  if (player.lockedUntil && player.lockedUntil > now) return { max: 0, minutes: 0, reason: 'You are locked up.' };
  if (player.movingUntil && player.movingUntil > now) return { max: 0, minutes: 0, reason: 'You are moving house.' };
  if (tail.ownerId === player.id) {
    const minutes = Math.ceil(backupMinutes(ruleset, hoursFromHome(ruleset, toStopPlans(tail.run.stops), tail.run.homeCity, now)));
    if (!Number.isFinite(minutes) || minutes > left) return { max: 0, minutes, reason: `It is ${minutes} minutes from home: backup would arrive after the hit.` };
    return { max: fit, minutes, reason: fit < 1 ? 'You have no fit thugs at home.' : null };
  }
  if (!player.allianceId || player.allianceId !== tail.owner.allianceId) return { max: 0, minutes: 0, reason: 'Only their allies can answer.' };
  if (player.city.slug !== tail.city) return { max: 0, minutes: 0, reason: `You do not live in ${cityName(ruleset, tail.city)}.` };
  if (!tail.alliesCalledAt) return { max: 0, minutes: 0, reason: 'They have not called for help.' };
  const reachable = await db.city.findUnique({ where: { slug: tail.city }, select: { id: true } });
  if (!reachable) return { max: 0, minutes: 0, reason: 'That city is not on the map.' };
  return { max: fit, minutes: 0, reason: fit < 1 ? 'You have no fit thugs to send.' : null };
}

/** The owner's own backup comes home from a fight (or from one that never happened), with its wounds. */
async function creditOwnerBackups(tx: Db, owner: RoundPlayer, backups: ConvoyBackup[], wounded: number, recoverAt: Date | null, now: Date): Promise<void> {
  if (!backups.length) return;
  const thugs = backups.reduce((sum, backup) => sum + backup.thugs, 0);
  const split = splitWounds(wounded, Object.fromEntries(backups.map((backup) => [backup.id, backup.thugs])));
  for (const backup of backups) await tx.convoyBackup.update({ where: { id: backup.id }, data: { wounded: split[backup.id] ?? 0, creditedAt: now } });
  await tx.roundPlayer.update({ where: { id: owner.id }, data: { busyThugs: Math.max(0, owner.busyThugs - thugs) } });
  if (recoverAt) await CombatRecoveryService.add(tx, owner.id, null, wounded, recoverAt);
}
