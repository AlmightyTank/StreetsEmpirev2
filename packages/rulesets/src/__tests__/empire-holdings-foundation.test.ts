import { describe, expect, it } from 'vitest';
import { classicOgV18S, classicOgV30A, rulesets } from '../index.js';
import { cityHoldingsEnabled } from '../classic-og-v3.0-a/index.js';

describe('3.0-A holdings ruleset foundation', () => {
  it('inherits the entire 1.8-S game without changing existing catalogs or historical rules', () => {
    const { meta: _oldMeta, ...oldRules } = classicOgV18S;
    const { meta: _newMeta, cityHoldings, ...newRules } = classicOgV30A;
    expect(newRules).toEqual(oldRules);
    expect(cityHoldings.modifiers).toEqual({ dealerSalesPace: 1, demand: 1, upkeep: 1 });
    expect(classicOgV18S).not.toHaveProperty('cityHoldings');
    expect(rulesets[classicOgV30A.meta.id]).toBe(classicOgV30A);
    expect(rulesets[classicOgV18S.meta.id]).toBe(classicOgV18S);
    expect(cityHoldingsEnabled(classicOgV18S)).toBe(false);
    expect(cityHoldingsEnabled(classicOgV30A)).toBe(true);
  });
});
