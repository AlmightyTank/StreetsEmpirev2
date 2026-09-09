import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import { calculateProduce, calculateStreetTake } from '../calculations/actions.js';
import { calculateInfections, calculateWorkConsumption } from '../calculations/upkeep.js';
import { calculateWhoreHappiness } from '../calculations/happiness.js';
import { flatRng, type Rng } from '../rng.js';

/**
 * Supplies are spent by working and felt through happiness on the very next
 * read - there is no separate wear that has to be waited out. Running the
 * shelf down IS the punishment, and restocking IS the fix.
 */
function crew(overrides: Record<string, number> = {}) {
  return {
    whores: 50,
    thugs: 20,
    condoms: 5_000,
    crack: 1_000,
    beer: 500,
    medicine: 50,
    whoreHappiness: 100,
    thugHappiness: 100,
    ...overrides,
  };
}

describe('street work supplies', () => {
  it('spends what a shift needs when the shelf can cover it', () => {
    const used = calculateWorkConsumption(crew(), 10, classicOgV01);

    expect(used.condoms).toBeGreaterThan(0);
    expect(used.beer).toBeGreaterThan(0);
    expect(used.crack).toBeGreaterThan(0);
  });

  it('never spends supplies that are not there', () => {
    const used = calculateWorkConsumption(
      crew({ condoms: 3, crack: 1, beer: 0 }),
      10,
      classicOgV01,
    );

    expect(used).toEqual({ condoms: 3, crack: 1, beer: 0 });
  });

  it('reports the shortfall the shift could not cover', () => {
    const take = calculateStreetTake({
      player: crew({ condoms: 0, beer: 0 }),
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: 1e9,
      district: 'CASINO',
      payoutPercent: 50,
      rng: flatRng,
    });

    expect(take.shortages.condoms).toBeGreaterThan(0);
    expect(take.shortages.beer).toBeGreaterThan(0);
  });

  it('costs nothing for zero turns or an empty crew', () => {
    expect(calculateWorkConsumption(crew(), 0, classicOgV01)).toEqual({
      condoms: 0,
      crack: 0,
      beer: 0,
    });
    expect(
      calculateWorkConsumption(crew({ whores: 0, thugs: 0 }), 50, classicOgV01),
    ).toEqual({ condoms: 0, crack: 0, beer: 0 });
  });

  /**
   * The loop that matters: work the shelf down, happiness falls; restock it,
   * happiness comes straight back. No waiting.
   */
  it('drops happiness as the shelf empties and restores it on restock', () => {
    const stocked = { whores: 50, thugs: 20, condoms: 250, crack: 100, payoutPercent: 50 };

    const full = calculateWhoreHappiness(stocked);
    const drained = calculateWhoreHappiness({ ...stocked, condoms: 0, crack: 0 });
    const restocked = calculateWhoreHappiness(stocked);

    expect(full).toBe(100);
    expect(drained).toBeLessThan(full);
    expect(restocked).toBe(full);
  });
});

/**
 * What medicine is for.
 *
 * Condoms at $1 are the prevention, medicine at $20 is the cure, and a whore
 * is worth $2,000 - so skipping both is by far the most expensive option.
 */
describe('working without condoms', () => {
  const always: Rng = () => 0; // every roll lands
  const never: Rng = () => 1; // no roll lands

  function shift(overrides: Record<string, number>, rng: Rng, ratio = 1) {
    return calculateInfections(
      { whores: 100, medicine: 0, ...overrides },
      10,
      ratio,
      classicOgV01,
      rng,
    );
  }

  it('never infects anyone when the shelf is fully stocked', () => {
    expect(shift({}, always, 0)).toEqual({
      infected: 0,
      treated: 0,
      medicineUsed: 0,
      lost: 0,
    });
  });

  it('scales the risk with how short the shelf was', () => {
    // A roll that lands at the full unprotected rate but not at a tenth of it.
    const chance = classicOgV01.health.infectionChancePerTurnUnprotected;
    const rng: Rng = () => chance / 2;

    expect(shift({}, rng, 1).infected).toBeGreaterThan(0);
    expect(shift({}, rng, 0.1).infected).toBe(0);
  });

  it('treats what the medicine on hand covers', () => {
    const out = shift({ medicine: 100 }, always);

    expect(out.infected).toBeGreaterThan(0);
    expect(out.treated).toBe(out.infected);
    expect(out.medicineUsed).toBe(
      out.infected * classicOgV01.health.medicinePerTreatment,
    );
    expect(out.lost).toBe(0);
  });

  it('loses the ones it cannot treat', () => {
    const out = shift({ medicine: 0 }, always);

    expect(out.infected).toBeGreaterThan(0);
    expect(out.treated).toBe(0);
    expect(out.lost).toBe(out.infected);
  });

  it('treats some and loses the rest when medicine runs short', () => {
    const out = shift({ medicine: 1 }, always);

    expect(out.treated).toBe(1);
    expect(out.lost).toBe(out.infected - 1);
  });

  it('caps how much of a stable one shift can cost', () => {
    const out = shift({ whores: 100 }, always);
    const cap = 100 * classicOgV01.health.maxInfectedFractionPerAction;

    expect(out.infected).toBeLessThanOrEqual(Math.max(1, Math.floor(cap)));
  });

  it('cannot infect more whores than there are', () => {
    expect(shift({ whores: 2 }, always).infected).toBeLessThanOrEqual(2);
  });

  it('does nothing on a lucky night, or with nobody working', () => {
    expect(shift({}, never).infected).toBe(0);
    expect(shift({ whores: 0 }, always).infected).toBe(0);
  });

  /** Both actions put the girls out, so both carry the risk. */
  it('applies to scouting and to cooking alike', () => {
    const bare = crew({ condoms: 0, medicine: 0 });
    const rng: Rng = () => 0;

    const scouted = calculateStreetTake({
      player: bare,
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: 1e9,
      district: 'CASINO',
      payoutPercent: 50,
      rng,
    });
    const cooked = calculateProduce({
      player: bare,
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: 1e9,
      payoutPercent: 50,
      cashCents: 10_000_000n,
      rng,
    });

    expect(scouted.infections.infected).toBeGreaterThan(0);
    expect(cooked.infections.infected).toBeGreaterThan(0);
  });
});
