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
      }),
    ).toBe(100);
  });

  it('clamps at zero rather than going negative', () => {
    expect(
      calculateThugHappiness({ thugs: 500, beer: 0, ...noWeapons }),
    ).toBe(0);
  });

  it('is 100 with no thugs at all', () => {
    expect(calculateThugHappiness({ thugs: 0, beer: 0, ...noWeapons })).toBe(100);
  });

  it('gains nothing from surplus beer or guns', () => {
    expect(
      calculateThugHappiness({
        thugs: 1,
        beer: 9_999,
        ...noWeapons,
        ak47s: 9_999,
      }),
    ).toBe(100);
  });

  it('matches the starting player: one thug, no gun, 99', () => {
    expect(calculateThugHappiness({ thugs: 1, beer: 10, ...noWeapons })).toBe(99);
  });
});

describe('calculateWhoreHappiness', () => {
  const stocked = { whores: 10, thugs: 10, condoms: 1_000, crack: 1_000, payoutPercent: 50 };

  it('is 100 at the neutral payout with supplies and muscle in place', () => {
    expect(calculateWhoreHappiness(stocked)).toBe(100);
  });

  it('is 100 with no whores', () => {
    expect(calculateWhoreHappiness({ ...stocked, whores: 0 })).toBe(100);
  });

  it('costs one point per percentage point below the neutral payout', () => {
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

  /**
   * What gives running dry a cost, and therefore what makes a turn spent
   * cooking worth more than nothing.
   */
  it('punishes an empty crack shelf in proportion to the shortfall', () => {
    // 10 whores expect 20 rocks, worth up to 25 points.
    expect(calculateWhoreHappiness({ ...stocked, crack: 20 })).toBe(100);
    expect(calculateWhoreHappiness({ ...stocked, crack: 10 })).toBe(88);
    expect(calculateWhoreHappiness({ ...stocked, crack: 0 })).toBe(75);
  });

  it('stacks an empty larder with a squeezed payout', () => {
    expect(
      calculateWhoreHappiness({ ...stocked, condoms: 0, crack: 0, payoutPercent: 40 }),
    ).toBe(35);
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
        payoutPercent: 50,
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
        payoutPercent: 1,
      }),
    ).toBe(0);
  });
});
