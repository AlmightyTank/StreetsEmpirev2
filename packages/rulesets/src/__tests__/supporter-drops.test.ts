import { describe, expect, it } from 'vitest';
import { SUPPORTER_COSMETICS, SUPPORTER_MONTHLY_DROPS, supporterDropFor, supporterMonth } from '../supporter.js';

describe('supporter monthly drops', () => {
  it('keys each bundle by a real month and gives every item its own unlock key', () => {
    const keys = new Set<string>();
    for (const [month, bundle] of Object.entries(SUPPORTER_MONTHLY_DROPS)) {
      expect(month, month).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      expect(bundle.length, month).toBeGreaterThan(0);
      expect(bundle.length, month).toBeLessThanOrEqual(3);
      for (const drop of bundle) {
        expect(drop.key === `supporter-drop-${month}` || drop.key.startsWith(`supporter-drop-${month}-`), drop.key).toBe(true);
        expect(drop.kind).toBe('TITLE_BADGE');
        expect(keys.has(drop.key)).toBe(false);
        expect(drop.key in SUPPORTER_COSMETICS).toBe(false);
        keys.add(drop.key);
      }
    }
  });

  it('reads months in UTC and finds only months that have a drop', () => {
    expect(supporterMonth(new Date('2026-10-31T23:30:00-05:00'))).toBe('2026-11');
    expect(supporterDropFor('2026-10')?.[0]?.name).toBe('Supporter · October 2026');
    expect(supporterDropFor('1999-01')).toBeUndefined();
  });
});
