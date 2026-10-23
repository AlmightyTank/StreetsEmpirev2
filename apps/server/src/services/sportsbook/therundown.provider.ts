import type { SportsbookProviderState } from '@prisma/client';
import type { SportsbookLeagueKey } from '@streets/shared';
import {
  ProviderError,
  ProviderSession,
  type NormalizedSportsbookEvent,
  type NormalizedSportsbookResult,
  type ProviderQuota,
  type ProviderSessionDeps,
  type ProviderTransport,
  type SportsbookProvider,
  type SportsbookProviderDiagnostic,
  type SportsbookProviderOutcome,
} from './sportsbook-provider.js';

export const THERUNDOWN_PROVIDER_ID = 'therundown';
const THERUNDOWN_API_BASE = 'https://therundown.io/api/v2';
const THERUNDOWN_AFFILIATE_ID = '3';

const LEAGUE_SPORT_IDS: Record<SportsbookLeagueKey, number> = {
  NFL: 2,
  NBA: 4,
  MLB: 3,
  NHL: 6,
  SOFTBALL: 0,
  MMA: 0,
};

type JsonRecord = Record<string, unknown>;
export type TheRundownEvent = {
  event_id?: unknown;
  starts_at?: unknown;
  event_date?: unknown;
  teams?: unknown;
  markets?: unknown;
  score?: unknown;
  status?: unknown;
  event_status?: unknown;
  is_live?: unknown;
  live?: unknown;
  is_final?: unknown;
  final?: unknown;
};

const record = (value: unknown): JsonRecord | null => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
const str = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const num = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const THERUNDOWN_TRANSPORT: ProviderTransport = {
  id: THERUNDOWN_PROVIDER_ID,
  name: 'TheRundown',
  baseUrl: THERUNDOWN_API_BASE,
  authHeaders: (apiKey) => ({ 'X-TheRundown-Key': apiKey }),
  usage: (headers) => ({
    units: num(headers.get('x-datapoints')) ?? 0,
    used: num(headers.get('x-datapoints-used')) ?? undefined,
    limit: num(headers.get('x-datapoints-limit')) ?? undefined,
    remaining: num(headers.get('x-datapoints-remaining')) ?? undefined,
    period: headers.get('x-datapoints-period') ?? undefined,
  }),
};

/** Convenience session for adapter tests and one-off diagnostics. */
export class TheRundownProviderSession extends ProviderSession {
  constructor(apiKey: string, quota: ProviderQuota, deps: ProviderSessionDeps = {}) {
    super(THERUNDOWN_TRANSPORT, apiKey, quota, deps);
  }

  override async get(path: string, params: Record<string, string> = {}): Promise<JsonRecord> {
    const body = record(await super.get(path, params));
    if (!body) throw new ProviderError('PAYLOAD', 'TheRundown returned something other than a JSON object.');
    return body;
  }
}

/** The provider's own status string, wherever TheRundown puts it. */
export function rawProviderStatus(event: TheRundownEvent): string {
  return str(event.status) ?? str(event.event_status) ?? str(record(event.score)?.event_status) ?? '';
}

/** Reads TheRundown status codes, words and flags into the provider-neutral outcome. */
export function providerOutcome(event: TheRundownEvent): SportsbookProviderOutcome {
  const status = rawProviderStatus(event).toLowerCase().replace(/^status_/, '').replaceAll('_', ' ');
  if (['cancelled', 'canceled', 'postponed', 'void', 'abandoned'].includes(status)) return 'CANCELLED';
  if (event.is_final === true || event.final === true || status.startsWith('final') || ['completed', 'complete'].includes(status)) return 'FINAL';
  if (event.is_live === true || event.live === true || ['live', 'in progress', 'halftime', 'end period', 'end of period', 'delayed', 'rain delay', 'suspended'].includes(status)) return 'LIVE';
  return 'PRE';
}

/** "Philadelphia" + "Eagles": TheRundown v2 splits the city from the mascot. */
function teamDisplayName(team: JsonRecord): string | null {
  const name = str(team.name) ?? str(team.team_name);
  if (!name) return null;
  const mascot = str(team.mascot);
  return mascot && !name.toLowerCase().includes(mascot.toLowerCase()) ? `${name} ${mascot}` : name;
}

/** Away and home team records: by flag, else TheRundown's order (away first, home second). */
export function eventTeams(event: TheRundownEvent): { home: JsonRecord; away: JsonRecord } | null {
  if (!Array.isArray(event.teams)) return null;
  const teams = event.teams.map(record).filter((team): team is JsonRecord => Boolean(team));
  let away = teams.find((team) => team.is_away === true) ?? teams.find((team) => team.is_home === false);
  let home = teams.find((team) => team.is_home === true) ?? teams.find((team) => team.is_away === false);
  if (!away && !home && teams.length === 2) [away, home] = teams;
  if (!home || !away || home === away || !teamDisplayName(home) || !teamDisplayName(away)) return null;
  return { home, away };
}

const teamIds = (team: JsonRecord) => [team.team_id, team.id, team.team_normalized_id]
  .filter((value) => typeof value === 'string' || typeof value === 'number').map(String);
const teamNames = (team: JsonRecord) => [str(team.name), str(team.team_name), teamDisplayName(team), str(team.abbreviation)]
  .filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase());

function participantSide(participant: JsonRecord, teams: { home: JsonRecord; away: JsonRecord }): 'HOME' | 'AWAY' | null {
  const id = participant.team_id ?? participant.id;
  if (typeof id === 'string' || typeof id === 'number') {
    if (teamIds(teams.home).includes(String(id))) return 'HOME';
    if (teamIds(teams.away).includes(String(id))) return 'AWAY';
  }
  const label = (str(participant.name) ?? str(participant.participant_name) ?? str(participant.team_name) ?? str(participant.label))?.toLowerCase();
  if (!label) return null;
  if (teamNames(teams.home).includes(label)) return 'HOME';
  if (teamNames(teams.away).includes(label)) return 'AWAY';
  return null;
}

/** A whole-number American price; TheRundown sends 0.0001 for a line that is off the board. */
function americanPrice(value: unknown): number | null {
  const price = num(value);
  return price !== null && Number.isInteger(price) && Math.abs(price) >= 100 ? price : null;
}

/** Read a participant's flat v1 or nested v2 TheRundown moneyline. */
export function participantPrice(participant: JsonRecord, affiliateId = THERUNDOWN_AFFILIATE_ID): number | null {
  const flat = americanPrice(participant.price) ?? americanPrice(participant.odds) ?? americanPrice(participant.american_odds);
  if (flat !== null) return flat;
  const offers: Array<{ price: number | null; ours: boolean; main: boolean }> = [];
  for (const rawLine of Array.isArray(participant.lines) ? participant.lines : []) {
    const line = record(rawLine);
    if (!line) continue;
    const entries: Array<[string, unknown]> = Array.isArray(line.prices)
      ? line.prices.map((entry): [string, unknown] => [String(record(entry)?.affiliate_id ?? ''), entry])
      : Object.entries(record(line.prices) ?? {});
    for (const [key, raw] of entries) {
      const entry = record(raw);
      const price = entry ? americanPrice(entry.price) ?? americanPrice(entry.price_american) ?? americanPrice(entry.american) : americanPrice(raw);
      offers.push({ price, ours: key === affiliateId || String(entry?.affiliate_id ?? '') === affiliateId, main: entry?.is_main_line !== false });
    }
  }
  const pool = offers.some((offer) => offer.ours) ? offers.filter((offer) => offer.ours) : offers;
  const priced = pool.filter((offer) => offer.price !== null).sort((a, b) => Number(b.main) - Number(a.main));
  return priced[0]?.price ?? null;
}

export function eventOdds(event: TheRundownEvent): { home: string; away: string; homeOdds: number | null; awayOdds: number | null } | null {
  const teams = eventTeams(event);
  if (!teams || !Array.isArray(event.markets)) return null;
  const moneylines = event.markets.map(record).filter((item): item is JsonRecord => Boolean(
    item && (num(item.market_id) === 1 || str(item.name)?.toLowerCase() === 'moneyline'),
  ));
  const market = moneylines.find((item) => (num(item.period_id) ?? 0) === 0) ?? moneylines[0];
  if (!market || !Array.isArray(market.participants)) return null;
  let homeOdds: number | null = null;
  let awayOdds: number | null = null;
  for (const raw of market.participants) {
    const participant = record(raw);
    if (!participant) continue;
    const side = participantSide(participant, teams);
    if (side === 'HOME') homeOdds ??= participantPrice(participant);
    if (side === 'AWAY') awayOdds ??= participantPrice(participant);
  }
  return { home: teamDisplayName(teams.home)!, away: teamDisplayName(teams.away)!, homeOdds, awayOdds };
}

/** The event inside TheRundown's v1 or v2 single-event response. */
export function singleEventFromPayload(payload: JsonRecord, providerEventId: string): TheRundownEvent | null {
  if (Array.isArray(payload.events)) {
    const events = payload.events.map(record).filter((row): row is JsonRecord => row !== null) as TheRundownEvent[];
    return events.find((row) => str(row.event_id) === providerEventId) ?? (events.length === 1 ? events[0]! : null);
  }
  return (record(payload.event) ?? payload) as TheRundownEvent;
}

export type SnapshotSkipReason = 'NO_EVENT_ID' | 'BAD_START' | 'NO_TEAMS' | 'NO_MONEYLINE';

export function diagnoseProviderEvent(raw: unknown): SnapshotSkipReason | null {
  const event = record(raw) as TheRundownEvent | null;
  if (!event || !str(event.event_id)) return 'NO_EVENT_ID';
  if (!Number.isFinite(new Date(String(event.starts_at ?? event.event_date ?? '')).getTime())) return 'BAD_START';
  if (eventOdds(event)) return null;
  return eventTeams(event) ? 'NO_MONEYLINE' : 'NO_TEAMS';
}

export interface SnapshotSummary extends Omit<SportsbookProviderDiagnostic, 'skipped'> {
  skipped: Record<SnapshotSkipReason, number>;
}

export function summarizeSnapshot(events: unknown[]): SnapshotSummary {
  const summary: SnapshotSummary = {
    events: events.length,
    parsed: 0,
    withoutPrices: 0,
    skipped: { NO_EVENT_ID: 0, BAD_START: 0, NO_TEAMS: 0, NO_MONEYLINE: 0 },
    statuses: [],
    samples: [],
  };
  const statuses = new Map<string, { outcome: SportsbookProviderOutcome; count: number }>();
  for (const raw of events) {
    const reason = diagnoseProviderEvent(raw);
    const event = (record(raw) ?? {}) as TheRundownEvent;
    const rawStatus = rawProviderStatus(event) || '(none)';
    const outcome = providerOutcome(event);
    const seen = statuses.get(rawStatus) ?? { outcome, count: 0 };
    seen.count += 1;
    statuses.set(rawStatus, seen);
    if (reason) {
      summary.skipped[reason] += 1;
      continue;
    }
    const odds = eventOdds(event)!;
    summary.parsed += 1;
    if (odds.homeOdds === null && odds.awayOdds === null) summary.withoutPrices += 1;
    if (summary.samples.length < 5) {
      summary.samples.push({
        providerEventId: str(event.event_id)!,
        startsAt: new Date(String(event.starts_at ?? event.event_date)).toISOString(),
        homeTeam: odds.home,
        awayTeam: odds.away,
        homeOdds: odds.homeOdds,
        awayOdds: odds.awayOdds,
        rawStatus,
        outcome,
      });
    }
  }
  summary.statuses = [...statuses].map(([raw, value]) => ({ raw, ...value })).sort((a, b) => b.count - a.count);
  return summary;
}

function normalizedEvent(raw: unknown, league: SportsbookLeagueKey): NormalizedSportsbookEvent | null {
  const event = record(raw) as TheRundownEvent | null;
  if (!event) return null;
  const providerEventId = str(event.event_id);
  const startsAt = new Date(String(event.starts_at ?? event.event_date ?? ''));
  const odds = eventOdds(event);
  if (!providerEventId || !Number.isFinite(startsAt.getTime()) || !odds) return null;
  const score = record(event.score);
  return {
    providerEventId,
    league,
    homeTeam: odds.home,
    awayTeam: odds.away,
    startsAt,
    status: providerOutcome(event),
    prices: { moneyline: { home: odds.homeOdds, away: odds.awayOdds } },
    scores: { home: score ? num(score.score_home) : null, away: score ? num(score.score_away) : null },
  };
}

export class TheRundownProvider implements SportsbookProvider {
  readonly id = THERUNDOWN_PROVIDER_ID;
  readonly name = 'TheRundown';
  readonly capabilities = {
    leagues: ['NFL', 'NBA', 'MLB', 'NHL'],
    markets: ['MONEYLINE'],
    odds: true,
    results: true,
    bulkResults: false,
  } as const;

  constructor(readonly session: ProviderSession) {}

  static fromState(
    apiKey: string,
    state: SportsbookProviderState,
    now: Date,
    deps: ProviderSessionDeps = {},
  ): TheRundownProvider {
    return new TheRundownProvider(ProviderSession.fromState(THERUNDOWN_TRANSPORT, apiKey, state, now, deps));
  }

  private async rawEvents(league: SportsbookLeagueKey, date: string): Promise<unknown[]> {
    const payload = record(await this.session.get(`/sports/${LEAGUE_SPORT_IDS[league]}/events/${date}`, {
      market_ids: '1', affiliate_ids: THERUNDOWN_AFFILIATE_ID, main_line: 'true', hide_closed: 'true',
    }));
    if (!payload) throw new ProviderError('PAYLOAD', 'TheRundown returned something other than a JSON object.');
    if (!Array.isArray(payload.events)) throw new ProviderError('PAYLOAD', 'Snapshot has no events list.');
    return payload.events;
  }

  async listEvents(league: SportsbookLeagueKey, dates: readonly string[]): Promise<NormalizedSportsbookEvent[]> {
    const events: NormalizedSportsbookEvent[] = [];
    for (const date of dates) {
      const raw = await this.rawEvents(league, date);
      events.push(...raw.map((event) => normalizedEvent(event, league)).filter((event): event is NormalizedSportsbookEvent => event !== null));
    }
    return events;
  }

  async getResult(providerEventId: string): Promise<NormalizedSportsbookResult | null> {
    const payload = record(await this.session.get(`/events/${encodeURIComponent(providerEventId)}`, { affiliate_ids: '0' }));
    if (!payload) throw new ProviderError('PAYLOAD', 'TheRundown returned something other than a JSON object.');
    const event = singleEventFromPayload(payload, providerEventId);
    if (!event) return null;
    const score = record(event.score);
    return {
      providerEventId,
      status: providerOutcome(event),
      scores: { home: score ? num(score.score_home) : null, away: score ? num(score.score_away) : null },
    };
  }

  /** Adapter-owned payload check used by the admin release gate. */
  async diagnose(league: SportsbookLeagueKey, date: string): Promise<SnapshotSummary> {
    return summarizeSnapshot(await this.rawEvents(league, date));
  }
}
