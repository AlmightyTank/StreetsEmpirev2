import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Round } from '@prisma/client';
import { classicOgStreetPassA, classicOgV08H, STREET_PASS_S1, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';

/**
 * Street Pass, live on the shipped classic-og-street-pass-a ruleset: Cred from
 * turns and Jobs, the daily turn cap, claiming (once, even when two claims
 * race), late joiners, round close and the API. Opt in with
 * STREET_PASS_INTEGRATION=1.
 */
describe.runIf(process.env.STREET_PASS_INTEGRATION === '1')('Street Pass with PostgreSQL', () => {
  const rules: Ruleset = classicOgStreetPassA;
  const DAY = 86_400_000;

  let app: FastifyInstance;
  let cookie = '';
  let playerId = '';
  let accountId = '';
  let current: Round;
  const roundIds: string[] = [];
  const accountIds: string[] = [];

  async function makeRound(startsAt: Date): Promise<Round> {
    const round = await app.prisma.round.create({ data: {
      name: 'Street Pass fixture', slug: `street-pass-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt, endsAt: new Date(Date.now() + 7 * DAY),
    } });
    roundIds.push(round.id);
    return round;
  }

  async function makePlayer(round: Round, joinedAt = new Date()): Promise<{ id: string; accountId: string; cookie: string }> {
    const name = `sp_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    expect(registered.statusCode, registered.body).toBe(201);
    const account = registered.json().account.id as string;
    accountIds.push(account);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({ data: {
      ...rules.round.startingPlayer, ...startingStock(rules),
      accountId: account, roundId: round.id, cityId: city.id,
      publicPimpId: -Math.floor(Math.random() * 2_000_000_000) - 1, displayName: name,
      whores: 10, thugs: 10, condoms: 1_000, beer: 500, crack: 500, pistols: 10,
      lastTurnCalculationAt: new Date(), createdAt: joinedAt,
    } });
    return { id: player.id, accountId: account, cookie: registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ') };
  }

  const service = async () => (await import('../street-pass.service.js')).StreetPassService;
  const cred = async () => (await import('../street-pass-cred.service.js')).StreetPassCredService;
  const experience = async () => (await import('../player-experience.service.js')).PlayerExperienceService;
  const setCred = (id: string, value: number) => app.prisma.streetPassProgress.upsert({
    where: { roundPlayerId: id },
    create: { roundPlayerId: id, passKey: STREET_PASS_S1.key, cred: value },
    update: { cred: value },
  });
  const cash = async (id: string) => (await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id } })).cashCents;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    current = await makeRound(new Date(Date.now() - 60 * 60_000));
    const player = await makePlayer(current);
    playerId = player.id;
    accountId = player.accountId;
    cookie = player.cookie;
    const { RoundService } = await import('../round.service.js');
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(async () => current);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await app?.close();
  });

  const post = (url: string, payload: Record<string, unknown> = {}) => app.inject({ method: 'POST', url, headers: { cookie }, payload });

  it('earns Cred from turns spent on a Scout and from turning in a job', async () => {
    expect((await post('/api/game/quests/FIRST_NIGHT_OUT/accept', { actionId: randomUUID() })).statusCode).toBe(200);
    const scout = await post('/api/game/scout', { district: 'WINO_SLUMS', turns: 12, actionId: randomUUID() });
    expect(scout.statusCode, scout.body).toBe(200);

    let view = (await (await service()).view(app.prisma, playerId, rules))!;
    expect(view.cred).toBe(12);
    expect(view.turnCredToday).toBe(12);

    const claim = await post('/api/game/quests/FIRST_NIGHT_OUT/claim', { actionId: randomUUID() });
    expect(claim.statusCode, claim.body).toBe(200);
    view = (await (await service()).view(app.prisma, playerId, rules))!;
    expect(view.cred).toBe(12 + STREET_PASS_S1.sources.oneTimeJob);
    expect(view.tier).toBe(0);
    expect(view.nextTierCred).toBe(800);
    expect((await app.prisma.account.findUniqueOrThrow({ where: { id: accountId } })).experiencePoints).toBe(112);
  });

  it('caps turn Cred at 400 a day and starts again the next day', async () => {
    const credit = await cred();
    const other = await makePlayer(current);
    const now = new Date();
    let spendIndex = 0;
    const spend = (turns: number, at: Date) => app.prisma.$transaction((tx) => credit.creditTurns(tx, other.id, rules, turns, at, `spend:${spendIndex++}`));
    expect(await spend(300, now)).toBe(300);
    expect(await spend(300, now)).toBe(100);
    expect(await spend(50, now)).toBe(0);
    expect(await spend(50, new Date(now.getTime() + DAY))).toBe(50);
    const view = (await (await service()).view(app.prisma, other.id, rules, new Date(now.getTime() + DAY)))!;
    expect(view.cred).toBe(450);
    expect(view.turnCredToday).toBe(50);
  });

  it('awards account XP once and unlocks a title when a level milestone is crossed', async () => {
    const player = await makePlayer(current);
    const progress = await experience();
    const input = {
      roundPlayerId: player.id,
      sourceKey: 'milestone-test',
      source: 'TEST',
      amount: 700,
      awardedAt: new Date(),
    };
    const first = await app.prisma.$transaction((tx) => progress.award(tx, input));
    const replay = await app.prisma.$transaction((tx) => progress.award(tx, input));

    expect(first).toMatchObject({ awardedXp: 700, totalXp: 700, level: 5 });
    expect(first.unlocked.map((cosmetic) => cosmetic.key)).toEqual(['player-level-5-title']);
    expect(replay).toMatchObject({ awardedXp: 0, totalXp: 700, level: 5 });
    expect(await app.prisma.playerExperienceEvent.count({ where: { accountId: player.accountId } })).toBe(1);
    expect(await app.prisma.accountCosmeticUnlock.count({ where: { accountId: player.accountId, key: 'player-level-5-title' } })).toBe(1);
  });

  it('refuses a tier the player has not reached', async () => {
    await setCred(playerId, 799);
    await expect((await service()).claim(app.prisma, playerId, { tier: 1, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'STREET_PASS_TIER_LOCKED' });
    await expect((await service()).claim(app.prisma, playerId, { tier: 31, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'STREET_PASS_TIER_UNKNOWN' });
  });

  it('pays a tier once: a replayed request answers the same, a second claim is refused', async () => {
    const pass = await service();
    await setCred(playerId, 800);
    const before = await cash(playerId);
    const actionId = randomUUID();
    const first = await pass.claim(app.prisma, playerId, { tier: 1, actionId });
    expect(first.result).toMatchObject({ passKey: 'street-pass-s1', tier: 1 });
    expect(first.result.rewards.map((reward) => reward.label)).toEqual(['$20,000.00']);
    expect(await cash(playerId) - before).toBe(2_000_000n);

    const replay = await pass.claim(app.prisma, playerId, { tier: 1, actionId });
    expect(replay).toEqual(first);
    await expect(pass.claim(app.prisma, playerId, { tier: 1, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'STREET_PASS_ALREADY_CLAIMED' });
    expect(await cash(playerId) - before).toBe(2_000_000n);

    const view = (await pass.view(app.prisma, playerId, rules))!;
    expect(view.tiers[0]).toMatchObject({ tier: 1, reached: true, claimed: true });
    expect(view.claimable).toEqual([]);
    const activity = await app.prisma.playerActivity.findFirst({ where: { roundPlayerId: playerId, type: 'STREET_PASS_CLAIMED' } });
    expect(activity?.payload).toMatchObject({ tier: 1, rewards: ['$20,000.00'] });
  });

  it('pays once when two claims for the same tier race', async () => {
    const pass = await service();
    await setCred(playerId, 10_000);
    const before = await cash(playerId);
    const results = await Promise.allSettled([
      pass.claim(app.prisma, playerId, { tier: 8, actionId: randomUUID() }),
      pass.claim(app.prisma, playerId, { tier: 8, actionId: randomUUID() }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'STREET_PASS_ALREADY_CLAIMED' } });
    expect(await cash(playerId) - before).toBe(5_000_000n);
    expect(await app.prisma.streetPassClaim.count({ where: { roundPlayerId: playerId, tier: 8 } })).toBe(1);
  });

  it('gives a player who joined two weeks in +30% Cred', async () => {
    const lateRound = await makeRound(new Date(Date.now() - 16 * DAY));
    const late = await makePlayer(lateRound, new Date(Date.now() - DAY));
    const earned = await app.prisma.$transaction(async (tx) => (await cred()).creditQuest(tx, late.id, rules, 'DAILY', 'late:daily:1'));
    expect(earned).toBe(195);
    const view = (await (await service()).view(app.prisma, late.id, rules))!;
    expect(view).toMatchObject({ cred: 195, lateJoinBonusPercent: 30 });
  });

  it('at round close grants unclaimed season cosmetics only, then refuses every claim', async () => {
    const closing = await makeRound(new Date(Date.now() - 60 * 60_000));
    const finisher = await makePlayer(closing);
    await setCred(finisher.id, 36_000);
    await (await service()).claim(app.prisma, finisher.id, { tier: 2, actionId: randomUUID() });
    const before = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: finisher.id } });

    const { RoundService } = await import('../round.service.js');
    const closed = await RoundService.closeRoundAt(app.prisma, closing.id, new Date());
    expect(closed.closed).toBe(true);

    const claims = await app.prisma.streetPassClaim.findMany({ where: { roundPlayerId: finisher.id }, orderBy: { tier: 'asc' } });
    // Tiers 10, 20 and 30 carry permanent cosmetics, so round close claims them.
    expect(claims.map((claim) => [claim.tier, claim.automatic])).toEqual([[2, false], [10, true], [20, true], [30, true]]);
    const cosmetics = await app.prisma.accountCosmeticUnlock.findMany({ where: { accountId: finisher.accountId }, orderBy: { key: 'asc' } });
    expect(cosmetics.map((row) => row.key)).toEqual([
      'street-pass-s1-badge', 'street-pass-s1-frame', 'street-pass-s1-fresh-face', 'street-pass-s1-kingpin', 'street-pass-s1-made-man',
    ]);
    // Gameplay rewards on the other 27 reached tiers expired with the round.
    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: finisher.id } });
    expect(after.cashCents).toBe(before.cashCents);

    await expect((await service()).claim(app.prisma, finisher.id, { tier: 1, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'ROUND_ENDED' });
  });

  it('serves the pass, claims through the API and puts a summary in /me for the nav badge', async () => {
    const api = await makePlayer(current);
    const headers = { cookie: api.cookie };
    await setCred(api.id, 1_600);

    const page = await app.inject({ method: 'GET', url: '/api/game/street-pass', headers });
    expect(page.statusCode, page.body).toBe(200);
    const { pass } = page.json();
    expect(pass).toMatchObject({ key: 'street-pass-s1', cred: 1_600, tier: 2, tierCount: 30, nextTierCred: 2_400, claimable: [1, 2] });
    expect(pass.sources).toMatchObject({ dailyContract: 150, weeklyContract: 750, perTurnSpent: 1 });
    expect(pass.tiers[2].rewards[0]).toMatchObject({ kind: 'ITEM', key: 'whores', amount: 3, label: '3 hoes' });

    let me = await app.inject({ method: 'GET', url: '/api/game/me', headers });
    expect(me.json().player.streetPass).toEqual({ tier: 2, tierCount: 30, claimable: 2 });

    const claim = await app.inject({ method: 'POST', url: '/api/game/street-pass/claim', headers, payload: { tier: 2, actionId: randomUUID() } });
    expect(claim.statusCode, claim.body).toBe(200);
    expect(claim.json().result.rewards[0].label).toBe('1,000 condoms');
    me = await app.inject({ method: 'GET', url: '/api/game/me', headers });
    expect(me.json().player.streetPass.claimable).toBe(1);

    const locked = await app.inject({ method: 'POST', url: '/api/game/street-pass/claim', headers, payload: { tier: 3, actionId: randomUUID() } });
    expect(locked.statusCode).toBe(409);
    expect(locked.json()).toMatchObject({ error: { code: 'STREET_PASS_TIER_LOCKED' } });
    const invalid = await app.inject({ method: 'POST', url: '/api/game/street-pass/claim', headers, payload: { tier: 'two', actionId: randomUUID() } });
    expect(invalid.statusCode).toBe(400);
  });

  it('answers pass: null and no nav summary on a round without a pass', async () => {
    const plainRound = await app.prisma.round.create({ data: {
      name: 'No pass fixture', slug: `no-pass-${randomUUID()}`,
      rulesetId: classicOgV08H.meta.id, rulesetVersion: classicOgV08H.meta.version, status: 'ACTIVE',
      startsAt: new Date(Date.now() - 60 * 60_000), endsAt: new Date(Date.now() + 7 * DAY),
    } });
    roundIds.push(plainRound.id);
    const plain = await makePlayer(plainRound);
    const before = current;
    current = plainRound;
    try {
      const page = await app.inject({ method: 'GET', url: '/api/game/street-pass', headers: { cookie: plain.cookie } });
      expect(page.statusCode, page.body).toBe(200);
      expect(page.json()).toEqual({ pass: null });
      const me = await app.inject({ method: 'GET', url: '/api/game/me', headers: { cookie: plain.cookie } });
      expect(me.json().player.streetPass).toBeNull();
      const claim = await app.inject({ method: 'POST', url: '/api/game/street-pass/claim', headers: { cookie: plain.cookie }, payload: { tier: 1, actionId: randomUUID() } });
      expect(claim.json()).toMatchObject({ error: { code: 'STREET_PASS_OFF' } });
    } finally {
      current = before;
    }
  });

  it('does nothing on a round without a pass', async () => {
    const plain = { ...rules, streetPass: undefined };
    expect(await (await service()).view(app.prisma, playerId, plain)).toBeNull();
    const player = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerId } });
    const xpBefore = (await app.prisma.account.findUniqueOrThrow({ where: { id: player.accountId } })).experiencePoints;
    expect(await app.prisma.$transaction(async (tx) => (await cred()).creditTurns(tx, playerId, plain, 50, new Date(), 'no-pass:turns:1'))).toBe(0);
    expect((await app.prisma.account.findUniqueOrThrow({ where: { id: player.accountId } })).experiencePoints - xpBefore).toBe(50);
  });

});
