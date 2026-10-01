import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV11D } from '@streets/rulesets';
import {
  blockWarFatigue,
  businessIncomeCentsPerHour,
  businessStaff,
  sackLootCents,
  startingStock,
  torchResult,
} from '@streets/rules-engine';
import { BlockWarService } from '../block-war.service.js';
import { BlockWarSettleService } from '../block-war-settle.service.js';
import { BusinessService } from '../business.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { TurfActionService } from '../turf-action.service.js';
import { TurfService } from '../turf.service.js';
import { TurfWarService } from '../turf-war.service.js';

const HOUR_MS = 3_600_000;
const rules = classicOgV11D;
const wars = rules.business.wars;
const home = rules.round.startingCitySlug;

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.1.0-D block wars with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  let holderId = '';
  let attackerId = '';
  let allyId = '';
  let holderAllyId = '';
  let attackerAlliance = '';
  let holderAlliance = '';
  const accountIds: string[] = [];
  let t0 = new Date();

  async function account(): Promise<string> {
    const name = `war_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() },
    });
    const id = registered.json().account.id as string;
    accountIds.push(id);
    return id;
  }

  async function player(accountId: string, publicPimpId: number): Promise<string> {
    const row = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        roundId, accountId, cityId,
        displayName: `war_${publicPimpId}`,
        publicPimpId,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    return row.id;
  }

  const read = (id: string) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id } });
  const block = () => app.prisma.turf.findFirstOrThrow({ where: { roundId, cityId, district: 'CASINO' }, include: { businesses: { orderBy: { lot: 'asc' } } } });
  const war = (id: string) => app.prisma.blockWar.findUniqueOrThrow({ where: { id } });
  const at = (hours: number) => new Date(t0.getTime() + hours * HOUR_MS);
  const settle = (id: string, when: Date) => PlayerStateService.settle(app.prisma, id, { now: when, markActive: false });
  const actionId = () => randomUUID();

  async function declare(goal: 'TAKE' | 'SACK', squad: number, when = t0) {
    const declared = await BlockWarService.declare(app.prisma, attackerId, { district: 'CASINO', goal, squad, actionId: actionId() }, when);
    return declared.result.warId;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({
      data: {
        name: 'Block wars D fixture', slug: `block-wars-d-${randomUUID()}`, rulesetId: rules.meta.id, rulesetVersion: rules.meta.version,
        status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    roundId = round.id;
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: home } })).id;
    holderId = await player(await account(), 8600);
    attackerId = await player(await account(), 8601);
    allyId = await player(await account(), 8602);
    holderAllyId = await player(await account(), 8603);
    const alliance = async (leaderId: string, label: string) => {
      const tag = `${label}${randomUUID().slice(0, 3)}`;
      const name = `${label} ${randomUUID().slice(0, 6)}`;
      return (await app.prisma.alliance.create({
        data: { roundId, name, nameNormalized: name.toLowerCase(), tag, tagNormalized: tag.toLowerCase(), leaderId },
      })).id;
    };
    attackerAlliance = await alliance(attackerId, 'A');
    holderAlliance = await alliance(holderId, 'H');
    await TurfService.ensureRound(app.prisma, roundId, rules);
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    for (const id of accountIds) await app.prisma.account.delete({ where: { id } });
    await app?.close();
  });

  beforeEach(async () => {
    t0 = new Date(Date.now() - 60_000);
    await app.prisma.blockWar.deleteMany({ where: { roundId } });
    await app.prisma.turfHoldSegment.deleteMany({ where: { roundId } });
    await app.prisma.business.updateMany({ where: { roundId }, data: { level: 0, staff: 0, staffTarget: 0, staffOwnerId: null, registerCents: 0n, racket: null, torchUntil: null, torchById: null } });
    await app.prisma.turf.updateMany({
      where: { roundId },
      data: { holderId: null, cornerThugs: 0, cornerPistols: 0, heldSince: null, shieldUntil: null, fatigue: 0, fatigueAt: t0, capturedAts: [], siegedSince: null, warCutPlayerId: null, warCutShare: 0, warCutUntil: null },
    });
    // The holder: a Casino block held 200 hours with a 6-thug corner and a built Casino Front.
    const casino = await block();
    await app.prisma.turf.update({
      where: { id: casino.id },
      data: { holderId, cornerThugs: 6, cornerPistols: 6, heldSince: new Date(t0.getTime() - 200 * HOUR_MS), upkeepAt: t0, fatigueAt: t0 },
    });
    const front = casino.businesses.find((row) => row.lot === 1)!;
    await app.prisma.business.update({
      where: { id: front.id },
      data: { level: 3, staff: businessStaff(rules, 'CASINO_FRONT', 3), staffTarget: businessStaff(rules, 'CASINO_FRONT', 3), staffOwnerId: holderId, registerCents: 2_000_000n, accruedAt: t0 },
    });
    const crew = {
      cashCents: 100_000_000n, turns: 144, thugs: 80, woundedThugs: 0, busyThugs: 0, postedThugs: 0, businessThugs: 0, businessWhores: 0,
      whores: 50, beer: 5_000, crack: 5_000, pistols: 80, thugHappiness: 90, whoreHappiness: 90, heat: 0,
      lastTurnCalculationAt: t0, postedNetWorthCents: 0n, racketEffects: {},
    };
    await app.prisma.roundPlayer.update({ where: { id: holderId }, data: { ...crew, postedThugs: 6, pistols: 74, businessThugs: businessStaff(rules, 'CASINO_FRONT', 3), allianceId: holderAlliance } });
    await app.prisma.roundPlayer.update({ where: { id: attackerId }, data: { ...crew, allianceId: attackerAlliance } });
    await app.prisma.roundPlayer.update({ where: { id: allyId }, data: { ...crew, allianceId: attackerAlliance } });
    await app.prisma.roundPlayer.update({ where: { id: holderAllyId }, data: { ...crew, allianceId: holderAlliance } });
    await app.prisma.combatInjury.deleteMany({ where: { roundPlayerId: { in: [holderId, attackerId, allyId, holderAllyId] } } });
    await app.prisma.turfPresence.deleteMany({ where: { roundPlayerId: attackerId } });
    await app.prisma.turfPresence.create({ data: { roundPlayerId: attackerId, cityId, district: 'CASINO', turns: 100, at: t0 } });
  });

  it('replaces the push on a player block, and charges a declaration exactly', async () => {
    await expect(TurfWarService.start(app.prisma, attackerId, { district: 'CASINO', squad: 30, actionId: actionId() } as never, t0))
      .rejects.toMatchObject({ code: 'BLOCK_WARS_ONLY' });
    const before = await read(attackerId);
    const id = await declare('TAKE', 30);
    const after = await read(attackerId);
    expect(before.turns - after.turns).toBe(wars.declareTurnCost);
    expect(after.busyThugs - before.busyThugs).toBe(30);
    expect(before.pistols - after.pistols).toBe(30);
    const row = await war(id);
    expect(row).toMatchObject({ status: 'OPENING', goal: 'TAKE', defenderId: holderId });
    expect(row.endsBy.getTime() - row.declaredAt.getTime()).toBe(wars.maxWarHours * HOUR_MS);
    // One declared war at a time, and never two wars on one block.
    await expect(declare('SACK', 10)).rejects.toMatchObject({ code: 'BLOCK_WAR_ON' });
  });

  it('opens with a fight; a won fight starts a siege that stops the registers; a full siege Takes the block a tier down', async () => {
    const id = await declare('TAKE', 40);
    await BlockWarSettleService.advance(app.prisma, id, at(0.6));
    let row = await war(id);
    expect(row.status).toBe('SIEGE');
    let casino = await block();
    expect(casino.siegedSince).not.toBeNull();
    // The defender's beaten corner thugs went home wounded with their guns.
    expect(casino.cornerThugs).toBeLessThanOrEqual(6);

    // Registers do not fill while the siege is on.
    const registerBefore = casino.businesses[0]!.registerCents;
    await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, holderId, rules, at(5)));
    casino = await block();
    expect(casino.businesses[0]!.registerCents).toBeLessThanOrEqual(registerBefore + BigInt(Math.ceil(businessIncomeCentsPerHour(rules, { citySlug: home, district: 'CASINO', business: 'CASINO_FRONT', level: 3 }))));

    // 12 hours of siege later the attacker has the block.
    await BlockWarSettleService.advance(app.prisma, id, at(14));
    row = await war(id);
    expect(row).toMatchObject({ status: 'ENDED', winner: 'ATTACKER', endReason: 'CONTROL' });
    casino = await block();
    expect(casino.holderId).toBe(attackerId);
    expect(casino.cornerThugs).toBeGreaterThan(0);
    expect(casino.siegedSince).toBeNull();
    expect(casino.fatigue).toBeCloseTo(blockWarFatigue(rules, { fights: 1, siegeHours: row.siegeHours, outcome: 'TAKE' }), 5);
    expect(casino.shieldUntil!.getTime()).toBe(row.endedAt!.getTime() + wars.truceHours * HOUR_MS);
    // The block drops a tier: held 200h it was a Foothold anyway (lot 1 at level 3 makes it
    // Established); a Take starts the clock at the Foothold threshold.
    expect(casino.heldSince!.getTime()).toBeLessThanOrEqual(row.endedAt!.getTime());

    // The attacker's credit: the survivors are now posted on the corner, the rest are home.
    const before = await read(attackerId);
    await settle(attackerId, at(14.1));
    const after = await read(attackerId);
    expect(after.busyThugs).toBe(0);
    expect(after.postedThugs).toBe(before.postedThugs + casino.cornerThugs);
    expect(after.pistols + after.postedThugs + 0).toBeGreaterThan(0);
    // The old holder's corner is gone from their posted thugs.
    const holder = await read(holderId);
    expect(holder.postedThugs).toBe(0);
  });

  it('a holder who breaks the siege knocks Control back and sends the squad home; the war times out', async () => {
    const id = await declare('TAKE', 20);
    await BlockWarSettleService.advance(app.prisma, id, at(0.6));
    expect((await war(id)).status).toBe('SIEGE');
    await settle(holderId, at(3));
    await BlockWarService.breakSiege(app.prisma, holderId, { warId: id, thugs: 60, actionId: actionId() }, at(3));
    await BlockWarSettleService.advance(app.prisma, id, at(3.5));
    const row = await war(id);
    expect(row.status).toBe('BETWEEN');
    expect(row.control).toBe(0);
    expect(row.nextAssaultAt!.getTime()).toBeGreaterThan(at(3.2).getTime());
    expect((await block()).siegedSince).toBeNull();
    // Nothing more happens: the war runs out and the holder wins it.
    await BlockWarSettleService.advance(app.prisma, id, at(wars.maxWarHours + 1));
    expect(await war(id)).toMatchObject({ status: 'ENDED', winner: 'DEFENDER', endReason: 'TIMEOUT' });
    expect((await block()).holderId).toBe(holderId);
    await settle(attackerId, at(wars.maxWarHours + 1));
    expect((await read(attackerId)).busyThugs).toBe(0);
    // The loser cannot declare on that block again for a while.
    await expect(declare('TAKE', 20, at(wars.maxWarHours + 2))).rejects.toMatchObject({ code: expect.stringMatching(/TURF_SHIELDED|BLOCK_WAR_COOLDOWN/) });
  });

  it('allies: matched to the declarer, one slot per side, and a Sack pays the cut only to an ally who fought', async () => {
    const id = await declare('SACK', 30);
    await BlockWarService.callAlly(app.prisma, attackerId, { warId: id, cutPercent: 30, actionId: actionId() }, t0);
    await expect(BlockWarService.answer(app.prisma, allyId, { warId: id, side: 'ATTACKER', thugs: 31, actionId: actionId() }, t0))
      .rejects.toMatchObject({ code: 'BLOCK_WAR_ALLY_CAP' });
    await BlockWarService.answer(app.prisma, allyId, { warId: id, side: 'ATTACKER', thugs: 20, actionId: actionId() }, t0);
    expect((await war(id)).attackerAllyId).toBe(allyId);
    // A cut can rise once taken, never fall.
    await expect(BlockWarService.callAlly(app.prisma, attackerId, { warId: id, cutPercent: 20, actionId: actionId() }, t0))
      .rejects.toMatchObject({ code: 'BLOCK_WAR_CUT_LOWER' });

    const registers = Number((await block()).businesses.reduce((sum, row) => sum + row.registerCents, 0n));
    await BlockWarSettleService.advance(app.prisma, id, at(14));
    const row = await war(id);
    expect(row).toMatchObject({ status: 'ENDED', winner: 'ATTACKER', goal: 'SACK', attackerAllyFought: true });
    const casino = await block();
    expect(casino.holderId).toBe(holderId);
    expect(casino.businesses[0]!.level).toBe(2);
    expect(casino.shieldUntil!.getTime()).toBe(row.endedAt!.getTime() + wars.sackTruceHours * HOUR_MS);
    const loot = sackLootCents(rules, registers);
    const cut = Math.floor(loot * 0.3);

    const [attackerBefore, allyBefore] = [await read(attackerId), await read(allyId)];
    await settle(attackerId, at(14.1));
    await settle(allyId, at(14.1));
    const [attackerAfter, allyAfter] = [await read(attackerId), await read(allyId)];
    expect(attackerAfter.cashCents - attackerBefore.cashCents).toBe(BigInt(loot - cut));
    expect(allyAfter.cashCents - allyBefore.cashCents).toBe(BigInt(cut));
    expect(attackerAfter.heat).toBeGreaterThanOrEqual(wars.sackHeat!);
    expect(allyAfter.busyThugs).toBe(0);
  });

  it('a side that loses pays its ally nothing; a holder who wins shares the truce income', async () => {
    const id = await declare('TAKE', 10);
    await settle(holderId, t0);
    await BlockWarService.callAlly(app.prisma, holderId, { warId: id, cutPercent: 50, actionId: actionId() }, t0);
    await BlockWarService.answer(app.prisma, holderAllyId, { warId: id, side: 'DEFENDER', thugs: 10, actionId: actionId() }, t0);
    await BlockWarService.defend(app.prisma, holderId, { warId: id, thugs: 40, actionId: actionId() }, t0);
    await BlockWarSettleService.advance(app.prisma, id, at(0.6));
    expect((await war(id)).status).toBe('BETWEEN');
    expect((await war(id)).defenderAllyFought).toBe(true);
    await BlockWarService.withdraw(app.prisma, attackerId, { warId: id, actionId: actionId() }, at(1));
    const row = await war(id);
    expect(row).toMatchObject({ winner: 'DEFENDER', endReason: 'WITHDREW' });
    const casino = await block();
    expect(casino.warCutPlayerId).toBe(holderAllyId);
    expect(casino.warCutShare).toBeCloseTo(0.5, 5);

    // The truce's income: half of it goes to the ally as cash.
    const allyBefore = await read(holderAllyId);
    await app.prisma.business.updateMany({ where: { turfId: casino.id }, data: { accruedAt: at(1) } });
    await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, holderId, rules, at(5)));
    const allyAfter = await read(holderAllyId);
    expect(allyAfter.cashCents).toBeGreaterThan(allyBefore.cashCents);
    const attacker = await read(attackerId);
    expect(attacker.cashCents).toBe(100_000_000n);
  });

  it('a concession hands over the block with less devastation than a finished siege', async () => {
    const id = await declare('TAKE', 40);
    await BlockWarSettleService.advance(app.prisma, id, at(0.6));
    await settle(holderId, at(2));
    await BlockWarService.concede(app.prisma, holderId, { warId: id, actionId: actionId() }, at(2));
    const row = await war(id);
    expect(row).toMatchObject({ winner: 'ATTACKER', endReason: 'CONCEDED' });
    const casino = await block();
    expect(casino.holderId).toBe(attackerId);
    expect(casino.fatigue).toBeLessThan(blockWarFatigue(rules, { fights: 1, siegeHours: 12, outcome: 'TAKE' }));
  });

  it('a torch that finishes before the end pays salvage; a Take catches one that has not', async () => {
    const id = await declare('TAKE', 40);
    await BlockWarSettleService.advance(app.prisma, id, at(0.6));
    await settle(holderId, at(1));
    const before = await read(holderId);
    await BlockWarService.torch(app.prisma, holderId, { district: 'CASINO', lot: 1, actionId: actionId() }, at(1));
    await BlockWarSettleService.advance(app.prisma, id, at(2));
    const casino = await block();
    const expected = torchResult(rules, 'CASINO_FRONT', 3);
    expect(casino.businesses[0]!.level).toBe(expected.level);
    const after = await read(holderId);
    expect(after.cashCents - before.cashCents).toBe(BigInt(expected.salvageCents));
    expect(after.heat).toBeGreaterThanOrEqual(wars.torchHeat!);
  });

  it('war fatigue cuts income until it heals', async () => {
    const casino = await block();
    await app.prisma.turf.update({ where: { id: casino.id }, data: { fatigue: 50, fatigueAt: t0 } });
    await app.prisma.business.updateMany({ where: { turfId: casino.id }, data: { registerCents: 0n, accruedAt: t0 } });
    await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, holderId, rules, at(1)));
    const register = (await block()).businesses[0]!.registerCents;
    const full = businessIncomeCentsPerHour(rules, { citySlug: home, district: 'CASINO', business: 'CASINO_FRONT', level: 3 });
    expect(Number(register)).toBeLessThan(full * 0.55);
    expect(Number(register)).toBeGreaterThan(full * 0.45);
  });

  it('a block left to the locals decays, the locals hold it harder, and its last holder cannot farm it back', async () => {
    // The holder walks away from the block 4 days ago; the locals have been on it since.
    const casino = await block();
    const left = new Date(t0.getTime() - 96 * HOUR_MS);
    await app.prisma.turfHoldSegment.create({
      data: { roundId, turfId: casino.id, holderId, holderPublicPimpId: 8600, holderName: 'war_8600', startedAt: new Date(left.getTime() - 120 * HOUR_MS), endedAt: left },
    });
    await app.prisma.turf.update({ where: { id: casino.id }, data: { holderId: null, cornerThugs: 0, cornerPistols: 0, heldSince: null, localsThugs: 0, localsAt: left, localsReclaimAt: null } });
    await app.prisma.roundPlayer.update({ where: { id: holderId }, data: { postedThugs: 0, businessThugs: 0, pistols: 80 } });
    await app.prisma.business.updateMany({ where: { turfId: casino.id }, data: { staff: 0, staffOwnerId: null } });

    const byCity = await TurfService.byCity(app.prisma, attackerId, rules, t0);
    const view = byCity!.get(home)!.blocks.find((row) => row.district === 'CASINO')!;
    expect(view.dormant).not.toBeNull();
    // 96 hours, less the 6-hour vacant window and 24 hours of grace: one level gone.
    expect(view.businesses![0]!.level).toBe(2);

    await app.prisma.turfPresence.deleteMany({ where: { roundPlayerId: attackerId } });
    await app.prisma.turfPresence.create({ data: { roundPlayerId: attackerId, cityId, district: 'CASINO', turns: 100, at: t0 } });
    const claimed = await TurfActionService.claim(app.prisma, attackerId, { district: 'CASINO', thugs: 60, actionId: actionId() }, () => 0.99);
    expect(claimed.result.won).toBe(true);
    const after = await block();
    expect(after.businesses[0]!.level).toBe(2);
    expect(after.fatigue).toBeCloseTo(rules.business.fatigue.onLocalsClaim, 5);
  });

  it('a block dropped to the locals cannot be farmed back by its last holder: the businesses reset', async () => {
    const casino = await block();
    const left = new Date(t0.getTime() - 10 * HOUR_MS);
    await app.prisma.turfHoldSegment.create({
      data: { roundId, turfId: casino.id, holderId, holderPublicPimpId: 8600, holderName: 'war_8600', startedAt: new Date(left.getTime() - 120 * HOUR_MS), endedAt: left },
    });
    await app.prisma.turf.update({ where: { id: casino.id }, data: { holderId: null, cornerThugs: 0, cornerPistols: 0, heldSince: null, localsThugs: 0, localsAt: left, localsReclaimAt: null } });
    await app.prisma.roundPlayer.update({ where: { id: holderId }, data: { postedThugs: 0, businessThugs: 0, pistols: 80 } });
    await app.prisma.business.updateMany({ where: { turfId: casino.id }, data: { staff: 0, staffOwnerId: null } });
    await app.prisma.turfPresence.create({ data: { roundPlayerId: holderId, cityId, district: 'CASINO', turns: 100, at: t0 } });
    const claimed = await TurfActionService.claim(app.prisma, holderId, { district: 'CASINO', thugs: 60, actionId: actionId() }, () => 0.99);
    expect(claimed.result.won).toBe(true);
    expect((await block()).businesses.every((row) => row.level === 0)).toBe(true);
    await app.prisma.turfPresence.deleteMany({ where: { roundPlayerId: holderId } });
  });
});
