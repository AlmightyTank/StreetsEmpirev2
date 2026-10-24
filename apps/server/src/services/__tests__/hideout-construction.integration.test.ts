import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26I } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { GameActionResult, HideoutUpgradeResult, HideoutV2Dto, SalvageTradeResult, SalvageYardDto } from '@streets/shared';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * Hideout construction, live: an upgrade pays cash, turns and parts up front, the
 * level lands only when the build is ready, the bell hears about it, a room that
 * becomes affordable is announced once, new cosmetics are announced, and the
 * Salvage Yard sells parts for cash and barters the scarce ones.
 * Opt in with HIDEOUT_INTEGRATION=1.
 */
describe.runIf(process.env.HIDEOUT_INTEGRATION === '1')('hideout construction with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  let accountId = '';
  let playerId = '';
  let cookie = '';
  const rules = classicOgV26I;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const round = await app.prisma.round.create({ data: {
      name: 'Hideout construction fixture', slug: `hideout-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 7 * 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    const name = `hideout_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { birthDate: '1990-01-01', ageConfirmed: true, username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
      roundId, accountId, cityId, displayName: name, publicPimpId: 7300,
      reputation: { create: ReputationService.seedFor(rules) } } });
    playerId = player.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.deleteMany({ where: { id: accountId } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.accountCosmeticUnlock.deleteMany({ where: { accountId } });
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: {
      cashCents: 0n, turns: 200, heat: 0, beer: 100, medicine: 0, condoms: 0, ammo: 0,
      hideoutSafeRoomLevel: 1, hideoutLookoutsLevel: 0, hideoutWorkshopLevel: 0, hideoutBackOfficeLevel: 0, hideoutGarageLevel: 0, hideoutStorageLevel: 0,
      hideoutBuildRoom: null, hideoutBuildLevel: null, hideoutBuildStartedAt: null, hideoutBuildReadyAt: null,
      hideoutReadyAlerts: {}, cosmeticsAlertedAt: null, scavengedComponents: {},
    } });
  });

  const post = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie }, payload });
  const get = (url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie } });
  const row = () => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
  const activities = async (type: string) => app.prisma.playerActivity.findMany({ where: { roundPlayerId: playerId, type: type as never } });

  it('takes time to build, spends the parts, and rings the bell when it lands', async () => {
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 50_000_000n, scavengedComponents: { SCRAP_METAL: 10, CLOTH: 5 } } });

    const started = await post('/hideout/upgrade', { room: 'SAFE_ROOM', actionId: randomUUID() });
    expect(started.statusCode, started.body).toBe(200);
    const receipt = (started.json() as GameActionResult<HideoutUpgradeResult>).result;
    expect(receipt.levelAfter).toBe(2);
    expect(receipt.buildMinutes).toBeGreaterThan(0);
    expect(receipt.readyAt).toBeTruthy();

    let player = await row();
    expect(player.hideoutSafeRoomLevel).toBe(1);
    expect(player.hideoutBuildRoom).toBe('SAFE_ROOM');
    // Level 2 costs 4 scrap metal and 2 cloth, and they really leave the stash.
    expect(player.scavengedComponents).toEqual({ SCRAP_METAL: 6, CLOTH: 3 });

    const page = (await get('/hideout')).json() as HideoutV2Dto;
    expect(page.construction).toMatchObject({ room: 'SAFE_ROOM', level: 2 });
    expect(page.rooms.find((room) => room.key === 'SAFE_ROOM')?.build).toMatchObject({ level: 2 });
    expect(page.rooms.every((room) => !room.canUpgrade)).toBe(true);

    const second = await post('/hideout/upgrade', { room: 'LOOKOUTS', actionId: randomUUID() });
    expect(second.json().error.code).toBe('HIDEOUT_BUILD_IN_PROGRESS');

    await PlayerStateService.settle(app.prisma, playerId, { markActive: false, now: new Date(new Date(receipt.readyAt!).getTime() + 1_000) });
    player = await row();
    expect(player.hideoutSafeRoomLevel).toBe(2);
    expect(player.hideoutBuildReadyAt).toBeNull();
    const done = await activities('HIDEOUT_BUILD_COMPLETE');
    expect(done).toHaveLength(1);
    expect(done[0]!.payload).toMatchObject({ room: 'SAFE_ROOM', level: 2 });
    expect(await app.prisma.inAppNotification.count({ where: { activityId: done[0]!.id } })).toBe(1);
  });

  it('announces a room once when it becomes ready to build', async () => {
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });
    expect(await activities('HIDEOUT_ROOM_READY')).toHaveLength(0);

    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 50_000_000n, scavengedComponents: { SCRAP_METAL: 10, CLOTH: 5, WIRING: 10 } } });
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });
    const ready = await activities('HIDEOUT_ROOM_READY');
    expect(ready).toHaveLength(1);
    const rooms = (ready[0]!.payload as { rooms: Array<{ room: string; level: number }> }).rooms;
    expect(rooms).toEqual(expect.arrayContaining([expect.objectContaining({ room: 'SAFE_ROOM', level: 2 })]));
  });

  it('announces new cosmetics on the next settle', async () => {
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });
    await app.prisma.accountCosmeticUnlock.create({ data: {
      accountId, key: `test-decor-${randomUUID()}`, kind: 'HIDEOUT_DECOR', title: 'Neon Sign', description: 'A test light.',
      rarity: 'RARE', sourceQuestKey: 'test', sourceRulesetId: rules.meta.id, sourceRulesetVersion: rules.meta.version,
    } });
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });
    await PlayerStateService.settle(app.prisma, playerId, { markActive: false });
    const unlocked = await activities('COSMETIC_UNLOCKED');
    expect(unlocked).toHaveLength(1);
    expect(unlocked[0]!.payload).toMatchObject({ items: [expect.objectContaining({ title: 'Neon Sign' })] });
  });

  it('sells everyday parts for cash and barters the scarce ones', async () => {
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 100_000n } });
    const yard = (await get('/stores/salvage')).json() as SalvageYardDto;
    expect(yard.offers.find((offer) => offer.key === 'SCRAP_METAL')?.price.kind).toBe('CASH');
    expect(yard.offers.find((offer) => offer.key === 'MOTOR_ASSEMBLY')?.price.kind).toBe('BARTER');

    const bought = await post('/stores/salvage/trade', { key: 'SCRAP_METAL', quantity: 5 });
    expect(bought.statusCode, bought.body).toBe(200);
    expect((bought.json() as SalvageTradeResult).spentCents).toBe(50_000);
    await post('/stores/salvage/trade', { key: 'TOOL_KIT', quantity: 1 });

    const broke = await post('/stores/salvage/trade', { key: 'WIRING', quantity: 5 });
    expect(broke.json().error.code).toBe('NOT_ENOUGH_CASH');

    // A motor assembly costs 4 scrap metal, 1 tool kit and 20 beer.
    const bartered = await post('/stores/salvage/trade', { key: 'MOTOR_ASSEMBLY', quantity: 1 });
    expect(bartered.statusCode, bartered.body).toBe(200);
    const player = await row();
    expect(player.cashCents).toBe(100_000n - 50_000n - 10_000n);
    expect(player.beer).toBe(80);
    expect(player.scavengedComponents).toEqual({ SCRAP_METAL: 1, MOTOR_ASSEMBLY: 1 });

    const short = await post('/stores/salvage/trade', { key: 'MOTOR_ASSEMBLY', quantity: 1 });
    expect(short.json().error.code).toBe('NOT_ENOUGH_TO_TRADE');
  });
});
