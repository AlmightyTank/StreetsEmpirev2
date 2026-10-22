import { describe, expect, it } from 'vitest';
import { validateSportsbookTeamRegistry } from '../sportsbook-teams.js';

describe('sportsbook team registry', () => {
  it('contains complete, unambiguous metadata', () => {
    expect(validateSportsbookTeamRegistry()).toEqual([]);
  });
});
