import { describe, expect, it } from 'vitest';
import { classicOgV01, classicOgV02D, classicOgV02E } from '@streets/rulesets';
import {
  calculateExposure,
  calculateProduce,
  calculateScout,
  calculateStreetTake,
  expectedRecruitsPerTurn,
  recruitmentMultiplier,
} from '../calculations/actions.js';
import type { UpkeepInput } from '../calculations/upkeep.js';
import { flatRng, type Rng } from '../rng.js';

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

/** Never rolls a "find", so a work result is pure earnings. */
const noFinds: Rng = () => 0.5;

/**
 * A block with effectively unlimited clients, so tests about something other
 * than saturation are not silently measuring it. Capacity is exercised on
 * purpose in clients.test.ts.
 */
const OPEN_BLOCK = 1e9;

describe('calculateScout', () => {
  const nobody = crew({ whores: 0, thugs: 0 });

  /**
   * Spec section 27 illustrates +11 whores for ten Nightclub turns. That is
   * deliberately not what happens any more: at 288 turns a day those rates
   * took a new player past the soft cap in an evening. The rate the ruleset
   * actually carries is what gets pinned.
   */
  it('recruits at the ruleset rate for a nobody', () => {
    const turns = 50;
    const result = calculateScout({
      player: nobody,
      turns,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      district: 'NIGHTCLUB',
      payoutPercent: 50,
      rng: flatRng,
    });

    expect(result.whoresRecruited).toBe(
      Math.round(classicOgV01.districts.NIGHTCLUB.whoresPerTurn * turns),
    );
    expect(result.turnsSpent).toBe(turns);
  });

  /** A recommended trip should feel like picking a couple of people up. */
  it('adds only a handful on the manual’s recommended trip', () => {
    const result = calculateScout({
      player: nobody,
      turns: classicOgV01.scouting.recommendedTurns,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      district: 'WINO_SLUMS',
      payoutPercent: 50,
      rng: flatRng,
    });

    expect(result.whoresRecruited).toBeGreaterThan(0);
    expect(result.whoresRecruited).toBeLessThanOrEqual(5);
  });

  /** Scouting is looking for people. It is not a shift. */
  it('earns nothing, burns nothing and wears nobody out', () => {
    const result = calculateScout({
      player: crew(),
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      district: 'NIGHTCLUB',
      payoutPercent: 50,
      rng: flatRng,
    });

    expect(result.grossCents).toBeGreaterThan(0n);
    expect(result.consumption.condoms).toBeGreaterThan(0);
    // ...and still picks people up on the same turns.
    expect(result.whoresRecruited).toBeGreaterThan(0);
  });

  it('can come back with a haul or with nothing', () => {
    // The take is rolled before the recruits, so a fixed sequence cannot pin
    // an exact head count any more. The spread itself is what matters.
    const roll = (value: number) =>
      calculateScout({
        player: nobody,
        turns: 200,
        ruleset: classicOgV01,
        clientCapacity: OPEN_BLOCK,
        district: 'NIGHTCLUB',
        payoutPercent: 50,
        rng: () => value,
      }).whoresRecruited;

    // Enough turns that the 0.35 spread is visible above the rounding.
    const generous = roll(1);
    const stingy = roll(0);

    expect(generous).toBeGreaterThan(stingy);
    expect(stingy).toBeGreaterThan(0);
  });

  it('rounds fractional recruits stochastically rather than to nothing', () => {
    // A single Casino turn is a fraction of a whore. It has to be able to
    // round up sometimes, or a small player in a rich district never recruits.
    const run = (value: number) =>
      calculateScout({
        player: nobody,
        turns: 1,
        ruleset: classicOgV01,
        clientCapacity: OPEN_BLOCK,
        district: 'CASINO',
        payoutPercent: 50,
        rng: () => value,
      }).whoresRecruited;

    expect(run(0)).toBe(1);
    expect(run(0.99)).toBe(0);
  });

  it('applies the city scout modifier', () => {
    const plain = calculateScout({
      player: nobody,
      turns: 100,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      district: 'NIGHTCLUB',
      payoutPercent: 50,
      rng: flatRng,
    });
    const boosted = calculateScout({
      player: nobody,
      turns: 100,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      district: 'NIGHTCLUB',
      payoutPercent: 50,
      city: { scoutModifier: 2, incomeModifier: 1, crackModifier: 1 },
      rng: flatRng,
    });
    expect(boosted.whoresRecruited).toBeGreaterThan(plain.whoresRecruited);
    // Same-trip recruits now count against later same-trip recruitment, so this
    // lands below the old batch formula while still reflecting the city boost.
    expect(boosted.whoresRecruited).toBe(23);
  });

  it('puts long-trip recruits to work before the trip ends', () => {
    const turns = 144;
    const result = calculateScout({
      player: crew({ whores: 1, thugs: 10 }),
      turns,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      district: 'CASINO',
      payoutPercent: 50,
      rng: flatRng,
    });
    const oldBatchGross =
      1 *
      classicOgV01.scouting.grossPerWhorePerTurnCents *
      turns *
      classicOgV01.districts.CASINO.payMultiplier;

    expect(result.whoresRecruited).toBeGreaterThan(0);
    expect(result.grossCents).toBeGreaterThan(BigInt(oldBatchGross * 2));
  });
});

describe('diminishing returns on recruitment', () => {
  const caps = classicOgV01.scouting.recruitment;

  it('is full rate for a nobody and half at the soft cap', () => {
    expect(recruitmentMultiplier(0, caps.whoreSoftCap)).toBe(1);
    expect(recruitmentMultiplier(caps.whoreSoftCap, caps.whoreSoftCap)).toBe(0.5);
    expect(recruitmentMultiplier(caps.whoreSoftCap * 3, caps.whoreSoftCap)).toBe(0.25);
  });

  it('never reaches zero, so growth slows without ever stopping', () => {
    const huge = recruitmentMultiplier(1_000_000, caps.whoreSoftCap);
    expect(huge).toBeGreaterThan(0);
    expect(huge).toBeLessThan(0.001);
  });

  it('measures whores and thugs against their own crews', () => {
    const expected = expectedRecruitsPerTurn(
      classicOgV01.districts.NIGHTCLUB,
      { whores: caps.whoreSoftCap, thugs: 0 },
      classicOgV01,
    );

    expect(expected.whores).toBeCloseTo(
      classicOgV01.districts.NIGHTCLUB.whoresPerTurn / 2,
      5,
    );
    expect(expected.thugs).toBeCloseTo(classicOgV01.districts.NIGHTCLUB.thugsPerTurn, 5);
  });

  it('cuts a big operation to a fraction of a small one', () => {
    const run = (whores: number) =>
      calculateScout({
        player: crew({ whores, thugs: 0 }),
        turns: 100,
        ruleset: classicOgV01,
        clientCapacity: OPEN_BLOCK,
        district: 'WINO_SLUMS',
        payoutPercent: 50,
        rng: flatRng,
      }).whoresRecruited;

    const full = Math.round(classicOgV01.districts.WINO_SLUMS.whoresPerTurn * 100);
    expect(run(0)).toBeLessThan(full);
    expect(run(0)).toBe(19);
    // Same-trip recruits also slow the tail of the trip, but a huge operation
    // still recruits only a small fraction of a nobody.
    expect(run(caps.whoreSoftCap * 9)).toBe(2);
  });
});

describe('calculateExposure', () => {
  const casino = classicOgV01.districts.CASINO;
  const slums = classicOgV01.districts.WINO_SLUMS;

  it('is clean when the crew covers the block', () => {
    // The Casino gives one thug four girls.
    const result = calculateExposure({ whores: 40, thugs: 10 }, casino, classicOgV01);

    expect(result.covered).toBe(40);
    expect(result.exposed).toBe(0);
    expect(result.takeMultiplier).toBe(1);
  });

  it('costs the take and the crew when half of them stand alone', () => {
    const result = calculateExposure({ whores: 40, thugs: 5 }, casino, classicOgV01);

    expect(result.exposed).toBe(0.5);
    expect(result.takeMultiplier).toBeCloseTo(0.7, 5);
  });

  /** The same crew is fine somewhere nobody is watching. */
  it('lets a thin crew work a block nobody polices', () => {
    const result = calculateExposure({ whores: 40, thugs: 5 }, slums, classicOgV01);
    expect(result.exposed).toBe(0);
  });

  it('bottoms out rather than going negative', () => {
    const result = calculateExposure({ whores: 40, thugs: 0 }, casino, classicOgV01);
    expect(result.exposed).toBe(1);
    expect(result.takeMultiplier).toBeCloseTo(0.4, 5);
  });
});


describe('0.2.0-E armed scouting', () => {
  const casino = classicOgV02E.districts.CASINO;

  it('counts only armed fit thugs as street cover', () => {
    const unarmed = calculateExposure({ whores: 40, thugs: 10, pistols: 0 }, casino, classicOgV02E);
    const halfArmed = calculateExposure({ whores: 40, thugs: 10, pistols: 5 }, casino, classicOgV02E);
    const armed = calculateExposure({ whores: 40, thugs: 10, pistols: 10 }, casino, classicOgV02E);

    expect(unarmed.covered).toBe(0);
    expect(unarmed.exposed).toBe(1);
    expect(halfArmed.covered).toBe(20);
    expect(halfArmed.exposed).toBe(0.5);
    expect(armed.covered).toBe(40);
    expect(armed.exposed).toBe(0);
  });

  it('keeps older strategy rounds pinned to ordinary thug coverage', () => {
    const result = calculateExposure({ whores: 40, thugs: 10, pistols: 0 }, classicOgV02D.districts.CASINO, classicOgV02D);
    expect(result.covered).toBe(40);
    expect(result.exposed).toBe(0);
  });
});

describe('calculateStreetTake', () => {
  /** 10 girls, enough muscle for the Casino, a clean average roll. */
  const covered = crew({ whores: 10, thugs: 3 });

  /**
   * A block holding 90 clients against 10 girls, so the saturation term is
   * exactly 0.9 and the whole formula stays in round numbers.
   */
  const BLOCK = 90;

  function night(payoutPercent: number, district: 'CASINO' | 'WINO_SLUMS' = 'CASINO') {
    return calculateStreetTake({
      player: covered,
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: BLOCK,
      district,
      payoutPercent,
      rng: noFinds,
    });
  }

  it('earns the district rate and splits it by the payout', () => {
    const result = night(50);

    // 10 whores * $15 * 10 turns * 2.5 (Casino) * 0.9 (90/(90+10)) = $3,375.
    expect(result.clients).toEqual({ capacity: BLOCK, takeMultiplier: 0.9 });
    expect(result.grossCents).toBe(337_500n);
    expect(result.crewTakeCents).toBe(168_750n);
    expect(result.pimpTakeCents).toBe(168_750n);
  });

  it('burns supplies, because this is the shift', () => {
    expect(night(50).consumption).toEqual({ condoms: 10, crack: 5, beer: 1 });
  });

  it('0.4.0-B: pays by the supply plan and burns only the crack the plan takes', () => {
    const base = night(50);
    const plan = {
      job: 'CASINO', role: 'hoes' as const, policy: { primary: 'ECSTASY', fallback: 'CRACK', emergency: null, strict: false },
      need: 5, perTurn: 0.5, switchesAtTurn: 6, takeMultiplier: 0.5, recruitmentMultiplier: 1, departureMultiplier: 1, morale: 0, woundMultiplier: 1, heat: 0,
      consumed: { ECSTASY: 3, CRACK: 2 },
      slices: [],
    };
    const supplied = calculateStreetTake({ player: covered, turns: 10, ruleset: classicOgV01, clientCapacity: BLOCK, district: 'CASINO', payoutPercent: 50, rng: noFinds, supply: plan });
    expect(supplied.grossCents).toBe(base.grossCents / 2n);
    expect(supplied.consumption).toEqual({ condoms: 10, crack: 2, beer: 1 });
  });

  /**
   * The point of the whole rework: a stingy cut is survivable somewhere rich
   * and ruinous somewhere poor, because relief is measured in money reaching
   * a pocket rather than in a percentage.
   */



  it('earns less on a block the crew cannot cover', () => {
    const thin = calculateStreetTake({
      player: crew({ whores: 40, thugs: 1 }),
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      district: 'CASINO',
      payoutPercent: 50,
      rng: noFinds,
    });

    expect(thin.exposure.exposed).toBeGreaterThan(0);
    expect(thin.exposure.takeMultiplier).toBeLessThan(1);
  });

  it('earns nothing from a stable that is not there', () => {
    const result = calculateStreetTake({
      player: crew({ whores: 0, thugs: 5 }),
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      district: 'CASINO',
      payoutPercent: 50,
      rng: noFinds,
    });
    expect(result.grossCents).toBe(0n);
  });

  it('scales the take with whore happiness, down to the floor', () => {
    const take = (whoreHappiness: number) =>
      calculateStreetTake({
        player: crew({ whores: 10, thugs: 3, whoreHappiness }),
        turns: 10,
        ruleset: classicOgV01,
        clientCapacity: OPEN_BLOCK,
        district: 'CASINO',
        payoutPercent: 50,
        rng: noFinds,
      }).grossCents;

    const floor = classicOgV01.scouting.minHappinessMultiplier;
    const full = Number(take(100));

    // The engine floors once at the end, so compare within a cent.
    expect(Number(take(50))).toBeCloseTo(full * (floor + (1 - floor) * 0.5), -1);
    // Rock bottom is the floor, not nothing.
    expect(Number(take(0))).toBeCloseTo(full * floor, -2);
    expect(Number(take(0))).toBeGreaterThan(0);
  });

  it('turns up product on the block every so often', () => {
    const lucky = calculateStreetTake({
      player: covered,
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      district: 'CASINO',
      payoutPercent: 50,
      rng: () => 0.01, // always under the find chance
    });
    expect(lucky.crackFound).toBeGreaterThan(0);
  });
});

describe('calculateProduce', () => {
  const rich = { cashCents: 100_000_000n };

  it('cooks half a rock per thug per turn at full happiness', () => {
    const result = calculateProduce({
      player: crew({ thugs: 42 }),
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      payoutPercent: 50,
      rng: flatRng,
      ...rich,
    });

    expect(result.crackProduced).toBe(210);
    expect(result.limitedByCash).toBe(false);
  });

  it('charges for the ingredients', () => {
    const result = calculateProduce({
      player: crew({ thugs: 42 }),
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      payoutPercent: 50,
      rng: flatRng,
      ...rich,
    });

    expect(result.ingredientCents).toBe(
      BigInt(result.crackProduced * classicOgV01.production.crack.ingredientCentsPerRock),
    );
  });

  /**
   * The three crack prices have to sit in one order, and the middle one is
   * what stops an infinite money loop:
   *
   *   cook $5  <  buy $10   so cooking is still the cheap way to get a rock
   *   cook $5  >  sell $3   so cook-and-dump loses money every time
   *
   * If cooking ever became cheaper than what Pip's pays, a player could mint
   * cash forever by cooking and selling. That is the assertion that matters.
   */
  it('prices cooking below Pip’s counter but above what Pip’s pays', () => {
    const cook = classicOgV01.production.crack.ingredientCentsPerRock;
    const buy = classicOgV01.stores.PIP.items.CRACK!.buyCents;
    const sell = classicOgV01.stores.PIP.items.CRACK!.sellCents!;

    expect(cook).toBeLessThan(buy);
    expect(cook).toBeGreaterThan(sell);
  });

  it('makes cook-and-dump a loss, so it cannot be farmed', () => {
    const cook = classicOgV01.production.crack.ingredientCentsPerRock;
    const sell = classicOgV01.stores.PIP.items.CRACK!.sellCents!;

    expect(sell - cook).toBeLessThan(0);
  });

  it('cooks a smaller batch when the cash runs out', () => {
    const result = calculateProduce({
      player: crew({ thugs: 42 }),
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      payoutPercent: 50,
      rng: flatRng,
      cashCents: BigInt(30 * classicOgV01.production.crack.ingredientCentsPerRock),
    });

    expect(result.crackProduced).toBe(30);
    expect(result.ingredientCents).toBe(
      BigInt(30 * classicOgV01.production.crack.ingredientCentsPerRock),
    );
    expect(result.limitedByCash).toBe(true);
  });

  it('still earns, at a fraction of a scouted night', () => {
    const result = calculateProduce({
      player: crew(),
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      payoutPercent: 50,
      rng: flatRng,
      ...rich,
    });

    expect(result.grossCents).toBeGreaterThan(0n);
  });

  it('burns the shelf too, because the girls are still out', () => {
    const result = calculateProduce({
      player: crew(),
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      payoutPercent: 50,
      rng: flatRng,
      ...rich,
    });
    // 73 whores and 42 thugs over 10 turns, same as any other night out.
    expect(result.consumption.condoms).toBeGreaterThan(0);
    expect(result.consumption.crack).toBeGreaterThan(0);
    expect(result.consumption.beer).toBeGreaterThan(0);
  });

  it('scales output with thug happiness', () => {
    const batch = (thugHappiness: number) =>
      calculateProduce({
        player: crew({ thugs: 42, thugHappiness }),
        turns: 10,
        ruleset: classicOgV01,
        clientCapacity: OPEN_BLOCK,
      payoutPercent: 50,
        rng: flatRng,
        ...rich,
      }).crackProduced;

    expect(batch(100)).toBe(210);
    expect(batch(0)).toBe(52);
    expect(batch(50)).toBeLessThan(batch(100));
  });

  it('produces nothing without thugs', () => {
    const result = calculateProduce({
      player: crew({ thugs: 0 }),
      turns: 10,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      payoutPercent: 50,
      rng: flatRng,
      ...rich,
    });
    expect(result.crackProduced).toBe(0);
  });
});

/**
 * The manual, held to directly. These are the two sentences the whole action
 * model is built from, so they get assertions of their own.
 */
describe('manual 3.1 and 3.2', () => {
  const player = crew({ whores: 20, thugs: 5 });

  const trip = calculateScout({
    player,
    turns: 13,
    ruleset: classicOgV01,
    clientCapacity: OPEN_BLOCK,
    district: 'NIGHTCLUB',
    payoutPercent: 50,
    rng: flatRng,
  });

  const cook = calculateProduce({
    player,
    turns: 13,
    ruleset: classicOgV01,
    clientCapacity: OPEN_BLOCK,
    payoutPercent: 50,
    cashCents: 100_000_000n,
    rng: flatRng,
  });

  /** 3.1: "where to go to make money for yourself, and go out and pickup some whores and thugs" */
  it('scouting both makes money and picks people up', () => {
    expect(trip.pimpTakeCents).toBeGreaterThan(0n);
    expect(trip.whoresRecruited + trip.thugsRecruited).toBeGreaterThan(0);
  });

  /** 3.2: "sends your whores out, while your thugs produce crack" */
  it('cooking still sends the girls out and still makes crack', () => {
    expect(cook.grossCents).toBeGreaterThan(0n);
    expect(cook.crackProduced).toBeGreaterThan(0);
  });

  /** 3.2: "the whores produce less money because the thugs are busy" */
  it('cooking earns less than scouting for the same turns', () => {
    expect(cook.grossCents).toBeLessThan(trip.grossCents);
  });

  /** 3.2: crack is what "keeps your whores happy, and keeps them from leaving you" */
  it('cooking is the only action that grows the crack that keeps them', () => {
    const cookNet = cook.crackProduced - cook.consumption.crack;
    const tripNet = trip.crackFound - trip.consumption.crack;

    expect(cookNet).toBeGreaterThan(0);
    expect(cookNet).toBeGreaterThan(tripNet);
  });

  /** 3.1: "The recommended amount of turns to use each time is around 12-14." */
  it('recommends the manual’s trip length', () => {
    expect(classicOgV01.scouting.recommendedTurns).toBeGreaterThanOrEqual(12);
    expect(classicOgV01.scouting.recommendedTurns).toBeLessThanOrEqual(14);
  });
});

/**
 * The ladder out.
 *
 * A crew at rock bottom must still earn something, or a player who lets
 * happiness hit zero has no way to buy their way back. A hard low is the
 * design; a dead end is not.
 */
describe('a broken crew can still earn its way back', () => {
  const broken = crew({
    whores: 48,
    thugs: 28,
    condoms: 0,
    crack: 0,
    beer: 0,
    whoreHappiness: 0,
    thugHappiness: 0,
  });

  it('earns something at zero happiness', () => {
    const out = calculateScout({
      player: broken,
      turns: 5,
      ruleset: classicOgV01,
      clientCapacity: OPEN_BLOCK,
      district: 'CASINO',
      payoutPercent: 45,
      rng: flatRng,
    });

    expect(out.pimpTakeCents).toBeGreaterThan(0n);
  });

  it('earns far less than a healthy crew, so the low still stings', () => {
    const run = (whoreHappiness: number) =>
      Number(
        calculateScout({
          player: crew({ ...broken, whoreHappiness, condoms: 5_000, crack: 500 }),
          turns: 5,
          ruleset: classicOgV01,
        clientCapacity: OPEN_BLOCK,
          district: 'CASINO',
          payoutPercent: 45,
          rng: flatRng,
        }).pimpTakeCents,
      );

    expect(run(0)).toBeLessThan(run(100) * 0.25);
  });

  it('keeps the floor low enough to hurt but above zero', () => {
    expect(classicOgV01.scouting.minHappinessMultiplier).toBeGreaterThan(0);
    expect(classicOgV01.scouting.minHappinessMultiplier).toBeLessThanOrEqual(0.25);
  });

});
