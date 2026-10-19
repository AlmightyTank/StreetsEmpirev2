import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classicOgV22A } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import type { FastifyInstance } from 'fastify';
import { TemplatedOperations } from '../operation-templated.service.js';

describe.runIf(process.env.UNDERWORLD_INTEGRATION === '1')('2.2.0 underworld operations with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  const playerIds: string[] = [];
  const accountIds: string[] = [];

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({
      data: {
        name: 'Underworld operations fixture',
        slug: `underworld-${randomUUID()}`,
        rulesetId: classicOgV22A.meta.id,
        rulesetVersion: classicOgV22A.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
        underworldOperationsEnabled: true,
      },
    });
    roundId = round.id;
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: classicOgV22A.round.startingCitySlug } })).id;
    for (let index = 0; index < 2; index += 1) {
      const username = `underworld_${randomUUID().slice(0, 8)}`;
      const account = await app.prisma.account.create({ data: {
        username,
        usernameNormalized: username.toLowerCase(),
        email: `underworld_${randomUUID()}@example.invalid`,
        passwordHash: 'integration-fixture',
      } });
      accountIds.push(account.id);
      const player = await app.prisma.roundPlayer.create({
        data: {
          ...classicOgV22A.round.startingPlayer,
          ...startingStock(classicOgV22A),
          roundId,
          accountId: account.id,
          cityId,
          displayName: `Underworld ${index + 1}`,
          publicPimpId: 9800 + index,
        },
      });
      playerIds.push(player.id);
    }
    await app.prisma.run.create({
      data: {
        roundPlayerId: playerIds[0]!,
        status: 'RETURNED',
        homeCity: classicOgV22A.round.startingCitySlug,
        lowRiders: 1,
        escortThugs: 2,
        cashCents: 0n,
        startCashCents: 0n,
        turnsSpent: 1,
        returnedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    for (const accountId of accountIds) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('runs a two-player convoy operation through one durable receipt', async () => {
    const player = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: playerIds[0]! } });
    const run = await app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: player.id } });
    const started = await TemplatedOperations.start(app.prisma, player.id, {
      citySlug: classicOgV22A.round.startingCitySlug,
      template: 'CONVOY_PROTECTION',
      runId: run.id,
      escort: 2,
      routeRisk: 'BALANCED',
    }, 'CONVOY_PROTECTION');
    await TemplatedOperations.invite(app.prisma, player.id, started.id, 'escort', 9801);
    await TemplatedOperations.answer(app.prisma, playerIds[1]!, started.id, true);
    await TemplatedOperations.lock(app.prisma, player.id, started.id, 'driver');
    const receipt = await TemplatedOperations.execute(app.prisma, player.id, started.id);
    expect(receipt.status).toBe('REPORTED');
    expect(receipt.report?.band).toBe('success');
    expect(await app.prisma.operationSourceClaim.count({ where: { operationId: started.id } })).toBe(1);
    expect(await app.prisma.operationGrant.count({ where: { operationId: started.id } })).toBe(2);
    expect(receipt.report?.contributions).toHaveLength(2);
  });
});
