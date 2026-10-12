import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV16E } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { DealerCrewService } from '../dealer-crew.service.js';
import { DealerStaffService } from '../dealer-staff.service.js';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';
import { homeStash } from '../supply-pickup-settle.service.js';
import { SupplyPropertyService } from '../supply-property.service.js';

/**
 * 1.6.0-E gate, live: a dealer crew takes stock only from storage in its own city, never
 * holds more than its dealers can carry, and its dealers keep their experience when they
 * are released and come back. Opt in with SUPPLY_INTEGRATION=1.
 */
describe.runIf(process.env.SUPPLY_INTEGRATION === '1')('1.6.0-E dealer crews with PostgreSQL', () => {
  const rules = classicOgV16E;
  const dealers = rules.supplyNetwork.dealers;
  const home = rules.round.startingCitySlug;
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';
  let homeCityId = '';

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `dealers_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    const round = await app.prisma.round.create({
      data: {
        name: 'Supply E fixture', slug: `supply-e-${randomUUID()}`,
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
        roundId, accountId, cityId: homeCityId, displayName: name, publicPimpId: 8703,
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
    await app.prisma.dealerStaff.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.dealerCrew.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.supplyWarehouse.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.supplySafehouse.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: playerId } });
    const data = {
      ...rules.round.startingPlayer, ...startingStock(rules),
      thugs: 40, woundedThugs: 0, dealerThugs: 0, turns: 500, cashCents: 500_000_000n, heat: 0, cityId: homeCityId,
      lastActiveAt: new Date(), lastTurnCalculationAt: new Date(),
    };
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) } });
  });

  const player = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
  const code = (promise: Promise<unknown>) => promise.then(() => 'OK', (error: { code: string }) => error.code);
  const establish = (citySlug: string, districtKey: string, count: number) => DealerCrewService.establish(app.prisma, playerId, { citySlug, districtKey, dealers: count, actionId: randomUUID() });
  const offer = (crewId: string, body: Record<string, unknown>) => DealerCrewService.offer(app.prisma, playerId, crewId, { ...body, actionId: randomUUID() });
  const stock = (crewId: string, warehouseId: string, direction: 'LOAD' | 'RETURN', quantity: number) => DealerCrewService.stock(app.prisma, playerId, crewId, { warehouseId, direction, quantity, actionId: randomUUID() });
  const manage = (crewId: string, action: string, districtKey?: string) => DealerCrewService.manage(app.prisma, playerId, crewId, { action, ...(districtKey ? { districtKey } : {}), actionId: randomUUID() });
  const seed = async (citySlug: string, quantity: number) => {
    const stash = await homeStash(app.prisma, playerId, citySlug, 12_000);
    await app.prisma.supplyStock.upsert({ where: { warehouseId_productKey: { warehouseId: stash.id, productKey: 'COCAINE' } }, create: { warehouseId: stash.id, productKey: 'COCAINE', quantity }, update: { quantity } });
    return stash.id;
  };
  const stockOf = async (warehouseId: string) => (await app.prisma.supplyStock.findUnique({ where: { warehouseId_productKey: { warehouseId, productKey: 'COCAINE' } } }))?.quantity ?? 0;

  it('sets a crew up only where there is a foothold, from the fit crew at home', async () => {
    expect(await code(establish('detroit', 'NIGHTCLUB', 2))).toBe('NO_FOOTHOLD');
    const before = await player();
    const made = await establish(home, 'NIGHTCLUB', 3);
    expect(made.result.crew).toMatchObject({ capacityUnits: 3 * dealers.unitsPerDealer, inventoryUnits: 0, status: 'ACTIVE' });
    const after = await player();
    expect(after.dealerThugs).toBe(3);
    expect(after.turns).toBe(before.turns - dealers.setupTurns);
    expect(after.thugs).toBe(before.thugs);
    expect(await code(establish(home, 'NIGHTCLUB', 1))).toBe('DISTRICT_TAKEN');
    expect(await code(establish(home, 'CASINO', dealers.maxDealersPerCrew + 1))).toBe('TOO_MANY_DEALERS');

    // A safehouse makes a foothold, and cannot close under the crew it holds up.
    const safehouse = await SupplyPropertyService.buy(app.prisma, playerId, { kind: 'SAFEHOUSE', citySlug: 'detroit', actionId: randomUUID() });
    await establish('detroit', 'CASINO', 1);
    await establish(home, 'LOW_RENT', 1);
    expect(await code(establish(home, 'CASINO', 1))).toBe('DEALER_CREW_LIMIT');
    expect(await code(SupplyPropertyService.close(app.prisma, playerId, { kind: 'SAFEHOUSE', propertyId: safehouse.result.propertyId, actionId: randomUUID() }))).toBe('SAFEHOUSE_IN_USE');
  });

  it('stocks a crew only from its own city, and never past what its dealers can carry', async () => {
    const crew = (await establish(home, 'NIGHTCLUB', 2)).result.crew!;
    const local = await seed(home, 5_000);
    await SupplyPropertyService.buy(app.prisma, playerId, { kind: 'SAFEHOUSE', citySlug: 'detroit', actionId: randomUUID() });
    const away = await seed('detroit', 5_000);

    expect(await code(stock(crew.id, local, 'LOAD', 100))).toBe('NO_PRODUCT');
    const street = crew.products.find((product) => product.key === 'COCAINE')!.streetPriceCents;
    expect(await code(offer(crew.id, { productKey: 'COCAINE', priceCents: street * 3 }))).toBe('PRICE_OUT_OF_RANGE');
    const priced = await offer(crew.id, { productKey: 'COCAINE' });
    expect(priced.result.crew).toMatchObject({ productKey: 'COCAINE', priceCents: street });

    expect(await code(stock(crew.id, away, 'LOAD', 100))).toBe('WAREHOUSE_ELSEWHERE');
    expect(await code(stock(crew.id, local, 'LOAD', 2 * dealers.unitsPerDealer + 1))).toBe('DEALER_CREW_FULL');
    const loaded = await stock(crew.id, local, 'LOAD', 2 * dealers.unitsPerDealer);
    expect(loaded.result.crew).toMatchObject({ inventoryUnits: 800, capacityUnits: 800 });
    expect(loaded.result.crew!.pace.unitsPerHour).toBeGreaterThan(0);
    expect(await stockOf(local)).toBe(5_000 - 800);
    expect(await code(stock(crew.id, local, 'LOAD', 1))).toBe('DEALER_CREW_FULL');

    // Releasing a dealer cannot leave the crew holding more than the rest can carry.
    const staffId = loaded.result.crew!.dealers[0]!.id;
    expect(await code(DealerStaffService.release(app.prisma, playerId, staffId, { actionId: randomUUID() }))).toBe('DEALER_CREW_OVERFULL');
    // Nor can it switch product with stock aboard.
    expect(await code(offer(crew.id, { productKey: 'WEED' }))).toBe('DEALER_CREW_NOT_EMPTY');

    await stock(crew.id, local, 'RETURN', 500);
    expect(await stockOf(local)).toBe(5_000 - 300);
    await DealerStaffService.release(app.prisma, playerId, staffId, { actionId: randomUUID() });
    const crewRow = await app.prisma.dealerCrew.findUniqueOrThrow({ where: { id: crew.id }, include: { inventory: true } });
    expect(crewRow.capacityUnits).toBe(dealers.unitsPerDealer);
    expect(crewRow.inventory.reduce((sum, row) => sum + row.quantity, 0)).toBeLessThanOrEqual(crewRow.capacityUnits);

    // Every unit is accounted for: storage plus the crew is what was seeded.
    const movements = await app.prisma.supplyMovement.findMany({ where: { dealerCrewId: crew.id } });
    expect(movements.map((row) => row.kind).sort()).toEqual(['ASSIGNED_TO_DEALER', 'RETURNED']);
    expect(await stockOf(local) + crewRow.inventory.reduce((sum, row) => sum + row.quantity, 0)).toBe(5_000);
  });

  it('pauses, moves, closes, and brings dealers back with their experience', async () => {
    const crew = (await establish(home, 'NIGHTCLUB', 2)).result.crew!;
    const local = await seed(home, 1_000);
    await offer(crew.id, { productKey: 'COCAINE' });
    await stock(crew.id, local, 'LOAD', 300);

    expect(await code(manage(crew.id, 'MOVE', 'CASINO'))).toBe('DEALER_CREW_WORKING');
    await manage(crew.id, 'PAUSE');
    const paused = await DealerCrewService.page(app.prisma, rules, { ...(await player()), city: await app.prisma.city.findUniqueOrThrow({ where: { id: homeCityId } }) }, new Date());
    expect(paused.crews[0]).toMatchObject({ status: 'PAUSED', pace: { unitsPerHour: 0, operatingCentsPerHour: 0 } });
    const moved = await manage(crew.id, 'MOVE', 'CASINO');
    expect(moved.result.crew).toMatchObject({ districtKey: 'CASINO', status: 'PAUSED' });
    await manage(crew.id, 'RESUME');

    expect(await code(manage(crew.id, 'CLOSE'))).toBe('DEALER_CREW_NOT_EMPTY');
    await stock(crew.id, local, 'RETURN', 300);
    // The veteran is the one who comes back first.
    const [veteran] = await app.prisma.dealerStaff.findMany({ where: { dealerCrewId: crew.id }, orderBy: { id: 'asc' } });
    await app.prisma.dealerStaff.update({ where: { id: veteran!.id }, data: { experiencePoints: 4_500 } });
    await manage(crew.id, 'CLOSE');
    expect((await player()).dealerThugs).toBe(0);
    expect((await app.prisma.dealerStaff.findUniqueOrThrow({ where: { id: veteran!.id } })).experiencePoints).toBe(4_500);

    const again = await establish(home, 'NIGHTCLUB', 1);
    expect(again.result.crew!.dealers).toEqual([expect.objectContaining({ id: veteran!.id, experiencePoints: 4_500, tierKey: 'VETERAN' })]);
    expect((await player()).dealerThugs).toBe(1);
  });
});
