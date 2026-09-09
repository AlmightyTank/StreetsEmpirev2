import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import {
  calculateDepartures,
  calculateWorkConsumption,
  type UpkeepInput,
} from '../calculations/upkeep.js';
import { flatRng } from '../rng.js';

function crew(overrides: Partial<UpkeepInput> = {}): UpkeepInput {
  return {
    whores: 73,
    thugs: 42,
    condoms: 4_812,
    crack: 1_221,
    beer: 108,
    medicine: 50,
    whoreHappiness: 100,
    thugHappiness: 100,
    ...overrides,
  };
}

describe('calculateWorkConsumption', () => {
  it('charges whole supplies for the shift, rounding condoms and beer up', () => {
    expect(calculateWorkConsumption(crew(), 10, classicOgV01)).toEqual({
      condoms: 73,
      crack: 36,
      beer: 9,
    });
  });

  it('scales with turns', () => {
    expect(calculateWorkConsumption(crew(), 20, classicOgV01)).toEqual({
      condoms: 146,
      crack: 73,
      beer: 17,
    });
  });

  it('never takes more than is on the shelf', () => {
    const broke = crew({ condoms: 10, crack: 2, beer: 0 });
    expect(calculateWorkConsumption(broke, 10, classicOgV01)).toEqual({
      condoms: 10,
      crack: 2,
      beer: 0,
    });
  });

  it('costs nothing with nobody to send out', () => {
    expect(
      calculateWorkConsumption(crew({ whores: 0, thugs: 0 }), 50, classicOgV01),
    ).toEqual({ condoms: 0, crack: 0, beer: 0 });
  });

  it('charges condoms and beer even for a single-person, single-turn shift', () => {
    expect(calculateWorkConsumption(crew({ whores: 1, thugs: 1 }), 1, classicOgV01))
      .toEqual({ condoms: 1, crack: 0, beer: 1 });
  });

  it('costs nothing for zero turns', () => {
    expect(calculateWorkConsumption(crew(), 0, classicOgV01))
      .toEqual({ condoms: 0, crack: 0, beer: 0 });
  });
});

describe('calculateDepartures', () => {
  /** The manual's recommended spend, which the rate is calibrated against. */
  const trip = classicOgV01.scouting.recommendedTurns;

  it('keeps everybody at or above the threshold', () => {
    const content = crew({ whoreHappiness: 40, thugHappiness: 40 });
    expect(calculateDepartures(content, trip, classicOgV01, flatRng)).toEqual({
      whores: 0,
      thugs: 0,
    });
  });

  it('costs a recommended trip what the old per-action rule cost', () => {
    // The rate is calibrated so nothing about a normal trip changed: 9.9%
    // against the flat 10% this replaced.
    const miserable = crew({ whores: 100, thugs: 100, whoreHappiness: 0, thugHappiness: 0 });
    expect(calculateDepartures(miserable, trip, classicOgV01, flatRng).whores).toBe(10);
  });

  it('costs more the longer the crew is worked', () => {
    // The bug this replaced: departures ran once per action regardless of
    // turns, so one enormous trip carried the same risk as a single turn and
    // batching was strictly free.
    const miserable = crew({ whores: 100, thugs: 100, whoreHappiness: 0, thugHappiness: 0 });

    const short = calculateDepartures(miserable, 1, classicOgV01, flatRng).whores;
    const recommended = calculateDepartures(miserable, trip, classicOgV01, flatRng).whores;
    const marathon = calculateDepartures(miserable, 200, classicOgV01, flatRng).whores;

    expect(short).toBeLessThan(recommended);
    expect(recommended).toBeLessThan(marathon);
  });

  it('costs nothing for an action that works nobody', () => {
    const miserable = crew({ whores: 100, thugs: 100, whoreHappiness: 0, thugHappiness: 0 });
    expect(calculateDepartures(miserable, 0, classicOgV01, flatRng))
      .toEqual({ whores: 0, thugs: 0 });
  });

  it('never takes more than the safety rail allows', () => {
    // However long and however miserable, one action cannot end the crew.
    const miserable = crew({ whores: 100, thugs: 100, whoreHappiness: 0, thugHappiness: 0 });
    const rail = classicOgV01.departures.maxFractionPerAction;

    expect(calculateDepartures(miserable, 100_000, classicOgV01, flatRng).whores)
      .toBeLessThanOrEqual(100 * rail);
  });

  it('loses the full fraction at zero happiness', () => {
    const miserable = crew({
      whores: 100,
      thugs: 100,
      whoreHappiness: 0,
      thugHappiness: 0,
    });
    expect(calculateDepartures(miserable, trip, classicOgV01, flatRng)).toEqual({
      whores: 10,
      thugs: 10,
    });
  });

  it('scales with how far below the threshold happiness sits', () => {
    const unhappy = crew({
      whores: 100,
      thugs: 100,
      whoreHappiness: 20,
      thugHappiness: 20,
    });
    expect(calculateDepartures(unhappy, trip, classicOgV01, flatRng)).toEqual({
      whores: 5,
      thugs: 5,
    });
  });

  it('treats whores and thugs independently', () => {
    const lopsided = crew({
      whores: 100,
      thugs: 100,
      whoreHappiness: 0,
      thugHappiness: 100,
    });
    expect(calculateDepartures(lopsided, trip, classicOgV01, flatRng)).toEqual({
      whores: 10,
      thugs: 0,
    });
  });

  it('cannot lose more than are there', () => {
    const tiny = crew({ whores: 1, thugs: 0, whoreHappiness: 0, thugHappiness: 0 });
    const result = calculateDepartures(tiny, trip, classicOgV01, flatRng);
    expect(result.whores).toBeLessThanOrEqual(1);
    expect(result.thugs).toBe(0);
  });
});
