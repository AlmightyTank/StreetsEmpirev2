import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV08H, classicOgV11A, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { ReputationService } from '../reputation.service.js';
import { TurfService } from '../turf.service.js';

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.1.0-A business lots with PostgreSQL', () => {
  let app: FastifyInstance;
  const roundIds: string[] = [];
  let accountId = '';

  async function fixture(rules: Ruleset): Promise<{ roundId: string; playerId: string }> {
    const round = await app.prisma.round.create({
      data: {
        name: 'Business A fixture',
        slug: `business-a-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundIds.push(round.id);
    const cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } })).id;
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        roundId: round.id,
        accountId,
        cityId,
        displayName: `biz_${randomUUID().slice(0, 6)}`,
        publicPimpId: 8300 + roundIds.length,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    return { roundId: round.id, playerId: player.id };
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const accountName = `biz_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: accountName, email: `${accountName}@example.invalid`, password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('seeds three empty lots on every block, once', async () => {
    const { roundId } = await fixture(classicOgV11A);
    await TurfService.ensureRound(app.prisma, roundId, classicOgV11A);
    await TurfService.ensureRound(app.prisma, roundId, classicOgV11A);

    const rows = await app.prisma.business.findMany({
      where: { roundId },
      include: { turf: { select: { district: true, city: { select: { slug: true } } } } },
    });
    expect(rows).toHaveLength(120);
    expect(rows.every((row) => row.level === 0)).toBe(true);
    for (const row of rows) {
      const lots = classicOgV11A.business.lots[row.turf.district as keyof typeof classicOgV11A.business.lots];
      expect(row.kind).toBe(lots[row.lot - 1]);
    }
  });

  it('shows each block\'s lots, with the city\'s signature marked', async () => {
    const { playerId } = await fixture(classicOgV11A);
    const byCity = await TurfService.byCity(app.prisma, playerId, classicOgV11A);
    const vegasCasino = byCity!.get('las-vegas')!.blocks.find((block) => block.district === 'CASINO')!;
    expect(vegasCasino.businesses).toMatchObject([
      { lot: 1, kind: 'CASINO_FRONT', name: 'Casino Front', level: 0, maxLevel: 5, signature: true },
      { lot: 2, kind: 'BAR', name: 'Bar', level: 0, maxLevel: 5, signature: false },
      { lot: 3, kind: 'PAWN_SHOP', name: 'Pawn Shop', level: 0, maxLevel: 5, signature: false },
    ]);
    // A 1.1.0-A round shows the lots but cannot build on them.
    expect(byCity!.get('las-vegas')!.business).toBeNull();
    expect(vegasCasino.businesses!.every((lot) => lot.buildBlockedReason === 'Businesses open in 1.1.0-B.')).toBe(true);
    for (const city of byCity!.values()) {
      for (const block of city.blocks) expect(block.businesses).toHaveLength(3);
    }
  });

  it('leaves a 0.8.0-H round without businesses', async () => {
    const { roundId, playerId } = await fixture(classicOgV08H);
    const byCity = await TurfService.byCity(app.prisma, playerId, classicOgV08H);
    expect(await app.prisma.business.count({ where: { roundId } })).toBe(0);
    for (const city of byCity!.values()) {
      for (const block of city.blocks) expect(block.businesses).toBeNull();
    }
  });
});
