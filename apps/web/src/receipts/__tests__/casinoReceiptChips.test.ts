import { describe, expect, it } from 'vitest';
import type { CasinoBlackjackHandDto, CasinoRouletteSpinDto, CasinoSlotSpinDto } from '@streets/shared';
import { blackjackReceiptChips, CASINO_RECEIPT_LABELS, rouletteReceiptChips, slotReceiptChips } from '../casinoReceiptChips.js';

const slot = (overrides: Partial<CasinoSlotSpinDto> = {}): CasinoSlotSpinDto => ({
  actionId: 'spin-1', machineKey: 'classic', machineName: 'Classic Slots', betPerLineCents: 500,
  activePaylineKeys: ['center'], wagerCents: 10_000, chargedWagerCents: 10_000, isFreeSpin: false,
  payoutCents: 12_000, netCents: 2_000, payoutBps: 12_000, grid: [], reelStops: [],
  winningLines: [{ paylineKey: 'center', paylineName: 'Center line', symbolKey: 'BAR', symbolLabel: 'Bar', matchCount: 3, payoutCents: 12_000, positions: [] }],
  nearMiss: null, winTier: 'SMALL', jackpotContributionCents: 0, jackpotAwardCents: 0,
  freeSpinsAwarded: 0, freeSpinsRemainingAfter: 0, bankrollAfterCents: 112_000, createdAt: '',
  ...overrides,
});

const blackjack = (overrides: Partial<CasinoBlackjackHandDto> = {}): CasinoBlackjackHandDto => ({
  id: 'hand-1', tableKey: 'low', tableName: 'Low Limit', status: 'SETTLED', dealerCards: [], dealerTotal: 18,
  dealerSoft: false,
  playerHands: [{ index: 0, cards: [], total: 20, soft: false, status: 'DONE', wagerCents: 10_000, outcome: 'WIN', returnCents: 20_000, canHit: false, canStand: false, canDouble: false, canSplit: false }],
  activeHandIndex: 0, totalWagerCents: 10_000, totalReturnCents: 20_000, netCents: 10_000,
  bankrollAfterCents: 110_000, shoeRemainingCards: 20, shuffleNumber: 1, createdAt: '', settledAt: '',
  ...overrides,
});

const roulette = (overrides: Partial<CasinoRouletteSpinDto> = {}): CasinoRouletteSpinDto => ({
  actionId: 'roulette-1', tableKey: 'american', tableName: 'American Wheel', wheel: 'AMERICAN', pocket: '7', color: 'RED',
  bets: [], wagerCents: 10_000, returnCents: 20_000, netCents: 10_000, bankrollAfterCents: 110_000, createdAt: '',
  ...overrides,
});

describe('casino action receipt labels', () => {
  it('uses one clear vocabulary across every casino receipt', () => {
    expect(CASINO_RECEIPT_LABELS).toEqual({
      wager: 'Wager',
      returned: 'Returned',
      winningLines: 'Winning lines',
      net: 'Net result',
      bankroll: 'Bankroll after',
    });
  });

  it('shows a slot wager, returned payout, winning lines, and net as distinct values', () => {
    const chips = slotReceiptChips(slot());
    expect(chips.slice(0, 4).map(({ label, text }) => [label, text])).toEqual([
      ['Wager', '$100'],
      ['Returned', '$120'],
      ['Winning lines', '1'],
      ['Net result', '+$20'],
    ]);
    expect(chips[0]?.tone).toBe('muted');
    expect(chips[1]?.tone).toBe('good');
  });

  it('labels a comped slot spin without showing a false cash stake', () => {
    const chips = slotReceiptChips(slot({
      isFreeSpin: true, chargedWagerCents: 0, payoutCents: 0, netCents: 0,
      winningLines: [], freeSpinsRemainingAfter: 2, bankrollAfterCents: 100_000,
    }));
    expect(chips[0]).toMatchObject({ label: 'Free spin', text: '2 left' });
    expect(chips.some(({ label }) => label === 'Wager')).toBe(false);
    expect(chips.some(({ label }) => label === 'Paid' || label === 'Lines hit' || label === 'Floor')).toBe(false);
  });

  it('uses explicit total, hand, net, and bankroll labels for blackjack', () => {
    expect(blackjackReceiptChips(blackjack()).map(({ label, text }) => [label, text])).toEqual([
      ['Wager', '$100'],
      ['Returned', '$200'],
      ['Net result', '+$100'],
      ['Dealer total', '18'],
      ['Your hand', '20 · Won'],
      ['Bankroll', '$1,100'],
    ]);
  });

  it('shows roulette wager and return separately from net winnings', () => {
    expect(rouletteReceiptChips(roulette()).map(({ label, text }) => [label, text])).toEqual([
      ['Wager', '$100'],
      ['Returned', '$200'],
      ['Net result', '+$100'],
      ['Winning pocket', '7'],
      ['Bankroll', '$1,100'],
    ]);
  });
});
