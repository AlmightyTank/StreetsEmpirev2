import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { classicOgV08H } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { RoundService } from '../round.service.js';

/** 1.0.0-B. Tutorial progress and the early goals against PostgreSQL. */
describe.runIf(process.env.ONBOARDING_INTEGRATION === '1')('1.0.0-B onboarding with PostgreSQL', () => {
  const rules = classicOgV08H;
  let app: FastifyInstance;
  let roundId = '';
  const accounts: string[] = [];
  let fresh = { accountId: '', playerId: '', cookie: '' };
  let veteranCookie = '';

  const itemName = (field: string) => Object.values(rules.stores).flatMap((store) => Object.values(store.items)).find((item) => item.field === field)!.name;

  async function register(prefix: string) {
    const username = `${prefix}_${randomUUID().slice(0, 6)}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username, email: `${username}@example.invalid`, password: randomUUID() } });
    expect(response.statusCode, response.body).toBeLessThan(300);
    const accountId = response.json().account.id as string;
    accounts.push(accountId);
    return { accountId, cookie: response.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ') };
  }

  async function join(accountId: string, round: string, pimp: number) {
    return app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer, ...startingStock(rules), roundId: round, accountId, displayName: `ob${pimp}`, publicPimpId: pimp,
        cityId: (await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } })).id,
      },
    });
  }

  const get = (cookie: string) => app.inject({ method: 'GET', url: '/api/game/onboarding', headers: { cookie } });
  const act = (cookie: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/game/onboarding', headers: { cookie }, payload });

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const now = Date.now();
    const round = await app.prisma.round.create({
      data: { name: 'OB Live', slug: `ob-${randomUUID()}`, rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE', startsAt: new Date(now - 86_400_000), endsAt: new Date(now + 10 * 86_400_000) },
    });
    roundId = round.id;
    const past = await app.prisma.round.create({
      data: { name: 'OB Past', slug: `ob-past-${randomUUID()}`, rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ENDED', startsAt: new Date(now - 40 * 86_400_000), endsAt: new Date(now - 10 * 86_400_000) },
    });
    const a = await register('obnew');
    const player = await join(a.accountId, roundId, 7701);
    fresh = { accountId: a.accountId, playerId: player.id, cookie: a.cookie };
    const v = await register('obvet');
    await join(v.accountId, past.id, 7702);
    await join(v.accountId, roundId, 7703);
    veteranCookie = v.cookie;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await app.prisma.round.deleteMany({ where: { slug: { startsWith: 'ob-' } } }).catch(() => undefined);
    for (const id of accounts) await app.prisma.account.delete({ where: { id } }).catch(() => undefined);
    await app?.close();
  });

  it('opens the intro for a new player, never by itself for a veteran', async () => {
    const state = (await get(fresh.cookie)).json();
    expect(state.intro).toEqual({ due: true, completedAt: null, skippedAt: null });
    expect(state.seenPages).toEqual([]);
    expect(state.guide).toMatchObject({ dismissed: false, complete: false });
    expect(state.guide.steps.every((step: { done: boolean }) => !step.done)).toBe(true);
    expect((await get(veteranCookie)).json().intro.due).toBe(false);
  });

  it('ticks the early goals off from real play, including checkout lines', async () => {
    const log = (type: string, payload: Prisma.InputJsonObject) => app.prisma.playerActivity.create({ data: { roundPlayerId: fresh.playerId, type: type as never, payload } });
    await log('SCOUT', { turns: 5, thugs: 0, whores: 1 });
    let steps = Object.fromEntries((await get(fresh.cookie)).json().guide.steps.map((step: { key: string; done: boolean }) => [step.key, step.done]));
    expect(steps).toEqual({ scout: true, recruit: false, restock: false, produce: false, weapon: false });

    await log('SCOUT', { turns: 5, thugs: 2 });
    await log('STORE_BUY', { item: itemName('condoms'), quantity: 10 });
    // Beer only as a checkout line; a sold line never counts as restocking.
    await log('STORE_SELL', { lines: [{ item: itemName('beer'), direction: 'sell', quantity: 1 }] });
    steps = Object.fromEntries((await get(fresh.cookie)).json().guide.steps.map((step: { key: string; done: boolean }) => [step.key, step.done]));
    expect(steps).toMatchObject({ recruit: true, restock: false });
    await log('STORE_BUY', { lines: [{ item: itemName('beer'), direction: 'buy', quantity: 5 }] });
    await log('PRODUCE_CRACK', { turns: 3, product: 10 });
    steps = Object.fromEntries((await get(fresh.cookie)).json().guide.steps.map((step: { key: string; done: boolean }) => [step.key, step.done]));
    // The guns every crew starts with are not a first weapon.
    expect(steps).toMatchObject({ restock: true, produce: true, weapon: false });
    await log('STORE_BUY', { lines: [{ item: itemName('shotguns'), direction: 'buy', quantity: 1 }] });
    const guide = (await get(fresh.cookie)).json().guide;
    expect(guide.complete).toBe(true);
  });

  it('remembers intros, replays them, and hides the guide for one season', async () => {
    expect((await act(fresh.cookie, { action: 'complete-intro' })).json().intro).toMatchObject({ due: false, completedAt: expect.any(String) });
    await act(fresh.cookie, { action: 'see-page', page: 'combat' });
    const seen = await act(fresh.cookie, { action: 'see-page', page: 'stores' });
    expect(seen.json().seenPages).toEqual(['stores', 'combat']);
    expect((await act(fresh.cookie, { action: 'see-page', page: 'nowhere' })).statusCode).toBe(400);

    expect((await act(fresh.cookie, { action: 'dismiss-guide' })).json().guide.dismissed).toBe(true);
    // A new season shows the guide again: the dismissal belongs to the round it was made in.
    await app.prisma.accountProfile.update({ where: { accountId: fresh.accountId }, data: { onboarding: { guideDismissedRoundId: 'an-older-round', introCompletedAt: new Date().toISOString() } } });
    expect((await get(fresh.cookie)).json().guide.dismissed).toBe(false);

    const replay = (await act(fresh.cookie, { action: 'replay' })).json();
    expect(replay).toMatchObject({ intro: { due: true, completedAt: null }, seenPages: [], guide: { dismissed: false } });
    expect((await act(fresh.cookie, { action: 'skip-intro' })).json().intro).toMatchObject({ due: false, skippedAt: expect.any(String) });
  });
});
