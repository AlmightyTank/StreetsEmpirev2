import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

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
    include: ['packages/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    environment: 'node',
  },
});
