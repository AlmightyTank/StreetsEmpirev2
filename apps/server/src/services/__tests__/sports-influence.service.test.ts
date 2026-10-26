import { describe, expect, it } from 'vitest';
import {
  resolveSportsInfluence,
  sportsInfluenceContract,
  type SportsInfluenceContract,
} from '../sports-influence.service.js';

const contract: SportsInfluenceContract = {
  eventId: 'event-alpha',
  sport: 'NFL',
  homeTeam: 'Metro City Wolves',
  awayTeam: 'Harbor Kings',
  startsAt: '2026-10-27T20:00:00.000Z',
  targetTeam: 'HOME',
  desiredOutcome: 'LOSE',
  targetRole: 'starting quarterback',
};

describe('sports influence resolver', () => {
  it('is deterministic for the same contract, approach, and heat', () => {
    const now = new Date('2026-10-26T20:00:00.000Z');
    expect(resolveSportsInfluence(contract, 'ACE_ACCESS', 10, now))
      .toEqual(resolveSportsInfluence(contract, 'ACE_ACCESS', 10, now));
  });

  it('uses the official settled outcome when one is supplied', () => {
    const now = new Date('2026-10-26T20:00:00.000Z');
    expect(resolveSportsInfluence(contract, 'ACE_ACCESS', 10, now, 'WIN')).toMatchObject({
      actualOutcome: 'WIN',
      success: false,
    });
  });

  it('parses a stored contract and preserves a recorded resolution', () => {
    expect(sportsInfluenceContract({ sportsInfluence: contract })).toMatchObject({ eventId: 'event-alpha' });
    expect(sportsInfluenceContract({ sportsInfluence: { ...contract, resolved: { success: true } } }))
      .toMatchObject({ eventId: 'event-alpha', resolved: { success: true } });
    expect(sportsInfluenceContract({ nope: true })).toBeNull();
  });
});
