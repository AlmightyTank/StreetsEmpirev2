import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV01 } from '@streets/rulesets';
import { finalStandingRanks, RoundService } from '../round.service.js';

describe('finalStandingRanks', () => {
  it('freezes competition ranks nationally and per city, excluding inactive accounts', () => {
    const ranks = finalStandingRanks([
      { id: 'a', cityId: 'nyc', netWorthCents: 500n, localRank: null, nationalRank: null, account: { isActive: true } },
      { id: 'b', cityId: 'nyc', netWorthCents: 400n, localRank: null, nationalRank: null, account: { isActive: true } },
      { id: 'c', cityId: 'detroit', netWorthCents: 400n, localRank: null, nationalRank: null, account: { isActive: true } },
      { id: 'd', cityId: 'nyc', netWorthCents: 300n, localRank: null, nationalRank: null, account: { isActive: true } },
      { id: 'inactive', cityId: 'detroit', netWorthCents: 999n, localRank: 1, nationalRank: 1, account: { isActive: false } },
    ]);

    expect(Object.fromEntries(ranks)).toEqual({
      a: { localRank: 1, nationalRank: 1 },
      b: { localRank: 2, nationalRank: 2 },
      c: { localRank: 1, nationalRank: 2 },
      d: { localRank: 3, nationalRank: 4 },
      inactive: { localRank: null, nationalRank: null },
    });
  });
});

describe.runIf(process.env.ROUND_INTEGRATION === '1')('RoundService season end with PostgreSQL', () => {
  let app: FastifyInstance;
  const accountIds: string[] = [];
  let roundIds: string[] = [];
  let cityId: string;

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const city = await app.prisma.city.create({ data: { slug: `round-end-${randomUUID()}`, name: 'Round End City', isEnabled: true } });
    cityId = city.id;
  });

  afterAll(async () => {
    if (roundIds.length) await app.prisma.round.deleteMany({ where: { id: { in: roundIds } } });
    if (accountIds.length) await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    if (cityId) await app.prisma.city.deleteMany({ where: { id: cityId } });
    if (app) await app.close();
  });

  async function account(label: string) {
    const username = `${label}_${randomUUID().slice(0, 8)}`;
    const row = await app.prisma.account.create({
      data: { username, usernameNormalized: username.toLowerCase(), email: `${randomUUID()}@example.invalid`, passwordHash: 'x' },
    });
    accountIds.push(row.id);
    return row;
  }

  it('closes an expired active round once and freezes final standings', async () => {
    const now = new Date('2026-09-14T12:00:00.000Z');
    const lastTick = new Date('2026-09-14T10:00:00.000Z');
    const round = await app.prisma.round.create({
      data: {
        slug: `round-end-${randomUUID()}`,
        name: 'Round End Test',
        rulesetId: classicOgV01.meta.id,
        rulesetVersion: classicOgV01.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2026-08-17T12:00:00.000Z'),
        endsAt: new Date('2026-09-14T11:00:00.000Z'),
      },
    });
    roundIds.push(round.id);
    const [first, second] = await Promise.all([account('winner'), account('runner')]);
    await app.prisma.roundPlayer.createMany({
      data: [
        {
          ...classicOgV01.round.startingPlayer,
          roundId: round.id,
          accountId: first.id,
          cityId,
          publicPimpId: 9101,
          displayName: first.username,
          cashCents: 1_000_000n,
          netWorthCents: 1n,
          localRank: null,
          nationalRank: null,
          lastTurnCalculationAt: lastTick,
          lastActiveAt: lastTick,
        },
        {
          ...classicOgV01.round.startingPlayer,
          roundId: round.id,
          accountId: second.id,
          cityId,
          publicPimpId: 9102,
          displayName: second.username,
          cashCents: 100_000n,
          netWorthCents: 9_999_999n,
          localRank: null,
          nationalRank: null,
          lastTurnCalculationAt: lastTick,
          lastActiveAt: lastTick,
        },
      ],
    });

    const [a, b] = await Promise.all([
      RoundService.closeIfExpired(app.prisma, round.id, now),
      RoundService.closeIfExpired(app.prisma, round.id, now),
    ]);
    expect([a.closed, b.closed].sort()).toEqual([false, true]);
    expect((await app.prisma.round.findUniqueOrThrow({ where: { id: round.id } })).status).toBe('ENDED');

    const players = await app.prisma.roundPlayer.findMany({ where: { roundId: round.id }, orderBy: { publicPimpId: 'asc' } });
    expect(players.map((player) => [player.publicPimpId, player.nationalRank, player.localRank])).toEqual([
      [9101, 1, 1],
      [9102, 2, 2],
    ]);
    expect(players[0]!.netWorthCents).toBeGreaterThan(players[1]!.netWorthCents);
  });

  it('closes older active rounds when a newer active season supersedes them', async () => {
    const older = await app.prisma.round.create({
      data: {
        slug: `round-old-${randomUUID()}`,
        name: 'Superseded Round',
        rulesetId: classicOgV01.meta.id,
        rulesetVersion: classicOgV01.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01T12:00:00.000Z'),
        endsAt: new Date('2000-01-29T12:00:00.000Z'),
      },
    });
    const newer = await app.prisma.round.create({
      data: {
        slug: `round-new-${randomUUID()}`,
        name: 'New Current Round',
        rulesetId: classicOgV01.meta.id,
        rulesetVersion: classicOgV01.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-15T12:00:00.000Z'),
        endsAt: new Date('2000-02-12T12:00:00.000Z'),
      },
    });
    roundIds.push(older.id, newer.id);
    try {
      await RoundService.closeSupersededActive(app.prisma, newer);
      expect((await app.prisma.round.findUniqueOrThrow({ where: { id: older.id } })).status).toBe('ENDED');
      expect((await app.prisma.round.findUniqueOrThrow({ where: { id: newer.id } })).status).toBe('ACTIVE');
    } finally {
      await app.prisma.round.deleteMany({ where: { id: { in: [older.id, newer.id] } } });
      roundIds = roundIds.filter((id) => id !== older.id && id !== newer.id);
    }
  });
});
