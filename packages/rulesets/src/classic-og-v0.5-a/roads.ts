import type { TravelRules } from '../types.js';

/**
 * 0.5.0-A. Real interstates between the eight cities, with real drive hours.
 * A run follows these roads, so a long one drives through other cities.
 *
 * BALANCE_APPROXIMATION, set against `runTravelSimulation`
 * (docs/TRAVEL-SIMULATION-0.5.0-A.md). The road list is geography, not balance;
 * the costs underneath it are balance.
 */
export const travel = {
  roads: [
    { from: 'new-york-city', to: 'detroit', name: 'I-80', driveHours: 10, police: 1, note: 'The shortest run from New York.' },
    { from: 'new-york-city', to: 'atlanta', name: 'I-85', driveHours: 13, police: 1 },
    { from: 'new-york-city', to: 'miami-beach', name: 'I-95', driveHours: 19, police: 1.8, note: 'Direct, but the East Coast drug corridor: the most police of any road.' },
    { from: 'detroit', to: 'atlanta', name: 'I-75', driveHours: 11, police: 1 },
    { from: 'atlanta', to: 'miami-beach', name: 'I-75', driveHours: 10, police: 1.1 },
    { from: 'detroit', to: 'seattle', name: 'I-94 / I-90', driveHours: 33, police: 0.8, note: 'The northern route.' },
    { from: 'detroit', to: 'las-vegas', name: 'I-80 / I-15', driveHours: 29, police: 0.9, note: 'The central route.' },
    { from: 'atlanta', to: 'los-angeles', name: 'I-20 / I-10', driveHours: 31, police: 1.5, note: 'The southern route, along the border: heavy police.' },
    { from: 'las-vegas', to: 'los-angeles', name: 'I-15', driveHours: 4, police: 1 },
    { from: 'los-angeles', to: 'seattle', name: 'I-5', driveHours: 17, police: 1 },
    { from: 'los-angeles', to: 'beverly-hills', name: 'Sunset Blvd', driveHours: 0.5, police: 1.3, note: 'The only road into Beverly Hills.' },
  ],
  // Five minutes a drive hour: New York to Detroit is under an hour.
  gameMinutesPerDriveHour: 5,
  // A turn every two drive hours: New York to Detroit and back is 10 turns.
  turnsPerDriveHour: 0.5,
  cargoPerLowRider: 750,
  alternativeRouteShare: 0.3,
  maxRoutes: 3,
  supplyLevels: {
    PLENTIFUL: { shelf: 2, restock: 1.5, price: 0.8 },
    NORMAL: { shelf: 1, restock: 1, price: 1 },
    LOW: { shelf: 0.4, restock: 0.5, price: 1.25 },
    OUT: { shelf: 0, restock: 0, price: 1.5 },
  },
  highMarketSpread: 0.05,
} as const satisfies TravelRules;
