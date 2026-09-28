/**
 * 1.0.0-F. What this server process has been doing, for the last hour, in memory.
 *
 * Deliberately no dependency and no database: monitoring must keep working when the
 * database is the thing that broke. One-minute buckets for the last hour hold request
 * counts, a latency histogram, 5xx errors, refused game actions by code and failed
 * sign-ins by code; background jobs and notification delivery keep their own
 * counters. `snapshot()` turns it into numbers and `alerts()` into the short list of
 * things an operator should look at now. A restart starts from zero, which is what
 * "this process" means.
 */

/** Latency bucket upper bounds, milliseconds. The last bucket is everything slower. */
export const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000] as const;

export type RequestArea = 'game' | 'auth' | 'admin' | 'public' | 'health' | 'other';

interface Minute {
  at: number;
  requests: number;
  byStatus: Record<'2xx' | '3xx' | '4xx' | '5xx', number>;
  byArea: Partial<Record<RequestArea, number>>;
  latency: number[];
  latencySumMs: number;
  failedActions: Map<string, number>;
  authFailures: Map<string, number>;
  errorCategories: Map<string, number>;
}

export interface JobHealth {
  name: string;
  /** How often it is meant to run, so "has not succeeded lately" can be judged. */
  intervalMs: number;
  runs: number;
  failures: number;
  consecutiveFailures: number;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastDurationMs: number | null;
  lastError: string | null;
}

export interface NotificationHealth {
  alertsSent: number;
  devicesReached: number;
  deviceFailures: number;
  lastFailureAt: number | null;
  lastFailure: string | null;
}

const MINUTE = 60_000;
const WINDOW_MINUTES = 60;

function newMinute(at: number): Minute {
  return {
    at, requests: 0, byStatus: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 }, byArea: {},
    latency: LATENCY_BUCKETS_MS.map(() => 0).concat(0), latencySumMs: 0,
    failedActions: new Map(), authFailures: new Map(), errorCategories: new Map(),
  };
}

export function areaOf(url: string): RequestArea {
  const path = url.split('?')[0] ?? url;
  if (path.startsWith('/api/game/') || path.startsWith('/api/rounds/') || path.startsWith('/api/combat')) return 'game';
  if (path.startsWith('/api/auth/') || path.startsWith('/api/forum/')) return 'auth';
  if (path.startsWith('/api/admin/') || path.startsWith('/api/internal/')) return 'admin';
  if (path === '/api/health' || path === '/api/ready' || path === '/api/meta' || path === '/api/metrics') return 'health';
  if (path.startsWith('/api/public/') || path.startsWith('/api/site/')) return 'public';
  return 'other';
}

/** A job's error, short and without anything that looks like a connection string or token. */
export function safeErrorText(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return text
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgresql://[redacted]')
    .replace(/(token|secret|password|key)=([^\s&'"]+)/gi, '$1=[redacted]')
    .slice(0, 300);
}

function percentile(histogram: number[], total: number, share: number): number | null {
  if (total <= 0) return null;
  let seen = 0;
  const target = total * share;
  for (let index = 0; index < histogram.length; index++) {
    seen += histogram[index]!;
    if (seen >= target) return LATENCY_BUCKETS_MS[index] ?? LATENCY_BUCKETS_MS[LATENCY_BUCKETS_MS.length - 1]! * 2;
  }
  return null;
}

export interface WindowSummary {
  minutes: number;
  requests: number;
  errors5xx: number;
  errorRatePercent: number;
  status: Record<'2xx' | '3xx' | '4xx' | '5xx', number>;
  byArea: Partial<Record<RequestArea, number>>;
  latencyMs: { mean: number | null; p50: number | null; p95: number | null; p99: number | null };
  failedActions: Array<{ code: string; count: number }>;
  authFailures: Array<{ code: string; count: number }>;
  errorCategories: Array<{ category: string; count: number }>;
}

export class MetricsRegistry {
  private minutes: Minute[] = [];
  private readonly jobs = new Map<string, JobHealth>();
  readonly notifications: NotificationHealth = { alertsSent: 0, devicesReached: 0, deviceFailures: 0, lastFailureAt: null, lastFailure: null };
  readonly startedAt: number;

  constructor(private readonly now: () => number = Date.now) {
    this.startedAt = now();
  }

  private current(): Minute {
    const at = Math.floor(this.now() / MINUTE) * MINUTE;
    let minute = this.minutes[this.minutes.length - 1];
    if (!minute || minute.at !== at) {
      minute = newMinute(at);
      this.minutes.push(minute);
      const oldest = at - WINDOW_MINUTES * MINUTE;
      while (this.minutes.length && this.minutes[0]!.at <= oldest) this.minutes.shift();
    }
    return minute;
  }

  /** `deliberate`: a 503 we meant (maintenance mode) is a refusal, not a server error. */
  recordRequest(input: { url: string; method: string; statusCode: number; durationMs: number; deliberate?: boolean }): void {
    const minute = this.current();
    minute.requests++;
    if (input.deliberate) minute.errorCategories.set('maintenance', (minute.errorCategories.get('maintenance') ?? 0) + 1);
    const status = input.deliberate ? '4xx' : input.statusCode >= 500 ? '5xx' : input.statusCode >= 400 ? '4xx' : input.statusCode >= 300 ? '3xx' : '2xx';
    minute.byStatus[status]++;
    const area = areaOf(input.url);
    minute.byArea[area] = (minute.byArea[area] ?? 0) + 1;
    const bucket = LATENCY_BUCKETS_MS.findIndex((bound) => input.durationMs <= bound);
    minute.latency[bucket === -1 ? LATENCY_BUCKETS_MS.length : bucket]!++;
    minute.latencySumMs += input.durationMs;
  }

  /** A refusal with a code: a failed game action, a failed sign-in, or both kinds of error category. */
  recordFailure(input: { url: string; method: string; statusCode: number; code: string; category: string }): void {
    const minute = this.current();
    minute.errorCategories.set(input.category, (minute.errorCategories.get(input.category) ?? 0) + 1);
    const area = areaOf(input.url);
    if (area === 'game' && input.method !== 'GET' && input.statusCode >= 400) {
      minute.failedActions.set(input.code, (minute.failedActions.get(input.code) ?? 0) + 1);
    }
    if (area === 'auth' && (input.statusCode === 401 || input.statusCode === 403 || input.statusCode === 429)) {
      minute.authFailures.set(input.code, (minute.authFailures.get(input.code) ?? 0) + 1);
    }
  }

  registerJob(name: string, intervalMs: number): void {
    if (!this.jobs.has(name)) {
      this.jobs.set(name, { name, intervalMs, runs: 0, failures: 0, consecutiveFailures: 0, lastRunAt: null, lastSuccessAt: null, lastDurationMs: null, lastError: null });
    }
  }

  recordJob(name: string, input: { ok: boolean; durationMs: number; error?: unknown }): void {
    this.registerJob(name, MINUTE);
    const job = this.jobs.get(name)!;
    const now = this.now();
    job.runs++;
    job.lastRunAt = now;
    job.lastDurationMs = input.durationMs;
    if (input.ok) {
      job.lastSuccessAt = now;
      job.consecutiveFailures = 0;
    } else {
      job.failures++;
      job.consecutiveFailures++;
      job.lastError = safeErrorText(input.error);
    }
  }

  recordNotifications(input: { alerts: number; delivered: number; failures: number; lastFailure?: string | null }): void {
    this.notifications.alertsSent += input.alerts;
    this.notifications.devicesReached += input.delivered;
    this.notifications.deviceFailures += input.failures;
    if (input.failures > 0) {
      this.notifications.lastFailureAt = this.now();
      this.notifications.lastFailure = input.lastFailure ?? null;
    }
  }

  jobHealth(): JobHealth[] {
    return [...this.jobs.values()].map((job) => ({ ...job }));
  }

  summary(minutes: number): WindowSummary {
    const since = this.now() - minutes * MINUTE;
    const rows = this.minutes.filter((minute) => minute.at >= Math.floor(since / MINUTE) * MINUTE);
    const status = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    const byArea: Partial<Record<RequestArea, number>> = {};
    const histogram = LATENCY_BUCKETS_MS.map(() => 0).concat(0);
    const failed = new Map<string, number>();
    const auth = new Map<string, number>();
    const categories = new Map<string, number>();
    let requests = 0;
    let latencySum = 0;
    for (const minute of rows) {
      requests += minute.requests;
      latencySum += minute.latencySumMs;
      for (const key of Object.keys(status) as Array<keyof typeof status>) status[key] += minute.byStatus[key];
      for (const [area, count] of Object.entries(minute.byArea) as Array<[RequestArea, number]>) byArea[area] = (byArea[area] ?? 0) + count;
      minute.latency.forEach((count, index) => { histogram[index]! += count; });
      for (const [code, count] of minute.failedActions) failed.set(code, (failed.get(code) ?? 0) + count);
      for (const [code, count] of minute.authFailures) auth.set(code, (auth.get(code) ?? 0) + count);
      for (const [category, count] of minute.errorCategories) categories.set(category, (categories.get(category) ?? 0) + count);
    }
    const sorted = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    return {
      minutes,
      requests,
      errors5xx: status['5xx'],
      errorRatePercent: requests ? Math.round((status['5xx'] / requests) * 1000) / 10 : 0,
      status,
      byArea,
      latencyMs: {
        mean: requests ? Math.round(latencySum / requests) : null,
        p50: percentile(histogram, requests, 0.5),
        p95: percentile(histogram, requests, 0.95),
        p99: percentile(histogram, requests, 0.99),
      },
      failedActions: sorted(failed).map(([code, count]) => ({ code, count })),
      authFailures: sorted(auth).map(([code, count]) => ({ code, count })),
      errorCategories: sorted(categories).map(([category, count]) => ({ category, count })),
    };
  }

  /** The raw latency histogram and counters for the Prometheus endpoint, last `minutes`. */
  histogram(minutes: number): { buckets: number[]; sumMs: number; count: number } {
    const since = Math.floor((this.now() - minutes * MINUTE) / MINUTE) * MINUTE;
    const buckets = LATENCY_BUCKETS_MS.map(() => 0).concat(0);
    let sumMs = 0;
    let count = 0;
    for (const minute of this.minutes.filter((row) => row.at >= since)) {
      minute.latency.forEach((value, index) => { buckets[index]! += value; });
      sumMs += minute.latencySumMs;
      count += minute.requests;
    }
    return { buckets, sumMs, count };
  }
}

export const metrics = new MetricsRegistry();
