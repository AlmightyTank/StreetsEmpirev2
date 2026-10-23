import type { SportsbookProviderState } from '@prisma/client';
import type { SportsbookLeagueKey } from '@streets/shared';
import {
  ProviderError,
  ProviderSession,
  type NormalizedSportsbookResult,
  type ProviderSessionDeps,
  type ProviderTransport,
  type SportsbookProvider,
  type SportsbookProviderOutcome,
} from './sportsbook-provider.js';

export const ESPN_PROVIDER_ID = 'espn';
const API_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

const LEAGUES: Record<SportsbookLeagueKey, string> = {
  NFL: 'football/nfl', NBA: 'basketball/nba', MLB: 'baseball/mlb', NHL: 'hockey/nhl',
  SOFTBALL: 'baseball/college-softball', MMA: 'mma/ufc',
};

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord | null => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
const str = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const num = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const TRANSPORT: ProviderTransport = {
  id: ESPN_PROVIDER_ID,
  name: 'ESPN scoreboard',
  baseUrl: API_BASE,
  authHeaders: () => ({}),
  usage: () => ({ units: 0, period: 'public' }),
};

function outcome(status: JsonRecord | null): SportsbookProviderOutcome {
  const type = record(status?.type);
  const value = `${str(type?.name) ?? ''} ${str(type?.description) ?? ''} ${str(type?.detail) ?? ''}`.toLowerCase();
  if (/(cancel|postpon|suspend|abandon|forfeit)/.test(value)) return 'CANCELLED';
  if (type?.completed === true) return 'FINAL';
  if ((str(type?.state) ?? '').toLowerCase() === 'in' || /(in progress|halftime|quarter|period|inning)/.test(value)) return 'LIVE';
  return 'PRE';
}

function normalize(raw: unknown, league: SportsbookLeagueKey): NormalizedSportsbookResult | null {
  const event = record(raw);
  const competition = record(Array.isArray(event?.competitions) ? event.competitions[0] : null);
  if (!event || !competition) return null;
  const providerEventId = str(event.id);
  const startsAt = new Date(String(event.date ?? competition.date ?? ''));
  let homeTeam: string | null = null;
  let awayTeam: string | null = null;
  let home: number | null = null;
  let away: number | null = null;
  for (const rawCompetitor of Array.isArray(competition.competitors) ? competition.competitors : []) {
    const competitor = record(rawCompetitor);
    const team = record(competitor?.team);
    const side = str(competitor?.homeAway);
    const name = str(team?.displayName) ?? str(team?.shortDisplayName) ?? str(team?.name);
    if (side === 'home') { homeTeam = name; home = num(competitor?.score); }
    if (side === 'away') { awayTeam = name; away = num(competitor?.score); }
  }
  if (!providerEventId || !homeTeam || !awayTeam || !Number.isFinite(startsAt.getTime())) return null;
  return {
    providerEventId, league, homeTeam, awayTeam, startsAt,
    status: outcome(record(competition.status) ?? record(event.status)), scores: { home, away },
  };
}

export class EspnProvider implements SportsbookProvider {
  readonly id = ESPN_PROVIDER_ID;
  readonly name = 'ESPN scoreboard';
  readonly capabilities = {
    leagues: ['NFL', 'NBA', 'MLB', 'NHL'], markets: [], odds: false, results: true, bulkResults: true,
  } as const;

  constructor(readonly session: ProviderSession) {}

  static fromState(state: SportsbookProviderState, now: Date, deps: ProviderSessionDeps = {}): EspnProvider {
    return new EspnProvider(ProviderSession.fromState(TRANSPORT, '', state, now, deps));
  }

  async listEvents(): Promise<[]> { return []; }

  async listResults(league: SportsbookLeagueKey, since: Date): Promise<NormalizedSportsbookResult[]> {
    const start = since.toISOString().slice(0, 10).replaceAll('-', '');
    const end = new Date(since.getTime() + 3 * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '');
    const payload = record(await this.session.get(`/${LEAGUES[league]}/scoreboard`, { dates: `${start}-${end}`, limit: '1000' }));
    if (!payload || !Array.isArray(payload.events)) throw new ProviderError('PAYLOAD', 'ESPN scoreboard response has no events list.');
    return payload.events.map((event) => normalize(event, league)).filter((event): event is NormalizedSportsbookResult => event !== null);
  }

  async getResult(providerEventId: string, league?: SportsbookLeagueKey): Promise<NormalizedSportsbookResult | null> {
    if (!league) return null;
    return (await this.listResults(league, new Date(Date.now() - 3 * 86_400_000)))
      .find((result) => result.providerEventId === providerEventId) ?? null;
  }
}
