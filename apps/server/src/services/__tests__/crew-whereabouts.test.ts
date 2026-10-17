import { describe, expect, it } from 'vitest';
import type { Ruleset } from '@streets/rules-engine';
import { escortWhereabouts } from '../crew-whereabouts.js';

const ruleset = {
  cities: {
    'new-york': { name: 'New York City' },
    detroit: { name: 'Detroit' },
  },
  travel: {
    roads: [{ from: 'new-york', to: 'detroit', driveHours: 4 }],
    gameMinutesPerDriveHour: 60,
  },
} as unknown as Ruleset;

const depart = new Date('2026-10-17T12:00:00Z');
const arrive = new Date('2026-10-17T16:00:00Z');
const leave = new Date('2026-10-17T18:00:00Z');
const home = new Date('2026-10-17T22:00:00Z');

const stops = [
  { city: 'detroit', route: ['new-york', 'detroit'], departAt: depart, arriveAt: arrive, leaveAt: leave },
  { city: 'new-york', route: ['detroit', 'new-york'], departAt: leave, arriveAt: home, leaveAt: null },
];

describe('escort whereabouts', () => {
  it('names the city while the run is in town', () => {
    expect(escortWhereabouts(ruleset, stops, new Date('2026-10-17T17:00:00Z'))).toBe('On a run in Detroit');
  });

  it('names the road while the run is driving', () => {
    expect(escortWhereabouts(ruleset, stops, new Date('2026-10-17T13:00:00Z'))).toBe('On a run from New York City to Detroit');
  });

  it('says the run is home once the last stop has landed', () => {
    expect(escortWhereabouts(ruleset, stops, new Date('2026-10-17T23:00:00Z'))).toBe('On a run, back home');
  });
});
