import { describe, expect, it } from 'vitest';
import type { LoanAccountDto, LoanCollectionsDto } from '@streets/shared';
import { standingNotice } from './LoanSharkPage.js';

const account = (collectionState: LoanAccountDto['collectionState'], recoveryNeeded = 0): LoanAccountDto => ({
  debtCents: 9_750_000, debtCeilingCents: 15_000_000, availableCents: 5_250_000, feesAssessedCents: 0, feeCapCents: 1_500_000, collectionState, recoveryNeeded,
});
const collections: LoanCollectionsDto = {
  missedInstallments: 1, missedInstallmentsThreshold: 2, garnishPercent: 25, garnishCapPerDayCents: 2_500_000,
  garnishedLast24hCents: 100_000, garnishRoomCents: 2_400_000, garnishSources: ['street work', 'dealer sales', 'business income'], recoveryOnTimeInstallments: 2,
};

describe('1.6.5-E standing notice', () => {
  it('says what changes and how to get out, for every standing', () => {
    expect(standingNotice({ account: account('CLEAR'), collections, overdueCents: 0, payoffTotalCents: 0 })).toBeNull();
    const behind = standingNotice({ account: account('DELINQUENT'), collections, overdueCents: 600_000, payoffTotalCents: 0 })!;
    expect(behind.tone).toBe('warning');
    expect(behind.text).toContain('$6,000 is overdue');
    expect(behind.text).toContain('Miss 2 installments at once (you have missed 1)');
    expect(behind.text).toContain('25% of what you earn from street work, dealer sales and business income, up to $25,000 a day');
    const deep = standingNotice({ account: account('COLLECTIONS'), collections, overdueCents: 600_000, payoffTotalCents: 0 })!;
    expect(deep.tone).toBe('error');
    expect(deep.text).toContain('($1,000 in the last 24 hours)');
    expect(deep.text).toContain('stops the moment everything overdue ($6,000) is paid');
    const back = standingNotice({ account: account('RECOVERING', 1), collections, overdueCents: 0, payoffTotalCents: 3_200_000 })!;
    expect(back).toEqual({ tone: 'info', text: 'Overdue cleared, and nothing more is being garnished. Pay 1 more installment on time, or pay off everything ($32,000), and the loan shark will lend again.' });
  });

  it('keeps the plain overdue warning where there are no collections rules', () => {
    expect(standingNotice({ account: account('DELINQUENT'), collections: null, overdueCents: 600_000, payoffTotalCents: 0 })?.text).toContain('You are behind: $6,000 is overdue.');
    expect(standingNotice({ account: account('CLEAR'), collections: null, overdueCents: 0, payoffTotalCents: 0 })).toBeNull();
  });
});
