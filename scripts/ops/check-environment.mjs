#!/usr/bin/env node
/**
 * 1.0.0-A. Keeps production and beta from being confused at deploy time.
 *
 *   node scripts/ops/check-environment.mjs --expect production
 *       Before building: this checkout's .env must describe a production server.
 *   node scripts/ops/check-environment.mjs --expect beta --url http://127.0.0.1:3003 --commit abc1234
 *       After restarting: the running API must report beta and that commit.
 *   node scripts/ops/check-environment.mjs --expect production --url https://play.streetsempire.dev
 *       Through the proxy: the public hostname must reach the production API.
 *
 * Plain Node on purpose, so it runs before `npm ci`. The environment rule mirrors
 * inferAppEnvironment in packages/shared/src/platform.ts; a unit test keeps them equal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ENVIRONMENTS = ['production', 'beta', 'development', 'test'];
export const PRODUCTION_SESSION_COOKIE = 'se_session';

export function parseEnvFile(text) {
  const values = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const equal = line.indexOf('=');
    if (equal < 1) continue;
    values.set(line.slice(0, equal).trim(), line.slice(equal + 1).trim().replace(/^['"]|['"]$/g, ''));
  }
  return values;
}

/** Same rule as the server: explicit APP_ENV, else invite-only on its own cookie is beta. */
export function environmentOf(values) {
  const explicit = (values.get('APP_ENV') ?? '').trim().toLowerCase();
  if (explicit) return explicit;
  const nodeEnv = values.get('NODE_ENV') ?? 'development';
  if (nodeEnv === 'test') return 'test';
  if (nodeEnv !== 'production') return 'development';
  const ownCookie = (values.get('SESSION_COOKIE_NAME') || PRODUCTION_SESSION_COOKIE) !== PRODUCTION_SESSION_COOKIE;
  return values.get('BETA_INVITE_ONLY') === 'true' && ownCookie ? 'beta' : 'production';
}

/** Problems with a checkout's .env for the environment it is about to be deployed as. */
export function configProblems(values, expect) {
  const problems = [];
  const actual = environmentOf(values);
  if (!ENVIRONMENTS.includes(actual)) problems.push(`APP_ENV "${actual}" is not one of ${ENVIRONMENTS.join(', ')}.`);
  if (actual !== expect) problems.push(`this .env describes a ${actual} server, but this deploy is for ${expect}.`);
  const cookie = values.get('SESSION_COOKIE_NAME') || PRODUCTION_SESSION_COOKIE;
  if (expect === 'beta') {
    if (cookie === PRODUCTION_SESSION_COOKIE) problems.push(`beta must not use the production session cookie "${PRODUCTION_SESSION_COOKIE}".`);
    if (values.get('BETA_INVITE_ONLY') !== 'true') problems.push('beta must set BETA_INVITE_ONLY=true.');
  }
  if (expect === 'production') {
    if (/beta/i.test(cookie)) problems.push(`production must not use a beta session cookie ("${cookie}").`);
    if (values.get('NODE_ENV') !== 'production') problems.push('production must set NODE_ENV=production.');
  }
  return problems;
}

/** Problems with what a running API says about itself. */
export function metaProblems(meta, expect, commit) {
  const problems = [];
  if (!meta || typeof meta !== 'object') return ['the API did not return /api/meta.'];
  if (meta.environment !== expect) problems.push(`the API reports ${meta.environment ?? 'no environment'}, expected ${expect}.`);
  const running = meta.app?.commit;
  if (commit && running && !(running.startsWith(commit) || commit.startsWith(running))) {
    problems.push(`the API runs commit ${running}, but this checkout is ${commit}. The service did not pick up the new build.`);
  }
  return problems;
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const expect = arg('expect');
  if (!ENVIRONMENTS.includes(expect ?? '')) {
    console.error(`Usage: check-environment.mjs --expect <${ENVIRONMENTS.join('|')}> [--env .env] [--url URL] [--commit SHA]`);
    process.exit(2);
  }
  const url = arg('url');
  let problems;
  if (url) {
    let meta = null;
    try {
      const response = await fetch(new URL('/api/meta', url), { signal: AbortSignal.timeout(10_000) });
      meta = response.ok ? await response.json() : null;
    } catch {
      meta = null;
    }
    problems = metaProblems(meta, expect, arg('commit'));
  } else {
    const envPath = path.resolve(process.cwd(), arg('env') ?? '.env');
    if (!fs.existsSync(envPath)) {
      console.error(`FAIL: missing ${envPath}`);
      process.exit(1);
    }
    problems = configProblems(parseEnvFile(fs.readFileSync(envPath, 'utf8')), expect);
  }
  for (const problem of problems) console.error(`FAIL: ${problem}`);
  if (problems.length) process.exit(1);
  console.log(`Environment check passed: ${url ? `${url} is` : 'this .env is'} ${expect}. No secret values were printed.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
