import { classicOgV04B } from '../classic-og-v0.4-b/index.js';
import type { ProductEffects, Ruleset } from '../types.js';

/**
 * 0.4.0-C gives every product an identity and switches Heat on.
 *
 * Numbers are BALANCE_APPROXIMATION, set against `simulateProducts` in the rules
 * engine (docs/PRODUCTS-SIMULATION-0.4.0-C.md). The rule the simulation holds
 * them to: no product is the best answer on every job, and Heat can always be
 * brought down.
 *
 * Crack keeps a crack-only player close to 0.4.0-B. What changes for them is that
 * running dry now costs take, and production thugs burn a little crack too.
 */
const effects = {
  // Street work, general use. Cheap and dependable, no specialty.
  CRACK: {
    referenceCostCents: 1_000,
    hoes: {
      take: 1,
      jobTake: { WINO_SLUMS: 1.1, LOW_RENT: 1.05, URBAN_GHETTO: 1.05, NIGHTCLUB: 0.9, CASINO: 0.85 },
      happinessWeight: 1,
      recruitment: 1,
      departures: 1,
      heatPerTurn: 0.1,
    },
    thugs: { output: 1.1, morale: 5, departures: 1, heatPerTurn: 0.1 },
  },
  // Low-pressure work. Calm and steady, a little slower.
  WEED: {
    referenceCostCents: 800,
    hoes: {
      take: 0.9,
      jobTake: { LOW_RENT: 1.1 },
      happinessWeight: 1.4,
      recruitment: 1,
      departures: 0.5,
      heatPerTurn: 0,
    },
    thugs: { output: 0.95, morale: 25, departures: 0.6, heatPerTurn: 0 },
  },
  // Casino and Nightclub. Higher take and client attraction; expensive and specialized.
  ECSTASY: {
    referenceCostCents: 3_000,
    hoes: {
      take: 1,
      jobTake: { CASINO: 1.3, NIGHTCLUB: 1.45, LOW_RENT: 0.75, URBAN_GHETTO: 0.75, WINO_SLUMS: 0.6 },
      happinessWeight: 0.7,
      recruitment: 1.35,
      departures: 1,
      heatPerTurn: 0.3,
    },
    thugs: { output: 0.8, morale: 0, departures: 1.2, heatPerTurn: 0.3 },
  },
  // Casino and high-end blocks. Higher income, better output; costly and hot.
  COCAINE: {
    referenceCostCents: 4_000,
    hoes: {
      take: 1.15,
      jobTake: { CASINO: 1.4, NIGHTCLUB: 1.15, URBAN_GHETTO: 1.1, LOW_RENT: 0.9, WINO_SLUMS: 0.75 },
      happinessWeight: 0.8,
      recruitment: 1,
      departures: 1,
      heatPerTurn: 0.6,
    },
    thugs: { output: 1.3, morale: 10, departures: 1, heatPerTurn: 0.6 },
  },
  // Production and thug work. Weak on the street; trouble follows it.
  METH: {
    referenceCostCents: 1_500,
    hoes: {
      take: 0.85,
      happinessWeight: 0.4,
      recruitment: 0.9,
      departures: 1.4,
      heatPerTurn: 0.8,
    },
    thugs: { output: 1.6, morale: 0, departures: 1.3, heatPerTurn: 0.5 },
  },
  // Desperate, low-end crews. Holds them together until it runs out.
  HEROIN: {
    referenceCostCents: 1_500,
    hoes: {
      take: 0.95,
      jobTake: { WINO_SLUMS: 1.15, URBAN_GHETTO: 1.1, LOW_RENT: 1.05 },
      happinessWeight: 2,
      recruitment: 0.9,
      departures: 0.1,
      crashDepartures: 4,
      heatPerTurn: 0.25,
    },
    thugs: { output: 0.9, morale: 45, departures: 0.2, heatPerTurn: 0.25 },
  },
} as const satisfies Record<string, ProductEffects>;

const products = Object.fromEntries(
  Object.entries(classicOgV04B.products).map(([key, product]) => [key, { ...product, effects: effects[key as keyof typeof effects] }]),
) as { [K in keyof typeof classicOgV04B.products]: (typeof classicOgV04B.products)[K] & { effects: (typeof effects)[K] } };

export const classicOgV04C = {
  ...classicOgV04B,
  meta: { id: 'classic-og-v0.4-c', version: '0.4.0-C', name: 'Classic OG - Product Effects & Heat' },
  products,
  workSupply: {
    ...classicOgV04B.workSupply,
    // Running out now costs something: the dry part of a trip earns less and loses more.
    dryTakeMultiplier: 0.8,
    dryDepartureMultiplier: 1.5,
    // Production thugs burn a tenth of a crack-equivalent of what they cook.
    productPerThugPerTurn: 0.05,
    roundNeedUp: true,
  },
  heat: {
    max: 100,
    // Two turns an interval, so a player spending every turn loses a point for every two.
    decayPerInterval: 1,
    crewScale: { whores: 100, thugs: 25 },
    drag: { startsAt: 40, maxTakePenalty: 0.35 },
    bust: { startsAt: 70, chanceAtMax: 0.35, productSeizedFraction: 0.5, cashFineFraction: 0.05, heatDrop: 40 },
    bribe: { minCentsPerPoint: 10_000, netWorthFractionPerPoint: 0.002 },
  },
} as const satisfies Ruleset;
