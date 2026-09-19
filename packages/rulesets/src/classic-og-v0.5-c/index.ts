import { classicOgV05B } from '../classic-og-v0.5-b/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.5.0-C puts money and risk on the road. Every city gets a live high market shared
 * by the whole round, Pip's supply moves on a schedule seeded per round, gluts and
 * droughts land and make the street wire, selling draws Heat, the police stop cars on
 * the interstates, and Heat past a city's arrest level gets you arrested.
 *
 * BALANCE_APPROXIMATION, set against `runTravelRiskSimulation`
 * (docs/TRAVEL-SIMULATION-0.5.0-C.md): risk widens the range of a run's outcome and
 * leaves its expected value where 0.5.0-A put it.
 */
export const classicOgV05C = {
  ...classicOgV05B,
  meta: { id: 'classic-og-v0.5-c', version: '0.5.0-C', name: 'Classic OG - Travel' },
  travel: {
    ...classicOgV05B.travel,
    // The high market leans with Pip's supply, less than his counter does, so the
    // same-city check holds at every level.
    supplyLevels: {
      PLENTIFUL: { ...classicOgV05B.travel.supplyLevels.PLENTIFUL, market: 0.9 },
      NORMAL: { ...classicOgV05B.travel.supplyLevels.NORMAL, market: 1 },
      LOW: { ...classicOgV05B.travel.supplyLevels.LOW, market: 1.1 },
      OUT: { ...classicOgV05B.travel.supplyLevels.OUT, market: 1.25 },
    },
    market: {
      // Half a push wears off in an hour and a half: a dumped market is soft for the
      // next run through, and back by the evening.
      recoveryHalfLifeMinutes: 90,
      maxPushDown: 0.9,
      maxPushUp: 1,
      quoteTolerance: 0.02,
    },
    swings: {
      // Four hours a level: about two town windows.
      slotMinutes: 240,
      moveChance: 0.5,
      bigMoveShare: 0.3,
      wireShare: 0.5,
      // Up to a fifth either way in Las Vegas, a fiftieth in New York.
      marketDrift: 0.2,
    },
    events: {
      slotMinutes: 720,
      // Las Vegas rolls one in about a third of half-days, New York almost never.
      chance: 0.35,
      kinds: {
        GLUT: { weight: 1, durationMinutes: 360, supply: 'PLENTIFUL', marketMultiplier: 0.6 },
        DROUGHT: { weight: 1, durationMinutes: 360, supply: 'OUT', marketMultiplier: 2 },
      },
    },
    stops: {
      chancePerDriveHour: 0.0012,
      cargoScale: 1500,
      maxCargoFactor: 3,
      escortCut: 0.05,
      minEscortFactor: 0.4,
      productSeizedFraction: 0.25,
      cashFineFraction: 0.1,
    },
    saleHeat: { perTenThousandDollars: 2 },
  },
  heat: {
    ...classicOgV05B.heat,
    arrest: {
      // New York's level; every other city sets its own.
      startsAt: 90,
      chanceAtMax: 0.25,
      productSeizedFraction: 0.75,
      cashFineFraction: 0.15,
      heatDrop: 60,
      downtimeMinutes: 120,
      runCashSeizedFraction: 0.5,
    },
  },
} as const satisfies Ruleset;
