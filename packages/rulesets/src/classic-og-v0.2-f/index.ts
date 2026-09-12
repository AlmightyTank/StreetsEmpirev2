import { classicOgV02E } from '../classic-og-v0.2-e/index.js';
import type { Ruleset } from '../types.js';

/** 0.2.0-F turns the E raid-onboarding rules into the first production-facing public raid round. */
export const classicOgV02F = {
  ...classicOgV02E,
  meta: { id: 'classic-og-v0.2-f', version: '0.2.0-F', name: 'Classic OG - Public Raids' },
  round: {
    ...classicOgV02E.round,
    seededRivals: [],
  },
  combat: {
    ...classicOgV02E.combat,
    version: '0.2.0-F.2',
    specialRaids: {
      DRUG_HOES: {
        title: 'Drug their hoes',
        buttonLabel: 'Drug hoes',
        turnCost: classicOgV02E.combat.turnCost,
        crackPerWhore: 1,
        whoresPerSurvivor: 2,
        defenderCrackBurnPerWhore: 2,
        defenderCondomBurnPerWhore: 4,
      },
      STEAL_RIDE: {
        title: 'Steal a ride',
        buttonLabel: 'Steal ride',
        turnCost: classicOgV02E.combat.turnCost,
        lowRidersStolen: 1,
      },
      LURE_CREW: {
        title: 'Lure their crew',
        buttonLabel: 'Lure crew',
        turnCost: classicOgV02E.combat.turnCost,
        happinessBelow: 50,
        crackPerWhore: 1,
        beerPerThug: 1,
        whoresPerSurvivor: 2,
        thugsPerSurvivor: 1,
      },
    },
  },
} as const satisfies Ruleset;
