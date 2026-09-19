import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { RoundPlayer } from '@prisma/client';
import { classicOgV05D } from '@streets/rulesets';
import { calculateNetWorthCents, cityHeatRules, relocationFeeCents, startingStock } from '@streets/rules-engine';
import type { CombatPageDto, GameActionResult, RelocationResult, TravelDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * 0.5.0-D gate, live: a move conserves everything the player owns but the fee; the
 * mover stays a target in the old city and cannot act until they arrive; a move cannot
 * be used to escape a fight they started, cannot be made with a run out, cannot be
 * repeated inside its cooldown, and closes before the round ends. Opt in with
 * TRAVEL_INTEGRATION=1.
 */
describe.runIf(process.env.TRAVEL_INTEGRATION === '1')('relocation with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  const cityIds: Record<string, string> = {};
  const accounts: string[] = [];
  const players: string[] = [];
  const cookies: string[] = [];
  const rules = classicOgV05D;
  const move = rules.travel.relocation;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    for (const city of await app.prisma.city.findMany({ select: { id: true, slug: true } })) cityIds[city.slug] = city.id;
    const round = await app.prisma.round.create({ data: {
      name: 'Relocation fixture', slug: `relocation-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 10 * 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    for (let index = 0; index < 2; index++) {
      const name = `mover_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      accounts.push(registered.json().account.id);
      cookies.push(registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; '));
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId: accounts[index]!, cityId: cityIds['new-york-city']!, displayName: name, publicPimpId: 7600 + index,
        reputation: { create: ReputationService.seedFor(rules) } } });
      players.push(player.id);
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accounts.length) await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.round.update({ where: { id: roundId }, data: { endsAt: new Date(Date.now() + 10 * 86_400_000) } });
    await app.prisma.relocation.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.raidBattle.deleteMany({ where: { attackerId: { in: players } } });
    await app.prisma.run.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: { in: players } } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: { in: players } } });
    for (const id of players) {
      const data = { ...rules.round.startingPlayer, ...startingStock(rules),
        whores: 120, thugs: 40, woundedThugs: 0, pistols: 40, beer: 500, condoms: 5_000, crack: 900, lowRiders: 2,
        turns: 144, cashCents: 80_000_000n, heat: 30, lockedUntil: null, movingUntil: null, awayNetWorthCents: 0n,
        cityId: cityIds['new-york-city']!, hideoutSafeRoomLevel: 2, hideoutLookoutsLevel: 1,
        createdAt: new Date('2000-01-01'), raidProtectedUntil: null,
        lastActiveAt: new Date(), lastTurnCalculationAt: new Date() };
      await app.prisma.roundPlayer.update({ where: { id }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
      await app.prisma.$transaction((tx) => ProductInventoryService.adjust(tx, id, rules, { COCAINE: 120, WEED: 300 }));
    }
  });

  const post = (player: number, url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie: cookies[player]! }, payload });
  const get = (player: number, url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie: cookies[player]! } });
  const row = (player: number) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[player]! } });
  const stock = (player: number) => ProductInventoryService.read(app.prisma, players[player]!, rules);
  const moveTo = (player: number, to: string, actionId: string = randomUUID()) => post(player, '/travel/move', { to, actionId });
  /** As if the truck had been on the road for its whole downtime. */
  const arrive = async (player: number) => {
    const past = new Date(Date.now() - 1_000);
    const started = new Date(past.getTime() - move.downtimeMinutes * 60_000);
    await app.prisma.relocation.updateMany({ where: { roundPlayerId: players[player]!, arrivedAt: null }, data: { startedAt: started, arrivesAt: past } });
    await app.prisma.roundPlayer.update({ where: { id: players[player]! }, data: { movingUntil: past } });
  };
  /** What a player owns, apart from cash, turns and the clocks. */
  const holdings = (player: RoundPlayer) => ({
    whores: player.whores, thugs: player.thugs, woundedThugs: player.woundedThugs, pistols: player.pistols, shotguns: player.shotguns,
    tek9s: player.tek9s, ak47s: player.ak47s, lowRiders: player.lowRiders, crack: player.crack, condoms: player.condoms,
    beer: player.beer, medicine: player.medicine, safeRoom: player.hideoutSafeRoomLevel, lookouts: player.hideoutLookoutsLevel,
    workshop: player.hideoutWorkshopLevel, backOffice: player.hideoutBackOfficeLevel,
  });

  it('moves everything the player owns and takes only the fee, priced on net worth', async () => {
    const before = await row(0);
    const beforeStock = await stock(0);
    const sent = await moveTo(0, 'atlanta');
    expect(sent.statusCode, sent.body).toBe(200);
    const result = sent.json<GameActionResult<RelocationResult>>().result;
    const fee = relocationFeeCents(before.netWorthCents, move);
    expect(BigInt(result.feeCents)).toBe(fee);

    const during = await row(0);
    expect(during.cashCents).toBe(before.cashCents - fee);
    // Still in New York, and a target there, until the truck arrives.
    expect(during.cityId).toBe(cityIds['new-york-city']);
    const targets = (await get(1, '/combat')).json<CombatPageDto>().targets.map((target) => target.publicPimpId);
    expect(targets).toContain(before.publicPimpId);
    // Nothing moves on the road.
    expect((await post(0, '/scout', { district: 'WINO_SLUMS', turns: 1, actionId: randomUUID() })).json().error.code).toBe('ON_THE_ROAD');
    expect((await get(0, '/combat')).json<CombatPageDto>().blockedReason).toMatch(/moving house/);

    await arrive(0);
    expect((await get(0, '/travel')).statusCode).toBe(200);
    const after = await row(0);
    expect(after.cityId).toBe(cityIds.atlanta);
    expect(after.movingUntil).toBeNull();
    expect(holdings(after)).toEqual(holdings(before));
    expect(await stock(0)).toEqual(beforeStock);
    expect(after.cashCents).toBe(before.cashCents - fee);
    expect(after.netWorthCents).toBe(calculateNetWorthCents({ ...after, products: await stock(0) }, rules));
    // Out of New York's lists, and Atlanta's Heat lines apply.
    expect((await get(1, '/combat')).json<CombatPageDto>().targets.map((target) => target.publicPimpId)).not.toContain(before.publicPimpId);
    const heat = (await get(0, '/heat')).json();
    expect(heat.bustStartsAt).toBe(cityHeatRules(rules, 'atlanta')!.bust.startsAt);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: players[0]!, type: 'RELOCATED' } })).toBe(1);
  });

  it('answers a retry with the same move, and cannot move again inside the cooldown', async () => {
    const actionId = randomUUID();
    const first = await moveTo(0, 'detroit', actionId);
    expect(first.statusCode, first.body).toBe(200);
    expect((await moveTo(0, 'detroit', actionId)).json()).toEqual(first.json());
    expect(await app.prisma.relocation.count({ where: { roundPlayerId: players[0]! } })).toBe(1);
    await arrive(0);
    const again = await moveTo(0, 'atlanta');
    expect(again.json().error.code).toBe('MOVE_COOLDOWN');
    const page = (await get(0, '/travel')).json<TravelDto>();
    expect(page.relocation!.blockedCode).toBe('MOVE_COOLDOWN');
    expect(page.relocation!.blockedUntil).not.toBeNull();
  });

  it('cannot be used to run from a fight the player started', async () => {
    await app.prisma.raidBattle.create({ data: {
      attackerId: players[0]!, defenderId: players[1]!, actionId: randomUUID(), attackingThugs: 5, modelVersion: 'fixture',
      calculation: {}, attackerReport: {}, defenderReport: {},
    } });
    const refused = await moveTo(0, 'miami-beach');
    expect(refused.json().error.code).toBe('IN_A_FIGHT');
    expect((await row(0)).cashCents).toBe(80_000_000n);
    // The one who was hit can still move.
    expect((await moveTo(1, 'miami-beach')).statusCode).toBe(200);
  });

  it('cannot move with a run out, into its own city, or in the round\'s last hours', async () => {
    expect((await moveTo(0, 'new-york-city')).json().error.code).toBe('ALREADY_HOME');
    const launched = await post(0, '/travel/launch', { to: 'detroit', route: 0, lowRiders: 1, escortThugs: 0, cashCents: 0, cargo: {}, actionId: randomUUID() });
    expect(launched.statusCode, launched.body).toBe(200);
    expect((await moveTo(0, 'atlanta')).json().error.code).toBe('RUN_OUT');
    await app.prisma.round.update({ where: { id: roundId }, data: { endsAt: new Date(Date.now() + (move.cutoffHours - 1) * 3_600_000) } });
    expect((await moveTo(1, 'atlanta')).json().error.code).toBe('MOVES_CLOSED');
  });

  it('shows what Heat would mean in every city before paying', async () => {
    const page = (await get(0, '/travel')).json<TravelDto>();
    const relocation = page.relocation!;
    expect(relocation.feeCents).toBe(Number(relocationFeeCents((await row(0)).netWorthCents, move)));
    expect(relocation.here!.bustStartsAt).toBe(70);
    const beverly = relocation.destinations.find((city) => city.slug === 'beverly-hills')!;
    expect(beverly.heat!.bustStartsAt).toBe(cityHeatRules(rules, 'beverly-hills')!.bust.startsAt);
    // Heat 30 is quiet in New York and costing take in Beverly Hills.
    expect(relocation.here!.takeMultiplier).toBe(1);
    expect(beverly.heat!.takeMultiplier).toBeLessThan(1);
  });
});
