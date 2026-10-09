import { describe, expect, it } from 'vitest';
import type { ActivityDto } from '@streets/shared';
import { describeActivity } from '../ActivityFeed.js';
import { gameEventToastFor } from '../GameEventToasts.js';
import { parseDollars, paymentRequestCents } from '../LoanPaymentPanel.js';

function activity(type: ActivityDto['type'], payload: Record<string, unknown>): ActivityDto {
  return { id: `${type}-1`, type, payload, createdAt: '2026-10-09T12:00:00.000Z' };
}

describe('1.6.5-D loan payment amounts', () => {
  it('reads dollars typed by a player as whole cents', () => {
    expect(parseDollars('2500')).toBe(250_000);
    expect(parseDollars('$2,500.5')).toBe(250_050);
    expect(parseDollars(' 12.34 ')).toBe(1_234);
    for (const bad of ['', '0', '0.00', '-5', '1.234', 'abc', '1e5']) expect(parseDollars(bad)).toBeNull();
  });

  it('asks for what each choice means, and a payoff for its held ceiling', () => {
    const loan = { overdueCents: 400_000, payoffCents: 1_037_500, nextDueCents: 575_000 };
    expect(paymentRequestCents('OVERDUE', loan, null, null)).toBe(400_000);
    expect(paymentRequestCents('NEXT', loan, null, null)).toBe(575_000);
    expect(paymentRequestCents('PAYOFF', loan, null, 1_038_000)).toBe(1_038_000);
    expect(paymentRequestCents('PAYOFF', loan, null, null)).toBe(1_037_500);
    expect(paymentRequestCents('CUSTOM', loan, 12_345, null)).toBe(12_345);
    expect(paymentRequestCents('OVERDUE', { ...loan, overdueCents: 0 }, null, null)).toBeNull();
  });
});

describe('1.6.5-D loan activity', () => {
  it('describes loans, payments and missed installments in the feed', () => {
    expect(describeActivity(activity('LOAN_TAKEN', { offerName: 'Quick Cash', principalCents: 1_000_000, obligationCents: 1_150_000, installments: 2, debtAfterCents: 1_150_000 }), 'crack')).toEqual({
      text: 'Borrowed $10,000 from the loan shark (Quick Cash).',
      detail: '$11,500 to pay back in 2 installments · you owe $11,500',
    });
    expect(describeActivity(activity('LOAN_PAYMENT', {
      kind: 'MANUAL', offerName: 'Quick Cash', paidCents: 1_037_500, contractFeeCents: 37_500, principalCents: 1_000_000, contractFeeWaivedCents: 112_500, paidOff: true, debtAfterCents: 0,
    }), 'crack')).toEqual({
      text: 'You paid the loan shark $10,375 on your Quick Cash, paying it off.',
      detail: '$375 fee · $10,000 principal · $1,125 unearned fee waived · you owe $0',
    });
    expect(describeActivity(activity('LOAN_PAYMENT', { kind: 'SCHEDULED', offerName: 'Quick Cash', paidCents: 575_000, contractFeeCents: 75_000, principalCents: 500_000, debtAfterCents: 575_000 }), 'crack').text)
      .toBe('The loan shark collected $5,750 on your Quick Cash.');
    expect(describeActivity(activity('LOAN_INSTALLMENT_MISSED', {
      offerName: 'Quick Cash', sequence: 1, dueCents: 575_000, collectedCents: 100_000, shortCents: 475_000, lateFeeCents: 250_000, debtAfterCents: 1_300_000,
    }), 'crack')).toEqual({
      text: 'You missed installment 1 on your Quick Cash · $1,000 of $5,750 collected.',
      detail: '$2,500 late fee added · $4,750 still overdue · you owe $13,000',
    });
  });

  it('raises a toast for a missed installment, and only that', () => {
    expect(gameEventToastFor(activity('LOAN_INSTALLMENT_MISSED', { offerName: 'Quick Cash', sequence: 1, shortCents: 1, lateFeeCents: 0, debtAfterCents: 1 }), 'crack'))
      .toMatchObject({ title: 'Loan installment missed', tone: 'bad', href: '/game/loans' });
    expect(gameEventToastFor(activity('LOAN_PAYMENT', { kind: 'SCHEDULED' }), 'crack')).toBeNull();
  });
});
