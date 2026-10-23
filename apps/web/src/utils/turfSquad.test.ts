import { describe, expect, it } from 'vitest';
import { homeSquadBlock, initialTurfSquad } from './turfSquad.js';

describe('turf squads', () => {
  it('does not offer away thugs as a claim squad', () => {
    expect(initialTurfSquad(false, 0, 45, 0)).toBe(0);
    expect(homeSquadBlock(0, 45)).toBe('away');
  });

  it('caps a claim at the thugs who are still at home', () => {
    expect(initialTurfSquad(false, 8, 45, 0)).toBe(8);
    expect(homeSquadBlock(8, 8)).toBeNull();
    expect(homeSquadBlock(8, 9)).toBe('short');
  });

  it('still lets a held corner pull the crew that is posted there', () => {
    expect(initialTurfSquad(true, 0, 4, 10)).toBe(4);
    expect(homeSquadBlock(0, 4)).toBe('away');
  });
});
