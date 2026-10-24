import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { classicOgV16H } from '@streets/rulesets';
import { profitClassificationForSource, projectProfitGroups, ProfitIntelligenceService } from '../profit-intelligence.service.js';

describe('profit intelligence source projection', () => {
  it('classifies audited sources and labels newly seen sources unknown', () => {
    expect(profitClassificationForSource('DEALER_SALES')).toBe('OPERATING_INCOME');
    expect(profitClassificationForSource('LOAN_PRINCIPAL')).toBe('FINANCING_REPAYMENT');
    expect(profitClassificationForSource('RAID')).toBe('PLAYER_TRANSFER');
    expect(profitClassificationForSource('FUTURE_UNMAPPED_SOURCE')).toBe('UNKNOWN');
  });

  it('groups only validated city slugs and reconciles every ledger row', () => {
    const result = projectProfitGroups({
      groups: [
        { day: '2026-10-10', source: 'DEALER_SALES', citySlug: 'chicago', entryCount: '2', inflowCents: '900', outflowCents: '0', netCents: '900' },
        { day: '2026-10-10', source: 'NEW_SOURCE', citySlug: 'not-a-city', entryCount: '1', inflowCents: '0', outflowCents: '75', netCents: '-75' },
        { day: '2026-10-10', source: 'NEW_SOURCE', citySlug: null, entryCount: '1', inflowCents: '20', outflowCents: '0', netCents: '20' },
      ],
      ledger: { entryCount: 4, netCents: 845n },
      ruleset: classicOgV07E,
      roundId: 'round-1',
      generatedAt: new Date('2026-10-10T12:00:00.000Z'),
      period: { from: new Date('2026-10-01T12:00:00.000Z'), to: new Date('2026-10-10T12:00:00.000Z'), days: 30 },
    });
    expect(result.reconciliation).toMatchObject({ matches: true, ledgerEntryCount: 4, projectedEntryCount: 4, varianceCents: '0' });
    expect(result.byCity.find((row) => row.citySlug === 'chicago')?.netCents).toBe('900');
    expect(result.byCity.find((row) => row.citySlug === null)?.entryCount).toBe(2);
    expect(result.dataQuality).toEqual({ unknownSourceEntries: 2, unattributedCityEntries: 2 });
  });

  it('rejects unsupported report windows before hitting the database', async () => {
    const $transaction = vi.fn();
    const prisma = { $transaction } as unknown as PrismaClient;
    await expect(ProfitIntelligenceService.get(prisma, {
      roundId: 'round-1', roundPlayerId: 'player-1',
      roundStartsAt: new Date('2026-10-01T00:00:00.000Z'),
      ruleset: classicOgV07E, days: 91, now: new Date('2026-10-10T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'INVALID_REPORT_PERIOD' });
    expect($transaction).not.toHaveBeenCalled();
  });
});
