#!/usr/bin/env node
/**
 * 1.0.0-H. Load test: public concurrency plus a safety margin, on a throwaway server.
 *
 *   npm run qa:load-test -- [--players 200] [--poll-seconds 5] [--poll-for 30] [--out docs/LOAD-1.0.0-H.md]
 *
 * It makes a scratch database, starts its own API on it (so nothing touches the .env
 * database or a live server), and plays these in order, each against budgets:
 *
 *   registration       every player registers and joins the season
 *   login spike        every player signs in at once
 *   dashboard polling  every player reloads its dashboard and bell every --poll-seconds
 *                      for --poll-for seconds; the game polls once a minute, so this is
 *                      60/poll-seconds times the real rate (reported as "equivalent players")
 *   store purchases    every player buys at once
 *   scout / produce    every player works at once
 *   notification burst an admin broadcasts news; every player's bell gets it; all read it at once
 *   mass season end    the season ends with every player in it; standings freeze
 *
 * Each simulated player has its own address (the server trusts X-Forwarded-For here, as
 * production does behind nginx), so the per-address sign-in limits apply as they would.
 * Exit code 1 when any budget is missed or any request fails with a server error.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createScratchDatabase } from './scratch-db.mjs';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const PLAYERS = Number(arg('players', '300'));
/** Seconds between a player's actions while playing: 15 s is a busy player. */
const ACT_SECONDS = Number(arg('act-seconds', '15'));
const POLL_SECONDS = Number(arg('poll-seconds', '20'));
const POLL_FOR = Number(arg('poll-for', '60'));
const OUT = arg('out', '');
// Prisma's pool is 2 × CPUs + 1 unless DATABASE_URL sets connection_limit; --pool tries another size.
const POOL = arg('pool', '');
const SERVER_LOG = arg('server-log', '');
const PORT = 3000 + Math.floor(Math.random() * 900) + 100;
const BASE = `http://127.0.0.1:${PORT}`;

/**
 * p95 budgets in ms. Sustained play is the one that matters for players; the bursts
 * (everyone pressing the same button in the same instant) are stress cases, where the
 * bar is "nobody gets an error, and even the last answer comes well inside the game
 * client's 15 s request timeout" (12 s, on the slowest request rather than p95).
 */
const BUDGETS = { registration: 3000, login: 3000, polling: 500, actions: 1000, burst: 12_000, notifications: 750, seasonEndMs: 60_000 };

// --- a tiny client ---------------------------------------------------------------
class Player {
  constructor(index) {
    this.index = index;
    this.ip = `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255 || 1}`;
    this.name = `load${index}${randomUUID().slice(0, 4)}`;
    this.cookie = '';
  }
  async request(method, url, body) {
    const started = performance.now();
    let status = 0;
    let json = null;
    try {
      const response = await fetch(BASE + url, {
        method,
        headers: { 'x-forwarded-for': this.ip, ...(this.cookie ? { cookie: this.cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      status = response.status;
      const setCookie = response.headers.getSetCookie?.() ?? [];
      if (setCookie.length) this.cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
      const text = await response.text();
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    } catch {
      status = 0;
    }
    return { status, json, ms: performance.now() - started };
  }
}

class Scenario {
  constructor(name, budgetMs, metric = 'p95') {
    this.name = name;
    this.budgetMs = budgetMs;
    this.metric = metric;
    this.timings = [];
    this.statuses = new Map();
    this.started = performance.now();
    this.note = '';
  }
  record(result) {
    this.timings.push(result.ms);
    const key = result.status === 0 ? 'network' : `${result.status}`;
    this.statuses.set(key, (this.statuses.get(key) ?? 0) + 1);
    return result;
  }
  get serverErrors() {
    return [...this.statuses].filter(([code]) => code === 'network' || Number(code) >= 500).reduce((n, [, c]) => n + c, 0);
  }
  percentile(p) {
    const sorted = [...this.timings].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] : 0;
  }
  finish() {
    this.seconds = (performance.now() - this.started) / 1000;
    return this;
  }
  get passed() {
    return this.serverErrors === 0 && this.percentile(this.metric === 'max' ? 1 : 0.95) <= this.budgetMs;
  }
}

async function pool(items, concurrency, work) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

// --- the throwaway server ---------------------------------------------------------
async function startServer(databaseUrl) {
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', APP_ENV: 'development',
    SESSION_SECRET: 'load-test-session-secret-at-least-32-characters', SESSION_COOKIE_NAME: 'se_load',
    TRUST_PROXY: 'true', LOG_LEVEL: 'warn', MAINTENANCE_MODE: 'false', BETA_INVITE_ONLY: 'false',
    // Nothing leaves this machine: no email, no Discord, no forum, no push.
    RESEND_API_KEY: '', DISCORD_BOT_API_TOKEN: '', DISCORD_BOT_PUSH_URL: '', FORUM_API_KEY: '', FORUM_LINK_SECRET: '',
    VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '', METRICS_TOKEN: '', BACKUP_STATUS_FILE: '',
  };
  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], { cwd: APP_DIR, env, stdio: ['ignore', SERVER_LOG ? 'pipe' : 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  if (SERVER_LOG) {
    const { createWriteStream } = await import('node:fs');
    const sink = createWriteStream(SERVER_LOG);
    child.stdout?.pipe(sink);
    child.stderr.pipe(sink);
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${BASE}/api/ready`)).ok) return child;
    } catch { /* not yet */ }
    if (child.exitCode !== null) throw new Error(`the load-test API exited:\n${stderr.slice(-1500)}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  child.kill();
  throw new Error(`the load-test API did not become ready:\n${stderr.slice(-1500)}`);
}

// --- the run ---------------------------------------------------------------------
const scenarios = [];
const scratch = await createScratchDatabase({ label: 'load' });
console.log(`Scratch database ${scratch.name}; API on ${BASE}; ${PLAYERS} players.`);
let server;
const prisma = new PrismaClient({ datasourceUrl: scratch.url });
try {
  const serverUrl = POOL ? `${scratch.url}${scratch.url.includes('?') ? '&' : '?'}connection_limit=${POOL}` : scratch.url;
  server = await startServer(serverUrl);
  const players = Array.from({ length: PLAYERS }, (_, index) => new Player(index + 1));

  // Registration and joining.
  let s = new Scenario('Registration + join', BUDGETS.registration);
  await pool(players, 25, async (player) => {
    s.record(await player.request('POST', '/api/auth/register', { ageConfirmed: true, birthDate: '1990-01-01', username: player.name, email: `${player.name}@example.invalid`, password: `password-${player.name}` }));
    s.record(await player.request('POST', '/api/rounds/current/join', {}));
  });
  scenarios.push(s.finish());

  // The operator: first admin, exactly what `npm run admin` does.
  const admin = new Player(250_000);
  s = new Scenario('Admin setup', 10_000);
  s.record(await admin.request('POST', '/api/auth/register', { ageConfirmed: true, birthDate: '1990-01-01', username: admin.name, email: `${admin.name}@example.invalid`, password: `password-${admin.name}` }));
  await prisma.account.update({ where: { usernameNormalized: admin.name.toLowerCase() }, data: { isAdmin: true } });

  // Territory actions share the same scratch PostgreSQL/API instance. This deliberately
  // overlaps access retries and cache collection against locked territory rows.
  if (PLAYERS >= 4) {
    const currentRound = (await players[0].request('GET', '/api/rounds/current')).json?.round;
    const dbPlayers = await prisma.roundPlayer.findMany({ where: { roundId: currentRound.id }, orderBy: { publicPimpId: 'asc' }, take: 12, include: { city: true, account: { select: { usernameNormalized: true } } } });
    if (dbPlayers.length >= 4) {
      const ownerRows = dbPlayers.slice(0, Math.floor(dbPlayers.length / 2));
      const visitorRows = dbPlayers.slice(ownerRows.length);
      const ownerSuffix = randomUUID().slice(0, 5);
      const visitorSuffix = randomUUID().slice(0, 5);
      const ownerTag = `OWN${ownerSuffix.slice(0, 3).toUpperCase()}`;
      const visitorTag = `VIS${visitorSuffix.slice(0, 3).toUpperCase()}`;
      const ownerAlliance = await prisma.alliance.create({ data: { roundId: currentRound.id, name: `Territory Owners ${ownerSuffix}`, nameNormalized: `territoryowners${ownerSuffix}`, tag: ownerTag, tagNormalized: ownerTag.toLowerCase(), leaderId: ownerRows[0].id } });
      const visitorAlliance = await prisma.alliance.create({ data: { roundId: currentRound.id, name: `Territory Visitors ${visitorSuffix}`, nameNormalized: `territoryvisitors${visitorSuffix}`, tag: visitorTag, tagNormalized: visitorTag.toLowerCase(), leaderId: visitorRows[0].id } });
      await Promise.all([
        prisma.roundPlayer.updateMany({ where: { id: { in: ownerRows.map((row) => row.id) } }, data: { allianceId: ownerAlliance.id } }),
        prisma.roundPlayer.updateMany({ where: { id: { in: visitorRows.map((row) => row.id) } }, data: { allianceId: visitorAlliance.id } }),
      ]);
      await prisma.round.update({ where: { id: currentRound.id }, data: { rulesetId: 'classic-og-v2.4-a', rulesetVersion: '2.4.0-A', territoryPerksEnabled: true, territoryPerksCatalogVersion: 'territory-perks-v1' } });
      const citySlug = ownerRows[0].city.slug;
      const accessKey = ({ chicago: 'arms-dealer', detroit: 'motor-city-garage', 'las-vegas': 'private-card-room', 'new-york-city': 'wall-street-fixer', 'miami-beach': 'port-dock', 'los-angeles': 'studio-lot' })[citySlug];
      if (!accessKey) throw new Error(`Territory load test needs a mapped city, got ${citySlug}.`);
      const ownerPlayer = players.find((candidate) => candidate.name.toLowerCase() === ownerRows[0].account.usernameNormalized);
      const now = new Date();
      await ownerPlayer?.request('GET', '/api/game/cities');
      await prisma.turf.updateMany({ where: { roundId: currentRound.id, cityId: ownerRows[0].cityId }, data: { holderId: ownerRows[0].id, cornerThugs: 1, heldSince: now, upkeepAt: now, localsAt: now, localsReclaimAt: null } });
      await prisma.territoryYieldCache.upsert({
        where: { roundId_scope_locationKey: { roundId: currentRound.id, scope: 'city', locationKey: citySlug } },
        create: { roundId: currentRound.id, scope: 'city', locationKey: citySlug, ownerAllianceId: ownerAlliance.id, contents: { goods: {}, cashCents: 1_000_000, tollCents: 0 }, fractionalRemainders: {}, lastSettledAt: now, carryMillis: 0 },
        update: { ownerAllianceId: ownerAlliance.id, contents: { goods: {}, cashCents: 1_000_000, tollCents: 0 }, lastSettledAt: now, carryMillis: 0 },
      });
      s = new Scenario('Territory: parallel access retries + cache collection', BUDGETS.burst, 'max');
      const dupActionId = randomUUID();
      const duplicateAccess = await Promise.all([0, 1].map(() => ownerPlayer.request('POST', '/api/game/alliance/empire/access', { scope: 'city', citySlug, accessKey, actionId: dupActionId })));
      duplicateAccess.forEach((result) => s.record(result));
      const paymentCount = await prisma.territoryTollPayment.count({ where: { roundId: currentRound.id, roundPlayerId: ownerRows[0].id, actionId: dupActionId } });
      const ownerAccesses = await Promise.all(ownerRows.slice(1).map((row) => {
        const player = players.find((candidate) => candidate.name.toLowerCase() === row.account.usernameNormalized);
        return player?.request('POST', '/api/game/alliance/empire/access', { scope: 'city', citySlug, accessKey, actionId: randomUUID() });
      }));
      const visitorAccesses = await Promise.all(visitorRows.map((row) => {
        const player = players.find((candidate) => candidate.name.toLowerCase() === row.account.usernameNormalized);
        return player?.request('POST', '/api/game/alliance/empire/access', { scope: 'city', citySlug, accessKey, actionId: randomUUID() });
      }));
      [...ownerAccesses, ...visitorAccesses].filter(Boolean).forEach((result) => s.record(result));
      const collects = await Promise.all(ownerRows.map((row) => {
        const player = players.find((candidate) => candidate.name.toLowerCase() === row.account.usernameNormalized);
        return player?.request('POST', '/api/game/alliance/empire/collect', { scope: 'city', citySlug, actionId: randomUUID() });
      }));
      collects.filter(Boolean).forEach((result) => s.record(result));
      const ledger = await prisma.territoryYieldDailyLedger.findFirst({ where: { roundId: currentRound.id, allianceId: ownerAlliance.id } });
      const cap = BigInt(25_000) * BigInt(ownerRows.length);
      const collectionSuccesses = collects.filter((result) => result?.status < 300).length;
      const capOk = collectionSuccesses > 0 && Boolean(ledger) && ledger.valueCents <= cap;
      const expectedVisitorStatus = ['arms-dealer', 'private-card-room', 'port-dock'].includes(accessKey) ? 403 : 200;
      const accessOk = duplicateAccess.every((result) => result.status < 300) && ownerAccesses.filter(Boolean).every((result) => result.status < 300) && visitorAccesses.filter(Boolean).every((result) => result.status === expectedVisitorStatus);
      s.note = `duplicate access payments=${paymentCount} (expected 1); visitors=${visitorAccesses.filter(Boolean).map((result) => result.status).join(',')}; cache collections=${collectionSuccesses}; ledger=${ledger?.valueCents ?? 0}/${cap} cents; concurrency checks ${capOk && accessOk ? 'ok' : 'FAILED'}`;
      s.finish();
      if (paymentCount !== 1 || !capOk || !accessOk) s.statuses.set('500', (s.statuses.get('500') ?? 0) + 1);
      scenarios.push(s);
    }
  }

  // Login spike: everyone signs in at the same moment.
  s = new Scenario('Login spike', BUDGETS.login);
  await Promise.all(players.map(async (player) => {
    player.cookie = '';
    s.record(await player.request('POST', '/api/auth/login', { identifier: player.name, password: `password-${player.name}` }));
  }));
  scenarios.push(s.finish());

  // Sustained play: every player keeps its dashboard and bell fresh and acts every ACT_SECONDS.
  s = new Scenario('Sustained play: dashboard + bell', BUDGETS.polling);
  const acts = new Scenario('Sustained play: actions', BUDGETS.actions);
  const until = performance.now() + POLL_FOR * 1000;
  await Promise.all(players.map(async (player, index) => {
    await new Promise((resolve) => setTimeout(resolve, Math.random() * POLL_SECONDS * 1000));
    let nextAct = performance.now() + Math.random() * ACT_SECONDS * 1000;
    let turn = index;
    while (performance.now() < until) {
      s.record(await player.request('GET', '/api/game/me?background=1'));
      s.record(await player.request('GET', '/api/notifications/in-app'));
      if (performance.now() >= nextAct) {
        acts.record(turn++ % 2
          ? await player.request('POST', '/api/game/stores/trade', { store: 'CORNER', item: 'CONDOM', direction: 'buy', quantity: 2, actionId: randomUUID() })
          : await player.request('POST', '/api/game/scout', { district: 'LOW_RENT', turns: 1, actionId: randomUUID() }));
        nextAct += ACT_SECONDS * 1000;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_SECONDS * 1000));
    }
  }));
  s.note = `≈ ${Math.round(PLAYERS * (60 / POLL_SECONDS))} players at the game's real once-a-minute poll`;
  acts.note = `${PLAYERS} players each acting every ${ACT_SECONDS} s ≈ ${(PLAYERS / ACT_SECONDS).toFixed(0)} actions/s`;
  scenarios.push(s.finish(), acts.finish());

  // Baseline: one player's writes with nothing else going on.
  s = new Scenario('Idle write (baseline)', BUDGETS.actions);
  for (let i = 0; i < 10; i++) s.record(await players[0].request('POST', '/api/game/stores/trade', { store: 'CORNER', item: 'CONDOM', direction: 'buy', quantity: 1, actionId: randomUUID() }));
  scenarios.push(s.finish());

  // Store purchases: all at once.
  s = new Scenario('Burst: every player buys at once', BUDGETS.burst, 'max');
  await Promise.all(players.map(async (player) => {
    s.record(await player.request('POST', '/api/game/stores/trade', { store: 'CORNER', item: 'CONDOM', direction: 'buy', quantity: 10, actionId: randomUUID() }));
    s.record(await player.request('POST', '/api/game/stores/trade', { store: 'CORNER', item: 'BEER', direction: 'buy', quantity: 5, actionId: randomUUID() }));
  }));
  // All sent at once, so the slowest answer is when the queue emptied.
  s.note = `≈ ${(s.timings.length / Math.max(0.001, s.percentile(1) / 1000)).toFixed(0)} writes/s drained`;
  scenarios.push(s.finish());

  // Scout and produce: all at once.
  const districts = (await players[0].request('GET', '/api/game/districts')).json?.districts ?? [];
  const district = districts.find((row) => !row.locked)?.key ?? 'LOW_RENT';
  s = new Scenario('Burst: every player scouts + produces at once', BUDGETS.burst, 'max');
  await Promise.all(players.map(async (player) => {
    s.record(await player.request('POST', '/api/game/scout', { district, turns: 2, actionId: randomUUID() }));
    s.record(await player.request('POST', '/api/game/produce-crack', { turns: 1, productType: 'CRACK', actionId: randomUUID() }));
  }));
  scenarios.push(s.finish());

  // Notification burst: one broadcast to everyone, then everyone opens the bell.
  s = new Scenario('Notification burst', BUDGETS.notifications);
  const current = (await admin.request('GET', '/api/rounds/current')).json?.round;
  const title = `Load test broadcast ${randomUUID().slice(0, 6)}`;
  const posted = s.record(await admin.request('POST', '/api/admin/news', { title, body: 'Everyone gets this once.', pinned: false, roundId: current?.id ?? null, mirrorToForum: false, broadcast: true }));
  const fanoutStarted = performance.now();
  let delivered = 0;
  for (let wait = 0; wait < 90 && delivered < PLAYERS; wait += 3) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    delivered = await prisma.inAppNotification.count({ where: { activity: { type: 'GAME_ANNOUNCEMENT' }, roundPlayer: { roundId: current.id } } }).catch(() => 0);
  }
  const fanoutSeconds = (performance.now() - fanoutStarted) / 1000;
  await Promise.all(players.map(async (player) => { s.record(await player.request('GET', '/api/notifications/in-app')); }));
  s.note = posted.status < 300 ? `broadcast reached ${delivered}/${PLAYERS} bells in ${fanoutSeconds.toFixed(0)} s (alerts run once a minute)` : `broadcast refused: ${posted.status}`;
  scenarios.push(s.finish());
  const fanoutOk = posted.status < 300 && delivered >= PLAYERS;

  // Mass season end.
  s = new Scenario('Mass season end', BUDGETS.seasonEndMs);
  const ended = s.record(await admin.request('POST', `/api/admin/rounds/${current.id}/end-early`, { reason: 'Load test: mass season end' }));
  const ranked = await prisma.roundPlayer.count({ where: { roundId: current.id, nationalRank: { not: null } } });
  const total = await prisma.roundPlayer.count({ where: { roundId: current.id } });
  s.note = `${ended.json?.round?.status ?? ended.status} · ${ranked}/${total} players ranked · ${(ended.ms / Math.max(1, total)).toFixed(1)} ms per player`;
  scenarios.push(s.finish());
  const endOk = ended.status < 300 && ranked === total;

  // --- report ---
  const rows = scenarios.map((row) => `| ${row.name} | ${row.timings.length} | ${row.percentile(0.5).toFixed(0)} | ${row.percentile(0.95).toFixed(0)} | ${row.percentile(1).toFixed(0)} | ${row.metric === 'max' ? `max ≤ ${row.budgetMs}` : `p95 ≤ ${row.budgetMs}`} | ${[...row.statuses].map(([k, v]) => `${k}×${v}`).join(' ')} | ${row.passed ? 'pass' : 'FAIL'} | ${row.note} |`);
  const report = [
    `# Load test (${new Date().toISOString().slice(0, 10)})`, '',
    `${PLAYERS} simulated players, each with its own address, on one API process and a local PostgreSQL 16 (${POOL ? `pool ${POOL}` : 'default pool'}, ${cpus().length} CPUs); sustained play for ${POLL_FOR} s polling every ${POLL_SECONDS} s.`, '',
    '| Scenario | Requests | p50 ms | p95 ms | max ms | Budget (ms) | Statuses | Result | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows, '',
  ].join('\n');
  console.log(`\n${report}`);
  if (OUT) writeFileSync(path.resolve(APP_DIR, OUT), report);
  const failed = scenarios.some((row) => !row.passed) || !fanoutOk || !endOk;
  if (failed) console.log('LOAD TEST FAILED: see the table.');
  process.exitCode = failed ? 1 : 0;
} finally {
  server?.kill();
  await prisma.$disconnect();
  await scratch.drop();
  console.log(`Scratch database ${scratch.name} dropped.`);
}
