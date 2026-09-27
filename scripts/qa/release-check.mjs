import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const withDb = process.argv.includes('--with-db');
const production = process.argv.includes('--production');
// 1.0.0-G: needs the web client and API running (npm run dev) and UI_AUDIT_PLAYER set.
const withUi = process.argv.includes('--with-ui');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(label, command, args, env = process.env) {
  console.log(`\n== ${label} ==`);
  // Node refuses to spawn npm.cmd without a shell on Windows (CVE-2024-27980), and says nothing unless asked.
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' && command === npm });
  if (result.error) console.error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('Typecheck', npm, ['run', 'typecheck']);
run('Unit tests', npm, ['test']);
run('Production build', npm, ['run', 'build']);
// 0.4.0: product effects, money loops, product in combat and a full round.
run('Product balance gates', npm, ['run', 'qa:products', '--', '--samples', '4000', '--quiet']);
// 0.5.0: every city worth a run, no run better than the street, no same-city loops.
run('Travel balance gates', npm, ['run', 'qa:travel', '--', '--quiet']);
// 0.6.0: all 40 turf blocks and player-vs-player push balance must still pass on the release ruleset.
run('Turf balance gates', npm, ['run', 'qa:turf', '--', '--quiet']);
// 0.7.0: Hideout headquarters, protection, logistics, ledger, armory/infirmary and specialization guardrails.
run('Hideout balance gates', npm, ['run', 'qa:hideout']);
// 0.8.0: Store pressure, relationship pricing, shipments, sourcing and integration guardrails.
run('Store economy gates', npm, ['run', 'qa:store-economy']);
// 1.0.0-D: whole seasons with every strategy at once, against the balance bands.
run('Whole-season balance bands', npm, ['run', 'qa:season', '--', '--quiet']);

if (withDb) {
  // One file at a time: suites share the .env database, and any real current-round lookup
  // closes older active rounds, including another suite's fixture round mid-run.
  run('PostgreSQL integration regression', npm, ['test', '--', '--no-file-parallelism'], {
    ...process.env,
    COMBAT_INTEGRATION: '1',
    REPUTATION_INTEGRATION: '1',
    STORE_INTEGRATION: '1',
    TRANSACTION_INTEGRATION: '1',
    // Includes the 0.3.0 alliance season and 0.4.0 products season regressions.
    RELEASE_INTEGRATION: '1',
    // 0.3.0: alliances, community hooks, shared recon, wire and contacts. Fixtures use their own rounds.
    ALLIANCE_INTEGRATION: '1',
    // 0.4.0: product inventory, work supply, Heat and the product economy.
    PRODUCT_INTEGRATION: '1',
    // 0.5.0: runs out of town, city counters and what the crew saw there, markets and risk, moving house and convoys.
    TRAVEL_INTEGRATION: '1',
    // 0.6.0: holding, player turf wars, away outposts, territory history/control and the release crackdown.
    TURF_INTEGRATION: '1',
    // 0.9.0: profile stats and titles, notifications and phone alerts, moderation and messaging QA.
    PROFILE_INTEGRATION: '1',
    GAME_ALERTS_INTEGRATION: '1',
    MODERATION_INTEGRATION: '1',
    // 1.0.0-A: version visibility and the production/beta database claim.
    PLATFORM_INTEGRATION: '1',
    // 1.0.0-B: tutorial progress and the early getting-started goals.
    ONBOARDING_INTEGRATION: '1',
    // 1.0.0-C: deliberate exploit attempts across money, goods, turns, combat, turf, travel and abuse signals.
    EXPLOIT_INTEGRATION: '1',
    // 1.0.0-E: season pause, bans, exploit flags, economy/combat/turf tools, announcements and maintenance.
    ADMIN_OPS_INTEGRATION: '1',
  });
  // 1.0.0-F: a backup nobody has restored is not a backup. Back up the test database, then
  // restore it into a scratch database and check every table (needs CREATEDB, or RESTORE_TEST_DATABASE_URL).
  const backupDir = mkdtempSync(join(tmpdir(), 'se-release-backup-'));
  const backupEnv = { ...process.env, BACKUP_DIR: backupDir, BACKUP_STATUS_FILE: join(backupDir, 'status.json'), BACKUP_OFFSITE: '' };
  try {
    run('Database backup', npm, ['run', 'ops:backup'], backupEnv);
    run('Restore test', npm, ['run', 'ops:restore-test'], backupEnv);
  } finally {
    rmSync(backupDir, { recursive: true, force: true });
  }
}

if (withUi) {
  run('Mobile and accessibility audit', npm, ['run', 'qa:ui', '--', '--strict', ...(process.env.UI_AUDIT_BASE ? ['--base', process.env.UI_AUDIT_BASE] : [])]);
}

if (production) {
  run('Production environment', process.execPath, ['scripts/qa/check-production-env.mjs']);
}

console.log('\nRelease checks passed.');
