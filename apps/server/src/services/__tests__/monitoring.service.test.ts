import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';
import type { MonitoringSnapshotDto } from '@streets/shared';
import { classifyError } from '../../plugins/error-handler.js';
import { maintenanceAllows } from '../../plugins/maintenance.js';
import { AppError } from '../../utils/errors.js';
import { acceptRequestId, annotateLogContext, LOG_REDACT_PATHS, logContextFields, withLogContext } from '../../utils/request-context.js';
import { areaOf, MetricsRegistry, safeErrorText } from '../metrics.service.js';
import { MONITORING_LINES, monitoringAlerts, MonitoringService, readBackupStatus } from '../monitoring.service.js';

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const HOUR = 3_600_000;

function snapshot(overrides: Partial<Omit<MonitoringSnapshotDto, 'alerts' | 'status'>> = {}): Omit<MonitoringSnapshotDto, 'alerts' | 'status'> {
  const registry = new MetricsRegistry(() => NOW);
  return {
    generatedAt: new Date(NOW).toISOString(),
    process: { version: 'test', environment: 'test', commit: null, startedAt: iso(HOUR), uptimeSeconds: 3600, memoryMb: 100, maintenance: false },
    database: { ok: true, latencyMs: 3, error: null },
    windows: { fiveMinutes: registry.summary(5), hour: registry.summary(60) },
    jobs: [],
    notifications: { pending: 0, oldestPendingMinutes: null, alertsSent: 0, devicesReached: 0, deviceFailures: 0, lastFailureAt: null, lastFailure: null },
    backups: {
      configured: true, lastBackupAt: iso(2 * HOUR), lastBackupOk: true, lastBackupFile: 'x.dump', lastBackupBytes: 1024,
      offsiteAt: iso(2 * HOUR), offsiteOk: true, offsiteTarget: 'remote:', lastRestoreTestAt: iso(24 * HOUR), lastRestoreTestOk: true, detail: null,
    },
    ...overrides,
  };
}
const keys = (input: Omit<MonitoringSnapshotDto, 'alerts' | 'status'>) => monitoringAlerts(input, NOW).map((row) => row.key);

describe('1.0.0-F metrics registry', () => {
  it('counts requests, 5xx and latency percentiles inside the window only', () => {
    let clock = NOW - 30 * 60_000;
    const registry = new MetricsRegistry(() => clock);
    registry.recordRequest({ url: '/api/game/state', method: 'GET', statusCode: 200, durationMs: 4000 });
    clock = NOW;
    for (let i = 0; i < 18; i++) registry.recordRequest({ url: '/api/game/state', method: 'GET', statusCode: 200, durationMs: 8 });
    registry.recordRequest({ url: '/api/game/actions', method: 'POST', statusCode: 500, durationMs: 300 });
    registry.recordRequest({ url: '/api/auth/login', method: 'POST', statusCode: 401, durationMs: 40 });
    const recent = registry.summary(5);
    expect(recent.requests).toBe(20);
    expect(recent.errors5xx).toBe(1);
    expect(recent.errorRatePercent).toBe(5);
    expect(recent.latencyMs.p50).toBe(10);
    expect(recent.latencyMs.p99).toBe(500);
    expect(recent.byArea).toEqual({ game: 19, auth: 1 });
    expect(registry.summary(60).requests).toBe(21);
    expect(registry.histogram(60).count).toBe(21);
  });

  it('files refusals as failed actions or failed sign-ins by area', () => {
    const registry = new MetricsRegistry(() => NOW);
    registry.recordFailure({ url: '/api/game/actions', method: 'POST', statusCode: 409, code: 'NOT_ENOUGH_TURNS', category: 'conflict' });
    registry.recordFailure({ url: '/api/game/state', method: 'GET', statusCode: 404, code: 'NOT_FOUND', category: 'not_found' });
    registry.recordFailure({ url: '/api/auth/login', method: 'POST', statusCode: 401, code: 'INVALID_CREDENTIALS', category: 'auth' });
    const hour = registry.summary(60);
    expect(hour.failedActions).toEqual([{ code: 'NOT_ENOUGH_TURNS', count: 1 }]);
    expect(hour.authFailures).toEqual([{ code: 'INVALID_CREDENTIALS', count: 1 }]);
    expect(hour.errorCategories.map((row) => row.category).sort()).toEqual(['auth', 'conflict', 'not_found']);
  });

  it('counts maintenance-mode 503s as refusals, not server errors', () => {
    const registry = new MetricsRegistry(() => NOW);
    registry.recordRequest({ url: '/api/game/me', method: 'GET', statusCode: 503, durationMs: 1, deliberate: true });
    const recent = registry.summary(5);
    expect(recent).toMatchObject({ errors5xx: 0, errorRatePercent: 0, status: { '4xx': 1, '5xx': 0 } });
    expect(recent.errorCategories).toEqual([{ category: 'maintenance', count: 1 }]);
  });

  it('keeps job health and scrubs secrets out of job errors', () => {
    const registry = new MetricsRegistry(() => NOW);
    registry.registerJob('round-settlement', 60_000);
    registry.recordJob('round-settlement', { ok: false, durationMs: 12, error: new Error('connect postgresql://streets:hunter2@db:5432/x failed, token=abc') });
    registry.recordJob('round-settlement', { ok: false, durationMs: 12, error: 'again' });
    const [job] = registry.jobHealth();
    expect(job).toMatchObject({ name: 'round-settlement', runs: 2, failures: 2, consecutiveFailures: 2, lastSuccessAt: null });
    registry.recordJob('round-settlement', { ok: true, durationMs: 5 });
    expect(registry.jobHealth()[0]).toMatchObject({ consecutiveFailures: 0, lastSuccessAt: NOW });
    const scrubbed = safeErrorText(new Error('connect postgresql://streets:hunter2@db:5432/x failed, token=abc'));
    expect(scrubbed).not.toContain('hunter2');
    expect(scrubbed).not.toContain('abc');
  });

  it('knows which area a URL belongs to', () => {
    expect(areaOf('/api/game/actions?x=1')).toBe('game');
    expect(areaOf('/api/admin/monitoring')).toBe('admin');
    expect(areaOf('/api/health')).toBe('health');
    expect(areaOf('/api/public/status')).toBe('public');
  });
});

describe('1.0.0-F monitoring alerts', () => {
  it('a healthy server with fresh backups has nothing to say', () => {
    expect(keys(snapshot())).toEqual([]);
  });

  it('a dead database is critical and comes first', () => {
    const alerts = monitoringAlerts(snapshot({ database: { ok: false, latencyMs: null, error: 'ECONNREFUSED' }, notifications: { ...snapshot().notifications, pending: 3, oldestPendingMinutes: 60 } }), NOW);
    expect(alerts[0]).toMatchObject({ severity: 'critical', key: 'database-down' });
    expect(alerts.map((row) => row.key)).toContain('notification-backlog');
  });

  it('error rate and latency only alert once there is enough traffic', () => {
    const quiet = new MetricsRegistry(() => NOW);
    quiet.recordRequest({ url: '/api/game/x', method: 'POST', statusCode: 500, durationMs: 4000 });
    expect(keys(snapshot({ windows: { fiveMinutes: quiet.summary(5), hour: quiet.summary(60) } }))).toEqual([]);
    const busy = new MetricsRegistry(() => NOW);
    for (let i = 0; i < MONITORING_LINES.minRequestsForRates; i++) busy.recordRequest({ url: '/api/game/x', method: 'POST', statusCode: i % 5 === 0 ? 500 : 200, durationMs: 2000 });
    expect(keys(snapshot({ windows: { fiveMinutes: busy.summary(5), hour: busy.summary(60) } }))).toEqual(['error-rate', 'latency']);
  });

  it('a background job failing in a row, or silently not finishing, is critical', () => {
    const job = { name: 'settle', intervalMs: 60_000, runs: 10, failures: 3, consecutiveFailures: 3, lastRunAt: iso(0), lastSuccessAt: iso(4 * 60_000), lastDurationMs: 5, lastError: 'boom' };
    expect(keys(snapshot({ jobs: [job] }))).toEqual(['job-failing:settle']);
    expect(keys(snapshot({ jobs: [{ ...job, consecutiveFailures: 0, lastSuccessAt: iso(10 * 60_000) }] }))).toEqual(['job-stale:settle']);
  });

  it('old, failed or never-copied backups and missing restore tests are called out', () => {
    const base = snapshot().backups;
    expect(keys(snapshot({ backups: { ...base, lastBackupAt: iso(30 * HOUR) } }))).toEqual(['backup-missing']);
    expect(keys(snapshot({ backups: { ...base, lastBackupOk: false, detail: 'pg_dump exited 1' } }))).toEqual(['backup-failed']);
    expect(keys(snapshot({ backups: { ...base, offsiteAt: null, offsiteOk: null } }))).toEqual(['offsite-missing']);
    expect(keys(snapshot({ backups: { ...base, lastRestoreTestAt: null, lastRestoreTestOk: null } }))).toEqual(['restore-test-stale']);
    expect(keys(snapshot({ backups: { ...base, lastRestoreTestOk: false } }))).toEqual(['restore-test-failed']);
  });

  it('reads the status file the backup scripts write, and says so when it cannot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'se-backup-status-'));
    const file = join(dir, 'status.json');
    await writeFile(file, JSON.stringify({ lastBackup: { at: iso(HOUR), ok: true, file: 'a.dump', bytes: 10, offsite: { at: iso(HOUR), ok: false, target: 'remote:', error: 'denied' } }, lastRestoreTest: { at: iso(HOUR), ok: true } }));
    expect(await readBackupStatus(file)).toMatchObject({ configured: true, lastBackupOk: true, offsiteOk: false, lastRestoreTestOk: true });
    expect(await readBackupStatus(join(dir, 'missing.json'))).toMatchObject({ configured: true, lastBackupOk: false, detail: expect.stringContaining('ENOENT') });
    expect(await readBackupStatus('')).toMatchObject({ configured: false });
  });

  it('exports Prometheus text with a cumulative histogram', () => {
    const registry = new MetricsRegistry(() => NOW);
    registry.recordRequest({ url: '/api/health', method: 'GET', statusCode: 200, durationMs: 3 });
    registry.recordRequest({ url: '/api/health', method: 'GET', statusCode: 200, durationMs: 9000 });
    const base = snapshot({ windows: { fiveMinutes: registry.summary(5), hour: registry.summary(60) } });
    const text = MonitoringService.prometheus({ ...base, alerts: [], status: 'ok' }, registry);
    expect(text).toContain('streets_database_up 1');
    expect(text).toContain('streets_request_duration_ms_bucket{le="5"} 1');
    expect(text).toContain('streets_request_duration_ms_bucket{le="+Inf"} 2');
    expect(text).toContain('streets_request_duration_ms_count 2');
  });
});

describe('1.0.0-F error categories', () => {
  it('sorts refusals into categories the logs and dashboards can count', () => {
    expect(classifyError(new AppError(401, 'UNAUTHENTICATED', 'x'))).toEqual({ statusCode: 401, code: 'UNAUTHENTICATED', category: 'auth' });
    expect(classifyError(new AppError(409, 'NOT_ENOUGH_TURNS', 'x')).category).toBe('conflict');
    expect(classifyError(new AppError(429, 'RATE_LIMITED', 'x')).category).toBe('rate_limit');
    expect(classifyError(new ZodError([])).category).toBe('validation');
    expect(classifyError(new RangeError('Player-state invariant failed: cash')).category).toBe('invariant');
    expect(classifyError(new Error('surprise'))).toEqual({ statusCode: 500, code: 'INTERNAL_ERROR', category: 'internal' });
  });
});

describe('1.0.0-F structured logging', () => {
  it('carries request, player and action identifiers into every log line, and never secrets', () => {
    const lines: Array<Record<string, unknown>> = [];
    const logger = pino({ mixin: logContextFields, redact: { paths: [...LOG_REDACT_PATHS], censor: '[redacted]' } }, { write: (line: string) => { lines.push(JSON.parse(line)); } });
    withLogContext({ requestId: 'req-12345678' }, () => {
      annotateLogContext({ accountId: 'acc1', roundPlayerId: 'rp1', roundId: 'r1', actionId: 'act1', action: 'RAID', ruleset: 'classic@1', errorCategory: undefined });
      logger.info({ body: { password: 'hunter2', token: 'abc' }, req: { headers: { cookie: 'sid=1', authorization: 'Bearer x' } } }, 'hello');
    });
    logger.info('outside');
    expect(lines[0]).toMatchObject({ requestId: 'req-12345678', accountId: 'acc1', roundPlayerId: 'rp1', roundId: 'r1', actionId: 'act1', action: 'RAID', ruleset: 'classic@1' });
    const first = JSON.stringify(lines[0]);
    for (const secret of ['hunter2', '"abc"', 'sid=1', 'Bearer x']) expect(first).not.toContain(secret);
    expect(lines[1]).not.toHaveProperty('requestId');
  });

  it('only echoes request ids that are safe to echo', () => {
    expect(acceptRequestId('abcd-1234-efgh')).toBe('abcd-1234-efgh');
    expect(acceptRequestId('short')).toBeNull();
    expect(acceptRequestId('has space in it')).toBeNull();
    expect(acceptRequestId(['a'])).toBeNull();
  });
});

describe('1.0.0-F maintenance mode', () => {
  it('keeps health, status, sign-in and admins open and turns players away', () => {
    expect(maintenanceAllows('/api/health', false)).toBe(true);
    expect(maintenanceAllows('/api/auth/login', false)).toBe(true);
    expect(maintenanceAllows('/api/public/status', false)).toBe(true);
    expect(maintenanceAllows('/api/game/actions', false)).toBe(false);
    expect(maintenanceAllows('/api/game/actions', true)).toBe(true);
  });
});
