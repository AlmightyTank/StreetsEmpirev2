import { describe, expect, it } from 'vitest';
import {
  calculateThugHappiness,
  calculateWhoreHappiness,
  explainThugHappiness,
  explainWhoreHappiness,
} from '../calculations/happiness.js';

const noWeapons = { pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };

/**
 * Happiness is a pure reading of the player's current state. Nothing
 * accumulates, so every input here is something a player can change on their
 * next action - there is no stored condition to wait out.
 */
describe('calculateThugHappiness', () => {
  // Section 20, frozen: clamp(100 - missingBeer - missingWeapons, 0, 100)
  it('is 100 when every thug has a beer and a gun', () => {
    expect(
      calculateThugHappiness({ thugs: 100, beer: 100, ...noWeapons, pistols: 100 }),
    ).toBe(100);
  });

  // Section 53: 100 thugs, 90 beer, 80 guns = 70
  it('drops one point per missing beer and one per missing gun', () => {
    expect(
      calculateThugHappiness({ thugs: 100, beer: 90, ...noWeapons, pistols: 80 }),
    ).toBe(70);
  });

  it('counts every weapon type towards arming the crew', () => {
    expect(
      calculateThugHappiness({
        thugs: 100,
        beer: 100,
        pistols: 40,
        shotguns: 30,
        tek9s: 20,
        ak47s: 10,
      }),
    ).toBe(100);
  });

  /** The frozen formula has exactly two terms. Nothing may be added to it. */
  it('depends on nothing but beer and guns', () => {
    const armed = { thugs: 10, beer: 10, ...noWeapons, pistols: 10 };
    expect(calculateThugHappiness(armed)).toBe(100);
    expect(calculateThugHappiness({ ...armed, beer: 9_999 })).toBe(100);
  });

  it('clamps at zero rather than going negative', () => {
    expect(calculateThugHappiness({ thugs: 500, beer: 0, ...noWeapons })).toBe(0);
  });

  it('is 100 with no thugs', () => {
    expect(calculateThugHappiness({ thugs: 0, beer: 0, ...noWeapons })).toBe(100);
  });

  it('matches the starting player: one thug, no gun, 99', () => {
    expect(calculateThugHappiness({ thugs: 1, beer: 10, ...noWeapons })).toBe(99);
  });
});

describe('calculateWhoreHappiness', () => {
  const stocked = {
    whores: 10,
    thugs: 10,
    condoms: 1_000,
    crack: 1_000,
    payoutPercent: 50,
  };

  it('is 100 at the neutral payout with supplies and muscle in place', () => {
    expect(calculateWhoreHappiness(stocked)).toBe(100);
  });

  it('is 100 with no whores', () => {
    expect(calculateWhoreHappiness({ ...stocked, whores: 0 })).toBe(100);
  });

  it('costs one point per percentage point below the neutral cut', () => {
    expect(calculateWhoreHappiness({ ...stocked, payoutPercent: 35 })).toBe(85);
    expect(calculateWhoreHappiness({ ...stocked, payoutPercent: 1 })).toBe(51);
  });

  it('does not reward paying above the neutral cut', () => {
    expect(calculateWhoreHappiness({ ...stocked, payoutPercent: 99 })).toBe(100);
  });

  it('punishes an empty condom shelf in proportion to the shortfall', () => {
    // 10 whores expect 50 condoms, worth up to 30 points.
    expect(calculateWhoreHappiness({ ...stocked, condoms: 50 })).toBe(100);
    expect(calculateWhoreHappiness({ ...stocked, condoms: 25 })).toBe(85);
    expect(calculateWhoreHappiness({ ...stocked, condoms: 0 })).toBe(70);
  });

  it('punishes an empty crack shelf in proportion to the shortfall', () => {
    // 10 whores expect 20 rocks, worth up to 25 points.
    expect(calculateWhoreHappiness({ ...stocked, crack: 20 })).toBe(100);
    expect(calculateWhoreHappiness({ ...stocked, crack: 10 })).toBe(88);
    expect(calculateWhoreHappiness({ ...stocked, crack: 0 })).toBe(75);
  });

  it('punishes whores nobody is protecting', () => {
    // One thug covers ten whores.
    expect(calculateWhoreHappiness({ ...stocked, whores: 10, thugs: 1 })).toBe(100);
    expect(calculateWhoreHappiness({ ...stocked, whores: 20, thugs: 1 })).toBe(88);
  });

  /**
   * Everything wrong at once still leaves the player a move: raising the cut
   * and restocking both take effect immediately.
   */
  it('bottoms out at zero, and every term is recoverable', () => {
    const ruined = { whores: 100, thugs: 0, condoms: 0, crack: 0, payoutPercent: 1 };
    expect(calculateWhoreHappiness(ruined)).toBe(0);

    expect(
      calculateWhoreHappiness({ ...ruined, payoutPercent: 50, condoms: 500, crack: 200 }),
    ).toBe(75);
  });
});

describe('explainWhoreHappiness', () => {
  const struggling = {
    whores: 43,
    thugs: 31,
    condoms: 204, // 215 wanted, so barely short
    crack: 98, // 86 wanted, so fine
    payoutPercent: 20,
  };

  it('names the payout as the real drag, not the near-full shelf', () => {
    const out = explainWhoreHappiness(struggling);

    expect(out.worst?.key).toBe('payout');
    expect(out.worst?.penalty).toBe(30);
  });

  it('reports each term with what it is actually costing', () => {
    const byKey = Object.fromEntries(
      explainWhoreHappiness(struggling).terms.map((t) => [t.key, t]),
    );

    expect(byKey.payout!.penalty).toBe(30);
    expect(byKey.condoms!.penalty).toBeCloseTo(1.5, 1);
    expect(byKey.crack!.penalty).toBe(0);
    expect(byKey.protection!.penalty).toBe(0);
  });

  it('only offers a fix for what is actually wrong', () => {
    const byKey = Object.fromEntries(
      explainWhoreHappiness(struggling).terms.map((t) => [t.key, t]),
    );

    expect(byKey.payout!.fix).toContain('50%');
    expect(byKey.condoms!.fix).toContain('11');
    expect(byKey.crack!.fix).toBeNull();
    expect(byKey.protection!.fix).toBeNull();
  });

  it('the penalties account for the whole gap from 100', () => {
    const out = explainWhoreHappiness(struggling);
    const total = out.terms.reduce((sum, t) => sum + t.penalty, 0);

    // Terms show to one decimal, happiness rounds to a whole number.
    expect(Math.abs(100 - total - out.happiness)).toBeLessThanOrEqual(1);
  });

  it('has nothing to say about a healthy stable', () => {
    const out = explainWhoreHappiness({
      whores: 10,
      thugs: 10,
      condoms: 1_000,
      crack: 1_000,
      payoutPercent: 50,
    });

    expect(out.happiness).toBe(100);
    expect(out.worst).toBeNull();
  });
});

describe('explainThugHappiness', () => {
  it('separates missing beer from missing guns, and nothing else', () => {
    const out = explainThugHappiness({
      thugs: 31,
      beer: 34,
      pistols: 21,
      shotguns: 0,
      tek9s: 0,
      ak47s: 0,
    });

    const byKey = Object.fromEntries(out.terms.map((t) => [t.key, t]));
    expect(Object.keys(byKey).sort()).toEqual(['beer', 'weapons']);
    expect(byKey.beer!.penalty).toBe(0);
    expect(byKey.weapons!.penalty).toBe(10);
    expect(out.happiness).toBe(90);
    expect(out.worst?.key).toBe('weapons');
  });
});
