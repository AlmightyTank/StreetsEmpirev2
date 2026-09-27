import { readFile } from 'node:fs/promises';
import type { PrismaClient } from '@prisma/client';
import { APP_VERSION } from '@streets/shared';
import type { MonitoringAlertDto, MonitoringBackupDto, MonitoringSnapshotDto } from '@streets/shared';
import { env } from '../config/env.js';
import { LATENCY_BUCKETS_MS, metrics, type MetricsRegistry } from './metrics.service.js';

/**
 * 1.0.0-F. One answer to "is StreetsEmpire all right?": the process's own metrics,
 * a live database check, what is waiting to be delivered, when the last backup and
 * restore test ran, and the short list of things to act on.
 */

/** What an alert fires on. Changing one is an operations decision; write down why. */
export const MONITORING_LINES = {
  /** 5xx share of requests over five minutes, once there is enough traffic to mean it. */
  errorRatePercent: 5,
  minRequestsForRates: 20,
  /** p95 over five minutes. */
  p95LatencyMs: 1500,
  /** Database round trip. */
  dbSlowMs: 500,
  /** A background job failing this many times in a row, or not succeeding for this many intervals. */
  jobConsecutiveFailures: 3,
  jobStaleIntervals: 5,
  /** Alerts waiting to go out for longer than this. */
  outboxBacklogMinutes: 10,
  /** Failed sign-ins in five minutes that look like more than forgetful players. */
  authFailures5m: 50,
} as const;

interface BackupStatusFile {
  environment?: string;
  lastBackup?: { at?: string; ok?: boolean; file?: string; bytes?: number; error?: string; offsite?: { at?: string; ok?: boolean; target?: string; error?: string } | null };
  lastRestoreTest?: { at?: string; ok?: boolean; backupFile?: string; detail?: string } | null;
}

export async function readBackupStatus(path = env.monitoring.backupStatusFile): Promise<MonitoringBackupDto> {
  if (!path) return { configured: false, lastBackupAt: null, lastBackupOk: null, lastBackupFile: null, lastBackupBytes: null, offsiteAt: null, offsiteOk: null, offsiteTarget: null, lastRestoreTestAt: null, lastRestoreTestOk: null, detail: 'BACKUP_STATUS_FILE is not set, so this server cannot see its backups.' };
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as BackupStatusFile;
    const backup = raw.lastBackup ?? null;
    const restore = raw.lastRestoreTest ?? null;
    return {
      configured: true,
      lastBackupAt: backup?.at ?? null,
      lastBackupOk: backup?.ok ?? null,
      lastBackupFile: backup?.file ?? null,
      lastBackupBytes: backup?.bytes ?? null,
      offsiteAt: backup?.offsite?.at ?? null,
      offsiteOk: backup?.offsite ? backup.offsite.ok ?? null : null,
      offsiteTarget: backup?.offsite?.target ?? null,
      lastRestoreTestAt: restore?.at ?? null,
      lastRestoreTestOk: restore?.ok ?? null,
      detail: backup?.error ?? restore?.detail ?? null,
    };
  } catch (error) {
    return { configured: true, lastBackupAt: null, lastBackupOk: false, lastBackupFile: null, lastBackupBytes: null, offsiteAt: null, offsiteOk: null, offsiteTarget: null, lastRestoreTestAt: null, lastRestoreTestOk: null, detail: `Could not read ${path}: ${(error as NodeJS.ErrnoException).code ?? 'unreadable'}` };
  }
}

/** The things an operator should look at now, most serious first. Pure, so it can be tested. */
export function monitoringAlerts(snapshot: Omit<MonitoringSnapshotDto, 'alerts' | 'status'>, now = Date.now()): MonitoringAlertDto[] {
  const lines = MONITORING_LINES;
  const alerts: MonitoringAlertDto[] = [];
  const recent = snapshot.windows.fiveMinutes;
  if (!snapshot.database.ok) alerts.push({ severity: 'critical', key: 'database-down', message: `The database is not answering: ${snapshot.database.error ?? 'no response'}.` });
  else if ((snapshot.database.latencyMs ?? 0) > lines.dbSlowMs) alerts.push({ severity: 'warning', key: 'database-slow', message: `The database took ${snapshot.database.latencyMs} ms to answer.` });
  if (recent.requests >= lines.minRequestsForRates && recent.errorRatePercent >= lines.errorRatePercent) {
    alerts.push({ severity: 'critical', key: 'error-rate', message: `${recent.errorRatePercent}% of requests failed with a server error in the last 5 minutes.` });
  }
  if (recent.requests >= lines.minRequestsForRates && (recent.latencyMs.p95 ?? 0) > lines.p95LatencyMs) {
    alerts.push({ severity: 'warning', key: 'latency', message: `95% of requests took up to ${recent.latencyMs.p95} ms in the last 5 minutes.` });
  }
  const authFailures = recent.authFailures.reduce((sum, row) => sum + row.count, 0);
  if (authFailures >= lines.authFailures5m) alerts.push({ severity: 'warning', key: 'auth-failures', message: `${authFailures} sign-in failures in the last 5 minutes: a password-guessing run or a broken login.` });
  for (const job of snapshot.jobs) {
    const staleAfter = job.intervalMs * lines.jobStaleIntervals;
    const sinceSuccess = job.lastSuccessAt ? now - Date.parse(job.lastSuccessAt) : now - Date.parse(snapshot.process.startedAt);
    if (job.consecutiveFailures >= lines.jobConsecutiveFailures) {
      alerts.push({ severity: 'critical', key: `job-failing:${job.name}`, message: `${job.name} has failed ${job.consecutiveFailures} times in a row: ${job.lastError ?? 'no error recorded'}.` });
    } else if (sinceSuccess > staleAfter) {
      alerts.push({ severity: 'critical', key: `job-stale:${job.name}`, message: `${job.name} has not completed for ${Math.round(sinceSuccess / 60_000)} minutes.` });
    }
  }
  if (snapshot.notifications.oldestPendingMinutes !== null && snapshot.notifications.oldestPendingMinutes > lines.outboxBacklogMinutes) {
    alerts.push({ severity: 'warning', key: 'notification-backlog', message: `${snapshot.notifications.pending} alerts are waiting to go out; the oldest for ${snapshot.notifications.oldestPendingMinutes} minutes.` });
  }
  if (snapshot.notifications.deviceFailures > 0 && snapshot.notifications.deviceFailures >= snapshot.notifications.devicesReached) {
    alerts.push({ severity: 'warning', key: 'push-failures', message: `Phone alerts are failing more often than they arrive: ${snapshot.notifications.lastFailure ?? 'no detail'}.` });
  }
  const backup = snapshot.backups;
  if (backup.configured) {
    const ageHours = backup.lastBackupAt ? (now - Date.parse(backup.lastBackupAt)) / 3_600_000 : Infinity;
    if (backup.lastBackupOk === false) alerts.push({ severity: 'critical', key: 'backup-failed', message: `The last backup failed${backup.detail ? `: ${backup.detail}` : ''}.` });
    else if (ageHours > env.monitoring.backupMaxAgeHours) alerts.push({ severity: 'critical', key: 'backup-missing', message: backup.lastBackupAt ? `The last backup is ${Math.round(ageHours)} hours old.` : 'No backup has been recorded.' });
    if (backup.offsiteOk === false) alerts.push({ severity: 'warning', key: 'offsite-failed', message: 'The last off-server copy failed; the only copy is on this server.' });
    else if (backup.lastBackupAt && !backup.offsiteAt) alerts.push({ severity: 'warning', key: 'offsite-missing', message: 'Backups are not being copied off this server.' });
    const restoreDays = backup.lastRestoreTestAt ? (now - Date.parse(backup.lastRestoreTestAt)) / 86_400_000 : Infinity;
    if (backup.lastRestoreTestOk === false) alerts.push({ severity: 'critical', key: 'restore-test-failed', message: 'The last restore test failed: the backups may not be restorable.' });
    else if (restoreDays > env.monitoring.restoreTestMaxAgeDays) alerts.push({ severity: 'warning', key: 'restore-test-stale', message: backup.lastRestoreTestAt ? `The last restore test was ${Math.round(restoreDays)} days ago.` : 'No backup has ever been test-restored.' });
  } else if (env.appEnvironment === 'production' || env.appEnvironment === 'beta') {
    alerts.push({ severity: 'warning', key: 'backup-unwatched', message: 'This server cannot see its backups: set BACKUP_STATUS_FILE.' });
  }
  if (env.maintenance.enabled) alerts.push({ severity: 'info', key: 'maintenance', message: 'Maintenance mode is on: players are being turned away.' });
  const order = { critical: 0, warning: 1, info: 2 } as const;
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

export const MonitoringService = {
  async snapshot(prisma: PrismaClient, registry: MetricsRegistry = metrics, now = Date.now()): Promise<MonitoringSnapshotDto> {
    const started = Date.now();
    let database: MonitoringSnapshotDto['database'];
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = { ok: true, latencyMs: Date.now() - started, error: null };
    } catch (error) {
      database = { ok: false, latencyMs: null, error: error instanceof Error ? error.message.split('\n')[0]!.slice(0, 200) : 'unreachable' };
    }
    let pending = 0;
    let oldestPendingMinutes: number | null = null;
    if (database.ok) {
      const [count, oldest] = await Promise.all([
        prisma.notificationOutbox.count({ where: { claimedAt: null } }),
        prisma.notificationOutbox.findFirst({ where: { claimedAt: null }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      ]);
      pending = count;
      oldestPendingMinutes = oldest ? Math.floor((now - oldest.createdAt.getTime()) / 60_000) : null;
    }
    const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());
    const base: Omit<MonitoringSnapshotDto, 'alerts' | 'status'> = {
      generatedAt: new Date(now).toISOString(),
      process: {
        version: APP_VERSION, environment: env.appEnvironment, commit: env.buildCommit,
        startedAt: new Date(registry.startedAt).toISOString(), uptimeSeconds: Math.floor((now - registry.startedAt) / 1000),
        memoryMb: Math.round(process.memoryUsage().rss / 1_048_576), maintenance: env.maintenance.enabled,
      },
      database,
      windows: { fiveMinutes: registry.summary(5), hour: registry.summary(60) },
      jobs: registry.jobHealth().map((job) => ({ ...job, lastRunAt: iso(job.lastRunAt), lastSuccessAt: iso(job.lastSuccessAt) })),
      notifications: {
        pending, oldestPendingMinutes,
        alertsSent: registry.notifications.alertsSent, devicesReached: registry.notifications.devicesReached,
        deviceFailures: registry.notifications.deviceFailures, lastFailureAt: iso(registry.notifications.lastFailureAt), lastFailure: registry.notifications.lastFailure,
      },
      backups: await readBackupStatus(env.monitoring.backupStatusFile),
    };
    const alerts = monitoringAlerts(base, now);
    return { ...base, alerts, status: alerts.some((row) => row.severity === 'critical') ? 'critical' : alerts.some((row) => row.severity === 'warning') ? 'degraded' : 'ok' };
  },

  /** Prometheus text exposition of the same numbers, for an external monitor. */
  prometheus(snapshot: MonitoringSnapshotDto, registry: MetricsRegistry = metrics): string {
    const lines: string[] = [];
    const metric = (name: string, help: string, type: 'gauge' | 'counter' | 'histogram', rows: Array<[string, number]>) => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
      for (const [labels, value] of rows) lines.push(`${name}${labels} ${Number.isFinite(value) ? value : 0}`);
    };
    const hour = snapshot.windows.hour;
    const labels = (entries: Record<string, string>) => `{${Object.entries(entries).map(([key, value]) => `${key}="${value.replace(/["\\\n]/g, '_')}"`).join(',')}}`;
    metric('streets_up', 'The API process is answering.', 'gauge', [['', 1]]);
    metric('streets_status', '0 ok, 1 degraded, 2 critical.', 'gauge', [['', snapshot.status === 'ok' ? 0 : snapshot.status === 'degraded' ? 1 : 2]]);
    metric('streets_database_up', 'The database answered.', 'gauge', [['', snapshot.database.ok ? 1 : 0]]);
    metric('streets_database_latency_ms', 'Database round trip.', 'gauge', [['', snapshot.database.latencyMs ?? -1]]);
    metric('streets_requests_last_hour', 'Requests in the last hour by status class.', 'gauge', Object.entries(hour.status).map(([status, value]) => [labels({ status }), value]));
    const histogram = registry.histogram(60);
    let cumulative = 0;
    lines.push('# HELP streets_request_duration_ms Request latency over the last hour.', '# TYPE streets_request_duration_ms histogram');
    histogram.buckets.forEach((count, index) => {
      cumulative += count;
      lines.push(`streets_request_duration_ms_bucket{le="${index < LATENCY_BUCKETS_MS.length ? LATENCY_BUCKETS_MS[index] : '+Inf'}"} ${cumulative}`);
    });
    lines.push(`streets_request_duration_ms_sum ${Math.round(histogram.sumMs)}`, `streets_request_duration_ms_count ${histogram.count}`);
    metric('streets_failed_actions_last_hour', 'Refused game actions by code.', 'gauge', hour.failedActions.map((row) => [labels({ code: row.code }), row.count]));
    metric('streets_auth_failures_last_hour', 'Refused sign-ins by code.', 'gauge', hour.authFailures.map((row) => [labels({ code: row.code }), row.count]));
    metric('streets_job_consecutive_failures', 'Background job failures in a row.', 'gauge', snapshot.jobs.map((job) => [labels({ job: job.name }), job.consecutiveFailures]));
    metric('streets_job_last_success_age_seconds', 'Seconds since the job last succeeded.', 'gauge', snapshot.jobs.map((job) => [labels({ job: job.name }), job.lastSuccessAt ? Math.floor((Date.parse(snapshot.generatedAt) - Date.parse(job.lastSuccessAt)) / 1000) : -1]));
    metric('streets_notifications_pending', 'Alerts waiting to be delivered.', 'gauge', [['', snapshot.notifications.pending]]);
    metric('streets_push_device_failures_total', 'Push deliveries that failed since start.', 'counter', [['', snapshot.notifications.deviceFailures]]);
    const age = (at: string | null) => (at ? Math.floor((Date.parse(snapshot.generatedAt) - Date.parse(at)) / 1000) : -1);
    metric('streets_backup_age_seconds', 'Seconds since the last successful backup, -1 when unknown.', 'gauge', [['', snapshot.backups.lastBackupOk ? age(snapshot.backups.lastBackupAt) : -1]]);
    metric('streets_restore_test_age_seconds', 'Seconds since the last successful restore test, -1 when unknown.', 'gauge', [['', snapshot.backups.lastRestoreTestOk ? age(snapshot.backups.lastRestoreTestAt) : -1]]);
    metric('streets_alerts', 'Open monitoring alerts by severity.', 'gauge', (['critical', 'warning', 'info'] as const).map((severity) => [labels({ severity }), snapshot.alerts.filter((row) => row.severity === severity).length]));
    return `${lines.join('\n')}\n`;
  },
};
