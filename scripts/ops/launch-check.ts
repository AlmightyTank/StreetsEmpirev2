/**
 * 1.0.0-H. The launch checklist, checked. Read-only; run it on the production server
 * from the production checkout before opening Season One, and again after any big change.
 *
 *   npm run ops:launch-check -- [--expect production] [--game https://play.streetsempire.dev]
 *                               [--site https://streetsempire.dev] [--beta-env /path/to/beta/.env]
 *
 * PASS / WARN / FAIL per item, exit 1 on any FAIL. Items it cannot check for you
 * (reading the legal pages, publishing release notes) are listed as MANUAL.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { configProblems, environmentOf, parseEnvFile } from './check-environment.mjs';
import { describeUrl, sameDatabase } from './backup-lib.mjs';

type Result = 'PASS' | 'WARN' | 'FAIL' | 'MANUAL';
const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name: string, fallback = '') => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1]!.startsWith('--') ? process.argv[index + 1]! : fallback;
};
const rows: Array<{ item: string; result: Result; detail: string }> = [];
const report = (item: string, result: Result, detail: string) => rows.push({ item, result, detail });

/** Placeholder and example values that must never be a real secret. */
const KNOWN_WEAK = [
  'ci-only-session-secret-change-me-32-characters', 'change-me', 'changeme', 'dev-session-secret', 'replace-me',
  'load-test-session-secret-at-least-32-characters', 'season-one-scratch-session-secret-32chars',
];

async function reachable(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return { ok: response.ok, status: response.status, body: await response.text() };
  } catch (error) {
    return { ok: false, status: 0, body: (error as Error).message };
  }
}

async function main(): Promise<void> {
  const envFile = path.join(APP_DIR, '.env');
  if (!existsSync(envFile)) throw new Error(`no .env in ${APP_DIR}; run this from the server's checkout.`);
  const env = parseEnvFile(readFileSync(envFile, 'utf8'));
  const expect = arg('expect', 'production');
  const game = arg('game', env.get('FRONTEND_ORIGIN') ?? '').replace(/\/$/, '');
  const site = arg('site', '').replace(/\/$/, '');
  const environment = environmentOf(env);

  // Environment and beta separation.
  const problems = configProblems(env, expect);
  report('Environment is ' + expect, problems.length ? 'FAIL' : 'PASS', problems.join(' ') || `.env describes a ${environment} server.`);
  const betaEnvPath = arg('beta-env');
  if (betaEnvPath) {
    const beta = parseEnvFile(readFileSync(betaEnvPath, 'utf8'));
    const shared = ['SESSION_SECRET', 'DISCORD_BOT_API_TOKEN', 'FORUM_LINK_SECRET', 'VAPID_PRIVATE_KEY', 'METRICS_TOKEN']
      .filter((key) => env.get(key) && env.get(key) === beta.get(key));
    const sameDb = env.get('DATABASE_URL') && beta.get('DATABASE_URL') && sameDatabase(env.get('DATABASE_URL')!, beta.get('DATABASE_URL')!);
    const cookie = (env.get('SESSION_COOKIE_NAME') || 'se_session') === (beta.get('SESSION_COOKIE_NAME') || 'se_session');
    const issues = [sameDb ? 'beta uses the production database' : '', cookie ? 'beta uses the production session cookie name' : '', shared.length ? `beta shares ${shared.join(', ')}` : ''].filter(Boolean);
    report('Beta separated', issues.length ? 'FAIL' : 'PASS', issues.join('; ') || `own database (${describeUrl(beta.get('DATABASE_URL')!)}), own cookie, no shared secrets.`);
  } else {
    report('Beta separated', 'WARN', 'Pass --beta-env <beta checkout>/.env to check database, cookie and secrets are not shared.');
  }

  // Secrets.
  const session = env.get('SESSION_SECRET') ?? '';
  const weak = session.length < 32 || KNOWN_WEAK.some((value) => session.toLowerCase().includes(value));
  const example = existsSync(path.join(APP_DIR, '.env.example')) ? parseEnvFile(readFileSync(path.join(APP_DIR, '.env.example'), 'utf8')) : new Map<string, string>();
  const copied = [...env].filter(([key, value]) => /SECRET|TOKEN|KEY|PASSWORD/.test(key) && value && value === example.get(key)).map(([key]) => key);
  report('Secrets are real', weak || copied.length ? 'FAIL' : 'PASS',
    weak ? 'SESSION_SECRET is short or a known placeholder.' : copied.length ? `${copied.join(', ')} still equal .env.example.` : 'No placeholders, nothing copied from .env.example.');
  const rotated = env.get('SECRETS_ROTATED_AT');
  const rotatedDays = rotated ? (Date.now() - Date.parse(rotated)) / 86_400_000 : NaN;
  report('Production secrets rotated', !rotated ? 'WARN' : rotatedDays > 30 ? 'WARN' : 'PASS',
    !rotated ? 'Rotate SESSION_SECRET (everyone signs in again), DISCORD_BOT_API_TOKEN and FORUM_LINK_SECRET (update the bot and forum too) before launch, then set SECRETS_ROTATED_AT=YYYY-MM-DD in .env.'
      : `Rotated ${rotated} (${Math.round(rotatedDays)} days ago).`);

  // Backups and restore.
  const statusFile = env.get('BACKUP_STATUS_FILE');
  if (!statusFile || !existsSync(statusFile)) {
    report('Backups verified', 'FAIL', 'No backup status file. Run scripts/ops/install-backup-timer.sh (docs/RECOVERY.md).');
    report('Restore verified', 'FAIL', 'No restore test recorded.');
  } else {
    const status = JSON.parse(readFileSync(statusFile, 'utf8')) as { lastBackup?: { at?: string; ok?: boolean; offsite?: { ok?: boolean; at?: string } | null }; lastRestoreTest?: { at?: string; ok?: boolean; detail?: string } };
    const backupHours = status.lastBackup?.at ? (Date.now() - Date.parse(status.lastBackup.at)) / 3_600_000 : Infinity;
    report('Backups verified', status.lastBackup?.ok && backupHours < 26 ? (status.lastBackup.offsite?.ok ? 'PASS' : 'WARN') : 'FAIL',
      `Last backup ${status.lastBackup?.at ?? 'never'} (${status.lastBackup?.ok ? 'ok' : 'failed'}); off-server copy ${status.lastBackup?.offsite?.ok ? 'ok' : 'not made'}.`);
    const restoreDays = status.lastRestoreTest?.at ? (Date.now() - Date.parse(status.lastRestoreTest.at)) / 86_400_000 : Infinity;
    report('Restore verified', status.lastRestoreTest?.ok && restoreDays < 8 ? 'PASS' : 'FAIL',
      status.lastRestoreTest?.detail ?? 'No restore test recorded. Run npm run ops:restore-test.');
  }

  // Database: admins and release notes.
  const prisma = new PrismaClient({ datasourceUrl: env.get('DATABASE_URL') });
  try {
    const admins = await prisma.account.findMany({ where: { isAdmin: true, isActive: true }, select: { username: true } });
    report('Admin accounts configured', admins.length === 0 ? 'FAIL' : admins.length === 1 ? 'WARN' : 'PASS',
      admins.length ? `${admins.map((a) => a.username).join(', ')}${admins.length === 1 ? ' (one admin: add a second so the game is never without one).' : '.'}` : 'No admin. npm run admin -- <username>.');
    const notes = await prisma.gameNews.findFirst({ where: { title: { contains: '1.0', mode: 'insensitive' }, publishedAt: { lte: new Date() } }, orderBy: { publishedAt: 'desc' }, select: { title: true } });
    report('Release notes published', notes ? 'PASS' : 'WARN', notes ? `News: "${notes.title}".` : 'Publish the 1.0 release notes as news (docs/RELEASE-1.0.0.md is the text).');
  } finally {
    await prisma.$disconnect();
  }

  // Live services.
  if (game) {
    const ready = await reachable(`${game}/api/ready`);
    let detail = ready.ok ? '' : `${game}/api/ready → ${ready.status || ready.body}`;
    if (ready.ok) {
      const body = JSON.parse(ready.body) as { environment?: string; version?: string; maintenance?: boolean };
      detail = `${body.environment} ${body.version}${body.maintenance ? ', MAINTENANCE MODE ON' : ''}`;
      report('Game API answering', body.environment === expect ? 'PASS' : 'FAIL', detail);
    } else report('Game API answering', 'FAIL', detail);
    const status = await reachable(`${game}/api/public/status`);
    report('Status and maintenance mechanism', status.ok && existsSync(path.join(APP_DIR, 'scripts/ops/maintenance.sh')) ? 'PASS' : 'FAIL',
      status.ok ? 'Public status answers; scripts/ops/maintenance.sh and the maintenance banner are available.' : `${game}/api/public/status → ${status.status}`);
    const rules = await reachable(`${game}/game/rules`);
    report('Rules available', rules.ok ? 'PASS' : 'FAIL', rules.ok ? `${game}/game/rules` : `${game}/game/rules → ${rules.status}`);
  } else {
    report('Game API answering', 'WARN', 'Pass --game https://play.streetsempire.dev (or set FRONTEND_ORIGIN).');
  }
  if (site) {
    const pages = await Promise.all(['/privacy', '/terms', '/status'].map(async (page) => [page, await reachable(site + page)] as const));
    const missing = pages.filter(([, result]) => !result.ok).map(([page, result]) => `${page} → ${result.status}`);
    report('Privacy and terms pages', missing.length ? 'FAIL' : 'PASS', missing.join(', ') || `${site}/privacy, /terms and /status answer.`);
  } else {
    report('Privacy and terms pages', 'WARN', 'Pass --site https://streetsempire.dev to check they are published.');
  }

  // Documentation and the human part.
  const runbook = existsSync(path.join(APP_DIR, 'docs/ADMIN-RUNBOOK.md')) && readFileSync(path.join(APP_DIR, 'docs/ADMIN-RUNBOOK.md'), 'utf8').includes('Moderation process (1.0)');
  report('Moderation process documented', runbook ? 'PASS' : 'FAIL', runbook ? 'docs/ADMIN-RUNBOOK.md → Moderation process (1.0).' : 'docs/ADMIN-RUNBOOK.md has no moderation process.');
  report('Privacy and terms read by the operator', 'MANUAL', 'Read apps/site/src/pages/LegalPages.tsx (plain language, not legal advice); change what does not fit, update LEGAL_UPDATED.');

  const width = Math.max(...rows.map((row) => row.item.length));
  for (const row of rows) console.log(`${row.result.padEnd(6)} ${row.item.padEnd(width)}  ${row.detail}`);
  const failed = rows.filter((row) => row.result === 'FAIL').length;
  const warned = rows.filter((row) => row.result === 'WARN').length;
  console.log(`\n${failed ? `${failed} FAIL` : 'No failures'}${warned ? `, ${warned} to look at` : ''}.`);
  if (failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`launch check could not run: ${(error as Error).message}`);
  process.exitCode = 1;
});
