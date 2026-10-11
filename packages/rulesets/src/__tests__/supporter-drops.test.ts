import { describe, expect, it } from 'vitest';
import { SUPPORTER_COSMETICS, SUPPORTER_MONTHLY_DROPS, supporterDropFor, supporterMonth } from '../supporter.js';

describe('supporter monthly drops', () => {
  it('keys each drop by a real month and gives it its own unlock key', () => {
    const keys = new Set<string>();
    for (const [month, drop] of Object.entries(SUPPORTER_MONTHLY_DROPS)) {
      expect(month, month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      expect(drop.key).toBe(`supporter-drop-${month}`);
      expect(drop.kind).toBe('TITLE_BADGE');
      expect(keys.has(drop.key)).toBe(false);
      expect(drop.key in SUPPORTER_COSMETICS).toBe(false);
      keys.add(drop.key);
    }
  });

  it('reads months in UTC and finds only months that have a drop', () => {
    expect(supporterMonth(new Date('2026-10-31T23:30:00-05:00'))).toBe('2026-11');
    expect(supporterDropFor('2026-10')?.name).toBe('Supporter · October 2026');
    expect(supporterDropFor('1999-01')).toBeUndefined();
  });
});
