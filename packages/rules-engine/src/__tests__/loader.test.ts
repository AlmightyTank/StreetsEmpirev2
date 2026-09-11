import { describe, expect, it } from 'vitest';
import { classicOgV01, type Ruleset } from '@streets/rulesets';
import { regenerateTurns } from '../calculations/turns.js';
import { calculateNetWorthCents } from '../calculations/net-worth.js';
import {
  loadRuleset,
  loadRulesetForRound,
  RulesetNotFoundError,
  RulesetVersionMismatchError,
  isKnownRulesetId,
  listRulesets,
} from '../loader.js';

describe('ruleset loader', () => {
  it('loads the classic ruleset by id', () => {
    expect(loadRuleset('classic-og-v0.1')).toBe(classicOgV01);
  });

  it('accepts a matching pinned version', () => {
    expect(loadRuleset('classic-og-v0.1', '0.1.0')).toBe(classicOgV01);
  });

  it('refuses to silently play by different numbers', () => {
    expect(() => loadRuleset('classic-og-v0.1', '0.2.0')).toThrow(
      RulesetVersionMismatchError,
    );
  });

  it('rejects an unknown ruleset', () => {
    expect(() => loadRuleset('classic-og-v9.9')).toThrow(RulesetNotFoundError);
  });

  it('loads the ruleset a round was created with', () => {
    const round = { rulesetId: 'classic-og-v0.1', rulesetVersion: '0.1.0' };
    expect(loadRulesetForRound(round)).toBe(classicOgV01);
  });

  it('knows which ids it can serve', () => {
    expect(isKnownRulesetId('classic-og-v0.1')).toBe(true);
    expect(isKnownRulesetId('nope')).toBe(false);
    expect(listRulesets()).toHaveLength(4);
  });
});

describe('classic-og-v0.1 contents', () => {
  it('carries every section of the ruleset', () => {
    for (const key of [
      'round',
      'turns',
      'economy',
      'happiness',
      'scouting',
      'production',
      'stores',
      'weapons',
      'rankings',
      'evidence',
    ] as const) {
      expect(classicOgV01[key]).toBeDefined();
    }
  });

  it('holds the starting resources from section 11', () => {
    expect(classicOgV01.round.startingPlayer).toMatchObject({
      cashCents: 500_000,
      turns: 200,
      whores: 1,
      thugs: 1,
      condoms: 250,
      medicine: 0,
      crack: 100,
      beer: 10,
      lowRiders: 0,
      payoutPercent: 50,
    });
  });

  it('regenerates two turns every ten minutes up to two hundred', () => {
    expect(classicOgV01.turns).toMatchObject({
      amountPerInterval: 2,
      intervalMinutes: 10,
      cap: 200,
    });
    expect(classicOgV01.turns.awayBonus).toMatchObject({
      enabled: true,
      afterHours: 6,
      amount: 6,
    });
  });

  it('keeps store prices in cents, with sell prices below buy prices', () => {
    for (const store of Object.values(classicOgV01.stores)) {
      for (const item of Object.values(store.items)) {
        expect(item.buyCents).toBeGreaterThan(0);
        expect(Number.isInteger(item.buyCents)).toBe(true);
        if (item.sellCents !== null) {
          expect(item.sellCents).toBeLessThan(item.buyCents);
        }
      }
    }
  });

  it('sells crack for exactly its net worth value', () => {
    expect(classicOgV01.stores.PIP.items.CRACK.sellCents).toBe(
      classicOgV01.economy.netWorth.perCrackCents,
    );
  });

  it('ships nothing PvP related as enabled', () => {
    expect(classicOgV01.evidence.enabled).toBe(false);
    expect(classicOgV01.turns.reserveTurns.enabled).toBe(false);
    expect(classicOgV01.turns.purchasedTurns.enabled).toBe(false);
  });
});

describe('the ruleset contract', () => {
  /**
   * The point of declaring Ruleset rather than deriving it from the classic
   * numbers: a second ruleset must be able to carry different values and still
   * flow through every calculator.
   */
  const brisk: Ruleset = {
    ...classicOgV01,
    meta: { id: 'brisk-test', version: '9.9.9', name: 'Brisk' },
    turns: { ...classicOgV01.turns, amountPerInterval: 5, cap: 500 },
    economy: {
      ...classicOgV01.economy,
      netWorth: { ...classicOgV01.economy.netWorth, perWhoreCents: 1_000_000 },
    },
  };

  it('regenerates at the variant rate and cap', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    const result = regenerateTurns(
      { turns: 490, lastTurnCalculationAt: base },
      new Date(base.getTime() + 40 * 60 * 1000),
      brisk,
    );

    expect(result.turns).toBe(500);
    expect(result.turnCap).toBe(500);
  });

  it('values resources at the variant prices', () => {
    const worth = calculateNetWorthCents(
      {
        cashCents: 0, whores: 3, thugs: 0, lowRiders: 0, medicine: 0, crack: 0,
        condoms: 0, beer: 0, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0,
      },
      brisk,
    );
    expect(worth).toBe(3_000_000n);
  });
});
