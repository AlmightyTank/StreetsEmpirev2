import { describe, expect, it } from 'vitest';
import { TheRundownProvider, TheRundownProviderSession } from '../sportsbook/therundown.provider.js';
import { TheOddsApiProvider, TheOddsApiProviderSession } from '../sportsbook/the-odds-api.provider.js';
import { EspnProvider } from '../sportsbook/espn.provider.js';
import { ProviderSession } from '../sportsbook/sportsbook-provider.js';

const quota = { used: 0, limit: 0, remaining: null, period: '' };

describe('sportsbook provider seam', () => {
  it('normalizes TheRundown listings and keeps one request per requested date', async () => {
    const calls: Array<{ url: string; key: string | null }> = [];
    const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(input), key: new Headers(init?.headers).get('X-TheRundown-Key') });
      return new Response(JSON.stringify({ events: [{
        event_id: 'evt-1', event_date: '2026-10-12T18:00:00Z',
        score: { event_status: 'STATUS_SCHEDULED', score_away: 0, score_home: 0 },
        teams: [
          { team_id: 1, name: 'Road', mascot: 'Runners', is_away: true },
          { team_id: 2, name: 'Home', mascot: 'Heroes', is_home: true },
        ],
        markets: [{ market_id: 1, participants: [
          { id: 1, lines: [{ prices: { 3: { price: 125, is_main_line: true } } }] },
          { id: 2, lines: [{ prices: { 3: { price: -145, is_main_line: true } } }] },
        ] }],
      }] }), { status: 200, headers: { 'x-datapoints': '4' } });
    }) as typeof fetch;
    const provider = new TheRundownProvider(new TheRundownProviderSession('secret', quota, { fetch: fetchImpl }));

    await expect(provider.listEvents('NFL', ['2026-10-12'])).resolves.toEqual([{
      providerEventId: 'evt-1', league: 'NFL', homeTeam: 'Home Heroes', awayTeam: 'Road Runners',
      startsAt: new Date('2026-10-12T18:00:00.000Z'), status: 'PRE',
      prices: { moneyline: { home: -145, away: 125 } }, scores: { home: 0, away: 0 },
    }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      url: 'https://therundown.io/api/v2/sports/2/events/2026-10-12?market_ids=1&affiliate_ids=3&main_line=true&hide_closed=true',
      key: 'secret',
    });
    expect(provider.session.datapoints).toBe(4);
  });

  it('normalizes a wrapped single-event result without exposing the vendor payload', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ events: [{
      event_id: 'evt-final', score: { event_status: 'STATUS_FINAL', score_away: 21, score_home: 24 },
    }] }), { status: 200 })) as typeof fetch;
    const provider = new TheRundownProvider(new TheRundownProviderSession('secret', quota, { fetch: fetchImpl }));

    await expect(provider.getResult('evt-final')).resolves.toEqual({
      providerEventId: 'evt-final', status: 'FINAL', scores: { home: 24, away: 21 },
    });
  });

  it('normalizes The Odds API moneylines, query authentication and request credits', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      calls.push(String(input));
      return new Response(JSON.stringify([{
        id: 'odds-1', sport_key: 'basketball_nba', commence_time: '2026-10-12T23:00:00Z',
        home_team: 'Chicago Bulls', away_team: 'Boston Celtics',
        bookmakers: [{ key: 'draftkings', markets: [{ key: 'h2h', outcomes: [
          { name: 'Boston Celtics', price: 120 }, { name: 'Chicago Bulls', price: -140 },
        ] }] }],
      }]), { status: 200, headers: { 'x-requests-last': '1', 'x-requests-used': '12', 'x-requests-remaining': '488' } });
    }) as typeof fetch;
    const provider = new TheOddsApiProvider(new TheOddsApiProviderSession('odds-secret', quota, { fetch: fetchImpl }));

    await expect(provider.listEvents('NBA', ['2026-10-12'])).resolves.toEqual([{
      providerEventId: 'odds-1', league: 'NBA', homeTeam: 'Chicago Bulls', awayTeam: 'Boston Celtics',
      startsAt: new Date('2026-10-12T23:00:00.000Z'), status: 'PRE',
      prices: { moneyline: { home: -140, away: 120 } }, scores: { home: null, away: null },
    }]);
    const url = new URL(calls[0]!);
    expect(url.pathname).toBe('/v4/sports/basketball_nba/odds');
    expect(url.searchParams.get('apiKey')).toBe('odds-secret');
    expect(url.searchParams.get('markets')).toBe('h2h');
    expect(provider.session).toMatchObject({ datapoints: 1, used: 12, remaining: 488, limit: 500, period: 'month' });
  });

  it('normalizes The Odds API bulk scores', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify([{
      id: 'odds-final', completed: true, home_team: 'Chicago Bulls', away_team: 'Boston Celtics',
      scores: [{ name: 'Boston Celtics', score: '101' }, { name: 'Chicago Bulls', score: '108' }],
    }]), { status: 200 })) as typeof fetch;
    const provider = new TheOddsApiProvider(new TheOddsApiProviderSession('secret', quota, { fetch: fetchImpl }));
    await expect(provider.listResults('NBA', new Date())).resolves.toEqual([{
      providerEventId: 'odds-final', league: 'NBA', homeTeam: 'Chicago Bulls', awayTeam: 'Boston Celtics',
      status: 'FINAL', scores: { home: 108, away: 101 },
    }]);
  });

  it('normalizes ESPN bulk scoreboard results without authentication or billing units', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ events: [{
        id: 'espn-final', date: '2026-10-12T23:00:00Z',
        competitions: [{
          status: { type: { name: 'STATUS_FINAL', state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '108', team: { displayName: 'Chicago Bulls' } },
            { homeAway: 'away', score: '101', team: { displayName: 'Boston Celtics' } },
          ],
        }],
      }] }), { status: 200 });
    }) as typeof fetch;
    const session = new ProviderSession({
      id: 'espn', name: 'ESPN scoreboard', baseUrl: 'https://site.api.espn.com/apis/site/v2/sports',
      authHeaders: () => ({}), usage: () => ({ units: 0 }),
    }, '', quota, { fetch: fetchImpl });
    const provider = new EspnProvider(session);

    await expect(provider.listResults('NBA', new Date('2026-10-12T00:00:00Z'))).resolves.toEqual([{
      providerEventId: 'espn-final', league: 'NBA', homeTeam: 'Chicago Bulls', awayTeam: 'Boston Celtics',
      startsAt: new Date('2026-10-12T23:00:00Z'), status: 'FINAL', scores: { home: 108, away: 101 },
    }]);
    expect(new URL(calls[0]!).pathname).toBe('/apis/site/v2/sports/basketball/nba/scoreboard');
    expect(session.datapoints).toBe(0);
  });
});
