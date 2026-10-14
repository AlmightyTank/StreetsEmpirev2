import type { SportsbookLeagueKey } from '@streets/shared';

export type SportsbookProviderOutcome = 'PRE' | 'LIVE' | 'FINAL' | 'CANCELLED';
export type SportsbookProviderMarket = 'MONEYLINE' | 'SPREAD' | 'TOTAL';

export interface SportsbookProviderCapabilities {
  leagues: readonly SportsbookLeagueKey[];
  markets: readonly SportsbookProviderMarket[];
  odds: boolean;
  results: boolean;
  bulkResults: boolean;
}

export interface SportsbookProviderPrices {
  moneyline: { home: number | null; away: number | null };
}

export interface SportsbookProviderScores {
  home: number | null;
  away: number | null;
}

/** A vendor listing after its adapter has removed every payload-specific detail. */
export interface NormalizedSportsbookEvent {
  providerEventId: string;
  league: SportsbookLeagueKey;
  homeTeam: string;
  awayTeam: string;
  startsAt: Date;
  status: SportsbookProviderOutcome;
  prices: SportsbookProviderPrices;
  scores: SportsbookProviderScores;
}

/** The smaller shape needed to grade one canonical event. */
export interface NormalizedSportsbookResult {
  providerEventId: string;
  status: SportsbookProviderOutcome;
  scores: SportsbookProviderScores;
  /** Bulk score feeds include these so a source can be attached to the canonical game. */
  league?: SportsbookLeagueKey;
  homeTeam?: string;
  awayTeam?: string;
  startsAt?: Date;
}

export interface SportsbookProviderDiagnostic {
  events: number;
  parsed: number;
  withoutPrices: number;
  skipped: Record<string, number>;
  statuses: Array<{ raw: string; outcome: SportsbookProviderOutcome; count: number }>;
  samples: Array<{
    providerEventId: string;
    startsAt: string;
    homeTeam: string;
    awayTeam: string;
    homeOdds: number | null;
    awayOdds: number | null;
    rawStatus: string;
    outcome: SportsbookProviderOutcome;
  }>;
}

export type ProviderErrorKind = 'AUTH' | 'RATE_LIMITED' | 'HTTP' | 'NETWORK' | 'PAYLOAD';

export class ProviderError extends Error {
  constructor(readonly kind: ProviderErrorKind, message: string, readonly status?: number) {
    super(message);
    this.name = 'ProviderError';
  }

  /** After these, every further request in this session would fail the same way. */
  get stopsRun(): boolean {
    return this.kind === 'AUTH' || this.kind === 'RATE_LIMITED';
  }
}

export type ProviderQuota = { used: number; limit: number; remaining: number | null; period: string };
export type ProviderUsage = Partial<ProviderQuota> & { units: number };
export type ProviderStateQuota = {
  datapointsUsed: number;
  datapointsLimit: number;
  datapointsRemaining: number | null;
  datapointsPeriod: string;
  quotaObservedAt: Date | null;
};

export interface ProviderTransport {
  id: string;
  name: string;
  baseUrl: string;
  authHeaders(apiKey: string): Record<string, string>;
  authQuery?(apiKey: string): Record<string, string>;
  usage(headers: Headers): ProviderUsage;
}

export type ProviderSessionDeps = { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> };

const REQUEST_TIMEOUT_MS = 15_000;
export const FEED_MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 2_000;
const RETRY_AFTER_CAP_MS = 30_000;

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 240);

/** Vendor error bodies name the cause of rejections (e.g. 422s); keep a capped slice for diagnostics. */
const responseDetail = async (response: Response): Promise<string> => {
  try {
    const text = (await response.text()).trim().slice(0, 200);
    return text ? ` ${text}` : '';
  } catch {
    return '';
  }
};
const dateKey = (date: Date) => date.toISOString().slice(0, 10);

function isSameQuotaWindow(first: Date, second: Date, period: string): boolean {
  if (period.toLowerCase().includes('month')) return first.toISOString().slice(0, 7) === second.toISOString().slice(0, 7);
  return dateKey(first) === dateKey(second);
}

/** Retry-After as seconds or an HTTP date, capped so one header cannot stall a poller. */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (header.trim() !== '' && Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.min(Math.max(0, at - now), RETRY_AFTER_CAP_MS) : null;
}

/**
 * One provider run's reusable HTTP, retry, stop and quota behavior. Vendor adapters supply the
 * URL, authentication and billing-header parser; this class has no knowledge of a vendor payload.
 */
export class ProviderSession {
  units = 0;
  requests = 0;
  observed = false;
  stopped: ProviderError | null = null;
  used: number;
  limit: number;
  remaining: number | null;
  period: string;

  constructor(
    readonly transport: ProviderTransport,
    private readonly apiKey: string,
    quota: ProviderQuota,
    private readonly deps: ProviderSessionDeps = {},
  ) {
    this.used = quota.used;
    this.limit = quota.limit;
    this.remaining = quota.remaining;
    this.period = quota.period;
  }

  /** Legacy database/DTO terminology. Every provider adapter reports its own billing units. */
  get datapoints(): number {
    return this.units;
  }

  static fromState(
    transport: ProviderTransport,
    apiKey: string,
    state: ProviderStateQuota,
    now: Date,
    deps: ProviderSessionDeps = {},
  ): ProviderSession {
    const sameWindow = Boolean(state.quotaObservedAt && isSameQuotaWindow(state.quotaObservedAt, now, state.datapointsPeriod));
    const remaining = state.datapointsRemaining
      ?? (state.datapointsLimit > 0 ? Math.max(0, state.datapointsLimit - state.datapointsUsed) : null);
    return new ProviderSession(transport, apiKey, {
      used: state.datapointsUsed,
      limit: state.datapointsLimit,
      period: state.datapointsPeriod,
      remaining: sameWindow ? remaining : null,
    }, deps);
  }

  quotaBelow(floor: number): boolean {
    return this.remaining !== null && this.remaining <= floor;
  }

  private observe(headers: Headers): void {
    const usage = this.transport.usage(headers);
    this.observed = true;
    this.units += usage.units;
    this.used = usage.used ?? this.used;
    this.limit = usage.limit ?? this.limit;
    this.remaining = usage.remaining ?? this.remaining;
    this.period = usage.period ?? this.period;
  }

  async get(path: string, params: Record<string, string> = {}): Promise<unknown> {
    if (this.stopped) throw this.stopped;
    const url = new URL(this.transport.baseUrl + path);
    for (const [key, value] of Object.entries(this.transport.authQuery?.(this.apiKey) ?? {})) url.searchParams.set(key, value);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const fetchImpl = this.deps.fetch ?? fetch;
    const sleep = this.deps.sleep ?? sleepFor;
    let last = new ProviderError('NETWORK', `${this.transport.name} did not respond.`);
    let wait = 0;
    for (let attempt = 1; attempt <= FEED_MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 1) await sleep(wait);
      const backoff = RETRY_BASE_MS * 2 ** (attempt - 1);
      let response: Response;
      try {
        this.requests += 1;
        response = await fetchImpl(url, {
          headers: this.transport.authHeaders(this.apiKey),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        last = new ProviderError('NETWORK', `${this.transport.name} request failed: ${errorText(error)}`);
        wait = backoff;
        continue;
      }
      this.observe(response.headers);
      if (response.ok) return response.json().catch(() => {
        throw new ProviderError('PAYLOAD', `${this.transport.name} returned invalid JSON.`);
      });
      if (response.status === 401 || response.status === 403) {
        this.stopped = new ProviderError('AUTH', `${this.transport.name} rejected the API key (${response.status}).`, response.status);
        throw this.stopped;
      }
      if (response.status === 429) {
        last = new ProviderError('RATE_LIMITED', `${this.transport.name} rate limit or quota reached (429).`, 429);
        if (this.remaining === 0) break;
        wait = retryAfterMs(response.headers.get('retry-after')) ?? backoff;
        continue;
      }
      if (response.status >= 500) {
        last = new ProviderError('HTTP', `${this.transport.name} returned ${response.status}.${await responseDetail(response)}`, response.status);
        wait = backoff;
        continue;
      }
      throw new ProviderError('HTTP', `${this.transport.name} returned ${response.status}.${await responseDetail(response)}`, response.status);
    }
    if (last.stopsRun) this.stopped = last;
    throw last;
  }

  usageData(now: Date) {
    if (!this.observed) return {};
    return {
      lastDatapoints: this.units,
      datapointsUsed: this.used,
      datapointsLimit: this.limit,
      datapointsRemaining: this.remaining,
      datapointsPeriod: this.period,
      quotaObservedAt: now,
    };
  }
}

export interface SportsbookProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: SportsbookProviderCapabilities;
  readonly session: ProviderSession;
  listEvents(league: SportsbookLeagueKey, dates: readonly string[]): Promise<NormalizedSportsbookEvent[]>;
  getResult(providerEventId: string, league?: SportsbookLeagueKey): Promise<NormalizedSportsbookResult | null>;
  listResults?(league: SportsbookLeagueKey, since: Date): Promise<NormalizedSportsbookResult[]>;
  diagnose?(league: SportsbookLeagueKey, date: string): Promise<SportsbookProviderDiagnostic>;
}
