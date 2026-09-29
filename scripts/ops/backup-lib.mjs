/**
 * 1.0.0-F. The decisions behind backups, kept pure so a unit test can hold them:
 * where a database URL points, what a backup file is called, which old backups
 * retention keeps, and whether a restored database matches what was backed up.
 * scripts/ops/backup.ts does the work; this only decides.
 */

/** Query parameters libpq understands. Prisma's own (schema, connection_limit...) are dropped. */
const LIBPQ_PARAMS = new Set(['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'application_name', 'connect_timeout', 'options']);

/**
 * A Prisma DATABASE_URL as pg_dump/psql want it: no Prisma-only parameters, and the
 * password moved out of the URL into PGPASSWORD so it never shows in `ps`.
 */
export function libpqTarget(databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') throw new Error('DATABASE_URL must be a postgresql:// URL.');
  const password = decodeURIComponent(url.password);
  url.password = '';
  for (const key of [...url.searchParams.keys()]) if (!LIBPQ_PARAMS.has(key)) url.searchParams.delete(key);
  return { url: url.toString(), password, database: decodeURIComponent(url.pathname.replace(/^\//, '')), host: url.hostname || 'localhost', port: url.port || '5432' };
}

/** The same URL pointing at another database on the same server, Prisma parameters kept. */
export function withDatabase(databaseUrl, database) {
  const url = new URL(databaseUrl);
  url.pathname = `/${encodeURIComponent(database)}`;
  return url.toString();
}

/** A URL for logs and the status file: never the password. */
export function describeUrl(databaseUrl) {
  const target = libpqTarget(databaseUrl);
  return `${target.host}:${target.port}/${target.database}`;
}

/** True when two URLs reach the same database (same host, port and name). */
export function sameDatabase(a, b) {
  const left = libpqTarget(a);
  const right = libpqTarget(b);
  const host = (value) => (value === '127.0.0.1' || value === '::1' || value === '[::1]' ? 'localhost' : value.toLowerCase());
  return host(left.host) === host(right.host) && left.port === right.port && left.database === right.database;
}

const NAME = /^streets-([a-z]+)-(\d{8}T\d{6}Z)(?:-([a-z0-9-]+))?\.dump$/;

export function backupFileName(environment, at, label) {
  const stamp = at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `streets-${environment}-${stamp}${label ? `-${label}` : ''}.dump`;
}

export function parseBackupFileName(name) {
  const match = NAME.exec(name);
  if (!match) return null;
  const [, environment, stamp, label] = match;
  const at = new Date(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`);
  return { name, environment, at, label: label ?? null };
}

function isoWeek(date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return `${day.getUTCFullYear()}-W${Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)}`;
}

/**
 * Which backups to delete. Scheduled backups: the newest of each day for `keepDaily`
 * days, then the newest of each ISO week for `keepWeekly` weeks. Labelled backups
 * (predeploy, prerestore, manual): the newest `keepLabelled`. The newest backup of
 * all is never deleted, however old, so retention can never leave nothing.
 */
export function retentionPlan(names, now, { keepDaily = 14, keepWeekly = 8, keepLabelled = 5 } = {}) {
  const backups = names.map(parseBackupFileName).filter(Boolean).sort((a, b) => b.at.getTime() - a.at.getTime());
  const keep = new Set();
  if (backups[0]) keep.add(backups[0].name);
  const days = new Set();
  const weeks = new Set();
  let labelled = 0;
  for (const backup of backups) {
    if (backup.label) {
      if (labelled++ < keepLabelled) keep.add(backup.name);
      continue;
    }
    const ageDays = (now.getTime() - backup.at.getTime()) / 86_400_000;
    const day = backup.at.toISOString().slice(0, 10);
    const week = isoWeek(backup.at);
    if (ageDays < keepDaily && !days.has(day)) {
      days.add(day);
      keep.add(backup.name);
    } else if (ageDays < keepWeekly * 7 && !weeks.has(week) && !days.has(day)) {
      keep.add(backup.name);
    }
    days.add(day);
    weeks.add(week);
  }
  return { keep: backups.filter((row) => keep.has(row.name)).map((row) => row.name), remove: backups.filter((row) => !keep.has(row.name)).map((row) => row.name) };
}

/**
 * Does a restored database hold what the backup's manifest says it should? Row counts
 * were taken in the dump's own snapshot, so they must match exactly.
 */
export function compareManifest(expected, actual) {
  const problems = [];
  for (const [table, count] of Object.entries(expected.tables ?? {})) {
    if (!(table in actual.tables)) problems.push(`table ${table} is missing`);
    else if (actual.tables[table] !== count) problems.push(`${table}: ${actual.tables[table]} rows, expected ${count}`);
  }
  for (const table of Object.keys(actual.tables)) if (!(table in (expected.tables ?? {}))) problems.push(`unexpected table ${table}`);
  if (expected.lastMigration && actual.lastMigration !== expected.lastMigration) {
    problems.push(`last migration is ${actual.lastMigration ?? 'none'}, expected ${expected.lastMigration}`);
  }
  const rows = Object.values(actual.tables).reduce((sum, count) => sum + count, 0);
  return { ok: problems.length === 0, problems, tables: Object.keys(actual.tables).length, rows };
}

/** Where an off-server copy goes, from BACKUP_OFFSITE. */
export function offsiteTarget(value) {
  const text = (value ?? '').trim();
  if (!text) return null;
  if (text.startsWith('rclone:')) return { kind: 'rclone', dest: text.slice('rclone:'.length).replace(/\/$/, '') };
  if (text.startsWith('rsync:')) return { kind: 'rsync', dest: text.slice('rsync:'.length).replace(/\/$/, '') };
  if (text.startsWith('s3://')) return { kind: 's3', dest: text.replace(/\/$/, '') };
  throw new Error('BACKUP_OFFSITE must start with rclone:, rsync: or s3://');
}
