import { useCallback, useEffect, useState } from 'react';
import type { MonitoringSnapshotDto, MonitoringWindowDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

const REFRESH_MS = 30_000;
const statusTone = { ok: ' se-tag--good', degraded: ' se-tag--warn', critical: ' se-tag--bad' } as const;
const severityTone = { critical: ' se-tag--bad', warning: ' se-tag--warn', info: '' } as const;

function ms(value: number | null): string {
  return value === null ? '-' : value >= 5000 ? '>5 s' : `≤${formatNumber(value)} ms`;
}

function uptime(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`;
  return `${Math.floor(seconds / 86_400)} d ${Math.floor((seconds % 86_400) / 3600)} h`;
}

function Codes({ title, rows }: { title: string; rows: Array<{ code: string; count: number }> }) {
  return (
    <div>
      <h3 className="se-subtitle">{title}</h3>
      {rows.length === 0 ? <p className="se-muted">None.</p> : (
        <ul className="se-admin-list">{rows.map((row) => <li key={row.code}><code>{row.code}</code> × {formatNumber(row.count)}</li>)}</ul>
      )}
    </div>
  );
}

function Traffic({ window }: { window: MonitoringWindowDto }) {
  return (
    <div className="se-stats se-admin-pad">
      <Stat label="Requests" value={formatNumber(window.requests)} />
      <Stat label="Server errors" value={`${formatNumber(window.errors5xx)} · ${window.errorRatePercent}%`} />
      <Stat label="Refused" value={formatNumber(window.status['4xx'])} tooltip="4xx answers, and requests turned away by maintenance mode." />
      <Stat label="Latency p50" value={ms(window.latencyMs.p50)} />
      <Stat label="Latency p95" value={ms(window.latencyMs.p95)} />
      <Stat label="Latency p99" value={ms(window.latencyMs.p99)} />
    </div>
  );
}

/** 1.0.0-F. Is StreetsEmpire all right, and are its backups? Refreshes itself. */
export function AdminMonitoringPage() {
  const [data, setData] = useState<MonitoringSnapshotDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    adminApi.monitoring()
      .then((snapshot) => { setData(snapshot); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not reach the monitoring endpoint.'));
  }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Monitoring</h1>
          <p className="se-eyebrow">Admin · this server process, its database and its backups</p>
        </div>
        {data ? <span className={`se-tag${statusTone[data.status]}`}>{data.status.toUpperCase()}</span> : null}
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {!data ? <p className="se-muted">Checking...</p> : (
        <>
          <Panel title="Needs attention" aside={`checked ${adminWhen(data.generatedAt)}`} className="se-mb">
            {data.alerts.length === 0 ? <p className="se-muted">Nothing. Every check is inside its line.</p> : (
              <ul className="se-admin-list">
                {data.alerts.map((row) => (
                  <li key={row.key}><span className={`se-tag${severityTone[row.severity]}`}>{row.severity}</span> {row.message}</li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="se-stats se-mb">
            <Stat label="Database" value={data.database.ok ? `${formatNumber(data.database.latencyMs ?? 0)} ms` : 'DOWN'} tooltip={data.database.error ?? undefined} />
            <Stat label="Uptime" value={uptime(data.process.uptimeSeconds)} sub={`since ${adminWhen(data.process.startedAt)}`} />
            <Stat label="Memory" value={`${formatNumber(data.process.memoryMb)} MB`} />
            <Stat label="Build" value={data.process.version} sub={`${data.process.environment}${data.process.commit ? ` · ${data.process.commit}` : ''}${data.process.maintenance ? ' · MAINTENANCE' : ''}`} />
          </div>

          <Panel title="Last 5 minutes" flush className="se-mb"><Traffic window={data.windows.fiveMinutes} /></Panel>
          <Panel title="Last hour" flush className="se-mb">
            <Traffic window={data.windows.hour} />
            <div className="se-grid-3 se-admin-pad">
              <Codes title="Refused game actions" rows={data.windows.hour.failedActions} />
              <Codes title="Failed sign-ins" rows={data.windows.hour.authFailures} />
              <Codes title="Error categories" rows={data.windows.hour.errorCategories.map((row) => ({ code: row.category, count: row.count }))} />
            </div>
          </Panel>

          <Panel title="Background jobs" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Job</th><th className="se-table__number">Runs</th><th className="se-table__number">Failures</th><th>Last success</th><th className="se-table__number">Last run</th><th>Last error</th></tr></thead>
                <tbody>
                  {data.jobs.length === 0 ? <tr><td colSpan={6} className="se-muted">No background jobs run in this process.</td></tr> : data.jobs.map((job) => (
                    <tr key={job.name}>
                      <td className="se-td--title">{job.name}{job.consecutiveFailures > 0 ? <span className="se-tag se-tag--bad"> {job.consecutiveFailures} in a row</span> : null}</td>
                      <td className="se-table__number se-num" data-label="Runs">{formatNumber(job.runs)}</td>
                      <td className="se-table__number se-num" data-label="Failures">{formatNumber(job.failures)}</td>
                      <td data-label="Last success">{job.lastSuccessAt ? adminWhen(job.lastSuccessAt) : 'never'}</td>
                      <td className="se-table__number se-num" data-label="Last run">{job.lastDurationMs === null ? '-' : `${formatNumber(job.lastDurationMs)} ms`}</td>
                      <td data-label="Last error">{job.lastError ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="se-grid-2">
            <Panel title="Notifications">
              <ul className="se-admin-list">
                <li>{formatNumber(data.notifications.pending)} waiting{data.notifications.oldestPendingMinutes !== null ? `, oldest ${formatNumber(data.notifications.oldestPendingMinutes)} min` : ''}</li>
                <li>{formatNumber(data.notifications.alertsSent)} push alerts sent to {formatNumber(data.notifications.devicesReached)} devices since start</li>
                <li>{formatNumber(data.notifications.deviceFailures)} device failures{data.notifications.lastFailure ? ` · last: ${data.notifications.lastFailure}` : ''}</li>
              </ul>
            </Panel>
            <Panel title="Backups">
              {!data.backups.configured ? <p className="se-muted">{data.backups.detail}</p> : (
                <ul className="se-admin-list">
                  <li>Last backup: {data.backups.lastBackupAt ? `${adminWhen(data.backups.lastBackupAt)} · ${data.backups.lastBackupOk ? 'ok' : 'FAILED'}` : 'none recorded'}{data.backups.lastBackupBytes ? ` · ${formatNumber(Math.round(data.backups.lastBackupBytes / 1024))} KB` : ''}</li>
                  <li>Off-server copy: {data.backups.offsiteAt ? `${adminWhen(data.backups.offsiteAt)} · ${data.backups.offsiteOk ? 'ok' : 'FAILED'}${data.backups.offsiteTarget ? ` · ${data.backups.offsiteTarget}` : ''}` : 'none recorded'}</li>
                  <li>Restore test: {data.backups.lastRestoreTestAt ? `${adminWhen(data.backups.lastRestoreTestAt)} · ${data.backups.lastRestoreTestOk ? 'restored and verified' : 'FAILED'}` : 'never'}</li>
                  {data.backups.detail ? <li className="se-muted">{data.backups.detail}</li> : null}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </GameLayout>
  );
}
