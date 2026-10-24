import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { classicOgV08H } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { DEFAULT_STREET_SIGN } from '@streets/shared';
import { RoundService } from '../round.service.js';

/** 1.0.0-B. Tutorial progress and the early goals against PostgreSQL. */
describe.runIf(process.env.ONBOARDING_INTEGRATION === '1')('1.0.0-B onboarding with PostgreSQL', () => {
  const rules = classicOgV08H;
  let app: FastifyInstance;
  let roundId = '';
  const accounts: string[] = [];
  let fresh = { accountId: '', playerId: '', cookie: '' };
  let veteranCookie = '';

  const itemName = (field: string) => Object.values(rules.stores)
    .flatMap((store) => Object.values(store.items))
    .find((item) => item.field === field)!.name;

  async function register(prefix: string) {
    const username = `${prefix}_${randomUUID().slice(0, 6)}`;
    const response = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { birthDate: '1990-01-01', ageConfirmed: true, username, email: `${username}@example.invalid`, password: randomUUID() } });
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
    expect((await get(veteranCookie)).json().intro.due).toBe(false);
  });

  it('offers the tour to new players, never by itself to veterans', async () => {
    const t = await register('obtour');
    const tourPlayer = await join(t.accountId, roundId, 7704);
    const tourCookie = t.cookie;
    const tour = (await get(tourCookie)).json().tour;
    expect(tour).toMatchObject({ due: true, active: false, dismissed: false, complete: false, step: 'build-street-sign', signRecap: null });
    expect(tour.steps.every((step: { done: boolean }) => !step.done)).toBe(true);
    await app.prisma.accountProfile.upsert({
      where: { accountId: t.accountId },
      create: { accountId: t.accountId, streetSign: { ...DEFAULT_STREET_SIGN, streetName: 'Cedar' } },
      update: { streetSign: { ...DEFAULT_STREET_SIGN, streetName: 'Cedar' } },
    });
    const marked = (await get(tourCookie)).json().tour;
    expect(marked.step).toBe('scout-streets');
    expect(marked.steps[0]).toEqual({ key: 'build-street-sign', done: true });
    expect(marked.signRecap).toMatchObject({ streetName: 'Cedar', shape: 'classic' });
    expect((await act(tourCookie, { action: 'dismiss-sign-recap' })).json().tour.signRecap).toBeNull();
    const veteran = (await get(veteranCookie)).json().tour;
    expect(veteran).toMatchObject({ due: false, active: false });
    // Stash for the next test.
    fresh = { accountId: t.accountId, playerId: tourPlayer.id, cookie: tourCookie };
  });

  it('runs the tour off saved sign data and real play, counting any raid outcome', async () => {
    const log = (type: string, payload: Prisma.InputJsonObject) => app.prisma.playerActivity.create({ data: { roundPlayerId: fresh.playerId, type: type as never, payload } });
    expect((await act(fresh.cookie, { action: 'start-tour' })).json().tour).toMatchObject({ due: false, active: true, step: 'scout-streets' });
    const stepsOf = async () => Object.fromEntries((await get(fresh.cookie)).json().tour.steps.map((step: { key: string; done: boolean }) => [step.key, step.done]));

    await log('SCOUT', { turns: 5, thugs: 0, whores: 1, cashCents: 25_000 });
    await log('STORE_BUY', { item: itemName('condoms'), direction: 'buy', quantity: 1_000 });
    await log('STORE_BUY', { lines: [{ item: itemName('beer'), direction: 'buy', quantity: 1_000 }] });
    await log('STORE_BUY', { item: itemName('medicine'), direction: 'buy', quantity: 15 });
    await log('STORE_BUY', { item: itemName('pistols'), direction: 'buy', quantity: 5 });
    await log('STORE_BUY', { item: 'AMMO_CRATE', direction: 'buy', quantity: 1 });
    expect(await stepsOf()).toMatchObject({ 'scout-streets': true, 'earn-first-payout': true, 'buy-condoms': true, 'buy-beer': true, 'buy-medicine': true, 'buy-pistols': true, 'buy-ammo-crate': true, 'grow-crew': false });

    await log('SCOUT', { turns: 5, thugs: 2 });
    await log('STORE_BUY', { item: itemName('thugs'), direction: 'buy', quantity: 1 });
    await log('PRODUCE_CRACK', { turns: 3, productType: 'NOT_A_PRODUCT', product: 10 });
    await log('PRODUCE_CRACK', { turns: 3, productType: 'CRACK', product: 0 });
    await log('PRODUCE_CRACK', { turns: 3, productType: 'CRACK', product: 10 });
    await log('HIDEOUT_UPGRADE', { room: 'safe-room', level: 1 });
    expect(await stepsOf()).toMatchObject({ 'grow-crew': true, produce: true, 'upgrade-hideout': true, 'recon-rival': false, 'first-raid': false });

    await log('COMBAT_RECON', { target: 'rival' });
    expect((await get(fresh.cookie)).json().tour.step).toBe('first-raid');
    // A lost raid still resolves the attempt and completes the walkthrough.
    await log('RAID_ATTACK', { won: false });
    const tour = (await get(fresh.cookie)).json().tour;
    expect(tour).toMatchObject({ complete: true, active: false, step: null });

    expect((await act(fresh.cookie, { action: 'dismiss-tour' })).json().tour.dismissed).toBe(true);
    expect((await act(fresh.cookie, { action: 'restore-tour' })).json().tour.dismissed).toBe(false);
  });

  it('does not treat sells, missing directions, or non-positive quantities as purchases', async () => {
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: fresh.playerId } });
    const log = (type: string, payload: Prisma.InputJsonObject) => app.prisma.playerActivity.create({ data: { roundPlayerId: fresh.playerId, type: type as never, payload } });
    const condoms = itemName('condoms');
    const beer = itemName('beer');

    await log('STORE_SELL', { item: condoms, direction: 'sell', quantity: 10 });
    await log('STORE_BUY', { item: condoms, quantity: 10 });
    await log('STORE_BUY', { item: beer, direction: 'buy', quantity: 0 });
    await log('STORE_SELL', { lines: [{ item: beer, direction: 'buy', quantity: -2 }] });

    const steps = Object.fromEntries((await get(fresh.cookie)).json().tour.steps.map((step: { key: string; done: boolean }) => [step.key, step.done]));
    expect(steps['buy-condoms']).toBe(false);

    await log('STORE_SELL', { lines: [{ item: condoms, direction: 'buy', quantity: 1 }] });
    await log('STORE_BUY', { lines: [{ item: beer, direction: 'buy', quantity: 1 }] });
    const completed = Object.fromEntries((await get(fresh.cookie)).json().tour.steps.map((step: { key: string; done: boolean }) => [step.key, step.done]));
    expect(completed['buy-condoms']).toBe(false);
  });

  it('remembers intros and replays them', async () => {
    expect((await act(fresh.cookie, { action: 'complete-intro' })).json().intro).toMatchObject({ due: false, completedAt: expect.any(String) });
    await act(fresh.cookie, { action: 'see-page', page: 'combat' });
    const seen = await act(fresh.cookie, { action: 'see-page', page: 'stores' });
    expect(seen.json().seenPages).toEqual(['stores', 'combat']);
    expect((await act(fresh.cookie, { action: 'see-page', page: 'nowhere' })).statusCode).toBe(400);

    const replay = (await act(fresh.cookie, { action: 'replay' })).json();
    expect(replay).toMatchObject({ intro: { due: true, completedAt: null }, seenPages: [] });
    expect((await act(fresh.cookie, { action: 'skip-intro' })).json().intro).toMatchObject({ due: false, skippedAt: expect.any(String) });
  });
});
