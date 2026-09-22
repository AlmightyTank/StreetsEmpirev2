import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { classicOgV07E, classicOgV07G } from '@streets/rulesets';
import { EconomyLedgerService } from '../economy-ledger.service.js';

describe('economy ledger defaults', () => {
  it('records ordinary home-cash deltas with a player-facing source label', () => {
    expect(EconomyLedgerService.defaultForAction('STORE_BUY', 10_000n, 7_500n)).toEqual([
      { source: 'STORE_BUY', label: 'Store purchase', amountCents: -2_500n },
    ]);
    expect(EconomyLedgerService.defaultForAction('STORE_SELL', 7_500n, 9_000n)).toEqual([
      { source: 'STORE_SELL', label: 'Store sale', amountCents: 1_500n },
    ]);
  });

  it('does not count cash loaded into a run or an outpost as an expense', () => {
    expect(EconomyLedgerService.defaultForAction('RUN_LAUNCH', 10_000n, 2_000n)).toEqual([]);
    expect(EconomyLedgerService.defaultForAction('TURF_OUTPOST_TRANSFER', 10_000n, 2_000n)).toEqual([]);
  });

  it('does not create zero-value noise', () => {
    expect(EconomyLedgerService.defaultForAction('PAYOUT_CHANGE', 10_000n, 10_000n)).toEqual([]);
  });

  it('computes rolling summaries from aggregates rather than the visible row cap', async () => {
    const aggregate = vi.fn()
      .mockResolvedValueOnce({ _sum: { amountCents: 5_000n } })
      .mockResolvedValueOnce({ _sum: { amountCents: -2_000n } })
      .mockResolvedValueOnce({ _sum: { amountCents: 15_000n } })
      .mockResolvedValueOnce({ _sum: { amountCents: -4_000n } })
      .mockResolvedValueOnce({ _sum: { amountCents: 50_000n } })
      .mockResolvedValueOnce({ _sum: { amountCents: -12_000n } });
    const findMany = vi.fn().mockResolvedValue([{
      id: 'visible-row',
      source: 'STORE_SELL',
      label: 'Visible sale',
      amountCents: 1_000n,
      createdAt: new Date('2026-09-22T12:00:00.000Z'),
    }]);
    const prisma = { economyLedgerEntry: { aggregate, findMany } } as unknown as PrismaClient;

    const page = await EconomyLedgerService.page(
      prisma,
      'player-1',
      classicOgV07E,
      0,
      null,
      new Date('2026-09-22T12:00:00.000Z'),
    );

    expect(page?.windows).toEqual([
      { days: 1, incomeCents: 5_000, expenseCents: 2_000, netCents: 3_000 },
      { days: 7, incomeCents: 15_000, expenseCents: 4_000, netCents: 11_000 },
      { days: 30, incomeCents: 50_000, expenseCents: 12_000, netCents: 38_000 },
    ]);
    expect(aggregate).toHaveBeenCalledTimes(6);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    expect(page?.entries).toHaveLength(1);
  });


  it('extends itemized history only for the G Bookkeeping branch', async () => {
    const aggregate = vi.fn().mockResolvedValue({ _sum: { amountCents: 0n } });
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { economyLedgerEntry: { aggregate, findMany } } as unknown as PrismaClient;

    const bookkeeping = await EconomyLedgerService.page(
      prisma,
      'player-1',
      classicOgV07G,
      5,
      'BOOKKEEPING',
      new Date('2026-09-22T12:00:00.000Z'),
    );
    expect(bookkeeping?.historyDays).toBe(90);
    expect(bookkeeping?.specializationHooks.bookkeeping.active).toBe(true);
    expect(bookkeeping?.specializationHooks.connections.active).toBe(false);

    const connections = await EconomyLedgerService.page(
      prisma,
      'player-1',
      classicOgV07G,
      5,
      'CONNECTIONS',
      new Date('2026-09-22T12:00:00.000Z'),
    );
    expect(connections?.historyDays).toBe(60);
    expect(connections?.specializationHooks.connections.active).toBe(true);
  });

});
