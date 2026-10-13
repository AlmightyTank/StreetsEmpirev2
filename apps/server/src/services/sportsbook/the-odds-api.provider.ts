import type { SportsbookProviderState } from '@prisma/client';
import type { SportsbookLeagueKey } from '@streets/shared';
import {
  ProviderError,
  ProviderSession,
  type NormalizedSportsbookEvent,
  type NormalizedSportsbookResult,
  type ProviderSessionDeps,
  type ProviderQuota,
  type ProviderTransport,
  type SportsbookProvider,
  type SportsbookProviderDiagnostic,
  type SportsbookProviderOutcome,
} from './sportsbook-provider.js';

export const THE_ODDS_API_PROVIDER_ID = 'theoddsapi';
const API_BASE = 'https://api.the-odds-api.com/v4';

const SPORT_KEYS: Record<SportsbookLeagueKey, string> = {
  NFL: 'americanfootball_nfl',
  NBA: 'basketball_nba',
  MLB: 'baseball_mlb',
  NHL: 'icehockey_nhl',
};

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord | null => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
const str = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const num = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const TRANSPORT: ProviderTransport = {
  id: THE_ODDS_API_PROVIDER_ID,
  name: 'The Odds API',
  baseUrl: API_BASE,
  authHeaders: () => ({}),
  authQuery: (apiKey) => ({ apiKey }),
  usage: (headers) => {
    const used = num(headers.get('x-requests-used'));
    const remaining = num(headers.get('x-requests-remaining'));
    return {
      units: num(headers.get('x-requests-last')) ?? 0,
      used: used ?? undefined,
      remaining: remaining ?? undefined,
      limit: used !== null && remaining !== null ? used + remaining : undefined,
      period: 'month',
    };
  },
};

export class TheOddsApiProviderSession extends ProviderSession {
  constructor(apiKey: string, quota: ProviderQuota, deps: ProviderSessionDeps = {}) {
    super(TRANSPORT, apiKey, quota, deps);
  }
}

function outcome(raw: JsonRecord): SportsbookProviderOutcome {
  if (raw.completed === true) return 'FINAL';
  const status = (str(raw.status) ?? '').toLowerCase();
  if (['cancelled', 'canceled', 'postponed', 'void', 'abandoned'].includes(status)) return 'CANCELLED';
  if (['live', 'in progress', 'in_progress'].includes(status)) return 'LIVE';
  return 'PRE';
}

function moneyline(raw: JsonRecord, homeTeam: string, awayTeam: string): { home: number | null; away: number | null } {
  for (const rawBookmaker of Array.isArray(raw.bookmakers) ? raw.bookmakers : []) {
    const bookmaker = record(rawBookmaker);
    if (!bookmaker) continue;
    const market = (Array.isArray(bookmaker.markets) ? bookmaker.markets : [])
      .map(record).find((row) => row?.key === 'h2h');
    if (!market || !Array.isArray(market.outcomes)) continue;
    let home: number | null = null;
    let away: number | null = null;
    for (const rawPrice of market.outcomes) {
      const price = record(rawPrice);
      const name = str(price?.name);
      const value = num(price?.price);
      if (!name || value === null || !Number.isInteger(value) || Math.abs(value) < 100) continue;
      if (name === homeTeam) home = value;
      if (name === awayTeam) away = value;
    }
    if (home !== null || away !== null) return { home, away };
  }
  return { home: null, away: null };
}

function normalizeEvent(raw: unknown, league: SportsbookLeagueKey): NormalizedSportsbookEvent | null {
  const event = record(raw);
  if (!event) return null;
  const providerEventId = str(event.id);
  const homeTeam = str(event.home_team);
  const awayTeam = str(event.away_team);
  const startsAt = new Date(String(event.commence_time ?? ''));
  if (!providerEventId || !homeTeam || !awayTeam || !Number.isFinite(startsAt.getTime())) return null;
  return {
    providerEventId,
    league,
    homeTeam,
    awayTeam,
    startsAt,
    status: outcome(event),
    prices: { moneyline: moneyline(event, homeTeam, awayTeam) },
    scores: { home: null, away: null },
  };
}

function normalizeResult(raw: unknown, league: SportsbookLeagueKey): NormalizedSportsbookResult | null {
  const event = record(raw);
  if (!event) return null;
  const providerEventId = str(event.id);
  const homeTeam = str(event.home_team);
  const awayTeam = str(event.away_team);
  if (!providerEventId || !homeTeam || !awayTeam) return null;
  let home: number | null = null;
  let away: number | null = null;
  for (const rawScore of Array.isArray(event.scores) ? event.scores : []) {
    const score = record(rawScore);
    if (str(score?.name) === homeTeam) home = num(score?.score);
    if (str(score?.name) === awayTeam) away = num(score?.score);
  }
  const startsAt = new Date(String(event.commence_time ?? ''));
  return {
    providerEventId, league, homeTeam, awayTeam,
    ...(Number.isFinite(startsAt.getTime()) ? { startsAt } : {}),
    status: outcome(event), scores: { home, away },
  };
}

const dateRange = (date: string) => ({
  commenceTimeFrom: `${date}T00:00:00Z`,
  commenceTimeTo: new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString(),
});

export class TheOddsApiProvider implements SportsbookProvider {
  readonly id = THE_ODDS_API_PROVIDER_ID;
  readonly name = 'The Odds API';
  readonly capabilities = {
    leagues: ['NFL', 'NBA', 'MLB', 'NHL'],
    markets: ['MONEYLINE'],
    odds: true,
    results: true,
    bulkResults: true,
  } as const;

  constructor(readonly session: ProviderSession) {}

  static fromState(apiKey: string, state: SportsbookProviderState, now: Date, deps: ProviderSessionDeps = {}): TheOddsApiProvider {
    return new TheOddsApiProvider(ProviderSession.fromState(TRANSPORT, apiKey, state, now, deps));
  }

  private async rawOdds(league: SportsbookLeagueKey, date: string): Promise<unknown[]> {
    const payload = await this.session.get(`/sports/${SPORT_KEYS[league]}/odds`, {
      regions: 'us', markets: 'h2h', oddsFormat: 'american', dateFormat: 'iso', ...dateRange(date),
    });
    if (!Array.isArray(payload)) throw new ProviderError('PAYLOAD', 'The Odds API snapshot is not an event list.');
    return payload;
  }

  async listEvents(league: SportsbookLeagueKey, dates: readonly string[]): Promise<NormalizedSportsbookEvent[]> {
    const events: NormalizedSportsbookEvent[] = [];
    for (const date of dates) {
      const raw = await this.rawOdds(league, date);
      events.push(...raw.map((event) => normalizeEvent(event, league)).filter((event): event is NormalizedSportsbookEvent => event !== null));
    }
    return events;
  }

  async listResults(league: SportsbookLeagueKey, _since?: Date): Promise<NormalizedSportsbookResult[]> {
    const payload = await this.session.get(`/sports/${SPORT_KEYS[league]}/scores`, { daysFrom: '3', dateFormat: 'iso' });
    if (!Array.isArray(payload)) throw new ProviderError('PAYLOAD', 'The Odds API scores response is not an event list.');
    return payload.map((event) => normalizeResult(event, league)).filter((event): event is NormalizedSportsbookResult => event !== null);
  }

  async getResult(providerEventId: string, league?: SportsbookLeagueKey): Promise<NormalizedSportsbookResult | null> {
    if (!league) return null;
    return (await this.listResults(league, new Date())).find((result) => result.providerEventId === providerEventId) ?? null;
  }

  async diagnose(league: SportsbookLeagueKey, date: string): Promise<SportsbookProviderDiagnostic> {
    const raw = await this.rawOdds(league, date);
    const parsed = raw.map((event) => normalizeEvent(event, league)).filter((event): event is NormalizedSportsbookEvent => event !== null);
    return {
      events: raw.length,
      parsed: parsed.length,
      withoutPrices: parsed.filter((event) => event.prices.moneyline.home === null && event.prices.moneyline.away === null).length,
      skipped: { NO_EVENT_ID: raw.length - parsed.length, BAD_START: 0, NO_TEAMS: 0, NO_MONEYLINE: 0 },
      statuses: [...new Set(parsed.map((event) => event.status))].map((status) => ({ raw: status, outcome: status, count: parsed.filter((event) => event.status === status).length })),
      samples: parsed.slice(0, 5).map((event) => ({
        providerEventId: event.providerEventId,
        startsAt: event.startsAt.toISOString(),
        homeTeam: event.homeTeam,
        awayTeam: event.awayTeam,
        homeOdds: event.prices.moneyline.home,
        awayOdds: event.prices.moneyline.away,
        rawStatus: event.status,
        outcome: event.status,
      })),
    };
  }
}
