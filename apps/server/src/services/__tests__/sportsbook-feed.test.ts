import { describe, expect, it } from 'vitest';
import {
  ProviderSession,
  diagnoseProviderEvent,
  summarizeSnapshot,
  isResultCheckDue,
  providerOutcome,
  resultBackoffMinutes,
  retryAfterMs,
  snapshotCoverage,
  sportsbookOddsCacheDue,
  sportsbookPollDates,
} from '../sportsbook-feed.service.js';

function reply(status: number, body: unknown = { events: [] }, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** A fetch that plays back responses (or thrown errors) in order and records each call. */
function scripted(...steps: Array<Response | Error>) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  const fetchImpl = (async (url: Parameters<typeof fetch>[0]) => {
    calls.push(String(url));
    const step = steps.shift();
    if (!step) throw new Error('unexpected request');
    if (step instanceof Error) throw step;
    return step;
  }) as typeof fetch;
  const sleep = async (ms: number) => { sleeps.push(ms); };
  const session = new ProviderSession('test-key', { used: 0, limit: 0, remaining: null, period: '' }, { fetch: fetchImpl, sleep });
  return { session, calls, sleeps };
}

describe('1.8.0-C sportsbook feed', () => {
  it('retries a server error with backoff, then returns the snapshot', async () => {
    const { session, calls, sleeps } = scripted(reply(503), reply(200, { events: [1] }));
    await expect(session.get('/sports/4/events/2026-10-11')).resolves.toEqual({ events: [1] });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2_000]);
    expect(session.stopped).toBeNull();
  });

  it('gives up after three network failures without stopping the rest of the run', async () => {
    const { session, calls, sleeps } = scripted(new Error('reset'), new Error('reset'), new Error('reset'));
    await expect(session.get('/sports/4/events/2026-10-11')).rejects.toMatchObject({ kind: 'NETWORK' });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([2_000, 4_000]);
    expect(session.stopped).toBeNull();
  });

  it('stops the whole run on a rejected key, without retrying or sending the next request', async () => {
    const { session, calls } = scripted(reply(401), reply(200));
    await expect(session.get('/sports/2/events/2026-10-11')).rejects.toMatchObject({ kind: 'AUTH' });
    await expect(session.get('/sports/4/events/2026-10-11')).rejects.toMatchObject({ kind: 'AUTH' });
    expect(calls).toHaveLength(1);
  });

  it('honours Retry-After on a 429 and stops the run if the limit holds', async () => {
    const retried = scripted(reply(429, {}, { 'retry-after': '1' }), reply(200));
    await retried.session.get('/x');
    expect(retried.sleeps).toEqual([1_000]);

    const limited = scripted(reply(429), reply(429), reply(429), reply(200));
    await expect(limited.session.get('/x')).rejects.toMatchObject({ kind: 'RATE_LIMITED' });
    expect(limited.session.stopped?.kind).toBe('RATE_LIMITED');
    await expect(limited.session.get('/y')).rejects.toMatchObject({ kind: 'RATE_LIMITED' });
    expect(limited.calls).toHaveLength(3);
  });

  it('does not retry a client error or accept a body that is not an object', async () => {
    const missing = scripted(reply(404), reply(200));
    await expect(missing.session.get('/events/nope')).rejects.toMatchObject({ kind: 'HTTP', status: 404 });
    expect(missing.calls).toHaveLength(1);
    const garbled = scripted(reply(200, ['not', 'an', 'object']));
    await expect(garbled.session.get('/x')).rejects.toMatchObject({ kind: 'PAYLOAD' });
  });

  it('tracks datapoint headers across requests, including retried ones', async () => {
    const usage = (points: string, remaining: string) => ({
      'x-datapoints': points, 'x-datapoints-used': '900', 'x-datapoints-limit': '1000', 'x-datapoints-remaining': remaining, 'x-datapoints-period': 'month',
    });
    const { session } = scripted(reply(503, {}, usage('0', '120')), reply(200, { events: [] }, usage('6', '114')), reply(200, { events: [] }, usage('4', '110')));
    await session.get('/a');
    await session.get('/b');
    expect(session.usageData(new Date(0))).toMatchObject({
      lastDatapoints: 10, datapointsUsed: 900, datapointsLimit: 1000, datapointsRemaining: 110, datapointsPeriod: 'month',
    });
    expect(session.quotaBelow(500)).toBe(true);
    expect(session.quotaBelow(50)).toBe(false);
  });

  it('parses Retry-After seconds and dates, capped at 30 seconds', () => {
    expect(retryAfterMs('3')).toBe(3_000);
    expect(retryAfterMs('600')).toBe(30_000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 5_000)).toBe(5_000);
    expect(retryAfterMs('soon')).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });

  it('paces result checks: not before a plausible final, then backing off to every 6 hours', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(resultBackoffMinutes)).toEqual([30, 30, 60, 120, 240, 360, 360]);
    const startsAt = new Date('2026-10-11T00:00:00.000Z');
    expect(isResultCheckDue({ sport: 'NFL', startsAt, nextResultCheckAt: null }, new Date('2026-10-11T02:59:00.000Z'))).toBe(false);
    expect(isResultCheckDue({ sport: 'NFL', startsAt, nextResultCheckAt: null }, new Date('2026-10-11T03:00:00.000Z'))).toBe(true);
    expect(isResultCheckDue({ sport: 'NBA', startsAt, nextResultCheckAt: null }, new Date('2026-10-11T02:15:00.000Z'))).toBe(true);
    const next = new Date('2026-10-11T05:00:00.000Z');
    expect(isResultCheckDue({ sport: 'NBA', startsAt, nextResultCheckAt: next }, new Date('2026-10-11T04:59:00.000Z'))).toBe(false);
    expect(isResultCheckDue({ sport: 'NBA', startsAt, nextResultCheckAt: next }, next)).toBe(true);
  });

  it('allows an odds refresh only 30 minutes after the cached file timestamp', () => {
    const updatedAt = new Date('2026-10-11T15:00:00.000Z');
    expect(sportsbookOddsCacheDue(updatedAt, new Date('2026-10-11T15:29:59.999Z'))).toBe(false);
    expect(sportsbookOddsCacheDue(updatedAt, new Date('2026-10-11T15:30:00.000Z'))).toBe(true);
    expect(sportsbookOddsCacheDue(null, new Date('2026-10-11T15:00:00.000Z'))).toBe(true);
  });

  it('reads provider status codes, words and flags into one outcome', () => {
    expect(providerOutcome({ status: 'STATUS_FINAL' })).toBe('FINAL');
    expect(providerOutcome({ status: 'Final/OT' })).toBe('FINAL');
    expect(providerOutcome({ is_final: true })).toBe('FINAL');
    expect(providerOutcome({ status: 'STATUS_CANCELED' })).toBe('CANCELLED');
    expect(providerOutcome({ event_status: 'postponed' })).toBe('CANCELLED');
    expect(providerOutcome({ status: 'STATUS_IN_PROGRESS' })).toBe('LIVE');
    // A suspended baseball game resumes later; it is not a void.
    expect(providerOutcome({ status: 'STATUS_SUSPENDED' })).toBe('LIVE');
    expect(providerOutcome({ status: 'STATUS_SCHEDULED' })).toBe('PRE');
    expect(providerOutcome({})).toBe('PRE');
  });

  it('adds yesterday while US evening games are ahead, and only pulls games a snapshot must contain', () => {
    expect(sportsbookPollDates(new Date('2026-10-11T04:00:00.000Z'))).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
    expect(sportsbookPollDates(new Date('2026-10-11T15:00:00.000Z'))).toEqual(['2026-10-11', '2026-10-12']);
    expect(snapshotCoverage(['2026-10-11', '2026-10-12'])).toEqual({
      from: new Date('2026-10-11T10:00:00.000Z'), to: new Date('2026-10-13T00:00:00.000Z'),
    });
  });
});

describe('1.8.0-E provider payload diagnostics', () => {
  const listing = (overrides: Record<string, unknown> = {}) => ({
    event_id: 'evt-1', event_date: '2026-10-11T23:00:00Z', status: 'STATUS_SCHEDULED',
    teams: [{ name: 'Road', is_away: true }, { name: 'House', is_away: false }],
    markets: [{ market_id: 1, participants: [{ name: 'Road', price: 120 }, { name: 'House', price: -140 }] }],
    ...overrides,
  });

  it('says why the feed would skip a listing, matching what it stores', () => {
    expect(diagnoseProviderEvent(listing())).toBeNull();
    expect(diagnoseProviderEvent(listing({ event_id: undefined }))).toBe('NO_EVENT_ID');
    expect(diagnoseProviderEvent(listing({ event_date: 'tomorrow-ish' }))).toBe('BAD_START');
    expect(diagnoseProviderEvent(listing({ teams: [{ name: 'Road', is_away: true }] }))).toBe('NO_TEAMS');
    expect(diagnoseProviderEvent(listing({ markets: [{ market_id: 2, participants: [] }] }))).toBe('NO_MONEYLINE');
    expect(diagnoseProviderEvent('not an object')).toBe('NO_EVENT_ID');
  });

  it('summarises a snapshot: parsed, skipped, priceless, statuses and samples', () => {
    const summary = summarizeSnapshot([
      listing(),
      listing({ event_id: 'evt-2', status: 'STATUS_IN_PROGRESS' }),
      listing({ event_id: 'evt-3', markets: [{ market_id: 1, participants: [] }] }),
      listing({ event_id: undefined }),
      listing({ event_id: 'evt-5', teams: [] }),
    ]);
    expect(summary).toMatchObject({
      events: 5, parsed: 3, withoutPrices: 1,
      skipped: { NO_EVENT_ID: 1, BAD_START: 0, NO_TEAMS: 1, NO_MONEYLINE: 0 },
    });
    expect(summary.statuses).toEqual([
      { raw: 'STATUS_SCHEDULED', outcome: 'PRE', count: 4 },
      { raw: 'STATUS_IN_PROGRESS', outcome: 'LIVE', count: 1 },
    ]);
    expect(summary.samples[0]).toEqual({
      providerEventId: 'evt-1', startsAt: '2026-10-11T23:00:00.000Z', homeTeam: 'House', awayTeam: 'Road',
      homeOdds: -140, awayOdds: 120, rawStatus: 'STATUS_SCHEDULED', outcome: 'PRE',
    });
  });
});
