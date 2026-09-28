/**
 * 1.0.0-H. A throwaway, fully migrated and seeded database for tests that take over a
 * whole server: the season lifecycle (it starts and ends seasons) and the load test
 * (it ends a season with hundreds of players in it). Nothing they do can reach the
 * database in .env.
 *
 *   const scratch = await createScratchDatabase({ label: 'lifecycle' });
 *   ... run things with DATABASE_URL = scratch.url ...
 *   await scratch.drop();
 *
 * Created next to DATABASE_URL (the database user needs CREATEDB), or inside
 * SCRATCH_SERVER_URL when that points at another server.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { libpqTarget, withDatabase } from '../ops/backup-lib.mjs';
import { parseEnvFile } from '../ops/check-environment.mjs';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export const SCRATCH_PREFIX = 'streets_scratch_';

function serverUrl() {
  const fileEnv = existsSync(path.join(APP_DIR, '.env')) ? parseEnvFile(readFileSync(path.join(APP_DIR, '.env'), 'utf8')) : new Map();
  const url = process.env.SCRATCH_SERVER_URL || process.env.DATABASE_URL || fileEnv.get('DATABASE_URL');
  if (!url) throw new Error('Set DATABASE_URL (or SCRATCH_SERVER_URL) so a scratch database can be created next to it.');
  return url;
}

async function onServer(url, sql) {
  const admin = new PrismaClient({ datasourceUrl: withDatabase(url, 'postgres') });
  try {
    await admin.$executeRawUnsafe(sql);
  } finally {
    await admin.$disconnect();
  }
}

function step(label, command, args, env) {
  const result = spawnSync(command, args, { cwd: APP_DIR, env: { ...process.env, ...env }, encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${label} failed:\n${(result.stderr || result.stdout || '').trim().split('\n').slice(-12).join('\n')}`);
}

/** True when a URL points at a scratch database, for suites that refuse anything else. */
export function isScratchUrl(url) {
  try {
    return libpqTarget(url).database.startsWith(SCRATCH_PREFIX);
  } catch {
    return false;
  }
}

export async function createScratchDatabase({ label = 'db', seed = true } = {}) {
  const base = serverUrl();
  const name = `${SCRATCH_PREFIX}${label.replace(/[^a-z0-9]/gi, '').toLowerCase()}_${Date.now().toString(36)}`;
  const url = withDatabase(base, name);
  await onServer(base, `CREATE DATABASE "${name}"`);
  let dropped = false;
  const drop = async () => {
    if (dropped) return;
    dropped = true;
    await onServer(base, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  };
  try {
    step('Migrating the scratch database', npx, ['prisma', 'migrate', 'deploy'], { DATABASE_URL: url });
    if (seed) step('Seeding the scratch database', npm, ['run', 'db:seed'], { DATABASE_URL: url });
  } catch (error) {
    await drop();
    throw error;
  }
  return { name, url, drop };
}
