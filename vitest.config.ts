import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

const root = import.meta.dirname;

// PostgreSQL suites (*.integration.test.ts) only run behind a *_INTEGRATION=1 flag, so a plain
// `npm test` used to load ~100 files just to report them skipped. Leave them out unless at
// least one flag is set (release-check --with-db, CI's release step, or a manual run).
const integrationRequested = Object.entries(process.env).some(
  ([name, value]) => name.endsWith('_INTEGRATION') && value === '1',
);

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
    include: ['packages/**/*.test.{ts,tsx}', 'apps/**/src/**/*.test.{ts,tsx}'],
    exclude: integrationRequested
      ? configDefaults.exclude
      : [...configDefaults.exclude, '**/*.integration.test.{ts,tsx}'],
    environment: 'node',
  },
});
