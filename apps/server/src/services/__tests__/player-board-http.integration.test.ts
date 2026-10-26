import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV26JBoard } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { PlayerBoardDto, PlayerBoardFillResult, PlayerBoardOfferResult, StoresDto } from '@streets/shared';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * The Board over HTTP on a round pinned to the opt-in ruleset: the catalog shows the tab, a
 * seller posts, a buyer buys through the route, and both stored ranks are already current.
 * Opt in with PLAYER_BOARD_INTEGRATION=1.
 */
describe.runIf(process.env.PLAYER_BOARD_INTEGRATION === '1')('The Board routes with PostgreSQL', () => {
  const rules = classicOgV26JBoard;
  let app: FastifyInstance;
  let roundId = '';
  const accounts: string[] = [];
  const players: Array<{ id: string; cookie: string }> = [];

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const round = await app.prisma.round.create({ data: {
      name: 'Board routes fixture', slug: `board-http-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 7 * 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    for (const index of [0, 1]) {
      const name = `boardhttp_${randomUUID().slice(0, 6)}`;
      const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { birthDate: '1990-01-01', ageConfirmed: true, username: name, email: `${name}@example.invalid`, password: randomUUID() } });
      const accountId = registered.json().account.id as string;
      accounts.push(accountId);
      const player = await app.prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId, accountId, cityId: city.id, displayName: name, publicPimpId: 7900 + index, cashCents: 100_000n,
        scavengedComponents: { RADIO: 4 }, reputation: { create: ReputationService.seedFor(rules) } } });
      players.push({ id: player.id, cookie: registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ') });
    }
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    await app.prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await app?.close();
  });

  const call = (who: number, method: 'GET' | 'POST', url: string, payload?: object) =>
    app.inject({ method, url: `/api/game${url}`, headers: { cookie: players[who]!.cookie }, ...(payload ? { payload } : {}) });

  it('shows the tab, posts, buys, and leaves both stored ranks current', async () => {
    const catalog = await call(1, 'GET', '/stores');
    expect(catalog.statusCode, catalog.body).toBe(200);
    expect((catalog.json() as StoresDto).playerBoard).toBe(true);

    const posted = await call(0, 'POST', '/stores/board/offers', { itemKey: 'RADIO', quantity: 2, unitPriceCents: 3_500, durationHours: 12 });
    expect(posted.statusCode, posted.body).toBe(200);
    const offerId = (posted.json() as PlayerBoardOfferResult).offer.id;

    const book = (await call(1, 'GET', '/stores/board?filter=PARTS')).json() as PlayerBoardDto;
    expect(book.rows.map((row) => [row.id, row.mine])).toEqual([[offerId, false]]);

    const actionId = randomUUID();
    const bought = await call(1, 'POST', `/stores/board/offers/${offerId}/buy`, { actionId });
    expect(bought.statusCode, bought.body).toBe(200);
    expect((bought.json() as PlayerBoardFillResult).paidCents).toBe(7_000);
    const replay = await call(1, 'POST', `/stores/board/offers/${offerId}/buy`, { actionId });
    expect(replay.json()).toEqual(bought.json());

    for (const { id } of players) {
      const stored = (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id }, select: { netWorthCents: true } })).netWorthCents;
      await PlayerStateService.settle(app.prisma, id);
      const fresh = (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id }, select: { netWorthCents: true } })).netWorthCents;
      expect(stored).toBe(fresh);
    }
    expect((await call(0, 'POST', `/stores/board/offers/${offerId}/cancel`, {})).json().error.code).toBe('OFFER_NOT_OPEN');
  });

  it('buys part of a cash offer over HTTP', async () => {
    await app.prisma.roundPlayer.update({ where: { id: players[0]!.id }, data: { scavengedComponents: { RADIO: 12 } } });
    const posted = await call(0, 'POST', '/stores/board/offers', { itemKey: 'RADIO', quantity: 12, unitPriceCents: 3_400, durationHours: 12 });
    const offerId = (posted.json() as PlayerBoardOfferResult).offer.id;
    const bought = await call(1, 'POST', `/stores/board/offers/${offerId}/buy`, { actionId: randomUUID(), quantity: 3 });
    expect(bought.statusCode, bought.body).toBe(200);
    expect(bought.json()).toMatchObject({ quantity: 3, remainingQuantity: 9, paidCents: 10_200 });
    const book = (await call(1, 'GET', '/stores/board')).json() as PlayerBoardDto;
    expect(book.rows.find((r) => r.id === offerId)?.quantity).toBe(9);
    await call(0, 'POST', `/stores/board/offers/${offerId}/cancel`, {});
  });

  it('posts and takes a barter over HTTP', async () => {
    await app.prisma.roundPlayer.update({ where: { id: players[0]!.id }, data: { scavengedComponents: { RADIO: 2 } } });
    await app.prisma.roundPlayer.update({ where: { id: players[1]!.id }, data: { scavengedComponents: { SCRAP_METAL: 20 } } });
    const posted = await call(0, 'POST', '/stores/board/offers', { itemKey: 'RADIO', quantity: 1, priceKind: 'BARTER', askItems: [{ key: 'SCRAP_METAL', quantity: 6 }], durationHours: 48 });
    expect(posted.statusCode, posted.body).toBe(200);
    const offer = (posted.json() as PlayerBoardOfferResult).offer;
    expect(offer.ask).toEqual([{ key: 'SCRAP_METAL', name: 'Scrap metal', quantity: 6 }]);
    const traded = await call(1, 'POST', `/stores/board/offers/${offer.id}/buy`, { actionId: randomUUID() });
    expect(traded.statusCode, traded.body).toBe(200);
    expect((traded.json() as PlayerBoardFillResult)).toMatchObject({ paidCents: 200, gave: [{ key: 'SCRAP_METAL', quantity: 6 }] });
    const buyer = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: players[1]!.id }, select: { scavengedComponents: true } });
    expect(buyer.scavengedComponents).toEqual({ SCRAP_METAL: 14, RADIO: 1 });
  });
});
