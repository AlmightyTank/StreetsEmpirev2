import { describe, expect, it } from 'vitest';
import { validatePayoutPercent } from '../calculations/payout.js';

describe('validatePayoutPercent', () => {
  // Section 53: accept 1 and 99.
  it.each([1, 35, 50, 99])('accepts %i', (percent) => {
    const result = validatePayoutPercent(percent);
    expect(result.ok).toBe(true);
  });

  // Section 53: reject 0, 100 and -1.
  it.each([0, 100, -1, 1000])('rejects %i', (percent) => {
    const result = validatePayoutPercent(percent);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('between 1% and 99%');
  });

  it.each([1.5, Number.NaN, '35', null, undefined])(
    'rejects non-integer input %o',
    (percent) => {
      const result = validatePayoutPercent(percent);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('whole percentage');
    },
  );
});
