/** 1.0.0-F. The monitoring snapshot: what admins see and what alerts are made of. */

export interface MonitoringWindowDto {
  minutes: number;
  requests: number;
  errors5xx: number;
  errorRatePercent: number;
  status: Record<'2xx' | '3xx' | '4xx' | '5xx', number>;
  byArea: Partial<Record<'game' | 'auth' | 'admin' | 'public' | 'health' | 'other', number>>;
  latencyMs: { mean: number | null; p50: number | null; p95: number | null; p99: number | null };
  failedActions: Array<{ code: string; count: number }>;
  authFailures: Array<{ code: string; count: number }>;
  errorCategories: Array<{ category: string; count: number }>;
}

export interface MonitoringJobDto {
  name: string;
  intervalMs: number;
  runs: number;
  failures: number;
  consecutiveFailures: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
}

export interface MonitoringBackupDto {
  configured: boolean;
  lastBackupAt: string | null;
  lastBackupOk: boolean | null;
  lastBackupFile: string | null;
  lastBackupBytes: number | null;
  offsiteAt: string | null;
  offsiteOk: boolean | null;
  offsiteTarget: string | null;
  lastRestoreTestAt: string | null;
  lastRestoreTestOk: boolean | null;
  detail: string | null;
}

export interface MonitoringAlertDto {
  severity: 'critical' | 'warning' | 'info';
  key: string;
  message: string;
}

export interface MonitoringSnapshotDto {
  generatedAt: string;
  status: 'ok' | 'degraded' | 'critical';
  alerts: MonitoringAlertDto[];
  process: { version: string; environment: string; commit: string | null; startedAt: string; uptimeSeconds: number; memoryMb: number; maintenance: boolean };
  database: { ok: boolean; latencyMs: number | null; error: string | null };
  windows: { fiveMinutes: MonitoringWindowDto; hour: MonitoringWindowDto };
  jobs: MonitoringJobDto[];
  notifications: {
    pending: number;
    oldestPendingMinutes: number | null;
    alertsSent: number;
    devicesReached: number;
    deviceFailures: number;
    lastFailureAt: string | null;
    lastFailure: string | null;
  };
  backups: MonitoringBackupDto;
}
