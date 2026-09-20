import { classicOgV05F } from '../classic-og-v0.5-f/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.6.0-A, the first turf ruleset. 0.5.0-F balance, plus a `turf` block: what a block
 * pays whoever holds it, what a corner crew costs, how hard the locals hold a block
 * before anyone takes it from them, and the caps that stop one crew owning a city.
 *
 * Nothing reads these numbers yet. A 0.6.0-A round plays exactly like a 0.5.0-F one;
 * 0.6.0-B posts the first corner crew. The numbers come first, as the cities did in
 * 0.5.0-A, so `npm run qa:turf` can argue with them before any of it is built.
 *
 * The shape of it:
 * - **A rich block costs more to hold and pays more to hold.** The Casino wants eight
 *   thugs standing on it and the slums three, which is the same trade the districts
 *   already make between pay and the muscle a block needs.
 * - **A corner is as big as the crew that holds it.** Past a few dozen thugs the minimum
 *   stops biting, so a corner also costs a share of the crew: a tenth of it on the Casino,
 *   a twentieth in the slums. Without that, the crews that need turf least hold it for
 *   nothing, and holding the home cap has to cost a crew of any size about a fifth of its
 *   muscle.
 * - **The tax is burned from the worker and minted for the holder**, at a lower rate and
 *   under a daily cap per payer. Money never moves between players, so an alt working
 *   its owner's block is worth less than that alt playing its own game.
 * - **The locals hold everything at the start.** Detroit's corners are the hardest in the
 *   game and Seattle's the softest, which is the same character the cities already have.
 *
 * BALANCE_APPROXIMATION. Every number here is set by `runTurfSimulation`.
 */
export const classicOgV06A = {
  ...classicOgV05F,
  meta: { id: 'classic-og-v0.6-a', version: '0.6.0-A', name: 'Classic OG - Turf' },
  turf: {
    districts: {
      CASINO: { cornerShareOfCrew: 0.1, holdBonus: 1.15, taxBurn: 0.12, taxMint: 0.07, cornerMinimum: 8, localsThugs: 30 },
      NIGHTCLUB: { cornerShareOfCrew: 0.08, holdBonus: 1.12, taxBurn: 0.1, taxMint: 0.06, cornerMinimum: 6, localsThugs: 22 },
      LOW_RENT: { cornerShareOfCrew: 0.06, holdBonus: 1.1, taxBurn: 0.08, taxMint: 0.05, cornerMinimum: 4, localsThugs: 12 },
      URBAN_GHETTO: { cornerShareOfCrew: 0.06, holdBonus: 1.1, taxBurn: 0.08, taxMint: 0.05, cornerMinimum: 4, localsThugs: 14 },
      WINO_SLUMS: { cornerShareOfCrew: 0.05, holdBonus: 1.08, taxBurn: 0.06, taxMint: 0.04, cornerMinimum: 3, localsThugs: 8 },
    },
    locals: {
      byCity: {
        'detroit': 1.4,
        'beverly-hills': 1.3,
        'new-york-city': 1.2,
        'los-angeles': 1.15,
        'miami-beach': 1.1,
        'las-vegas': 1,
        'atlanta': 0.8,
        'seattle': 0.7,
      },
      weapon: 'PISTOL',
      armedShare: 0.6,
      regrowPerHour: 0.5,
      reclaimHours: 6,
    },
    presence: { turnsToClaim: 40, halfLifeHours: 24, perScoutTurn: 1 },
    corner: {
      postTurnCost: 4,
      pullTurnCost: 2,
      beerPerThugPerHour: 0.05,
      productPerThugPerHour: 0.02,
      walkoutSharePerHour: 0.05,
    },
    caps: {
      blocksPerCrewHome: 2,
      blocksPerCrewAway: 1,
      blocksPerAllianceInCity: 3,
      dailyTaxCapCentsPerPayer: 5_000_000,
    },
    push: {
      warningMinutes: 8,
      turnCost: 8,
      shieldHours: 6,
      attackerCooldownHours: 4,
      // A corner is not a home: the holder keeps a little of the defender's edge and the
      // fight swings wider than a raid, though not as wide as an ambush on the road.
      fight: { defenseMultiplier: 1.05, variance: 0.2 },
      // 0.3.0-D's held reinforcement, on turf only: big help that shows up half the time.
      allies: { maxShareOfDefender: 0.25, chanceToShowUp: 0.5, maxHelpers: 2 },
    },
  },
} as const satisfies Ruleset;
