import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV16H } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { NetWorthService } from '../net-worth.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { SupplyLaneService } from '../supply-lane.service.js';
import { SupplyLedgerService } from '../supply-ledger.service.js';

/**
 * 1.6.0-H gate, live: a lane order pays goods and card up front, lands once when its time is
 * up, and every outcome is recorded the same way in the shipment, the ledger, the movements,
 * the feed and (when searched) the Case. Opt in with SUPPLY_INTEGRATION=1.
 */
describe.runIf(process.env.SUPPLY_INTEGRATION === '1')('1.6.0-H international lanes with PostgreSQL', () => {
  const rules = classicOgV16H;
  const lanes = rules.supplyNetwork.lanes;
  const home = rules.round.startingCitySlug;
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';
  let homeCityId = '';

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `lanes_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    const round = await app.prisma.round.create({
      data: {
        name: 'Supply H fixture', slug: `supply-h-${randomUUID()}`,
        rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    homeCityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: home } })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId, cityId: homeCityId, displayName: name, publicPimpId: 8705,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    playerId = player.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.supplyMovement.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.supplyOrder.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.supplyWarehouse.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.supplySupplierStock.deleteMany({ where: { roundId } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.economyLedgerEntry.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: playerId, type: 'SUPPLY_LANE_ARRIVED' } });
    const data = { ...rules.round.startingPlayer, ...startingStock(rules), turns: 500, cashCents: 500_000_000n, heat: 0, cityId: homeCityId, lastActiveAt: new Date(), lastTurnCalculationAt: new Date() };
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
  });

  const player = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
  const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code: string }) => error.code);
  const ship = (body: Record<string, unknown>) => SupplyLaneService.ship(app.prisma, playerId, { supplierKey: 'monterrey-connection', productKey: 'COCAINE', quantity: 1_000, route: 'AIR', warehouseKey: 'stash', requestKey: randomUUID(), actionId: randomUUID(), ...body });
  const settle = () => PlayerStateService.settle(app.prisma, playerId, { markActive: false });

  it('pays goods and card up front, then lands once, recorded the same way everywhere', async () => {
    const before = (await player()).cashCents;
    const requestKey = randomUUID();
    const sent = await ship({ requestKey });
    const fee = lanes.routes.AIR.baseFeeCents + lanes.routes.AIR.feeCentsPerUnit * 1_000;
    const goods = lanes.suppliers[0]!.offers.COCAINE.unitCostCents * 1_000;
    expect(sent.result).toMatchObject({ goodsCents: goods, feeCents: fee, chargedCents: goods + fee, replayed: false, pickup: { status: 'IN_TRANSIT', lane: { route: 'AIR', outcome: null }, originCityName: 'Monterrey' } });
    expect((await player()).cashCents).toBe(before - BigInt(goods + fee));
    // Retried, it answers with the shipment it already made and charges nothing.
    const replay = await ship({ requestKey });
    expect(replay.result).toMatchObject({ replayed: true, pickup: { id: sent.result.pickup.id } });
    expect((await player()).cashCents).toBe(before - BigInt(goods + fee));

    // Not yet: three hours in the air.
    await settle();
    expect((await app.prisma.supplyPickup.findUniqueOrThrow({ where: { id: sent.result.pickup.id } })).status).toBe('IN_TRANSIT');
    await app.prisma.supplyPickup.update({ where: { id: sent.result.pickup.id }, data: { expectedArrivalAt: new Date(Date.now() - 60_000) } });
    await settle();
    await settle();
    const landed = await app.prisma.supplyPickup.findUniqueOrThrow({ where: { id: sent.result.pickup.id } });
    const stored = (await app.prisma.supplyStock.aggregate({ where: { warehouse: { roundPlayerId: playerId } }, _sum: { quantity: true } }))._sum.quantity ?? 0;
    expect(stored).toBe(landed.deliveredQuantity);
    expect(landed.status).toBe(landed.deliveredQuantity > 0 ? 'DELIVERED' : 'FAILED');
    const news = await app.prisma.playerActivity.findMany({ where: { roundPlayerId: playerId, type: 'SUPPLY_LANE_ARRIVED' } });
    expect(news).toHaveLength(1);
    const payload = news[0]!.payload as { delivered: number; lost: number; outcome: string };
    expect(payload.delivered + payload.lost).toBe(1_000);
    expect(payload.delivered).toBe(landed.deliveredQuantity);
    expect(payload.outcome).toBe(payload.lost === 0 ? 'CLEAN' : payload.delivered === 0 ? 'SEIZED' : 'PARTIAL');
    const ledger = await SupplyLedgerService.ledger(app.prisma, playerId);
    expect(ledger).toMatchObject({ wholesaleCents: goods, laneFeesCents: fee, stock: { inTransit: 0, stored } });
    const history = await SupplyLedgerService.history(app.prisma, rules, playerId);
    expect(history.find((item) => item.kind === 'LANE')?.text).toMatch(/Air load/);
  });

  it('refuses a card the supplier does not use, a city the card does not reach, too big a load, and a third shipment', async () => {
    expect(await code(ship({ supplierKey: 'mexico-city-contact', quantity: 2_000, route: 'OVERLAND' }))).toBe('LANE_NOT_OFFERED');
    expect(await code(ship({ route: 'OVERLAND' }))).toBe('LANE_WRONG_CITY');
    expect(await code(ship({ quantity: 1_500 }))).toBe('LANE_FULL');
    expect(await code(ship({ quantity: 100 }))).toBe('SUPPLY_ORDER_QUANTITY');
    await ship({});
    await ship({});
    expect(await code(ship({}))).toBe('LANE_LIMIT');
  });

  it('holds room at the landing warehouse for loads on the way', async () => {
    const stash = (await app.prisma.supplyWarehouse.upsert({
      where: { roundPlayerId_citySlug_name: { roundPlayerId: playerId, citySlug: home, name: 'Home stash' } },
      create: { roundPlayerId: playerId, citySlug: home, name: 'Home stash', kind: 'STASH', capacityUnits: 1_500 },
      update: { capacityUnits: 1_500 },
    }));
    expect(stash.capacityUnits).toBe(1_500);
    await ship({});
    expect(await code(ship({}))).toBe('SUPPLY_STASH_FULL');
  });
});
