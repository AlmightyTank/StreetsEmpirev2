import { describe, expect, it } from 'vitest';
import { resolveSportsbookTeam } from '@streets/shared';
import { matchSportsbookEvent } from '../sportsbook/sportsbook-event-matcher.js';
import type { NormalizedSportsbookEvent } from '../sportsbook/sportsbook-provider.js';

const at = (hour: number) => new Date(`2026-10-12T${String(hour).padStart(2, '0')}:00:00.000Z`);
const listing = (startsAt = at(18)): NormalizedSportsbookEvent => ({
  providerEventId: 'provider-1', league: 'MLB', homeTeam: 'NYY', awayTeam: 'Boston Red Sox', startsAt,
  status: 'PRE', prices: { moneyline: { home: -120, away: 105 } }, scores: { home: null, away: null },
});
const game = (id: string, startsAt: Date, homeTeam = 'New York Yankees', awayTeam = 'Boston Red Sox') => ({
  id, sport: 'MLB', homeTeam, awayTeam, startsAt,
});

describe('sportsbook canonical event matching', () => {
  it('resolves abbreviations, mascot/city forms and recent franchise names', () => {
    expect(resolveSportsbookTeam('NFL', 'JAX')).toBe('JAX');
    expect(resolveSportsbookTeam('NFL', 'Jacksonville Jaguars')).toBe('JAX');
    expect(resolveSportsbookTeam('NFL', 'Oakland Raiders')).toBe('LV');
    expect(resolveSportsbookTeam('MLB', 'Cleveland Indians')).toBe('CLE');
    expect(resolveSportsbookTeam('NHL', 'Utah Hockey Club')).toBe('UTA');
    expect(resolveSportsbookTeam('NFL', 'New York')).toBeNull();
  });

  it('takes the nearest start for an MLB doubleheader', () => {
    const result = matchSportsbookEvent(listing(at(21)), [game('early', at(18)), game('late', at(22))]);
    expect(result).toMatchObject({ kind: 'MATCHED', event: { id: 'late' } });
  });

  it('refuses an equal-distance ambiguity instead of guessing', () => {
    expect(matchSportsbookEvent(listing(at(20)), [game('one', at(19)), game('two', at(21))])).toEqual({
      kind: 'AMBIGUOUS', candidateIds: ['one', 'two'],
      teams: { homeTeamId: 'NYY', awayTeamId: 'BOS', homeTeam: 'New York Yankees', awayTeam: 'Boston Red Sox' },
    });
  });

  it('does not match outside three hours or when either team is unknown', () => {
    expect(matchSportsbookEvent(listing(at(22)), [game('too-early', at(18))]).kind).toBe('NO_MATCH');
    expect(matchSportsbookEvent({ ...listing(), homeTeam: 'Mystery Club' }, [game('one', at(18))]).kind).toBe('UNKNOWN_TEAM');
  });
});
