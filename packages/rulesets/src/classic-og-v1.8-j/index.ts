import { classicOgV18I } from '../classic-og-v1.8-i/index.js';
import type { CityConditionRules, Ruleset } from '../types.js';

const cityConditions = [
  {
    key: 'neighborhood-festival',
    title: 'Neighborhood festival',
    description: 'Street vendors and late crowds make scouting livelier, while local counters see a short bump in sales.',
    districts: ['CASINO', 'NIGHTCLUB', 'LOW_RENT'],
    actions: ['SCOUT'],
    effects: { recruitPercent: 5 },
    schedule: { startFraction: 0.18, endFraction: 0.26 },
  },
  {
    key: 'supplier-convoy',
    title: 'Supplier convoy',
    description: 'A convoy brings extra ingredients through the city. Crews producing in the listed districts turn out a little more product.',
    districts: ['LOW_RENT', 'URBAN_GHETTO'],
    actions: ['PRODUCE_CRACK'],
    effects: { productPercent: 10 },
    schedule: { startFraction: 0.52, endFraction: 0.60 },
  },
  {
    key: 'last-call-crowd',
    title: 'Last call crowd',
    description: 'The late-night rush brings extra business to the entertainment strip before the round winds down.',
    districts: ['CASINO', 'NIGHTCLUB'],
    actions: ['SCOUT'],
    effects: { recruitPercent: 7 },
    schedule: { startFraction: 0.82, endFraction: 0.90 },
  },
  {
    key: 'money-in-motion-follow-up',
    title: 'Trader bonus shipment',
    description: 'The successful citywide sales drive attracts a short-lived shipment and better counter demand.',
    districts: ['CASINO', 'WINO_SLUMS', 'LOW_RENT', 'NIGHTCLUB', 'URBAN_GHETTO'],
    actions: ['STORE_SELL', 'PRODUCE_CRACK'],
    effects: { cashGainPercent: 8, productPercent: 5 },
    followUpFrom: { type: 'COMMUNITY', key: 'EVENT_MONEY_IN_MOTION' },
    durationMinutes: 360,
  },
  {
    key: 'witching-run-follow-up',
    title: 'Moonlit street fair',
    description: 'The Halloween run draws curious crowds into the city for a brief after-hours festival.',
    districts: ['CASINO', 'WINO_SLUMS', 'LOW_RENT', 'NIGHTCLUB', 'URBAN_GHETTO'],
    actions: ['SCOUT', 'STORE_SELL'],
    effects: { recruitPercent: 5, cashGainPercent: 5 },
    followUpFrom: { type: 'SEASONAL', key: 'HALLOWEEN_2026' },
    durationMinutes: 240,
  },
] satisfies readonly CityConditionRules[];

/** 1.8.5-F. Schedules bounded city modifiers and links optional event follow-ups. */
export const classicOgV18J = {
  ...classicOgV18I,
  meta: {
    id: 'classic-og-v1.8-j',
    version: '1.8.0-J',
    name: 'Classic OG - City Conditions and Event Chains',
    eventSystem: {
      communityEvents: 'FIRST_CLASS',
      seasonalEvents: 'FIRST_CLASS',
      randomEncounters: 'FIRST_CLASS',
      cityConditions: 'FIRST_CLASS',
    },
  },
  cityConditions,
} as const satisfies Ruleset;
