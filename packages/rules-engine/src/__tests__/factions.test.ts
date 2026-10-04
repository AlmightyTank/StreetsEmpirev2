import { describe, expect, it } from 'vitest';
import { classicOgV14B } from '@streets/rulesets';
import { addStanding, factionTier, factionTierName, nextFactionTier, standingFromRep } from '../calculations/factions.js';

const rules = classicOgV14B.factionStanding;

describe('1.4.0-B faction standing', () => {
  it('reaches each tier exactly at its line', () => {
    expect([0, 24, 25, 74, 75, 149, 150, 299, 300, 500].map((points) => factionTier(points, rules))).toEqual([
      'UNKNOWN', 'UNKNOWN', 'KNOWN', 'KNOWN', 'TRUSTED', 'TRUSTED', 'CONNECTED', 'CONNECTED', 'INNER_CIRCLE', 'INNER_CIRCLE',
    ]);
    expect(factionTierName('INNER_CIRCLE')).toBe('Inner Circle');
  });

  it('names the next tier and where it starts, until the top', () => {
    expect(nextFactionTier(0, rules)).toEqual({ tier: 'KNOWN', startsAt: 25 });
    expect(nextFactionTier(160, rules)).toEqual({ tier: 'INNER_CIRCLE', startsAt: 300 });
    expect(nextFactionTier(300, rules)).toBeNull();
  });

  it('keeps standing between 0 and the max', () => {
    expect(addStanding(490, 40, rules)).toBe(500);
    expect(addStanding(10, -40, rules)).toBe(0);
  });

  it('pays standing only for reputation gained, at the ruleset rate', () => {
    expect(standingFromRep(15, rules)).toBe(15);
    expect(standingFromRep(0, rules)).toBe(0);
    expect(standingFromRep(-10, rules)).toBe(0);
  });
});
