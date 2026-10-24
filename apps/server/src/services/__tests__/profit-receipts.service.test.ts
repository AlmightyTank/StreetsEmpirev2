import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { classicOgV16H } from '@streets/rulesets';
import { ProfitIntelligenceService } from '../profit-intelligence.service.js';

const base = {
  roundPlayerId: 'player-1',
  roundStartsAt: new Date('2026-01-01T00:00:00.000Z'),
  ruleset: classicOgV16H,
  days: 30,
  now: new Date('2026-10-20T00:00:00.000Z'),
};

describe('profit intelligence receipt drilldown', () => {
  it('returns a bounded page with a stable next cursor and string cents', async () => {
    const rows = [
      { id: 'receipt-2', at: new Date('2026-10-19T12:00:00.000Z'), source: 'BUSINESS_INCOME', label: 'Collection', amountCents: '250', citySlug: 'chicago' },
      { id: 'receipt-1', at: new Date('2026-10-19T11:00:00.000Z'), source: 'BUSINESS_INCOME', label: 'Collection', amountCents: '-50', citySlug: null },
    ];
    const queryRaw = vi.fn(async () => rows);
    const result = await ProfitIntelligenceService.receipts({ $queryRaw: queryRaw } as unknown as PrismaClient, {
      ...base, source: 'BUSINESS_INCOME', citySlug: 'chicago', limit: 1,
    });

    expect(result).toEqual({ receipts: [ { ...rows[0], at: rows[0]!.at.toISOString() } ], nextCursor: 'receipt-2', limit: 1 });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('keeps an invalid cursor from changing the selected player or filters', async () => {
    const queryRaw = vi.fn(async () => []);
    await expect(ProfitIntelligenceService.receipts({ $queryRaw: queryRaw } as unknown as PrismaClient, {
      ...base, source: 'BUSINESS_INCOME', citySlug: 'chicago', cursor: 'forged-cursor', limit: 50,
    })).rejects.toMatchObject({ code: 'INVALID_RECEIPT_CURSOR' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('validates the city filter before querying receipts', async () => {
    const queryRaw = vi.fn();
    await expect(ProfitIntelligenceService.receipts({ $queryRaw: queryRaw } as unknown as PrismaClient, {
      ...base, citySlug: 'not-a-round-city', limit: 50,
    })).rejects.toMatchObject({ code: 'INVALID_REPORT_CITY' });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
