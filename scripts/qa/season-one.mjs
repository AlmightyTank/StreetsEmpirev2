#!/usr/bin/env node
/**
 * 1.0.0-H. Season One on a scratch database: create → join → play → end → freeze →
 * Hall of Fame → archive → create next, with the 1.0 player journey inside it.
 * See apps/server/src/services/__tests__/season-one.integration.test.ts.
 *
 *   npm run qa:season-one
 */
import { spawnSync } from 'node:child_process';
import { createScratchDatabase } from './scratch-db.mjs';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const scratch = await createScratchDatabase({ label: 'seasonone' });
console.log(`Scratch database ${scratch.name} ready.`);
let status = 1;
try {
  const result = spawnSync(npx, ['vitest', 'run', 'apps/server/src/services/__tests__/season-one.integration.test.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      DATABASE_URL: scratch.url,
      SEASON_ONE_INTEGRATION: '1',
      // As on production: players verify their email (or use Discord) before they play.
      REQUIRE_VERIFIED_EMAIL: 'true',
      REQUIRE_RULES_ACCEPTANCE: 'true',
      SESSION_SECRET: process.env.SESSION_SECRET || 'season-one-scratch-session-secret-32chars',
      NODE_ENV: 'test',
    },
  });
  status = result.status ?? 1;
} finally {
  await scratch.drop();
  console.log(`Scratch database ${scratch.name} dropped.`);
}
process.exit(status);
