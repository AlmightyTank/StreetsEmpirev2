import { describe, expect, it } from 'vitest';
import {
  calculateThugHappiness,
  calculateWhoreHappiness,
} from '../calculations/happiness.js';

const noWeapons = { pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };

describe('calculateThugHappiness', () => {
  // Section 53: 100 thugs, 100 beer, 100 guns = 100
  it('is 100 when every thug has a beer and a gun', () => {
    expect(
      calculateThugHappiness({
        thugs: 100,
        beer: 100,
        ...noWeapons,
        pistols: 100,
        thugFatigue: 0,
      }),
    ).toBe(100);
  });

  // Section 53: 100 thugs, 90 beer, 80 guns = 70
  it('drops one point per missing beer and one per missing gun', () => {
    expect(
      calculateThugHappiness({
        thugs: 100,
        beer: 90,
        ...noWeapons,
        pistols: 80,
        thugFatigue: 0,
      }),
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
        thugFatigue: 0,
      }),
    ).toBe(100);
  });

  it('takes wear off on top of the frozen formula', () => {
    expect(
      calculateThugHappiness({
        thugs: 10,
        beer: 100,
        ...noWeapons,
        pistols: 100,
        thugFatigue: 25,
      }),
    ).toBe(75);
  });

  it('clamps at zero rather than going negative', () => {
    expect(
      calculateThugHappiness({ thugs: 500, beer: 0, ...noWeapons, thugFatigue: 40 }),
    ).toBe(0);
  });

  it('is 100 with no thugs and no wear', () => {
    expect(
      calculateThugHappiness({ thugs: 0, beer: 0, ...noWeapons, thugFatigue: 0 }),
    ).toBe(100);
  });

  it('matches the starting player: one thug, no gun, 99', () => {
    expect(
      calculateThugHappiness({ thugs: 1, beer: 10, ...noWeapons, thugFatigue: 0 }),
    ).toBe(99);
  });
});

describe('calculateWhoreHappiness', () => {
  const stocked = {
    whores: 10,
    thugs: 10,
    condoms: 1_000,
    crack: 1_000,
    whoreFatigue: 0,
  };

  it('is 100 with supplies, muscle and a rested crew', () => {
    expect(calculateWhoreHappiness(stocked)).toBe(100);
  });

  it('is 100 with no whores', () => {
    expect(calculateWhoreHappiness({ ...stocked, whores: 0 })).toBe(100);
  });

  /**
   * The payout deliberately does not appear here. A cut is only generous
   * relative to what the block pays, so it acts through fatigue when they
   * work rather than as a flat penalty for existing.
   */
  it('does not care about the payout directly', () => {
    // Nothing in the input can express a payout at all - only its consequence.
    expect(Object.keys(stocked)).not.toContain('payoutPercent');
  });

  it('takes wear straight off', () => {
    expect(calculateWhoreHappiness({ ...stocked, whoreFatigue: 30 })).toBe(70);
    expect(calculateWhoreHappiness({ ...stocked, whoreFatigue: 100 })).toBe(0);
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
    expect(
      calculateWhoreHappiness({
        whores: 20,
        thugs: 1,
        condoms: 1_000,
        crack: 1_000,
        whoreFatigue: 0,
      }),
    ).toBe(88);
  });

  it('bottoms out at zero when everything is wrong at once', () => {
    expect(
      calculateWhoreHappiness({
        whores: 100,
        thugs: 0,
        condoms: 0,
        crack: 0,
        whoreFatigue: 40,
      }),
    ).toBe(0);
  });
});
