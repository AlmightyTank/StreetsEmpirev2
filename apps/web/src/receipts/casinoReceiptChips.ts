import { formatCents, formatNumber } from '@streets/shared';
import type { CasinoBlackjackHandDto, CasinoRouletteSpinDto, CasinoSlotSpinDto } from '@streets/shared';
import { deltaChip, type ResultChip } from '../components/ActionDock.js';

export const CASINO_RECEIPT_LABELS = {
  wager: 'Wager',
  returned: 'Returned',
  winningLines: 'Winning lines',
  net: 'Net result',
  bankroll: 'Bankroll after',
} as const;

function moneyChip(label: string, value: number, tone: ResultChip['tone'] = 'muted'): ResultChip {
  return { key: label.toLowerCase().replaceAll(' ', '-'), label, text: formatCents(value), tone };
}

function netChip(value: number): ResultChip {
  return { ...deltaChip(CASINO_RECEIPT_LABELS.net, value, { money: true }), key: 'net-result' };
}

function bankrollChip(value: number): ResultChip {
  return moneyChip('Bankroll', value);
}

/** Casino receipts use positive amounts for wagers and returns; net shows the actual gain or loss. */
export function slotReceiptChips(spin: CasinoSlotSpinDto): ResultChip[] {
  return [
    spin.isFreeSpin
      ? { key: 'free-spin', label: 'Free spin', text: `${formatNumber(spin.freeSpinsRemainingAfter)} left`, tone: 'muted' }
      : moneyChip(CASINO_RECEIPT_LABELS.wager, spin.chargedWagerCents),
    ...(spin.payoutCents > 0 ? [moneyChip(CASINO_RECEIPT_LABELS.returned, spin.payoutCents, 'good')] : []),
    ...(spin.winningLines.length > 0 ? [{ key: 'winning-lines', label: CASINO_RECEIPT_LABELS.winningLines, text: formatNumber(spin.winningLines.length), tone: 'good' as const }] : []),
    netChip(spin.netCents),
    ...(spin.freeSpinsAwarded > 0 ? [{ key: 'free-spins-awarded', label: 'Free spins won', text: formatNumber(spin.freeSpinsAwarded), tone: 'good' as const }] : []),
    ...(spin.nearMiss && spin.payoutCents === 0 ? [{ key: 'near-miss', label: 'Near miss', text: spin.nearMiss.symbolLabel, tone: 'muted' as const }] : []),
    bankrollChip(spin.bankrollAfterCents),
  ];
}

function blackjackOutcomeLabel(outcome: string | null): string {
  if (!outcome) return '';
  if (outcome === 'BLACKJACK') return 'Blackjack';
  if (outcome === 'WIN') return 'Won';
  if (outcome === 'LOSE') return 'Lost';
  if (outcome === 'PUSH') return 'Push';
  return outcome;
}

export function blackjackReceiptChips(hand: CasinoBlackjackHandDto): ResultChip[] {
  return [
    moneyChip(CASINO_RECEIPT_LABELS.wager, hand.totalWagerCents),
    moneyChip(CASINO_RECEIPT_LABELS.returned, hand.totalReturnCents, hand.totalReturnCents > 0 ? 'good' : 'muted'),
    netChip(hand.netCents),
    { key: 'dealer', label: 'Dealer total', text: hand.dealerTotal === null ? '—' : formatNumber(hand.dealerTotal), tone: 'muted' },
    ...hand.playerHands.map((playerHand) => ({
      key: `hand-${playerHand.index}`,
      label: hand.playerHands.length > 1 ? `Hand ${formatNumber(playerHand.index + 1)}` : 'Your hand',
      text: `${formatNumber(playerHand.total)}${playerHand.outcome ? ` · ${blackjackOutcomeLabel(playerHand.outcome)}` : ''}`,
      tone: playerHand.outcome === 'WIN' || playerHand.outcome === 'BLACKJACK' ? 'good' as const : playerHand.outcome === 'PUSH' ? 'muted' as const : 'bad' as const,
    })),
    bankrollChip(hand.bankrollAfterCents),
  ];
}

export function rouletteReceiptChips(spin: CasinoRouletteSpinDto): ResultChip[] {
  return [
    moneyChip(CASINO_RECEIPT_LABELS.wager, spin.wagerCents),
    moneyChip(CASINO_RECEIPT_LABELS.returned, spin.returnCents, spin.returnCents > 0 ? 'good' : 'muted'),
    netChip(spin.netCents),
    { key: 'pocket', label: 'Winning pocket', text: spin.pocket, tone: 'muted' },
    bankrollChip(spin.bankrollAfterCents),
  ];
}
