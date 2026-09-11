import { spawnSync } from 'node:child_process';

const withDb = process.argv.includes('--with-db');
const production = process.argv.includes('--production');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(label, command, args, env = process.env) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('Typecheck', npm, ['run', 'typecheck']);
run('Unit tests', npm, ['test']);
run('Production build', npm, ['run', 'build']);

if (withDb) {
  run('PostgreSQL integration regression', npm, ['test'], {
    ...process.env,
    COMBAT_INTEGRATION: '1',
    REPUTATION_INTEGRATION: '1',
    STORE_INTEGRATION: '1',
    TRANSACTION_INTEGRATION: '1',
    RELEASE_INTEGRATION: '1',
  });
}

if (production) {
  run('Production environment', process.execPath, ['scripts/qa/check-production-env.mjs']);
}

console.log('\nRelease checks passed.');
