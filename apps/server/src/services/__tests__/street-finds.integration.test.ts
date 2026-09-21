import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV05F } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { NetWorthService } from '../net-worth.service.js';
import { ProductInventoryService } from '../product-inventory.service.js';
import { ProductionService } from '../production.service.js';
import { ReputationService } from '../reputation.service.js';
import { ScoutService } from '../scout.service.js';

describe.runIf(process.env.PRODUCT_INTEGRATION === '1')('mixed street finds with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  let roundId = '';
  let playerId = '';
  const rules = classicOgV05F;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();

    const name = `finds_${randomUUID().slice(0, 7)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() },
    });
    accountId = registered.json().account.id;

    const round = await app.prisma.round.create({
      data: {
        name: 'Mixed finds fixture',
        slug: `mixed-finds-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundId = round.id;
    const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: 'beverly-hills' } })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        roundId,
        accountId,
        cityId,
        displayName: name,
        publicPimpId: 7950,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    playerId = player.id;
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.playerProduct.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.processedAction.deleteMany({ where: { roundPlayerId: playerId } });
    await app.prisma.playerActivity.deleteMany({ where: { roundPlayerId: playerId } });

    const data = {
      ...rules.round.startingPlayer,
      ...startingStock(rules),
      whores: 20,
      thugs: 20,
      woundedThugs: 0,
      busyThugs: 0,
      postedThugs: 0,
      postedNetWorthCents: 0n,
      awayNetWorthCents: 0n,
      outpostNetWorthCents: 0n,
      condoms: 2_000,
      medicine: 200,
      crack: 2_000,
      beer: 2_000,
      pistols: 20,
      turns: 100,
      cashCents: 10_000_000n,
      heat: 0,
      lastTurnCalculationAt: new Date(),
      lastActiveAt: new Date(),
    };
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: { ...data, netWorthCents: NetWorthService.calculate(data, rules) },
    });
  });

  it('adds non-crack finds from Scout to the product inventory', async () => {
    const trip = await ScoutService.scout(
      app.prisma,
      playerId,
      { district: 'LOW_RENT', turns: 4, actionId: randomUUID() },
      () => 0,
    );

    expect(trip.result.productsFound).toEqual([{ key: 'WEED', name: 'Weed', quantity: 4 }]);
    expect(trip.result.crackFound).toBe(0);
    expect((await ProductInventoryService.read(app.prisma, playerId, rules)).WEED).toBe(4);
  });

  it('adds non-crack finds from the girls shift while Produce is running', async () => {
    const batch = await ProductionService.produceCrack(
      app.prisma,
      playerId,
      { turns: 4, productType: 'CRACK', actionId: randomUUID() },
      () => 0,
    );

    expect(batch.result.productsFound).toEqual([{ key: 'WEED', name: 'Weed', quantity: 4 }]);
    expect(batch.result.crackFound).toBe(0);
    expect((await ProductInventoryService.read(app.prisma, playerId, rules)).WEED).toBe(4);
  });
});
