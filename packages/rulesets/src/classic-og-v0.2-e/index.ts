import { classicOgV02D } from '../classic-og-v0.2-d/index.js';
import type { Ruleset } from '../types.js';

/** 0.2.0-E makes local raid testing self-contained with seeded rivals. */
export const classicOgV02E = {
  ...classicOgV02D,
  meta: { id: 'classic-og-v0.2-e', version: '0.2.0-E', name: 'Classic OG - Testable Raids' },
  happiness: {
    ...classicOgV02D.happiness,
    thug: {
      ...classicOgV02D.happiness.thug,
      penaltyPerThugWithoutWeapon: 3,
    },
  },
  scouting: {
    ...classicOgV02D.scouting,
    requiresArmedThugs: true,
  },
  communityPrivacy: {
    hideOpponentCrew: true,
    hideOpponentWeapons: true,
  },
  combat: {
    ...classicOgV02D.combat,
    version: '0.2.0-E.2',
    /**
     * BALANCE_APPROXIMATION. A drive-by weakens rather than robs: it wounds
     * crew on the usual recovery clock and kills whores for good, so it sets
     * up a raid and dents income at the same time.
     *
     * The target only has half its crew out front and no home advantage,
     * which is what makes a carload of six a real threat to a crew of ten.
     * Losing is where the swing is: casualties climb with how badly you were
     * outgunned, and a car whose whole crew goes down does not come home.
     */
    driveBy: {
      turnCost: 5,
      thugsPerLowRider: classicOgV02D.lowRiderThugCapacity,
      cooldownMinutes: 60,
      protectionHours: 6,
      defenderFieldedFraction: 0.5,
      defenseMultiplier: 1,
      hit: {
        thugWounds: { minPercent: 10, maxPercent: 40, exponent: 2 },
        whoreKills: { minPercent: 2, maxPercent: 15, exponent: 2.5 },
        perShooterThugWounds: 1,
        perShooterWhoreKills: 1,
      },
      casualties: { onHit: 0.05, onMissBase: 0.2, onMissPerMargin: 0.6, max: 0.9 },
    },
    loot: {
      ...classicOgV02D.combat.loot,
      exposedCashPercent: 40,
      perFitAttackerCents: 25_000,
      exposedDrugPercent: 40,
      perFitAttackerCrack: 5,
      weightedPercent: {
        minPercent: 5,
        maxPercent: 40,
        exponent: 2.5,
        repeatPenaltyPercent: 25,
        repeatFloorPercent: 25,
      },
    },
  },
  /**
   * Charlie's favour moves from handing a car back to using one. Only rounds
   * with drive-bys can ask for it; economic rounds keep "Back on the lot".
   */
  quests: {
    ...classicOgV02D.quests,
    CHARLIE: {
      title: 'Take it for a spin',
      description:
        'Charlie builds cars to be driven, not parked. Buy one of his Low-Riders, ' +
        'put it through a drive-by, and he will know your name. If the car comes ' +
        'home, you keep it.',
      goal: { kind: 'DRIVE_BY', driveBys: 1 },
    },
  },
  round: {
    ...classicOgV02D.round,
    seededRivals: [
      {
        slug: 'razor-ray',
        displayName: 'Razor Ray',
        publicPimpId: 1000,
        note: 'Even match with starter weapons. Good first raid target.',
        startingPlayer: { cashCents: 3_000_000, thugs: 10, pistols: 10, beer: 10, crack: 150, medicine: 2 },
      },
      {
        slug: 'cashbox-carlo',
        displayName: 'Cashbox Carlo',
        publicPimpId: 1001,
        note: 'Cash-heavy crew with lighter muscle. Good recon target.',
        startingPlayer: { cashCents: 6_000_000, thugs: 8, pistols: 8, beer: 8, crack: 500, medicine: 4 },
      },
      {
        slug: 'iron-maya',
        displayName: 'Iron Maya',
        publicPimpId: 1002,
        note: 'Stronger defender for testing losses, wounds and recovery.',
        startingPlayer: { cashCents: 4_000_000, thugs: 16, pistols: 16, beer: 16, crack: 350, medicine: 8 },
      },
    ],
  },
} as const satisfies Ruleset;
