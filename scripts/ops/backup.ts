/**
 * 1.0.0-F. Database backups, off-server copies, restore tests and restores.
 *
 *   npm run ops:backup                         back up now (what the daily timer runs)
 *   npm run ops:backup -- --label predeploy    a labelled backup (deploy.sh takes one before migrating)
 *   npm run ops:restore-test                   restore the newest backup into a scratch database,
 *                                              check every table's row count, apply this checkout's
 *                                              migrations on top, then drop it (the weekly timer)
 *   npm run ops:restore-test -- --file <dump>  the same for a chosen backup (e.g. one fetched from off-server)
 *   npm run ops:backup -- --list               the backups on this server
 *   npm run ops:restore -- --file <dump> --target <postgresql-url>
 *                                              restore into another database (a new server)
 *   npm run ops:restore -- --file <dump> --confirm <database-name>
 *                                              restore over THIS checkout's database (disaster recovery;
 *                                              stop the API first; takes a safety backup first)
 *
 * Settings (environment or .env, see .env.example):
 *   BACKUP_DIR          where backups live (default /var/backups/streets-empire/<environment>,
 *                       or ./.backups in development)
 *   BACKUP_STATUS_FILE  the JSON status the API reads for /admin/monitoring (default BACKUP_DIR/status.json)
 *   BACKUP_KEEP_DAILY / BACKUP_KEEP_WEEKLY / BACKUP_KEEP_LABELLED   retention (14 days / 8 weeks / 5)
 *   BACKUP_OFFSITE      rclone:<remote>:<path> | rsync:<user@host:/path> | s3://<bucket>/<prefix>
 *   RESTORE_TEST_DATABASE_URL  an existing empty database for restore tests (else a scratch
 *                       database is created and dropped next to the live one, needs CREATEDB)
 *
 * Every backup is a pg_dump custom-format file with a manifest: its SHA-256 and the
 * exact row count of every table, counted in the same snapshot the dump was taken
 * from, so a restore can be checked table by table rather than "it didn't error".
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { accessSync, constants, createReadStream, existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma, PrismaClient } from '@prisma/client';
import { APP_VERSION } from '@streets/shared';
import {
  backupFileName, compareManifest, describeUrl, libpqTarget, offsiteTarget, parseBackupFileName, retentionPlan, sameDatabase,
  type TableManifest, withDatabase,
} from './backup-lib.mjs';
import { environmentOf, parseEnvFile } from './check-environment.mjs';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fileEnv = existsSync(path.join(APP_DIR, '.env')) ? parseEnvFile(readFileSync(path.join(APP_DIR, '.env'), 'utf8')) : new Map<string, string>();
/** A setting from the environment (even set empty), else .env; an empty value means the default. */
const setting = (key: string, fallback = ''): string => (key in process.env ? process.env[key] : fileEnv.get(key)) || fallback;

const merged = new Map([...fileEnv, ...Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')]);
const ENVIRONMENT = environmentOf(merged);
const DATABASE_URL = setting('DATABASE_URL');
const BACKUP_DIR = resolveBackupDir();

/**
 * BACKUP_DIR, else /var/backups/streets-empire/<environment> on a server. Until
 * install-backup-timer.sh has created that (it needs root), a deploy's pre-deploy
 * backup still happens, in the checkout's .backups, rather than failing the deploy.
 */
function resolveBackupDir(): string {
  const configured = setting('BACKUP_DIR');
  if (configured) return path.resolve(APP_DIR, configured);
  if (ENVIRONMENT !== 'production' && ENVIRONMENT !== 'beta') return path.join(APP_DIR, '.backups');
  const preferred = `/var/backups/streets-empire/${ENVIRONMENT}`;
  for (const candidate of [preferred, path.dirname(preferred), '/var/backups']) {
    if (!existsSync(candidate)) continue;
    try {
      accessSync(candidate, constants.W_OK);
      return preferred;
    } catch {
      break;
    }
  }
  process.stdout.write(`[backup] ${preferred} is not writable yet (run scripts/ops/install-backup-timer.sh); using ${path.join(APP_DIR, '.backups')}\n`);
  return path.join(APP_DIR, '.backups');
}
const STATUS_FILE = path.resolve(APP_DIR, setting('BACKUP_STATUS_FILE', path.join(BACKUP_DIR, 'status.json')));

interface Manifest extends TableManifest {
  file: string;
  environment: string;
  label: string | null;
  createdAt: string;
  appVersion: string;
  commit: string | null;
  database: string;
  bytes: number;
  sha256: string;
  migrations: number;
  durationMs: number;
}

function log(message: string): void {
  process.stdout.write(`[backup] ${message}\n`);
}

function args(): { flags: Set<string>; values: Map<string, string> } {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const list = process.argv.slice(3);
  for (let index = 0; index < list.length; index++) {
    const item = list[index]!;
    if (!item.startsWith('--')) continue;
    const next = list[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      values.set(item.slice(2), next);
      index++;
    } else flags.add(item.slice(2));
  }
  return { flags, values };
}

/** Run a program; resolve with stdout, reject with its stderr. Never through a shell. */
function run(command: string, argv: string[], options: { env?: NodeJS.ProcessEnv; stdin?: NodeJS.ReadableStream } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { cwd: APP_DIR, env: { ...process.env, ...options.env }, stdio: [options.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout?.on('data', (chunk) => { out += chunk; });
    child.stderr?.on('data', (chunk) => { err += chunk; });
    if (options.stdin && child.stdin) options.stdin.pipe(child.stdin);
    child.on('error', (error) => reject(new Error(`${command}: ${error.message}`)));
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${command} exited ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`))));
  });
}

function pgEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const target = libpqTarget(databaseUrl);
  return target.password ? { PGPASSWORD: target.password } : {};
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function gitCommit(): string | null {
  try {
    const head = readFileSync(path.join(APP_DIR, '.git/HEAD'), 'utf8').trim();
    const ref = head.startsWith('ref: ') ? head.slice(5) : null;
    if (!ref) return head.slice(0, 12);
    const loose = path.join(APP_DIR, '.git', ref);
    if (existsSync(loose)) return readFileSync(loose, 'utf8').trim().slice(0, 12);
    const packed = readFileSync(path.join(APP_DIR, '.git/packed-refs'), 'utf8').split('\n').find((line) => line.endsWith(` ${ref}`));
    return packed?.slice(0, 12) ?? null;
  } catch {
    return setting('BUILD_COMMIT') || null;
  }
}

type Queryable = Pick<PrismaClient, '$queryRawUnsafe'> | Prisma.TransactionClient;

/** Exact row counts for every table in the public schema, and the newest applied migration. */
async function tableManifest(client: Queryable): Promise<TableManifest & { migrations: number }> {
  const tables = await client.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    const [row] = await client.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM "public"."${name.replace(/"/g, '""')}"`);
    counts[name] = Number(row?.n ?? 0);
  }
  let lastMigration: string | null = null;
  let migrations = 0;
  if ('_prisma_migrations' in counts) {
    const rows = await client.$queryRawUnsafe<Array<{ migration_name: string }>>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`,
    );
    migrations = rows.length;
    lastMigration = rows[rows.length - 1]?.migration_name ?? null;
  }
  return { tables: counts, lastMigration, migrations };
}

interface StatusFile {
  environment?: string;
  lastBackup?: Record<string, unknown>;
  lastRestoreTest?: Record<string, unknown>;
}

async function updateStatus(patch: StatusFile): Promise<void> {
  let current: StatusFile = {};
  try {
    current = JSON.parse(await readFile(STATUS_FILE, 'utf8')) as StatusFile;
  } catch { /* first run */ }
  const next = { ...current, ...patch, environment: ENVIRONMENT };
  await mkdir(path.dirname(STATUS_FILE), { recursive: true });
  const temp = `${STATUS_FILE}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o644 });
  await rename(temp, STATUS_FILE);
}

async function listBackups(): Promise<string[]> {
  if (!existsSync(BACKUP_DIR)) return [];
  return (await readdir(BACKUP_DIR)).filter((name) => parseBackupFileName(name)).sort();
}

async function readManifest(dumpFile: string): Promise<Partial<Manifest> | null> {
  try {
    return JSON.parse(await readFile(dumpFile.replace(/\.dump$/, '.json'), 'utf8')) as Partial<Manifest>;
  } catch {
    return null;
  }
}

/** A dump is only a backup if pg_restore can read it and it is the file the manifest describes. */
async function verifyDump(file: string, manifest: Partial<Manifest> | null): Promise<void> {
  if (manifest?.sha256) {
    const actual = await sha256(file);
    if (actual !== manifest.sha256) throw new Error(`${path.basename(file)} does not match its manifest checksum; the file is damaged.`);
  }
  const listing = await run('pg_restore', ['--list', file]);
  if (!/TABLE DATA public /.test(listing)) throw new Error(`${path.basename(file)} holds no table data.`);
}

async function copyOffsite(files: string[]): Promise<{ at: string; ok: boolean; target: string; error: string | null } | null> {
  const target = offsiteTarget(setting('BACKUP_OFFSITE'));
  if (!target) return null;
  const at = new Date().toISOString();
  const label = `${target.kind}:${target.dest.replace(/\/\/[^@/]*@/, '//')}`;
  try {
    for (const file of files) {
      if (target.kind === 'rclone') await run('rclone', ['copyto', file, `${target.dest}/${path.basename(file)}`]);
      else if (target.kind === 'rsync') await run('rsync', ['-a', '--chmod=F600', file, `${target.dest}/`]);
      else await run('aws', ['s3', 'cp', '--only-show-errors', file, `${target.dest}/${path.basename(file)}`]);
    }
    log(`copied off-server to ${label}`);
    return { at, ok: true, target: label, error: null };
  } catch (error) {
    const message = (error as Error).message.slice(0, 300);
    log(`OFF-SERVER COPY FAILED: ${message}`);
    return { at, ok: false, target: label, error: message };
  }
}

async function prune(): Promise<void> {
  const number = (key: string, fallback: number) => Math.max(0, Number.parseInt(setting(key, String(fallback)), 10) || fallback);
  const plan = retentionPlan(await listBackups(), new Date(), {
    keepDaily: number('BACKUP_KEEP_DAILY', 14), keepWeekly: number('BACKUP_KEEP_WEEKLY', 8), keepLabelled: number('BACKUP_KEEP_LABELLED', 5),
  });
  for (const name of plan.remove) {
    await rm(path.join(BACKUP_DIR, name), { force: true });
    await rm(path.join(BACKUP_DIR, name.replace(/\.dump$/, '.json')), { force: true });
  }
  if (plan.remove.length) log(`retention removed ${plan.remove.length} old backup(s); ${plan.keep.length} kept`);
}

async function backup(label: string | null): Promise<void> {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set (in .env or the environment).');
  if (label && !/^[a-z0-9-]{1,32}$/.test(label)) throw new Error('--label must be lowercase letters, digits and dashes.');
  const started = Date.now();
  const createdAt = new Date();
  const name = backupFileName(ENVIRONMENT, createdAt, label);
  const file = path.join(BACKUP_DIR, name);
  const partial = `${file}.partial`;
  await mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
  log(`backing up ${describeUrl(DATABASE_URL)} to ${file}`);
  try {
    const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL });
    let counted: TableManifest & { migrations: number };
    try {
      // One REPEATABLE READ snapshot for the counts and the dump, so they describe the same moment.
      counted = await prisma.$transaction(async (tx) => {
        const [row] = await tx.$queryRawUnsafe<Array<{ snapshot: string }>>('SELECT pg_export_snapshot() AS snapshot');
        const dump = run('pg_dump', ['--format=custom', '--compress=6', '--no-owner', '--no-acl', `--snapshot=${row!.snapshot}`, `--file=${partial}`, `--dbname=${libpqTarget(DATABASE_URL).url}`], { env: pgEnv(DATABASE_URL) });
        const manifest = await tableManifest(tx);
        await dump;
        return manifest;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 6 * 60 * 60 * 1000, maxWait: 30_000 });
    } finally {
      await prisma.$disconnect();
    }
    await chmod(partial, 0o600);
    await rename(partial, file);
    const manifest: Manifest = {
      file: name, environment: ENVIRONMENT, label, createdAt: createdAt.toISOString(), appVersion: APP_VERSION, commit: gitCommit(),
      database: describeUrl(DATABASE_URL), bytes: (await stat(file)).size, sha256: await sha256(file), durationMs: Date.now() - started, ...counted,
    };
    await verifyDump(file, manifest);
    const manifestFile = file.replace(/\.dump$/, '.json');
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    const rows = Object.values(manifest.tables).reduce((sum, count) => sum + count, 0);
    log(`ok: ${(manifest.bytes / 1024).toFixed(0)} KB, ${Object.keys(manifest.tables).length} tables, ${rows} rows, last migration ${manifest.lastMigration ?? 'none'}, ${manifest.durationMs} ms`);
    const offsite = await copyOffsite([file, manifestFile]);
    await updateStatus({ lastBackup: { at: manifest.createdAt, ok: true, file, label, bytes: manifest.bytes, sha256: manifest.sha256, rows, error: null, offsite } });
    await prune();
    if (offsite && !offsite.ok) process.exitCode = 2;
  } catch (error) {
    await rm(partial, { force: true });
    const message = (error as Error).message.slice(0, 300);
    await updateStatus({ lastBackup: { at: createdAt.toISOString(), ok: false, file: null, label, bytes: null, error: message, offsite: null } }).catch(() => undefined);
    throw error;
  }
}

/** Replace everything in `targetUrl`'s public schema with the dump, in one transaction. */
async function restoreInto(file: string, targetUrl: string): Promise<void> {
  const target = libpqTarget(targetUrl);
  const sql = spawn('pg_restore', ['--no-owner', '--no-acl', '--file=-', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  let restoreErr = '';
  sql.stderr.on('data', (chunk) => { restoreErr += chunk; });
  const { PassThrough } = await import('node:stream');
  const script = new PassThrough();
  script.write('DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n');
  sql.stdout.pipe(script);
  const restored = run('psql', ['--no-psqlrc', '--quiet', '--set=ON_ERROR_STOP=1', '--single-transaction', `--dbname=${target.url}`], { env: pgEnv(targetUrl), stdin: script });
  await new Promise<void>((resolve, reject) => sql.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`pg_restore exited ${code}: ${restoreErr.trim()}`)))));
  await restored;
}

async function checkRestored(targetUrl: string, manifest: Partial<Manifest> | null) {
  const prisma = new PrismaClient({ datasourceUrl: targetUrl });
  try {
    const actual = await tableManifest(prisma);
    if (!manifest?.tables) return { ok: true, problems: ['no manifest: row counts were not checked'], tables: Object.keys(actual.tables).length, rows: Object.values(actual.tables).reduce((a, b) => a + b, 0) };
    return compareManifest(manifest, actual);
  } finally {
    await prisma.$disconnect();
  }
}

async function migrate(targetUrl: string): Promise<string> {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const out = await run(npx, ['prisma', 'migrate', 'deploy'], { env: { DATABASE_URL: targetUrl } });
  return /No pending migrations/.test(out) ? 'no pending migrations' : (out.match(/The following migration\(s\) have been applied:[\s\S]*/)?.[0].replace(/\s+/g, ' ').trim() ?? 'migrations applied');
}

async function pickBackup(chosen: string | undefined): Promise<string> {
  if (chosen) return path.resolve(chosen);
  const names = (await listBackups()).filter((name) => parseBackupFileName(name)?.environment === ENVIRONMENT);
  const newest = names.map(parseBackupFileName).filter(Boolean).sort((a, b) => b!.at.getTime() - a!.at.getTime())[0];
  if (!newest) throw new Error(`no ${ENVIRONMENT} backups in ${BACKUP_DIR}. Run npm run ops:backup first.`);
  return path.join(BACKUP_DIR, newest.name);
}

async function withAdmin<T>(serverUrl: string, work: (admin: PrismaClient) => Promise<T>): Promise<T> {
  const admin = new PrismaClient({ datasourceUrl: withDatabase(serverUrl, 'postgres') });
  try {
    return await work(admin);
  } finally {
    await admin.$disconnect();
  }
}

async function restoreTest(chosen: string | undefined, runMigrations: boolean, keep: boolean): Promise<void> {
  const file = await pickBackup(chosen);
  const started = Date.now();
  const at = new Date().toISOString();
  const configured = setting('RESTORE_TEST_DATABASE_URL');
  const scratchName = `streets_restore_test_${Date.now().toString(36)}`;
  let targetUrl = configured;
  let created = false;
  try {
    if (!configured && !DATABASE_URL) throw new Error('set DATABASE_URL or RESTORE_TEST_DATABASE_URL.');
    if (configured && DATABASE_URL && sameDatabase(configured, DATABASE_URL)) throw new Error('RESTORE_TEST_DATABASE_URL is the live database. It must be a separate, disposable one.');
    const manifest = await readManifest(file);
    log(`verifying ${path.basename(file)}`);
    await verifyDump(file, manifest);
    if (!configured) {
      targetUrl = withDatabase(DATABASE_URL, scratchName);
      await withAdmin(DATABASE_URL, (admin) => admin.$executeRawUnsafe(`CREATE DATABASE "${scratchName}"`));
      created = true;
    }
    log(`restoring into scratch database ${describeUrl(targetUrl)}`);
    await restoreInto(file, targetUrl);
    const check = await checkRestored(targetUrl, manifest);
    if (!check.ok) throw new Error(`restored data does not match the backup: ${check.problems.slice(0, 5).join('; ')}`);
    log(`restored ${check.tables} tables and ${check.rows} rows; every count matches the backup`);
    const migrated = runMigrations ? await migrate(targetUrl) : 'not run';
    if (runMigrations) log(`this checkout's migrations on the restored copy: ${migrated}`);
    const detail = `Restored ${path.basename(file)} into a scratch database: ${check.tables} tables, ${check.rows} rows, all counts match; migrations: ${migrated}.`;
    await updateStatus({ lastRestoreTest: { at, ok: true, backupFile: file, durationMs: Date.now() - started, tables: check.tables, rows: check.rows, detail } });
    log(`ok in ${Date.now() - started} ms`);
  } catch (error) {
    const message = (error as Error).message.slice(0, 300);
    await updateStatus({ lastRestoreTest: { at, ok: false, backupFile: file, durationMs: Date.now() - started, detail: `Restore test failed: ${message}` } }).catch(() => undefined);
    throw error;
  } finally {
    if (created && !keep) {
      await withAdmin(DATABASE_URL, (admin) => admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratchName}" WITH (FORCE)`)).catch((error) => log(`could not drop ${scratchName}: ${(error as Error).message}`));
    } else if (created) log(`kept ${scratchName} for inspection; drop it when done`);
  }
}

async function restore(chosen: string | undefined, targetArg: string | undefined, confirm: string | undefined, flags: Set<string>): Promise<void> {
  if (!chosen) throw new Error('--file <backup.dump> is required.');
  const file = path.resolve(chosen);
  const targetUrl = targetArg || DATABASE_URL;
  if (!targetUrl) throw new Error('--target <postgresql-url> is required when DATABASE_URL is not set.');
  const live = Boolean(DATABASE_URL) && sameDatabase(targetUrl, DATABASE_URL);
  const targetName = libpqTarget(targetUrl).database;
  if (live && confirm !== targetName) {
    throw new Error(`this would replace ${ENVIRONMENT}'s live database. Stop the API (or turn on MAINTENANCE_MODE), then rerun with --confirm ${targetName}.`);
  }
  const manifest = await readManifest(file);
  log(`verifying ${path.basename(file)}`);
  await verifyDump(file, manifest);
  if (manifest?.environment && manifest.environment !== ENVIRONMENT && live && !flags.has('allow-other-environment')) {
    throw new Error(`${path.basename(file)} is a ${manifest.environment} backup; this is ${ENVIRONMENT}. Rerun with --allow-other-environment if that is really intended.`);
  }
  if (live && !flags.has('no-safety-backup')) {
    log('taking a safety backup of the database about to be replaced');
    await backup('prerestore');
  }
  log(`restoring ${path.basename(file)} into ${describeUrl(targetUrl)} (one transaction: all or nothing)`);
  await restoreInto(file, targetUrl);
  const check = await checkRestored(targetUrl, manifest);
  if (!check.ok) throw new Error(`restored, but the data does not match the backup: ${check.problems.slice(0, 5).join('; ')}`);
  log(`restored ${check.tables} tables and ${check.rows} rows; every count matches the backup`);
  if (flags.has('migrate')) log(`migrations: ${await migrate(targetUrl)}`);
  else log('not migrated: run `npx prisma migrate deploy` (or deploy) if this checkout is newer than the backup');
}

async function list(): Promise<void> {
  const names = await listBackups();
  if (!names.length) log(`no backups in ${BACKUP_DIR}`);
  for (const name of names) {
    const manifest = await readManifest(path.join(BACKUP_DIR, name));
    const rows = manifest?.tables ? Object.values(manifest.tables).reduce((a, b) => a + b, 0) : '?';
    log(`${name}  ${manifest?.bytes ? `${Math.round(manifest.bytes / 1024)} KB` : '?'}  ${rows} rows  ${manifest?.lastMigration ?? ''}`);
  }
  log(`status file: ${STATUS_FILE}`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const { flags, values } = args();
  if (command === 'backup' && flags.has('list')) return list();
  if (command === 'backup') return backup(values.get('label') ?? null);
  if (command === 'restore-test') return restoreTest(values.get('file'), !flags.has('no-migrate'), flags.has('keep'));
  if (command === 'restore') return restore(values.get('file'), values.get('target'), values.get('confirm'), flags);
  if (command === 'prune') return prune();
  if (command === 'list') return list();
  throw new Error('usage: backup.ts backup [--label x] [--list] | restore-test [--file f] [--keep] [--no-migrate] | restore --file f [--target url | --confirm dbname] [--migrate] | prune | list');
}

main().catch((error: unknown) => {
  process.stderr.write(`[backup] FAILED: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
