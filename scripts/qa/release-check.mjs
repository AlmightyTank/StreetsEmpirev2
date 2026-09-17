import { spawnSync } from 'node:child_process';

const withDb = process.argv.includes('--with-db');
const production = process.argv.includes('--production');
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
  });
}

if (production) {
  run('Production environment', process.execPath, ['scripts/qa/check-production-env.mjs']);
}

console.log('\nRelease checks passed.');
