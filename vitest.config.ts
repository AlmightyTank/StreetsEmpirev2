import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

const root = import.meta.dirname;

// PostgreSQL suites (*.integration.test.ts) only run behind a *_INTEGRATION=1 flag, so a plain
// `npm test` used to load ~100 files just to report them skipped. Leave them out unless at
// least one flag is set (release-check --with-db, CI's release step, or a manual run).
const integrationRequested = Object.entries(process.env).some(
  ([name, value]) => name.endsWith('_INTEGRATION') && value === '1',
);
const fullTestSuite =
  process.env.FULL_TESTS === '1' ||
  process.env.npm_lifecycle_event === 'test:full' ||
  process.env.npm_lifecycle_event === 'test:full:watch';

// Keep the default feedback loop short. The full suite remains available through `npm run
// test:full` for release work and focused investigations.
const smokeTests = [
  'packages/rules-engine/src/__tests__/actions.test.ts',
  'packages/rules-engine/src/__tests__/combat.test.ts',
  'packages/rules-engine/src/__tests__/turns.test.ts',
  'packages/shared/src/__tests__/theme.test.ts',
  'apps/web/src/utils/__tests__/time.test.ts',
];

export default defineConfig({
  resolve: {
    alias: {
      '@streets/shared': path.resolve(root, 'packages/shared/src/index.ts'),
      '@streets/rulesets': path.resolve(root, 'packages/rulesets/src/index.ts'),
      '@streets/rules-engine': path.resolve(
        root,
        'packages/rules-engine/src/index.ts',
      ),
    },
  },
  test: {
    include: fullTestSuite
      ? ['packages/**/*.test.{ts,tsx}', 'apps/**/src/**/*.test.{ts,tsx}']
      : smokeTests,
    exclude: integrationRequested
      ? configDefaults.exclude
      : [...configDefaults.exclude, '**/*.integration.test.{ts,tsx}'],
    environment: 'node',
  },
});
