import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV17E, classicOgV17G, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { ProductsDto, QuestPageDto } from '@streets/shared';
import { NetWorthService } from '../net-worth.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * Quest Recipe Unlocks B gate, live: a 1.7.0-G round cooks only Crack, Party Favors opens
 * at Pip rep 12 and pays the Ecstasy recipe through ordinary production and sales, the
 * recipe works at once, the next rung opens in order, and a 1.7.0-E round keeps every
 * recipe it always had. Opt in with PRODUCT_INTEGRATION=1.
 */
describe.runIf(process.env.PRODUCT_INTEGRATION === '1')('1.7.0-G cookhouse ladder with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';
  let cookie = '';
  const rules: Ruleset = classicOgV17G;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const round = await app.prisma.round.create({ data: {
      name: 'Cookhouse ladder fixture', slug: `ladder-${randomUUID()}`,
      rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 10 * 86_400_000),
    } });
    roundId = round.id;
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: roundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);

    const name = `ladder_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    const data = {
      ...rules.round.startingPlayer, ...startingStock(rules),
      whores: 50, thugs: 40, woundedThugs: 0, pistols: 40, beer: 500, condoms: 5_000, crack: 0,
      turns: 144, cashCents: 50_000_000n, heat: 0, cityId: city.id,
    };
    const player = await app.prisma.roundPlayer.create({ data: {
      ...data, netWorthCents: NetWorthService.calculate(data, rules),
      roundId, accountId, displayName: name, publicPimpId: 7600 + Math.floor(Math.random() * 300),
      reputation: { create: ReputationService.seedFor(rules) },
    } });
    playerId = player.id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  const post = (url: string, payload: object) => app.inject({ method: 'POST', url: `/api/game${url}`, headers: { cookie }, payload });
  const get = (url: string) => app.inject({ method: 'GET', url: `/api/game${url}`, headers: { cookie } });
  const quests = async () => (await get('/quests')).json<QuestPageDto>();
  const quest = async (key: string) => (await quests()).quests.find((row) => row.key === key)!;
  const cook = (productType: string, turns = 5) => post('/produce-crack', { turns, productType, actionId: randomUUID() });
  const setPipRep = (points: number) => app.prisma.playerReputation.updateMany({ where: { roundPlayerId: playerId, trader: 'PIP' }, data: { points } });

  /** Cook with ordinary production until the job's objective has what it needs. */
  async function cookFor(questKey: string, objectiveId: string, productType: string) {
    for (let batch = 0; batch < 20; batch += 1) {
      const objective = (await quest(questKey)).objectives.find((row) => row.id === objectiveId)!;
      if (objective.current >= objective.target) return;
      const cooked = await cook(productType);
      expect(cooked.statusCode, cooked.body).toBe(200);
    }
    throw new Error(`${questKey}/${objectiveId} never filled.`);
  }

  it('cooks only Crack at the start and points every locked recipe at its job', async () => {
    const products = (await get('/products')).json<ProductsDto>().products;
    const access = (key: string) => products.find((row) => row.key === key)!.recipeAccess;
    expect(access('CRACK')?.unlocked ?? true).toBe(true);
    expect(access('ECSTASY')).toMatchObject({ unlocked: false, unlockName: 'Ecstasy Recipe', unlockQuest: { key: 'PIP_PARTY_FAVORS' } });
    expect(access('METH')).toMatchObject({ unlocked: false, unlockQuest: { key: 'PIP_BULK_ORDER' } });
    expect(access('WEED')).toMatchObject({ unlocked: false, unlockQuest: { key: 'PIP_GREEN_THUMB' } });
    expect(access('COCAINE')).toMatchObject({ unlocked: false, unlockQuest: { key: 'PIP_A_BETTER_CUT' } });
    expect(access('HEROIN')).toMatchObject({ unlocked: false, unlockQuest: { key: 'PIP_RED_LEDGER' } });

    for (const product of ['ECSTASY', 'METH', 'WEED', 'COCAINE', 'HEROIN']) {
      const refused = await cook(product, 1);
      expect(refused.statusCode, product).toBe(409);
      expect(refused.json().error.code).toBe('PRODUCT_RECIPE_LOCKED');
    }
    expect((await cook('CRACK', 1)).statusCode).toBe(200);

    const page = await quests();
    const dailies = page.quests.filter((row) => row.type === 'DAILY').map((row) => row.key);
    expect(dailies).toHaveLength(3);
    expect(dailies).not.toContain('DAILY_METH_COOK');
    expect(dailies).not.toContain('DAILY_PARTY_PACK');
  }, 60_000);

  it('opens Party Favors after Cookhouse at Pip rep 12 and pays the Ecstasy recipe for Crack work', async () => {
    expect((await quest('PIP_PARTY_FAVORS')).status).toBe('LOCKED');
    await app.prisma.playerQuest.updateMany({
      where: { roundPlayerId: playerId, questDefinition: { key: 'COOKHOUSE', rulesetId: rules.meta.id } },
      data: { status: 'COMPLETED', completedAt: new Date(), claimedAt: new Date() },
    });
    await setPipRep(11);
    expect((await quest('PIP_PARTY_FAVORS')).status).toBe('LOCKED');
    await setPipRep(12);
    expect((await quest('PIP_PARTY_FAVORS')).status).toBe('AVAILABLE');
    expect((await quest('PIP_BULK_ORDER')).status).toBe('LOCKED');

    expect((await post('/quests/PIP_PARTY_FAVORS/accept', { actionId: randomUUID() })).statusCode).toBe(200);
    await cookFor('PIP_PARTY_FAVORS', 'cook_crack', 'CRACK');
    const sold = await post('/stores/trade', { store: 'PIP', item: 'CRACK', direction: 'sell', quantity: 100, actionId: randomUUID() });
    expect(sold.statusCode, sold.body).toBe(200);
    expect((await quest('PIP_PARTY_FAVORS')).status).toBe('READY_TO_TURN_IN');

    const claimed = await post('/quests/PIP_PARTY_FAVORS/claim', { actionId: randomUUID() });
    expect(claimed.statusCode, claimed.body).toBe(200);
    const unlocks = await app.prisma.playerUnlock.findMany({ where: { roundPlayerId: playerId }, orderBy: { key: 'asc' } });
    expect(unlocks.map((row) => [row.key, row.sourceQuestKey])).toEqual([
      ['PRODUCT_ECSTASY_ACCESS', 'PIP_PARTY_FAVORS'],
      ['PRODUCT_ECSTASY_RECIPE', 'PIP_PARTY_FAVORS'],
    ]);
  }, 120_000);

  it('lets the new recipe cook at once and opens only the next rung', async () => {
    const cooked = await cook('ECSTASY');
    expect(cooked.statusCode, cooked.body).toBe(200);
    expect(cooked.json().result.productType).toBe('ECSTASY');
    expect((await cook('METH', 1)).json().error.code).toBe('PRODUCT_RECIPE_LOCKED');

    expect((await quest('PIP_BULK_ORDER')).status).toBe('AVAILABLE');
    for (const key of ['PIP_GREEN_THUMB', 'PIP_A_BETTER_CUT', 'PIP_RED_LEDGER']) expect((await quest(key)).status, key).toBe('LOCKED');

    const products = (await get('/products')).json<ProductsDto>().products;
    expect(products.find((row) => row.key === 'ECSTASY')!.recipeAccess?.unlocked).toBe(true);
    expect(products.find((row) => row.key === 'METH')!.recipeAccess?.unlocked).toBe(false);
  }, 60_000);

  it('keeps every recipe open from the start in a 1.7.0-E round', async () => {
    await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: classicOgV17E.meta.id, rulesetVersion: classicOgV17E.meta.version } });
    try {
      const cooked = await cook('METH', 1);
      expect(cooked.statusCode, cooked.body).toBe(200);
      const products = (await get('/products')).json<ProductsDto>().products;
      expect(products.every((row) => row.recipeAccess === undefined || row.recipeAccess === null || row.recipeAccess.unlocked)).toBe(true);
    } finally {
      await app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: rules.meta.id, rulesetVersion: rules.meta.version } });
    }
  }, 60_000);
});
