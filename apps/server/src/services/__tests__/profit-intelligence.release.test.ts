import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { classicOgV16H } from '@streets/rulesets';
import { ProfitIntelligenceService, projectProfitGroups } from '../profit-intelligence.service.js';

const roundStartsAt = new Date('2026-01-01T00:00:00.000Z');
const frozenAt = new Date('2026-10-20T12:00:00.000Z');
const playerId = 'round-player-release-fixture';

function transactionFixture(input: {
  groups: Array<{ source: string; day: string; citySlug: string | null; entryCount: string; inflowCents: string; outflowCents: string; netCents: string }>;
  entryCount: number;
  netCents: bigint;
}) {
  const aggregate = vi.fn(async () => ({ _count: { _all: input.entryCount }, _sum: { amountCents: input.netCents } }));
  const tx = {
    $queryRaw: vi.fn(async () => input.groups),
    economyLedgerEntry: { aggregate },
    run: { findMany: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]) },
    business: { findMany: vi.fn().mockResolvedValue([]) },
    citySighting: { findMany: vi.fn().mockResolvedValue([]) },
    bossTrip: { findMany: vi.fn().mockResolvedValue([]) },
    roundPlayer: { findUniqueOrThrow: vi.fn().mockResolvedValue({ cashCents: 0n }) },
    profitIntelligenceGoal: { findUnique: vi.fn().mockResolvedValue(null) },
    supplyStock: { findMany: vi.fn().mockResolvedValue([]) },
    dealerStock: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const transactionOptions: unknown[] = [];
  const $transaction = vi.fn(async (callback: (client: unknown) => unknown, options: unknown) => {
    transactionOptions.push(options);
    return await callback(tx);
  });
  return { tx, aggregate, $transaction, transactionOptions, prisma: { $transaction } as unknown as PrismaClient };
}

describe('profit intelligence release gates', () => {
  it('holds a selected reporting window fixed and reads it from one repeatable snapshot', async () => {
    const from = new Date(frozenAt.getTime() - 30 * 86_400_000);
    const groups = [{ source: 'DEALER_SALES', day: '2026-10-19', citySlug: 'chicago', entryCount: '2', inflowCents: '12500', outflowCents: '0', netCents: '12500' }];
    const { tx, aggregate, transactionOptions, prisma } = transactionFixture({ groups, entryCount: 2, netCents: 12_500n });
    const report = await ProfitIntelligenceService.get(prisma, {
      roundId: 'round-1', roundPlayerId: playerId, roundStartsAt, ruleset: classicOgV16H, days: 30, now: frozenAt,
    });

    expect(report.period).toEqual({ from: from.toISOString(), to: frozenAt.toISOString(), days: 30 });
    expect(report.reconciliation.matches).toBe(true);
    expect(aggregate).toHaveBeenCalledWith({
      where: { roundPlayerId: playerId, createdAt: { gte: from, lt: frozenAt } },
      _sum: { amountCents: true }, _count: { _all: true },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transactionOptions).toEqual([{ isolationLevel: 'RepeatableRead' }]);
  });

  it('reports a count or cents mismatch instead of masking reconciliation drift', () => {
    const report = projectProfitGroups({
      groups: [{ source: 'DEALER_SALES', day: '2026-10-19', citySlug: 'chicago', entryCount: '3', inflowCents: '1000', outflowCents: '0', netCents: '1000' }],
      ledger: { entryCount: 4, netCents: 999n }, ruleset: classicOgV16H, roundId: 'round-1', generatedAt: frozenAt,
      period: { from: roundStartsAt, to: frozenAt, days: 30 },
    });
    expect(report.reconciliation).toMatchObject({
      matches: false, ledgerEntryCount: 4, projectedEntryCount: 3,
      ledgerNetCents: '999', projectedNetCents: '1000', varianceCents: '1',
    });
  });

  it('reconciles a high-volume fixture while leaving unsupported source and city history explicitly unknown', () => {
    const citySlugs = Object.keys(classicOgV16H.cities ?? {});
    const sources = ['DEALER_SALES', 'DEALER_WAGES', 'STORE_BUY', 'UNMAPPED_LEGACY_SOURCE'];
    const grouped = new Map<string, { source: string; day: string; citySlug: string | null; entryCount: bigint; inflowCents: bigint; outflowCents: bigint; netCents: bigint }>();
    let ledgerNet = 0n;
    let ledgerCount = 0;

    // Model 100,000 ledger receipts reduced by PostgreSQL to the bounded report buckets.
    for (let index = 0; index < 100_000; index++) {
      const amount = index % 3 === 0 ? -BigInt((index % 701) + 1) : BigInt((index % 1301) + 1);
      const source = sources[index % sources.length]!;
      const citySlug = index % 11 === 0 ? null : citySlugs[index % citySlugs.length] ?? null;
      const day = new Date(Date.UTC(2026, 9, 1 + (index % 20))).toISOString().slice(0, 10);
      const key = `${day}|${source}|${citySlug ?? ''}`;
      const bucket = grouped.get(key) ?? { source, day, citySlug, entryCount: 0n, inflowCents: 0n, outflowCents: 0n, netCents: 0n };
      bucket.entryCount++;
      if (amount > 0n) bucket.inflowCents += amount;
      else bucket.outflowCents += -amount;
      bucket.netCents += amount;
      grouped.set(key, bucket);
      ledgerCount++;
      ledgerNet += amount;
    }

    const report = projectProfitGroups({
      groups: [...grouped.values()].map((row) => ({
        source: row.source, day: row.day, citySlug: row.citySlug,
        entryCount: row.entryCount.toString(), inflowCents: row.inflowCents.toString(),
        outflowCents: row.outflowCents.toString(), netCents: row.netCents.toString(),
      })),
      ledger: { entryCount: ledgerCount, netCents: ledgerNet }, ruleset: classicOgV16H,
      roundId: 'round-1', generatedAt: frozenAt,
      period: { from: roundStartsAt, to: frozenAt, days: 30 },
    });

    expect(report.byDaySourceCity.length).toBeLessThanOrEqual(20 * sources.length * (citySlugs.length + 1));
    expect(report.reconciliation).toMatchObject({ matches: true, ledgerEntryCount: 100_000, projectedEntryCount: 100_000, varianceCents: '0' });
    expect(report.dataQuality.unknownSourceEntries).toBeGreaterThan(0);
    expect(report.dataQuality.unattributedCityEntries).toBeGreaterThan(0);
    expect(report.bySource.find((row) => row.source === 'UNMAPPED_LEGACY_SOURCE')?.classification).toBe('UNKNOWN');
    expect(report.byCity.find((row) => row.citySlug === null)?.attribution).toBe('UNKNOWN_CITY');
  });
});
