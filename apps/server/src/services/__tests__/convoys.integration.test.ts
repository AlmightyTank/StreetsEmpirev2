import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV05E } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { ConvoysDto, ConvoyTailResult, GameActionResult } from '@streets/shared';
import { AdminConvoyService } from '../admin-convoy.service.js';
import { ConvoyService } from '../convoy.service.js';
import { NetWorthService } from '../net-worth.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { TravelService } from '../travel.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * 0.5.0-E gate, live: a crew recons its area to find runs; a tail commits a squad and
 * lands or fails when its window closes, whoever is online; nobody is alerted, and an
 * owner sees a tail only through their lookouts; what a hit takes is conserved between the
 * run and the attacker; allies cannot hit each other's runs and linked accounts cannot use
 * a hijack to move goods; an ally who is called can send backup; escorts ride armed and
 * lose their guns to a bust; a hit can be voided. Opt in with TRAVEL_INTEGRATION=1.
 */
describe.runIf(process.env.TRAVEL_INTEGRATION === '1')('convoys with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let allianceId = '';
  const cityIds: Record<string, string> = {};
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgV05E;
  // Owner in New York; attacker, ally and a linked account in Detroit.
  const [OWNER, ATTACKER, ALLY, LINKED] = [0, 1, 2, 3];
  const homes = ['new-york-city', 'detroit', 'detroit', 'detroit'];

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    for (const city of await app.prisma.city.findMany({ select: { id: true, slug: true } })) cityIds[city.slug] = city.id;
    const round = await app.prisma.round.create({ data: {
      name: 'Convoy fixture', slug: `convoy-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 10 * 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    for (let index = 0; index < 4; index++) {
      const name = `convoy_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      accounts.push(registered.json().account.id);
      cookies.push(registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; '));
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId: accounts[index]!, cityId: cityIds[homes[index]!]!, displayName: name, publicPimpId: 7700 + index,
        reputation: { create: ReputationService.seedFor(rules) } } });
      players.push(player.id);
    }
    const alliance = await app.prisma.alliance.create({ data: { roundId, name: 'Fixture Crew', nameNormalized: `fixture-${randomUUID()}`, tag: 'FIX', tagNormalized: `f${randomUUID().slice(0, 5)}`, leaderId: players[OWNER]! } });
    allianceId = alliance.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.convoyTail.deleteMany({ where: { runId: { not: '' }, owner: { roundId } } });
    await app.prisma.run.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.combatInjury.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.convoyRecon.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.session.updateMany({ where: { accountId: { in: accounts } }, data: { ip: null } });
    for (const [index, id] of players.entries()) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        whores: 100, thugs: 60, woundedThugs: 0, busyThugs: 0, pistols: 60, shotguns: 0, tek9s: 0, ak47s: 0, hideoutLookoutsLevel: 0, beer: 500, condoms: 5_000, crack: 1_000, lowRiders: 3,
        turns: 144, cashCents: 50_000_000n, heat: 0, lockedUntil: null, movingUntil: null, awayNetWorthCents: 0n,
        cityId: cityIds[homes[index]!]!, allianceId: index === OWNER || index === ALLY ? allianceId : null,
        allianceJoinedAt: index === OWNER || index === ALLY ? new Date('2000-01-01') : null,
        lastActiveAt: new Date(), lastTurnCalculationAt: new Date() };
      await app.prisma.roundPlayer.update({ where: { id }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
    }
    await app.prisma.$transaction((tx) => ProductInventoryService.adjust(tx, players[OWNER]!, rules, { COCAINE: 600 }));
  });

  const post = (player: number, url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie: cookies[player]! }, payload });
  const get = (player: number, url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie: cookies[player]! } });
  const row = (player: number) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[player]! } });
  const ownersRun = () => app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: players[OWNER]! }, orderBy: { launchedAt: 'desc' }, include: { stops: true, cargo: true } });
  /** Every stop of the owner's run shifted `minutes` into the past. */
  const age = async (minutes: number) => {
    const run = await ownersRun();
    for (const stop of run.stops) {
      await app.prisma.runStop.update({ where: { id: stop.id }, data: {
        departAt: new Date(stop.departAt.getTime() - minutes * 60_000),
        arriveAt: new Date(stop.arriveAt.getTime() - minutes * 60_000),
        leaveAt: stop.leaveAt ? new Date(stop.leaveAt.getTime() - minutes * 60_000) : null,
      } });
    }
  };
  /** The owner's run, unescorted, in Detroit town. */
  const inDetroit = async () => {
    const sent = await post(OWNER, '/travel/launch', { to: 'detroit', route: 0, lowRiders: 2, escortThugs: 0, cashCents: 10_000_000, cargo: { COCAINE: 600 }, actionId: randomUUID() });
    expect(sent.statusCode, sent.body).toBe(200);
    await age(51);
    return (await ownersRun()).id;
  };
  const recon = (player: number) => post(player, '/convoys/recon', { actionId: randomUUID() });
  /** Recon the area, then tail the run. */
  const tail = async (player: number, runId: string, squad = 40) => {
    await recon(player);
    return post(player, '/convoys/tail', { runId, squad, actionId: randomUUID() });
  };
  /** Bring a tail to `minutes` before it hits. */
  const soon = async (tailId: string, minutes: number) => {
    const landsAt = new Date(Date.now() + minutes * 60_000);
    await app.prisma.convoyTail.update({ where: { id: tailId }, data: { startedAt: new Date(landsAt.getTime() - rules.travel.convoys.warningMinutes * 60_000), landsAt } });
  };
  const lookouts = (player: number, level: number) => app.prisma.roundPlayer.update({ where: { id: players[player]! }, data: { hideoutLookoutsLevel: level } });
  /** Close the tail's warning window now. */
  const due = async (tailId: string) => {
    const landsAt = new Date(Date.now() - 1_000);
    await app.prisma.convoyTail.update({ where: { id: tailId }, data: { startedAt: new Date(landsAt.getTime() - rules.travel.convoys.warningMinutes * 60_000), landsAt } });
  };
  const stash = async (player: number) => {
    const products = await ProductInventoryService.read(app.prisma, players[player]!, rules);
    return products.COCAINE ?? 0;
  };

  it('finds a run in reach by recon, commits the squad, and lands the hit when the window closes', async () => {
    const runId = await inDetroit();
    // Nothing is known until the area is reconned, and a run nobody spotted cannot be tailed.
    expect((await get(ATTACKER, '/convoys')).json<ConvoysDto>().targets).toEqual([]);
    expect((await post(ATTACKER, '/convoys/tail', { runId, squad: 40, actionId: randomUUID() })).json().error.code).toBe('NOT_SPOTTED');
    const turnsBefore = (await row(ATTACKER)).turns;
    expect((await recon(ATTACKER)).statusCode).toBe(200);
    expect((await row(ATTACKER)).turns).toBe(turnsBefore - rules.travel.convoys.recon.turnCost);
    const page = (await get(ATTACKER, '/convoys')).json<ConvoysDto>();
    expect(page.recon).not.toBeNull();
    const target = page.targets.find((entry) => entry.runId === runId)!;
    expect(target).toMatchObject({ city: 'detroit', source: 'HOME', inReachNow: true, blockedReason: null });
    expect(target.bands).toEqual({ cash: 'heavy', cargo: 'half', escort: 'none' });

    const before = { run: await ownersRun(), attacker: await row(ATTACKER), stash: await stash(ATTACKER) };
    const sent = await post(ATTACKER, '/convoys/tail', { runId, squad: 40, actionId: randomUUID() });
    expect(sent.statusCode, sent.body).toBe(200);
    const started = sent.json<GameActionResult<ConvoyTailResult>>().result;
    expect((await row(ATTACKER)).busyThugs).toBe(40);
    expect((await row(ATTACKER)).turns).toBe(before.attacker.turns - rules.travel.convoys.turnCost);

    // Nobody tells the owner: without lookouts they see nothing, and nothing is pushed.
    expect((await get(OWNER, '/convoys')).json<ConvoysDto>().tails.find((entry) => entry.id === started.tailId)).toBeUndefined();
    expect(await app.prisma.notificationOutbox.count({ where: { accountId: accounts[OWNER]! } })).toBe(0);
    expect((await post(OWNER, '/convoys/call', { tailId: started.tailId })).json().error.code).toBe('TAIL_NOT_FOUND');
    // Top lookouts spot it in its last minutes; from New York, backup cannot get there in time.
    await lookouts(OWNER, 5);
    expect((await get(OWNER, '/convoys')).json<ConvoysDto>().tails.find((entry) => entry.id === started.tailId)).toBeUndefined();
    await soon(started.tailId, 3);
    const ownerPage = (await get(OWNER, '/convoys')).json<ConvoysDto>();
    const warning = ownerPage.tails.find((entry) => entry.id === started.tailId)!;
    expect(warning).toMatchObject({ role: 'owner', status: 'PENDING' });
    expect(warning.sendBackup!.reason).toMatch(/after the hit/);

    await due(started.tailId);
    const landed = (await get(ATTACKER, '/convoys')).json<ConvoysDto>().tails.find((entry) => entry.id === started.tailId)!;
    expect(landed.status).toBe('LANDED');
    expect(landed.report!.won).toBe(true);

    // What left the run is what the attacker has; the squad is home.
    const after = { run: await ownersRun(), attacker: await row(ATTACKER), stash: await stash(ATTACKER) };
    expect(after.attacker.busyThugs).toBe(0);
    // A police stop on the road in, if one was rolled, took its share first.
    const police = await app.prisma.runIncident.findMany({ where: { runId } });
    const fined = police.reduce((sum, incident) => sum + incident.fineCents, 0n);
    const seized = police.reduce((sum, incident) => sum + ((incident.seized as Record<string, number>).COCAINE ?? 0), 0);
    expect(before.run.cashCents - after.run.cashCents - fined).toBe(after.attacker.cashCents - before.attacker.cashCents);
    const cargoBefore = before.run.cargo.find((entry) => entry.productKey === 'COCAINE')!.quantity;
    const cargoAfter = after.run.cargo.find((entry) => entry.productKey === 'COCAINE')!.quantity;
    expect(cargoBefore - cargoAfter - seized).toBe(after.stash - before.stash);
    expect(cargoBefore - cargoAfter).toBeGreaterThan(0);
    expect(after.run.lastHitAt).not.toBeNull();
    // And the run cannot be tailed again straight away.
    expect((await tail(LINKED, runId)).json().error.code).toBe('RECENTLY_HIT');
  });

  it('lets the run get away if it is out of reach when the window closes', async () => {
    const runId = await inDetroit();
    const sent = await tail(ATTACKER, runId);
    const tailId = sent.json<GameActionResult<ConvoyTailResult>>().result.tailId;
    // The run left Detroit a while ago and is out on the open road home.
    await age(140);
    await due(tailId);
    await ConvoyService.sweep(app.prisma);
    const stored = await app.prisma.convoyTail.findUniqueOrThrow({ where: { id: tailId } });
    expect(stored.status).toBe('ESCAPED');
    // The attacker's squad is still out until they next look, then home with nothing.
    expect((await row(ATTACKER)).busyThugs).toBe(40);
    const page = (await get(ATTACKER, '/convoys')).json<ConvoysDto>();
    expect(page.tails.find((entry) => entry.id === tailId)!.report!.escaped).toBe(true);
    expect((await row(ATTACKER)).busyThugs).toBe(0);
    expect((await row(ATTACKER)).cashCents).toBe(50_000_000n);
  });

  it('refuses allies, linked accounts, runs out of reach, and a second tail', async () => {
    const launched = await post(OWNER, '/travel/launch', { to: 'detroit', route: 0, lowRiders: 2, escortThugs: 0, cashCents: 1_000_000, cargo: {}, actionId: randomUUID() });
    expect(launched.statusCode).toBe(200);
    const runId = (await ownersRun()).id;
    // On the open road, too far out for a recon to see coming.
    await age(25);
    expect((await tail(ATTACKER, runId)).json().error.code).toBe('NOT_SPOTTED');
    // Coming up on Detroit: the recon sees it coming, but it is not in reach yet.
    await age(7);
    expect((await tail(ATTACKER, runId)).json().error.code).toBe('OUT_OF_REACH');
    await age(19);
    expect((await tail(ALLY, runId)).json().error.code).toBe('ALLIED');
    await app.prisma.session.updateMany({ where: { accountId: { in: [accounts[OWNER]!, accounts[LINKED]!] } }, data: { ip: '198.51.100.7' } });
    expect((await tail(LINKED, runId)).json().error.code).toBe('LINKED_ACCOUNTS');
    expect((await tail(ATTACKER, runId)).statusCode).toBe(200);
    await app.prisma.session.updateMany({ where: { accountId: accounts[LINKED]! }, data: { ip: null } });
    expect((await tail(LINKED, runId)).json().error.code).toBe('ALREADY_TAILED');
  });

  it('lets an ally who lives there answer a call with backup, who comes home after the fight', async () => {
    const runId = await inDetroit();
    const tailId = (await tail(ATTACKER, runId, 50)).json<GameActionResult<ConvoyTailResult>>().result.tailId;
    // Not called yet; the owner calls once their lookouts spot it.
    expect((await post(ALLY, '/convoys/backup', { tailId, thugs: 10, actionId: randomUUID() })).json().error.code).toBe('CANNOT_SEND');
    await lookouts(OWNER, 5);
    await soon(tailId, 3);
    expect((await post(OWNER, '/convoys/call', { tailId })).statusCode).toBe(200);
    const call = (await get(ALLY, '/convoys')).json<ConvoysDto>().tails.find((entry) => entry.id === tailId)!;
    expect(call).toMatchObject({ role: 'ally', answer: { max: 60, reason: null } });
    const sent = await post(ALLY, '/convoys/backup', { tailId, thugs: 10, actionId: randomUUID() });
    expect(sent.statusCode, sent.body).toBe(200);
    expect((await row(ALLY)).busyThugs).toBe(10);

    await due(tailId);
    await ConvoyService.sweep(app.prisma);
    const stored = await app.prisma.convoyTail.findUniqueOrThrow({ where: { id: tailId }, include: { backups: true } });
    expect(stored.status).toBe('LANDED');
    expect((stored.result as { defenders: { allyBackup: number } }).defenders.allyBackup).toBe(10);
    // The ally's thugs come home when the ally is next settled.
    expect((await get(ALLY, '/convoys')).statusCode).toBe(200);
    expect((await row(ALLY)).busyThugs).toBe(0);
    expect(stored.backups[0]!.wounded).toBeLessThanOrEqual(10);
  });

  it('arms the escorts from home, and a bust takes every gun they carried', async () => {
    await app.prisma.roundPlayer.update({ where: { id: players[OWNER]! }, data: { pistols: 20, shotguns: 3, ak47s: 1 } });
    const sent = await post(OWNER, '/travel/launch', { to: 'detroit', route: 0, lowRiders: 2, escortThugs: 6, cashCents: 1_000_000, cargo: { COCAINE: 100 }, actionId: randomUUID() });
    expect(sent.statusCode, sent.body).toBe(200);
    // The best first, one each: the AK, the shotguns, then pistols.
    const run = await ownersRun();
    expect([run.ak47s, run.shotguns, run.pistols]).toEqual([1, 3, 2]);
    expect(await row(OWNER)).toMatchObject({ ak47s: 0, shotguns: 0, pistols: 18 });
    await age(51);
    await app.prisma.roundPlayer.update({ where: { id: players[OWNER]! }, data: { heat: 80, lastTurnCalculationAt: new Date() } });
    // Past Detroit's bust line and under its arrest line, a roll that lands is a bust.
    const traded = await TravelService.trade(app.prisma, players[OWNER]!, { product: 'COCAINE', direction: 'sell', venue: 'pip', quantity: 10, actionId: randomUUID() }, () => 0);
    expect(traded.result.trouble?.kind).toBe('BUST');
    expect(traded.result.trouble?.seized).toMatchObject({ PISTOL: 2, SHOTGUN: 3, AK47: 1 });
    const busted = await ownersRun();
    expect([busted.ak47s, busted.shotguns, busted.pistols]).toEqual([0, 0, 0]);
    // Home again, the guns are still gone.
    await age(300);
    expect((await get(OWNER, '/travel')).statusCode).toBe(200);
    expect(await row(OWNER)).toMatchObject({ ak47s: 0, shotguns: 0, pistols: 18 });
  });

  it('can be voided: what the attacker took goes back to the run', async () => {
    const runId = await inDetroit();
    const before = await ownersRun();
    const tailId = (await tail(ATTACKER, runId)).json<GameActionResult<ConvoyTailResult>>().result.tailId;
    await due(tailId);
    await ConvoyService.sweep(app.prisma);
    const admin = await app.prisma.account.findUniqueOrThrow({ where: { id: accounts[ALLY]! }, select: { id: true, username: true } });
    const result = await AdminConvoyService.voidTail(app.prisma, admin, tailId, 'fixture: confirmed exploit');
    expect(result.shortfall.cashCents).toBe(0);
    const after = await ownersRun();
    expect(after.cashCents).toBe(before.cashCents);
    expect(after.cargo.find((entry) => entry.productKey === 'COCAINE')!.quantity).toBe(before.cargo.find((entry) => entry.productKey === 'COCAINE')!.quantity);
    expect((await row(ATTACKER)).cashCents).toBe(50_000_000n);
    await expect(AdminConvoyService.voidTail(app.prisma, admin, tailId, 'again')).rejects.toThrow(/already/);
  });
});
