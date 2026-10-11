import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { RoundAftermathQueryService } from '../round-aftermath-query.service.js';

describe('RoundAftermathQueryService.archive', () => {
  it('pages only closed rounds and never fabricates totals for unavailable legacy reports', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'round-ready',
        name: 'Golden Season',
        slug: 'golden-season',
        rulesetVersion: 'classic-1',
        startsAt: new Date('2025-01-01T00:00:00Z'),
        endsAt: new Date('2025-02-01T00:00:00Z'),
        aftermathReport: {
          status: 'READY',
          globalAggregate: {
            participants: 12,
            eligibleCompetitors: 10,
            citiesInRound: 4,
            finalNetWorthCents: '987654',
            finalCrewMembers: 21,
            playerHeldTurfBlocks: 8,
            activeBusinessesHeld: 6,
            crimeActions: 3,
          },
        },
      },
      {
        id: 'round-legacy',
        name: 'Old Season',
        slug: 'old-season',
        rulesetVersion: 'classic-0',
        startsAt: new Date('2024-01-01T00:00:00Z'),
        endsAt: new Date('2024-02-01T00:00:00Z'),
        aftermathReport: null,
      },
    ]);
    const count = vi.fn().mockResolvedValue(2);
    const prisma = { round: { findMany, count } } as unknown as PrismaClient;

    const archive = await RoundAftermathQueryService.archive(prisma, {
      page: 1,
      pageSize: 25,
      query: 'season',
      year: 2025,
      order: 'newest',
    });

    expect(archive.total).toBe(2);
    expect(archive.rounds[0]).toMatchObject({
      id: 'round-ready',
      reportStatus: 'READY',
      global: { participants: 12, finalNetWorthCents: '987654' },
    });
    expect(archive.rounds[1]).toMatchObject({
      id: 'round-legacy',
      reportStatus: 'UNAVAILABLE',
      global: null,
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { in: ['ENDED', 'ARCHIVED'] },
        endsAt: { gte: new Date('2025-01-01T00:00:00.000Z'), lt: new Date('2026-01-01T00:00:00.000Z') },
        AND: expect.arrayContaining([expect.objectContaining({ OR: expect.arrayContaining([{ name: { contains: 'season', mode: 'insensitive' } }]) })]),
      }),
      skip: 0,
      take: 25,
    }));
    expect(count).toHaveBeenCalledOnce();

    findMany.mockResolvedValueOnce([{
      id: 'round-legacy',
      name: 'Old Season',
      slug: 'old-season',
      rulesetVersion: 'classic-0',
      startsAt: new Date('2024-01-01T00:00:00Z'),
      endsAt: new Date('2024-02-01T00:00:00Z'),
      aftermathReport: null,
    }]);
    const unavailableArchive = await RoundAftermathQueryService.archive(prisma, {
      page: 1,
      pageSize: 25,
      reportStatus: 'UNAVAILABLE',
      order: 'oldest',
    });
    expect(unavailableArchive.rounds).toEqual([expect.objectContaining({ id: 'round-legacy', reportStatus: 'UNAVAILABLE', global: null })]);
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [expect.objectContaining({ OR: expect.arrayContaining([{ aftermathReport: { is: null } }]) })],
      }),
      orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
    }));
  });

  it('surfaces malformed READY report totals instead of returning a success-shaped empty summary', async () => {
    const prisma = {
      round: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'round-invalid',
          name: 'Invalid',
          slug: 'invalid',
          rulesetVersion: 'classic-1',
          startsAt: new Date('2025-01-01T00:00:00Z'),
          endsAt: new Date('2025-02-01T00:00:00Z'),
          aftermathReport: { status: 'READY', globalAggregate: { participants: 'unknown' } },
        }]),
        count: vi.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaClient;

    await expect(RoundAftermathQueryService.archive(prisma, {
      page: 1,
      pageSize: 25,
      order: 'newest',
    })).rejects.toMatchObject({ code: 'AFTERMATH_REPORT_INVALID' });
  });
});
