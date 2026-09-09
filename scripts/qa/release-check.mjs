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
    STORE_INTEGRATION: '1',
    TRANSACTION_INTEGRATION: '1',
    RELEASE_INTEGRATION: '1',
  });
}

if (production) {
  run('Production environment', process.execPath, ['scripts/qa/check-production-env.mjs']);
}

console.log('\n0.1.0-H release checks passed.');
