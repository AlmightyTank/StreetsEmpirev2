import { describe, expect, it } from 'vitest';
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
});
