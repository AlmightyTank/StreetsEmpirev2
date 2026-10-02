import type { Prisma, PrismaClient } from '@prisma/client';
import {
  allyCutShare,
  allyThugCap,
  blockWarRules,
  cornerMinimumFor,
  torchOpen,
  turfPushCombatModel,
  warEndsBy,
  type Ruleset,
} from '@streets/rules-engine';
import type { DistrictKey } from '@streets/rulesets';
import type {
  BlockWarActionResult,
  BlockWarAnswerInput,
  BlockWarCallInput,
  BlockWarDeclareInput,
  BlockWarEndInput,
  BlockWarSendInput,
  BusinessTorchInput,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs, type PlayerState } from './action.service.js';
import { accountsShareNetwork } from './admin-signals.service.js';
import { allianceTargetBlock } from './alliance.service.js';
import { ActivityService } from './activity.service.js';
import { ACTIVE_WAR, BlockWarSettleService, blockFatigueNow } from './block-war-settle.service.js';
import { hasTurfRevenge } from './turf-revenge.service.js';
import {
  TurfService,
  allocateCornerGuns,
  cornerGunWorthCents,
  gunsFromTurf,
  subtractCornerGuns,
  turfGunData,
} from './turf.service.js';

const HOUR_MS = 3_600_000;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function districtName(ruleset: Ruleset, city: string, district: DistrictKey): string {
  return ruleset.cities?.[city]?.districts?.[district]?.name ?? ruleset.districts[district].name;
}

function requireWars(ruleset: Ruleset) {
  const wars = blockWarRules(ruleset);
  const model = turfPushCombatModel(ruleset);
  if (!wars || !model) throw AppError.conflict('BLOCK_WARS_DISABLED', 'Block wars are not open in this round.');
  return { wars, model, business: ruleset.business! };
}

async function lockWar(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "BlockWar" WHERE id = ${id} FOR UPDATE`;
}
async function lockBlock(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Turf" WHERE id = ${id} FOR UPDATE`;
}

async function loadWar(tx: Db, warId: string, roundId: string) {
  await lockWar(tx, warId);
  const war = await tx.blockWar.findUnique({
    where: { id: warId },
    include: { turf: { include: { city: { select: { id: true, slug: true } } } }, fightRows: { where: { status: 'PENDING' }, orderBy: { landsAt: 'asc' } } },
  });
  if (!war || war.roundId !== roundId) throw AppError.notFound('BLOCK_WAR_NOT_FOUND', 'That block war is not in this round.');
  if (war.status === 'ENDED') throw AppError.conflict('BLOCK_WAR_OVER', 'That block war is already over.');
  return war;
}

/**
 * Commit thugs from home with their guns, the way a push squad leaves: they stop being fit,
 * and their guns leave the arsenal until the squad comes home.
 */
function commit(current: PlayerState, ruleset: Ruleset, thugs: number, cap: number) {
  const fit = Math.min(fitThugs(current), cap);
  if (fit < 1) throw AppError.conflict('BLOCK_WAR_NO_THUGS', 'You have no fit thugs at home to send.');
  if (thugs > fit) throw AppError.badRequest('BLOCK_WAR_TOO_MANY', `Send at most ${fit} thugs.`);
  const guns = allocateCornerGuns(current, thugs);
  if (!guns) throw AppError.conflict('BLOCK_WAR_NOT_ENOUGH_ARMED', `You need ${thugs} home guns to send that many.`);
  const next: PlayerState = {
    ...current,
    busyThugs: current.busyThugs + thugs,
    pistols: current.pistols - guns.pistols,
    shotguns: current.shotguns - guns.shotguns,
    tek9s: current.tek9s - guns.tek9s,
    ak47s: current.ak47s - guns.ak47s,
    postedNetWorthCents: current.postedNetWorthCents + cornerGunWorthCents(ruleset, guns),
  };
  const crew = json({ thugHappiness: 0, weapons: { PISTOL: guns.pistols, SHOTGUN: guns.shotguns, TEK9: guns.tek9s, AK47: guns.ak47s } });
  return { next, guns, crew };
}

/** Thugs a side has on the war right now (the corner counts for the holder). */
async function committed(tx: Db, warId: string): Promise<{ declarer: number; attacker: number; defender: number }> {
  const squads = await tx.blockWarSquad.findMany({ where: { warId, active: true }, select: { side: true, role: true, thugs: true } });
  return {
    declarer: squads.filter((row) => row.role === 'DECLARER').reduce((sum, row) => sum + row.thugs, 0),
    attacker: squads.filter((row) => row.side === 'ATTACKER').reduce((sum, row) => sum + row.thugs, 0),
    defender: squads.filter((row) => row.side === 'DEFENDER').reduce((sum, row) => sum + row.thugs, 0),
  };
}

function withMorale(crew: Prisma.InputJsonValue, morale: number): Prisma.InputJsonValue {
  return { ...(crew as Record<string, unknown>), thugHappiness: morale } as Prisma.InputJsonValue;
}

/**
 * 1.1.0-E. An alliance member who does not live in the war city can answer from the
 * corner crew of their outpost there. The people move from posted -> busy while they
 * fight; their guns remain away, so posted gun net worth does not change at send time.
 */
async function commitOutpostAlly(
  tx: Db,
  current: PlayerState,
  ruleset: Ruleset,
  input: { roundId: string; playerId: string; cityId: string; thugs: number; cap: number },
) {
  const candidates = await tx.turf.findMany({
    where: { roundId: input.roundId, cityId: input.cityId, holderId: input.playerId },
    include: { outpost: true },
    orderBy: { heldSince: 'asc' },
  });
  const source = candidates.find((row) => row.outpost?.ownerId === input.playerId);
  if (!source?.outpost) return null;
  await lockBlock(tx, source.id);
  const fresh = await tx.turf.findUniqueOrThrow({ where: { id: source.id }, include: { outpost: true } });
  if (fresh.holderId !== input.playerId || fresh.outpost?.ownerId !== input.playerId) return null;

  const available = Math.min(fresh.cornerThugs, input.cap);
  if (available < 1) throw AppError.conflict('BLOCK_WAR_NO_THUGS', 'Your outpost has no corner crew free to answer.');
  if (input.thugs > available) throw AppError.badRequest('BLOCK_WAR_TOO_MANY', `Send at most ${available} thugs from that outpost.`);
  const guns = allocateCornerGuns(gunsFromTurf(fresh), input.thugs);
  if (!guns) throw AppError.conflict('BLOCK_WAR_NOT_ENOUGH_ARMED', `That outpost needs ${input.thugs} posted guns to send that many.`);
  const left = subtractCornerGuns(gunsFromTurf(fresh), guns);
  await tx.turf.update({
    where: { id: fresh.id },
    data: { cornerThugs: fresh.cornerThugs - input.thugs, ...turfGunData(left) },
  });

  const crew = json({
    thugHappiness: 0,
    weapons: { PISTOL: guns.pistols, SHOTGUN: guns.shotguns, TEK9: guns.tek9s, AK47: guns.ak47s },
    sourceOutpost: { turfId: fresh.id, outpostId: fresh.outpost.id },
  });
  return {
    next: {
      ...current,
      busyThugs: current.busyThugs + input.thugs,
      postedThugs: Math.max(0, current.postedThugs - input.thugs),
    },
    crew,
  };
}

type WarRow = Awaited<ReturnType<typeof loadWar>>;

function result(war: WarRow, ruleset: Ruleset, message: string, turnsUsed: number, thugs: number): BlockWarActionResult {
  const district = war.turf.district as DistrictKey;
  return { warId: war.id, district, districtName: districtName(ruleset, war.turf.city.slug, district), message, turnsUsed, thugs };
}

/** Before any war action, the war is brought up to date in a transaction of its own. */
async function upToDate(prisma: PrismaClient, warId: string, at: Date): Promise<void> {
  await BlockWarSettleService.advance(prisma, warId, at);
}

export const BlockWarService = {
  /** Declare a war on a player's block: a goal, a squad, and the opening fight after the warning. */
  declare(prisma: PrismaClient, attackerId: string, input: BlockWarDeclareInput, at: Date = new Date()) {
    return ActionService.run<BlockWarActionResult>(prisma, attackerId, {
      action: 'BLOCK_WAR_DECLARE', actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        const { wars, model } = requireWars(ruleset);
        const turfRules = ruleset.turf!;
        const district = input.district as DistrictKey;
        if (!turfRules.districts[district]) throw AppError.badRequest('UNKNOWN_DISTRICT', 'That is not a turf block.');
        await TurfService.ensureRound(tx, round.id, ruleset);
        const block = await tx.turf.findUnique({ where: { roundId_cityId_district: { roundId: round.id, cityId: player.cityId, district } }, select: { id: true } });
        if (!block) throw AppError.notFound('TURF_NOT_FOUND', 'That block is not in your city.');
        await lockBlock(tx, block.id);
        const turf = await tx.turf.findUniqueOrThrow({
          where: { id: block.id },
          include: {
            city: { select: { id: true, slug: true } },
            outpost: true,
            holder: { select: { id: true, accountId: true, allianceId: true, formerAllianceId: true, allianceCooldownUntil: true, publicPimpId: true, displayName: true } },
          },
        });
        const holder = turf.holder;
        if (!holder) throw AppError.conflict('LOCALS_BLOCK', 'The locals hold that block. Claim it instead.');
        if (turf.outpost && !ruleset.business?.outposts) {
          throw AppError.conflict('BLOCK_WAR_OUTPOSTS_DISABLED', 'Block wars on outposts arrive in 1.1.0-E.');
        }
        if (holder.id === attackerId || holder.accountId === player.accountId) throw AppError.badRequest('OWN_TURF', 'That is your own block.');
        const allied = allianceTargetBlock(player, holder, now);
        if (allied) throw AppError.conflict('ALLIED', `${allied} A block passed between allies has to go through the locals.`);
        if (await accountsShareNetwork(tx, player.accountId, holder.accountId, now)) {
          throw AppError.conflict('LINKED_ACCOUNTS', 'You have played from the same network as this crew, so you cannot declare on their turf.');
        }
        if (turf.shieldUntil && turf.shieldUntil > now) throw AppError.conflict('TURF_SHIELDED', `That block is under a truce until ${turf.shieldUntil.toISOString()}.`);
        if (await tx.blockWar.findFirst({ where: { turfId: turf.id, status: ACTIVE_WAR } })) throw AppError.conflict('BLOCK_WAR_ON', 'There is already a war on that block.');
        const declared = await tx.blockWar.count({ where: { attackerId, status: ACTIVE_WAR } });
        if (declared >= wars.maxDeclaredPerCrew) throw AppError.conflict('BLOCK_WAR_LIMIT', `You can have ${wars.maxDeclaredPerCrew} war declared at a time.`);
        const lost = await tx.blockWar.findFirst({
          where: { turfId: turf.id, attackerId, winner: 'DEFENDER', endedAt: { gt: new Date(now.getTime() - wars.loserCooldownHours * HOUR_MS) } },
          orderBy: { endedAt: 'desc' },
        });
        if (lost?.endedAt) {
          throw AppError.conflict('BLOCK_WAR_COOLDOWN', `You lost a war on this block; you can declare again at ${new Date(lost.endedAt.getTime() + wars.loserCooldownHours * HOUR_MS).toISOString()}.`);
        }

        const revenge = await hasTurfRevenge(tx, player, round.id, holder.id, ruleset, now);
        const presence = await TurfService.presenceFor(tx, attackerId, player.cityId, district, ruleset, now);
        if (!revenge && presence < turfRules.presence.turnsToClaim) {
          throw AppError.conflict('TURF_NO_PRESENCE', `Work this block until you have ${turfRules.presence.turnsToClaim} presence before declaring on it.`);
        }
        if (input.goal === 'TAKE') {
          // A Take needs a free block slot, held for the whole war.
          const [held, taking] = await Promise.all([
            tx.turf.count({ where: { roundId: round.id, cityId: player.cityId, holderId: attackerId } }),
            tx.blockWar.count({ where: { attackerId, goal: 'TAKE', status: ACTIVE_WAR, turf: { cityId: player.cityId } } }),
          ]);
          if (held + taking >= turfRules.caps.blocksPerCrewHome) {
            throw AppError.conflict('TURF_CREW_CAP', `You already hold your ${turfRules.caps.blocksPerCrewHome}-block home cap. Declare a Sack instead.`);
          }
        }
        const minimum = cornerMinimumFor(ruleset, district, current.thugs);
        if (input.squad < minimum) throw AppError.badRequest('TURF_SQUAD_SMALL', `A war on this block needs a squad of at least ${minimum}.`);
        assertTurns(current.turns, wars.declareTurnCost);
        const sent = commit(current, ruleset, input.squad, model.squadCap);

        const fatigue = blockFatigueNow(ruleset, turf, null, now).percent;
        await tx.turf.update({ where: { id: turf.id }, data: { fatigue, fatigueAt: now } });
        const landsAt = new Date(now.getTime() + wars.warningMinutes * 60_000);
        const war = await tx.blockWar.create({
          data: {
            roundId: round.id, turfId: turf.id, attackerId, attackerAllianceId: player.allianceId,
            defenderId: holder.id, defenderAllianceId: holder.allianceId,
            goal: input.goal, actionId: input.actionId, declaredAt: now, endsBy: warEndsBy(ruleset, now), fatigueAtStart: fatigue,
          },
        });
        const fight = await tx.blockWarFight.create({ data: { warId: war.id, kind: 'OPENING', startedAt: now, landsAt } });
        await tx.blockWarSquad.create({
          data: { warId: war.id, playerId: attackerId, side: 'ATTACKER', role: 'DECLARER', fightId: fight.id, sent: input.squad, thugs: input.squad, crew: withMorale(sent.crew, player.thugHappiness) },
        });

        const name = districtName(ruleset, turf.city.slug, district);
        await ActivityService.log(tx, holder.id, 'BLOCK_WAR_DECLARED', json({
          warId: war.id, district, districtName: name, goal: input.goal, role: 'defender',
          attacker: player.displayName, squad: input.squad, landsAt: landsAt.toISOString(),
        }));
        return {
          next: { ...sent.next, turns: current.turns - wars.declareTurnCost },
          result: {
            warId: war.id, district, districtName: name, turnsUsed: wars.declareTurnCost, thugs: input.squad,
            message: `War declared on ${name} (${input.goal === 'TAKE' ? 'Take' : 'Sack'}). The opening fight lands at ${landsAt.toISOString()}.`,
          },
          activity: { type: 'BLOCK_WAR_DECLARED', payload: json({ warId: war.id, district, districtName: name, goal: input.goal, role: 'attacker', defender: holder.displayName, squad: input.squad, landsAt: landsAt.toISOString() }) },
        };
      },
    }, at);
  },

  /** The holder sends backup from home to the fight that is coming (the opening fight or a re-assault). */
  async defend(prisma: PrismaClient, holderId: string, input: BlockWarSendInput, at: Date = new Date()) {
    await upToDate(prisma, input.warId, at);
    return ActionService.run<BlockWarActionResult>(prisma, holderId, {
      action: 'BLOCK_WAR_DEFEND', actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        const { model } = requireWars(ruleset);
        const war = await loadWar(tx, input.warId, round.id);
        if (war.defenderId !== holderId) throw AppError.conflict('NOT_YOUR_WAR', 'Only the holder can send backup to this block.');
        const fight = war.fightRows.find((row) => row.kind !== 'BREAK' && row.landsAt > now);
        if (!fight) throw AppError.conflict('BLOCK_WAR_NO_FIGHT', 'No assault is coming to defend against right now.');
        if (await tx.blockWarSquad.findFirst({ where: { warId: war.id, fightId: fight.id, playerId: holderId } })) {
          throw AppError.conflict('BLOCK_WAR_SENT', 'You already sent backup to this fight.');
        }
        const sent = commit(current, ruleset, input.thugs, model.squadCap);
        await tx.blockWarSquad.create({
          data: { warId: war.id, playerId: holderId, side: 'DEFENDER', role: 'HOLDER', fightId: fight.id, sent: input.thugs, thugs: input.thugs, crew: withMorale(sent.crew, player.thugHappiness) },
        });
        return { next: sent.next, result: result(war, ruleset, `${input.thugs} thugs are on their way to hold the block.`, 0, input.thugs) };
      },
    }, at);
  },

  /** The holder hits the occupying squad. It lands after the muster window so an ally can answer. */
  async breakSiege(prisma: PrismaClient, holderId: string, input: BlockWarSendInput, at: Date = new Date()) {
    await upToDate(prisma, input.warId, at);
    return ActionService.run<BlockWarActionResult>(prisma, holderId, {
      action: 'BLOCK_WAR_BREAK', actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        const { wars, model } = requireWars(ruleset);
        const war = await loadWar(tx, input.warId, round.id);
        if (war.defenderId !== holderId) throw AppError.conflict('NOT_YOUR_WAR', 'Only the holder can break this siege.');
        if (war.status !== 'SIEGE') throw AppError.conflict('BLOCK_WAR_NO_SIEGE', 'Nobody is besieging this block right now.');
        if (war.fightRows.some((row) => row.kind === 'BREAK')) throw AppError.conflict('BLOCK_WAR_BREAKING', 'A break attempt is already on its way.');
        const landsAt = new Date(now.getTime() + wars.breakMusterMinutes * 60_000);
        if (landsAt >= war.endsBy) throw AppError.conflict('BLOCK_WAR_ENDING', 'The war ends before a break attempt could land.');
        const sent = commit(current, ruleset, input.thugs, model.squadCap);
        const fight = await tx.blockWarFight.create({ data: { warId: war.id, kind: 'BREAK', startedAt: now, landsAt } });
        await tx.blockWarSquad.create({
          data: { warId: war.id, playerId: holderId, side: 'DEFENDER', role: 'HOLDER', fightId: fight.id, sent: input.thugs, thugs: input.thugs, crew: withMorale(sent.crew, player.thugHappiness) },
        });
        return { next: sent.next, result: result(war, ruleset, `Your crew musters to break the siege; it hits at ${landsAt.toISOString()}.`, 0, input.thugs) };
      },
    }, at);
  },

  /** The declarer goes again after a lost fight or a broken siege, once the cooldown has passed. */
  async assault(prisma: PrismaClient, attackerId: string, input: BlockWarSendInput, at: Date = new Date()) {
    await upToDate(prisma, input.warId, at);
    return ActionService.run<BlockWarActionResult>(prisma, attackerId, {
      action: 'BLOCK_WAR_ASSAULT', actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        const { wars, model } = requireWars(ruleset);
        const war = await loadWar(tx, input.warId, round.id);
        if (war.attackerId !== attackerId) throw AppError.conflict('NOT_YOUR_WAR', 'Only the crew that declared this war can assault the block.');
        if (war.status !== 'BETWEEN' || war.fightRows.length) throw AppError.conflict('BLOCK_WAR_NOT_READY', 'Your squad is already in this fight.');
        if (war.nextAssaultAt && war.nextAssaultAt > now) throw AppError.conflict('BLOCK_WAR_COOLDOWN', `Your crew can go again at ${war.nextAssaultAt.toISOString()}.`);
        const landsAt = new Date(now.getTime() + wars.breakMusterMinutes * 60_000);
        if (landsAt >= war.endsBy) throw AppError.conflict('BLOCK_WAR_ENDING', 'The war ends before another assault could land.');
        const sent = commit(current, ruleset, input.thugs, model.squadCap);
        const fight = await tx.blockWarFight.create({ data: { warId: war.id, kind: 'ASSAULT', startedAt: now, landsAt } });
        await tx.blockWarSquad.create({
          data: { warId: war.id, playerId: attackerId, side: 'ATTACKER', role: 'DECLARER', fightId: fight.id, sent: input.thugs, thugs: input.thugs, crew: withMorale(sent.crew, player.thugHappiness) },
        });
        await ActivityService.log(tx, war.defenderId, 'BLOCK_WAR_DECLARED', json({ warId: war.id, district: war.turf.district, role: 'defender', assault: true, attacker: player.displayName, squad: input.thugs, landsAt: landsAt.toISOString() }));
        return { next: sent.next, result: result(war, ruleset, `Your crew goes again; it hits at ${landsAt.toISOString()}.`, 0, input.thugs) };
      },
    }, at);
  },

  /**
   * Call one alliance member to your side, promising a cut of the winnings. The call is open
   * until the coming fight lands (or, for the attacker during a siege, a short window).
   * Once an ally has taken the slot the cut can rise but never fall.
   */
  async callAlly(prisma: PrismaClient, callerId: string, input: BlockWarCallInput, at: Date = new Date()) {
    await upToDate(prisma, input.warId, at);
    return ActionService.run<BlockWarActionResult>(prisma, callerId, {
      action: 'BLOCK_WAR_CALL', actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        const { business } = requireWars(ruleset);
        const war = await loadWar(tx, input.warId, round.id);
        const side = war.attackerId === callerId ? 'attacker' : war.defenderId === callerId ? 'defender' : null;
        if (!side) throw AppError.conflict('NOT_YOUR_WAR', 'Only the declarer or the holder can call for help.');
        if (!player.allianceId) throw AppError.conflict('NO_ALLIANCE', 'You have no alliance to call.');
        const cut = allyCutShare(ruleset, input.cutPercent / 100);
        const current_cut = side === 'attacker' ? war.attackerCut : war.defenderCut;
        const slot = side === 'attacker' ? war.attackerAllyId : war.defenderAllyId;
        if (slot && cut < current_cut) throw AppError.conflict('BLOCK_WAR_CUT_LOWER', `Your ally was promised ${Math.round(current_cut * 100)}%; you can raise it, never lower it.`);
        const pending = war.fightRows.find((row) => row.landsAt > now && (side === 'defender' || row.kind !== 'BREAK'));
        const until = pending?.landsAt
          ?? (side === 'attacker' && war.status === 'SIEGE' ? new Date(now.getTime() + business.allies.siegeCallMinutes * 60_000) : null);
        if (!until) throw AppError.conflict('BLOCK_WAR_NOTHING_TO_CALL', 'There is no fight coming for an ally to join right now.');
        await tx.blockWar.update({
          where: { id: war.id },
          data: side === 'attacker'
            ? { attackerCut: cut, attackerCallUntil: until, attackerAllianceId: player.allianceId }
            : { defenderCut: cut, defenderCallUntil: until, defenderAllianceId: player.allianceId },
        });
        const enemy = side === 'attacker' ? war.defenderId : war.attackerId;
        const candidates = await tx.roundPlayer.findMany({
          where: { roundId: round.id, allianceId: player.allianceId, id: { notIn: [callerId, enemy] } },
          select: {
            id: true,
            cityId: true,
            turfHeld: {
              where: { cityId: war.turf.cityId },
              select: { outpost: { select: { ownerId: true } } },
            },
          },
        });
        const members = candidates.filter((member) =>
          member.cityId === war.turf.cityId
          || (Boolean(business.outposts) && member.turfHeld.some((block) => block.outpost?.ownerId === member.id)));
        const payload = json({ warId: war.id, district: war.turf.district, side: side === 'attacker' ? 'ATTACKER' : 'DEFENDER', caller: player.displayName, cutPercent: Math.round(cut * 100), until: until.toISOString() });
        for (const member of slot ? members.filter((row) => row.id === slot) : members) {
          await ActivityService.log(tx, member.id, 'BLOCK_WAR_CALL', payload);
        }
        return { next: current, result: result(war, ruleset, `Called ${slot ? 'your ally' : `${members.length} alliance member${members.length === 1 ? '' : 's'}`} for a ${Math.round(cut * 100)}% cut, open until ${until.toISOString()}.`, 0, 0) };
      },
    }, at);
  },

  /** Answer a call: the first member to answer takes the side's one ally slot for the war. */
  async answer(prisma: PrismaClient, allyId: string, input: BlockWarAnswerInput, at: Date = new Date()) {
    await upToDate(prisma, input.warId, at);
    return ActionService.run<BlockWarActionResult>(prisma, allyId, {
      action: 'BLOCK_WAR_ANSWER', actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        const { business, model } = requireWars(ruleset);
        const war = await loadWar(tx, input.warId, round.id);
        if (war.attackerId === allyId || war.defenderId === allyId) throw AppError.conflict('BLOCK_WAR_OWN', 'This is your own war.');
        const attackerSide = input.side === 'ATTACKER';
        const callerId = attackerSide ? war.attackerId : war.defenderId;
        const enemyId = attackerSide ? war.defenderId : war.attackerId;
        const caller = await tx.roundPlayer.findUniqueOrThrow({ where: { id: callerId }, select: { allianceId: true, accountId: true, displayName: true } });
        if (!player.allianceId || player.allianceId !== caller.allianceId) throw AppError.conflict('NOT_ALLIED', 'Only the caller\'s alliance can answer.');
        const resident = player.cityId === war.turf.cityId;
        if (!resident && !business.outposts) {
          throw AppError.conflict('WRONG_CITY', 'Only members who live in this city can answer.');
        }
        const until = attackerSide ? war.attackerCallUntil : war.defenderCallUntil;
        if (!until || until <= now) throw AppError.conflict('BLOCK_WAR_NO_CALL', 'There is no open call for help on that side.');
        const slot = attackerSide ? war.attackerAllyId : war.defenderAllyId;
        if (slot && slot !== allyId) throw AppError.conflict('BLOCK_WAR_SLOT_TAKEN', 'Another member already answered for that side.');
        if (!slot) {
          const elsewhere = await tx.blockWar.count({ where: { status: ACTIVE_WAR, id: { not: war.id }, OR: [{ attackerAllyId: allyId }, { defenderAllyId: allyId }] } });
          if (elsewhere >= business.allies.maxWarsAsAlly) throw AppError.conflict('BLOCK_WAR_ALLY_BUSY', 'You are already the ally in another war.');
          const enemy = await tx.roundPlayer.findUniqueOrThrow({ where: { id: enemyId }, select: { accountId: true } });
          if (await accountsShareNetwork(tx, player.accountId, caller.accountId, now) || await accountsShareNetwork(tx, player.accountId, enemy.accountId, now)) {
            throw AppError.conflict('LINKED_ACCOUNTS', 'Linked accounts cannot answer each other\'s calls.');
          }
        }
        // Defenders join the coming fight; the attacker's ally joins the coming assault, or
        // the occupying squad during a siege.
        const fight = war.fightRows.find((row) => row.landsAt > now && (!attackerSide || row.kind !== 'BREAK'));
        if (!fight && !(attackerSide && war.status === 'SIEGE')) throw AppError.conflict('BLOCK_WAR_NO_FIGHT', 'There is no fight to join on that side right now.');
        const totals = await committed(tx, war.id);
        const mine = await tx.blockWarSquad.findMany({ where: { warId: war.id, playerId: allyId, active: true }, select: { thugs: true } });
        const room = allyThugCap(ruleset, totals.declarer) - mine.reduce((sum, row) => sum + row.thugs, 0);
        if (room < 1) throw AppError.conflict('BLOCK_WAR_ALLY_CAP', 'You already match the declarer\'s squad, the most an ally can send.');
        if (input.thugs > room) throw AppError.badRequest('BLOCK_WAR_ALLY_CAP', `An ally can send at most ${room} more (matched to the declarer's squad).`);
        const sent = resident
          ? commit(current, ruleset, input.thugs, model.squadCap)
          : await commitOutpostAlly(tx, current, ruleset, {
              roundId: round.id, playerId: allyId, cityId: war.turf.cityId, thugs: input.thugs, cap: model.squadCap,
            });
        if (!sent) throw AppError.conflict('WRONG_CITY', 'You need to live in this city or hold an outpost here to answer.');
        if (!slot) await tx.blockWar.update({ where: { id: war.id }, data: attackerSide ? { attackerAllyId: allyId } : { defenderAllyId: allyId } });
        await tx.blockWarSquad.create({
          data: {
            warId: war.id, playerId: allyId, side: input.side, role: 'ALLY', fightId: fight?.id ?? null,
            sent: input.thugs, thugs: input.thugs, crew: withMorale(sent.crew, player.thugHappiness),
          },
        });
        // An ally sitting in a siege is in it: the siege counts that as fighting.
        if (attackerSide && !fight) await tx.blockWar.update({ where: { id: war.id }, data: { attackerAllyFought: true } });
        const cut = attackerSide ? war.attackerCut : war.defenderCut;
        return {
          next: sent.next,
          result: result(war, ruleset, `${input.thugs} thugs ride with ${caller.displayName} for a ${Math.round(cut * 100)}% cut.`, 0, input.thugs),
          activity: { type: 'BLOCK_WAR_CALL', payload: json({ warId: war.id, district: war.turf.district, answered: true, side: input.side, caller: caller.displayName, thugs: input.thugs, cutPercent: Math.round(cut * 100) }) },
        };
      },
    }, at);
  },

  /** The holder gives the attacker their goal now, with less devastation than a finished siege. */
  async concede(prisma: PrismaClient, holderId: string, input: BlockWarEndInput, at: Date = new Date()) {
    return BlockWarService.endBy(prisma, holderId, input, at, 'concede');
  },

  /** The declarer calls it off: the holder wins, and the declarer is locked out of the block for a while. */
  async withdraw(prisma: PrismaClient, attackerId: string, input: BlockWarEndInput, at: Date = new Date()) {
    return BlockWarService.endBy(prisma, attackerId, input, at, 'withdraw');
  },

  /**
   * Concede or withdraw. The war is ended in a transaction of its own (it writes the holder's
   * corner and the block), and only then is the action recorded, so the player's own state is
   * read after the war has moved it.
   */
  async endBy(prisma: PrismaClient, playerId: string, input: BlockWarEndInput, at: Date, how: 'concede' | 'withdraw') {
    await upToDate(prisma, input.warId, at);
    const replay = await prisma.processedAction.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId: input.actionId } } });
    if (!replay) {
      const war = await prisma.blockWar.findUnique({ where: { id: input.warId } });
      const mine = how === 'concede' ? war?.defenderId === playerId : war?.attackerId === playerId;
      if (!war || !mine) throw AppError.notFound('BLOCK_WAR_NOT_FOUND', how === 'concede' ? 'That war is not on your block.' : 'You did not declare that war.');
      if (war.status === 'ENDED') throw AppError.conflict('BLOCK_WAR_OVER', 'That block war is already over.');
      if (how === 'concede' && war.status !== 'SIEGE') throw AppError.conflict('BLOCK_WAR_NO_SIEGE', 'You can only concede while your block is under siege.');
      await BlockWarSettleService.advance(prisma, war.id, at, how === 'concede'
        ? { winner: 'ATTACKER', reason: 'CONCEDED' }
        : { winner: 'DEFENDER', reason: 'WITHDREW' });
    }
    return ActionService.run<BlockWarActionResult>(prisma, playerId, {
      action: how === 'concede' ? 'BLOCK_WAR_CONCEDE' : 'BLOCK_WAR_WITHDRAW', actionId: input.actionId,
      execute: async ({ tx, current, ruleset }) => {
        const war = await tx.blockWar.findUniqueOrThrow({
          where: { id: input.warId },
          include: { turf: { include: { city: { select: { id: true, slug: true } } } }, fightRows: true },
        });
        return {
          next: current,
          result: result(war as WarRow, ruleset, how === 'concede' ? 'You conceded the block.' : 'You called off the war; the holder keeps the block.', 0, 0),
        };
      },
    }, at);
  },

  /**
   * The holder burns a business rather than hand it over: it takes time and must finish before
   * Control reaches 100. It loses levels, pays a salvage, and draws Heat.
   */
  async torch(prisma: PrismaClient, holderId: string, input: BusinessTorchInput, at: Date = new Date()) {
    return ActionService.run<BlockWarActionResult>(prisma, holderId, {
      action: 'BUSINESS_TORCH', actionId: input.actionId,
      execute: async ({ tx, current, player, round, ruleset, now }) => {
        const { business } = requireWars(ruleset);
        const district = input.district as DistrictKey;
        const turf = await tx.turf.findUnique({ where: { roundId_cityId_district: { roundId: round.id, cityId: player.cityId, district } }, select: { id: true } });
        if (!turf) throw AppError.notFound('TURF_NOT_FOUND', 'That block is not in your city.');
        const live = await tx.blockWar.findFirst({ where: { turfId: turf.id, status: ACTIVE_WAR } });
        if (!live || live.defenderId !== holderId) throw AppError.conflict('BLOCK_WAR_NONE', 'You can only torch a business on your block during a war on it.');
        const war = await loadWar(tx, live.id, round.id);
        const hoursLeft = (round.endsAt.getTime() - now.getTime()) / HOUR_MS;
        if (!torchOpen(ruleset, hoursLeft)) throw AppError.conflict('TORCH_CLOSED', `Torching closes for the round's final ${business.torch.closedFinalHours} hours.`);
        const row = await tx.business.findFirst({ where: { turfId: turf.id, lot: input.lot } });
        if (!row || row.level <= 0) throw AppError.conflict('BUSINESS_EMPTY_LOT', 'There is nothing built on that lot to torch.');
        if (row.torchUntil) throw AppError.conflict('TORCH_BURNING', 'That business is already burning.');
        assertTurns(current.turns, business.torch.turnCost);
        const until = new Date(now.getTime() + business.torch.minutes * 60_000);
        await tx.business.update({ where: { id: row.id }, data: { torchUntil: until, torchById: holderId } });
        const heat = ruleset.heat ? Math.min(ruleset.heat.max, current.heat + (business.wars.torchHeat ?? 0)) : current.heat;
        const name = business.catalog[row.kind as keyof typeof business.catalog].name;
        return {
          next: { ...current, turns: current.turns - business.torch.turnCost, heat },
          result: result(war, ruleset, `The ${name} is burning; it is gone at ${until.toISOString()} unless the block falls first.`, business.torch.turnCost, 0),
          activity: { type: 'BUSINESS_TORCH', payload: json({ warId: war.id, district, lot: input.lot, kind: row.kind, name, until: until.toISOString() }) },
        };
      },
    }, at);
  },
};

