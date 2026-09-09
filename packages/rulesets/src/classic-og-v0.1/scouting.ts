/**
 * Scout. Manual 3.1, spec sections 25-27.
 *
 * The manual calls this "Scout for Whores", but that undersells what a trip
 * actually is: you are scouting a block for clients to sell the girls' time
 * to, and picking up whores and thugs while you are there. All three come
 * home from the same night, which is why the action is just "Scout".
 *
 * BALANCE_APPROXIMATION.
 *
 *   "This is where to go to make money for yourself, and go out and pickup
 *    some whores and thugs."
 *
 * One action, both jobs. You take the crew to a block: the girls work it while
 * you work the room, and you come home with a night's take and whoever you
 * managed to pick up.
 *
 * That is why a district is two offers at once and they pull against each
 * other. The Casino pays two and a half times as much and has barely anyone
 * standing around worth recruiting; the Wino Slums are the reverse. There is
 * no district that is simply best.
 *
 * The manual's recommended spend is 12-14 turns a trip, which is what
 * `recommendedTurns` is for.
 */

import { districts } from './districts.js';
import type { ScoutingRules } from '../types.js';

export const scouting = {
  /** Turns burned per unit of scouting. The player chooses how many. */
  turnCostPerScout: 1,
  minTurns: 1,

  /** Manual 3.1: "The recommended amount of turns to use each time is around 12-14." */
  recommendedTurns: 13,

  districts,

  // --- picking people up ---------------------------------------------------

  /**
   * Diminishing returns on recruitment.
   *
   * A district holds a finite number of people who have nowhere better to be.
   * The more of them you already run, the fewer new faces there are for you to
   * find, so a headline rate is what a nobody gets - not what an empire gets.
   *
   *   multiplier = softCap / (softCap + current)
   *
   * At the soft cap you recruit at half the headline rate, and growth over a
   * round goes from linear to roughly the square root of turns spent. That
   * gives the round a shape: recruit while you are small, then live off the
   * crew you built.
   */
  recruitment: {
    whoreSoftCap: 50,
    thugSoftCap: 25,
  },

  /**
   * Random spread on recruitment, plus or minus this fraction. Deliberately
   * wide: a scout should be able to come back with a haul or with nothing.
   */
  variance: 0.35,

  // --- making money for yourself -------------------------------------------

  /** Gross a whore brings in per turn worked, before happiness and district. */
  grossPerWhorePerTurnCents: 1_500,

  /**
   * Earnings scale linearly with whore happiness, down to this floor.
   *
   * The floor is the ladder out. At zero, a crew whose happiness has hit the
   * bottom earns nothing at all, so the player has no way to buy their way
   * back. At 0.15 a miserable stable still limps in enough to restock and
   * raise the cut - a hard low rather than a dead end.
   */
  minHappinessMultiplier: 0.15,

  /** Random spread on a night's take. */
  takeVariance: 0.15,

  /** Working the block is what burns the shelf. */
  consumption: {
    condomsPerWhorePerTurn: 0.1,
    crackPerWhorePerTurn: 0.05,
    beerPerThugPerTurn: 0.02,
  },



  /**
   * Working a block your crew cannot cover. Girls with nobody watching them
   * get moved along, so the take suffers.
   */
  exposure: {
    maxTakePenalty: 0.6,
  },

  /**
   * How many clients a block has tonight. BALANCE_APPROXIMATION.
   *
   * A corner only holds so many people willing to pay, so the two hundredth
   * girl on it earns less than the twentieth:
   *
   *   multiplier = capacity / (capacity + whores)
   *
   * This is the only thing in the game that puts diminishing returns on
   * money. Recruitment has had them from the start, which is why a crew
   * flattens out - but income stayed linear in crew size, so cash compounded
   * without limit and net worth became a cash-hoarding contest. This is the
   * brake.
   *
   * It scales itself in. Ten girls barely notice the difference between the
   * best block and the worst; three hundred and seventy-five see an eight-fold
   * gap. Small players are untouched, and the constraint arrives exactly when
   * an operation is big enough to need one.
   *
   * The five numbers are handed out one per district and reshuffled every
   * hour, and which district holds which is never shown. That makes the
   * headline pay rate a guess rather than an answer: at scale the spread
   * between a packed block and a dead one is wider than the spread between
   * the Casino and the Slums, so the right district genuinely changes hour to
   * hour. You find out by going, and what you learn is good for the hour.
   */
  clients: {
    capacities: [2_000, 600, 250, 100, 40],
    rotationMinutes: 60,
  },

  /**
   * Manual 3.2 sends the girls out while the thugs cook, but the player never
   * picks the block - the muscle that would be running them is inside. They
   * work the Low Rent District: middling pay, and forgiving enough about
   * protection that an unsupervised night is not a disaster.
   *
   * Hidden, like the capacities. Produce Crack is not a district choice, so
   * showing one would only imply a decision that is not on offer.
   */
  produceDistrict: 'LOW_RENT',

  /** Every so often a night turns up product rather than cash. */
  finds: {
    chancePerTurn: 0.08,
    crackMin: 1,
    crackMax: 6,
  },
} as const satisfies ScoutingRules;
