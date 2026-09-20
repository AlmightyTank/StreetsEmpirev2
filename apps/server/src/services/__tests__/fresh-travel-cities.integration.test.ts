import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV05B } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { CitiesService } from '../cities.service.js';
import { ReputationService } from '../reputation.service.js';

/**
 * Regression for the fresh-account 0.5.0 road map.
 *
 * Production deploys use migrations rather than the development seed. The
 * travel-city catalog migration must therefore make all eight ruleset cities
 * available even before this crew has visited any of them.
 */
describe.runIf(process.env.TRAVEL_INTEGRATION === '1')('fresh travel city catalog with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let accountId = '';
  let playerId = '';

  const rules = classicOgV05B;

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();

    const home = await app.prisma.city.findUniqueOrThrow({
      where: { slug: rules.round.startingCitySlug },
    });

    const round = await app.prisma.round.create({
      data: {
        name: 'Fresh travel city fixture',
        slug: `fresh-travel-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundId = round.id;

    const name = `fresh_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        username: name,
        email: `${name}@example.invalid`,
        password: randomUUID(),
      },
    });
    expect(registered.statusCode, registered.body).toBe(201);
    accountId = registered.json().account.id;

    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        roundId,
        accountId,
        cityId: home.id,
        displayName: name,
        publicPimpId: 7410,
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

  it('shows all eight cities while keeping every unvisited counter hidden', async () => {
    const page = await CitiesService.page(app.prisma, playerId);

    expect(page.cities.map((city) => city.slug)).toEqual([
      'new-york-city',
      'detroit',
      'miami-beach',
      'seattle',
      'beverly-hills',
      'las-vegas',
      'los-angeles',
      'atlanta',
    ]);

    const home = page.cities.find((city) => city.slug === 'new-york-city');
    expect(home?.isHome).toBe(true);
    expect(home?.counter).not.toBeNull();

    for (const city of page.cities.filter((city) => !city.isHome)) {
      expect(city.counter, `${city.slug} should still be unknown to a fresh crew`).toBeNull();
    }
  });
});
