import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs');
const files = [
  'apps/server/src/services/__tests__/living-story-contract.service.test.ts',
  'apps/server/src/services/__tests__/living-story-trigger.service.test.ts',
  'apps/server/src/services/__tests__/living-case-evidence.service.test.ts',
  'apps/server/src/services/__tests__/criminal-case-file.service.test.ts',
  'apps/server/src/services/__tests__/criminal-case-outcomes.service.test.ts',
  'apps/server/src/services/__tests__/admin-living-stories.service.test.ts',
];

const result = spawnSync(process.execPath, [vitest, 'run', ...files], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    // Run baseline eligibility assertions independent of beta's live switch;
    // the focused test explicitly stubs the disabled case itself.
    LIVING_STREETS_ENABLED: 'true',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://qa:qa@127.0.0.1:5432/living_streets_qa?schema=public',
    SESSION_SECRET: process.env.SESSION_SECRET ?? 'living-streets-qa-session-secret-32chars',
  },
});

if (result.error) {
  console.error(`Living Streets QA could not start: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
