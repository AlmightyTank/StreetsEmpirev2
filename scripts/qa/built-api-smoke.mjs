#!/usr/bin/env node
/**
 * rc.5 fix. Starts the BUILT API (apps/server/dist/index.js, exactly what the servers run)
 * on a scratch database and walks a few paths through it: ready, meta, sign-up, sign-in and
 * two-step setup (which loads the QR code library). The tests run the source through
 * tsx, so a dependency that breaks only once bundled (as qrcode did in rc.3-rc.5) would
 * otherwise first show up as a failed deploy.
 *
 *   npm run build && node scripts/qa/built-api-smoke.mjs
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createScratchDatabase } from './scratch-db.mjs';

const DIST = 'apps/server/dist/index.js';
if (!existsSync(DIST)) {
  console.error(`${DIST} is missing. Run npm run build first.`);
  process.exit(1);
}

const PORT = 3600 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${PORT}`;
const scratch = await createScratchDatabase({ label: 'builtapi' });
let child;
let log = '';
let status = 1;

async function call(method, path, body, cookie) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const setCookie = response.headers.getSetCookie?.() ?? [];
  return { status: response.status, text, json: () => JSON.parse(text), cookies: setCookie.map((c) => c.split(';')[0]).join('; ') };
}

function expect(ok, message) {
  if (!ok) throw new Error(message);
  console.log(`ok  ${message}`);
}

try {
  child = spawn(process.execPath, [DIST], {
    env: {
      ...process.env,
      DATABASE_URL: scratch.url,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      APP_ENV: 'development',
      SESSION_SECRET: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { log += chunk; });
  child.stderr.on('data', (chunk) => { log += chunk; });
  let exited = null;
  child.on('exit', (code) => { exited = code; });

  let ready = false;
  for (let i = 0; i < 60 && exited === null; i += 1) {
    try {
      if ((await fetch(`${base}/api/ready`)).ok) { ready = true; break; }
    } catch { /* not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  expect(ready, 'the built API starts and answers /api/ready');
  expect((await call('GET', '/api/meta')).json().app.version, 'it answers /api/meta');

  const name = `smoke${randomBytes(3).toString('hex')}`;
  const password = randomBytes(12).toString('hex');
  const registered = await call('POST', '/api/auth/register', { username: name, email: `${name}@example.invalid`, password, ageConfirmed: true });
  expect(registered.status === 201, `sign-up works (${registered.status})`);
  const login = await call('POST', '/api/auth/login', { identifier: name, password });
  expect(login.status === 200 && login.json().account?.username === name, 'sign-in works');
  const setup = await call('POST', '/api/auth/2fa/setup', { currentPassword: password }, login.cookies);
  expect(setup.status === 200 && setup.json().qrSvg?.startsWith('<svg'), 'two-step setup makes its QR code');
  status = 0;
  console.log('\nThe built API works.');
} catch (error) {
  console.error(`\nBUILT API SMOKE TEST FAILED: ${error instanceof Error ? error.message : error}`);
  console.error(log.split('\n').slice(-40).join('\n'));
} finally {
  child?.kill('SIGTERM');
  await scratch.drop();
}
process.exit(status);
