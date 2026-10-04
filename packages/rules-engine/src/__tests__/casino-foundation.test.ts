import { describe, expect, it } from 'vitest';
import { classicOgV11F, classicOgV12A, type Ruleset } from '@streets/rulesets';
import { calculateNetWorthCents, loadRuleset } from '../index.js';

const emptyPlayer = {
  cashCents: 0, whores: 0, thugs: 0, lowRiders: 0, medicine: 0, crack: 0,
  condoms: 0, beer: 0, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0,
};

describe('1.2.0-A casino foundation', () => {
  it('pins eight city venues without changing the 1.1 release ruleset', () => {
    expect((classicOgV11F as Ruleset).casino).toBeUndefined();
    expect(Object.keys(classicOgV12A.casino.venues)).toHaveLength(8);
    expect(classicOgV12A.casino.venues['las-vegas']?.kind).toBe('FULL_CASINO');
    expect(classicOgV12A.casino.venues['new-york-city']?.kind).toBe('UNDERGROUND');
    expect(loadRuleset('classic-og-v1.2-a', '1.2.0-A')).toBe(classicOgV12A);
  });

  it('values casino cash-equivalents like cash so cage transfers cannot change net worth', () => {
    const asCash = calculateNetWorthCents({ ...emptyPlayer, cashCents: 250_000 }, classicOgV12A);
    const asCasino = calculateNetWorthCents({ ...emptyPlayer, casinoNetWorthCents: 250_000 }, classicOgV12A);
    expect(asCasino).toBe(asCash);
  });

  it('keeps whole-dollar limits ordered and the session ceiling inside the cage ceiling', () => {
    const casino = classicOgV12A.casino;
    expect(casino.chipUnitCents).toBe(100);
    expect(casino.cashier.minExchangeCents).toBeLessThan(casino.cashier.maxExchangeCents);
    expect(casino.session.minBankrollCents).toBeGreaterThanOrEqual(casino.cashier.minExchangeCents);
    expect(casino.session.maxBankrollCents).toBeLessThanOrEqual(casino.cashier.maxExchangeCents);
  });
});
