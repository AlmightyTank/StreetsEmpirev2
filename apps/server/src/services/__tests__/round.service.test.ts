import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Round } from '@prisma/client';
import { classicOgV01 } from '@streets/rulesets';
import { assertJoinable, finalStandingRanks, isJoinable, RoundService } from '../round.service.js';
import { ROUND_AFTERMATH_SCHEMA_VERSION, ROUND_AFTERMATH_SOURCE_REVISION } from '../round-aftermath.service.js';
import { TurfWarSettlementService } from '../turf-war-settle.service.js';

afterEach(() => vi.restoreAllMocks());

function round(overrides: Partial<Round> = {}): Round {
  return {
    id: 'round-1',
    name: 'Current game',
    slug: 'current-game',
    rulesetId: classicOgV01.meta.id,
    rulesetVersion: classicOgV01.meta.version,
    streetPassOverride: null,
    status: 'ACTIVE',
    startsAt: new Date('2026-10-01T00:00:00.000Z'),
    endsAt: new Date('2026-11-01T00:00:00.000Z'),
    pausedAt: null,
    pauseReason: null,
    pausedByUsername: null,
    pausedMinutesTotal: 0,
    registrationOpensAt: null,
    alertsOpenedAt: null,
    alertsEndingSoonAt: null,
    alertsEndedAt: null,
    discordEndedAt: null,
    discordEndedClaimedAt: null,
    discordEndedMessageId: null,
    discordEndedError: null,
    nextPublicPimpId: 1000,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('round joining', () => {
  const now = new Date('2026-10-11T12:00:00.000Z');

  it.each(['REGISTRATION', 'ACTIVE'] as const)('always allows entry to a current %s round', (status) => {
    const current = round({
      status,
      registrationOpensAt: new Date('2026-10-20T00:00:00.000Z'),
    });

    expect(isJoinable(current, now)).toBe(true);
    expect(() => assertJoinable(current, now)).not.toThrow();
  });

  it.each(['SCHEDULED', 'ENDED', 'ARCHIVED'] as const)('does not allow entry to a %s round', (status) => {
    const unavailable = round({ status });

    expect(isJoinable(unavailable, now)).toBe(false);
    expect(() => assertJoinable(unavailable, now)).toThrow();
  });

  it('does not allow entry after the round end time', () => {
    const expired = round({ endsAt: now });

    expect(isJoinable(expired, now)).toBe(false);
    expect(() => assertJoinable(expired, now)).toThrow();
  });
});

describe('RoundService turf clock ordering', () => {
  it('settles the round/crackdown before the minute turf-war sweep', async () => {
    const now = new Date('2026-09-27T00:01:00.000Z');
    const getCurrent = vi.spyOn(RoundService, 'getCurrent').mockResolvedValue(null);
    const sweep = vi.spyOn(TurfWarSettlementService, 'sweep').mockResolvedValue(0);

    await RoundService.settleTurfClock({} as any, now);

    expect(getCurrent).toHaveBeenCalledWith(expect.anything(), now);
    expect(sweep).toHaveBeenCalledWith(expect.anything(), now);
    expect(getCurrent.mock.invocationCallOrder[0]).toBeLessThan(sweep.mock.invocationCallOrder[0]!);
  });
});

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
    const closed = await app.prisma.round.findUniqueOrThrow({ where: { id: round.id } });
    expect(closed.status).toBe('ENDED');
    // Closing on schedule leaves the end date alone.
    expect(closed.endsAt).toEqual(round.endsAt);

    const players = await app.prisma.roundPlayer.findMany({ where: { roundId: round.id }, orderBy: { publicPimpId: 'asc' } });
    expect(players.map((player) => [player.publicPimpId, player.nationalRank, player.localRank])).toEqual([
      [9101, 1, 1],
      [9102, 2, 2],
    ]);
    expect(players[0]!.netWorthCents).toBeGreaterThan(players[1]!.netWorthCents);

    const aftermath = await app.prisma.roundAftermathReport.findUniqueOrThrow({ where: { roundId: round.id } });
    expect(aftermath).toMatchObject({
      status: 'READY',
      schemaVersion: ROUND_AFTERMATH_SCHEMA_VERSION,
      sourceRevision: ROUND_AFTERMATH_SOURCE_REVISION,
      cutoffAt: round.endsAt,
    });
    const snapshotPlayers = aftermath.playerAggregates as Array<{ roundPlayerId: string; nationalRank: number | null; netWorthCents: string }>;
    expect(snapshotPlayers.map((player) => [player.roundPlayerId, player.nationalRank, player.netWorthCents])).toEqual(
      players.map((player) => [player.id, player.nationalRank, player.netWorthCents.toString()]),
    );
    const beforeRetry = aftermath;
    await RoundService.closeIfExpired(app.prisma, round.id, now);
    expect(await app.prisma.roundAftermathReport.findUniqueOrThrow({ where: { roundId: round.id } })).toEqual(beforeRetry);
  });

  it('freezes an empty paused round at the explicit early-close cutoff', async () => {
    const now = new Date('2026-09-20T12:00:00.000Z');
    const round = await app.prisma.round.create({
      data: {
        slug: `round-early-${randomUUID()}`,
        name: 'Paused Early Close Test',
        rulesetId: classicOgV01.meta.id,
        rulesetVersion: classicOgV01.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2026-09-01T12:00:00.000Z'),
        endsAt: new Date('2026-10-01T12:00:00.000Z'),
        pausedAt: new Date('2026-09-19T12:00:00.000Z'),
      },
    });
    roundIds.push(round.id);

    try {
      await RoundService.closeRoundAt(app.prisma, round.id, now);
      const aftermath = await app.prisma.roundAftermathReport.findUniqueOrThrow({ where: { roundId: round.id } });
      expect(aftermath).toMatchObject({ status: 'READY', cutoffAt: now });
      expect(aftermath.globalAggregate).toMatchObject({ participants: 0, eligibleCompetitors: 0, citiesInRound: 0, finalNetWorthCents: '0' });
      expect(aftermath.categoryRecords).toMatchObject({
        wealth: { status: 'NOT_RECORDED' },
        crew: { status: 'NOT_RECORDED' },
      });
    } finally {
      await app.prisma.round.delete({ where: { id: round.id } });
      roundIds = roundIds.filter((id) => id !== round.id);
    }
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
      const ended = await app.prisma.round.findUniqueOrThrow({ where: { id: older.id } });
      expect(ended.status).toBe('ENDED');
      // It ended when the newer season started, not on the date it was scheduled for.
      expect(ended.endsAt).toEqual(newer.startsAt);
      expect((await app.prisma.round.findUniqueOrThrow({ where: { id: newer.id } })).status).toBe('ACTIVE');
      const aftermath = await app.prisma.roundAftermathReport.findUniqueOrThrow({ where: { roundId: older.id } });
      expect(aftermath).toMatchObject({ status: 'READY', cutoffAt: newer.startsAt });
      expect(aftermath.globalAggregate).toMatchObject({ participants: 0, eligibleCompetitors: 0, citiesInRound: 0, finalNetWorthCents: '0' });
    } finally {
      await app.prisma.round.deleteMany({ where: { id: { in: [older.id, newer.id] } } });
      roundIds = roundIds.filter((id) => id !== older.id && id !== newer.id);
    }
  });
});
