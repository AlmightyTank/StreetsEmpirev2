#!/usr/bin/env node
/**
 * Tells the game a deploy is starting, finished or failed, so the Discord status
 * channel can say so. Run on the VPS from the checkout, by the deploy workflow:
 *
 *   node scripts/ops/deploy-status.mjs started <commit>
 *   node scripts/ops/deploy-status.mjs finished <commit>
 *   node scripts/ops/deploy-status.mjs failed <commit>
 *
 * Best effort: it always exits 0, so a missing token or a down API never fails a deploy.
 * Uses the same PATCH_NOTES_API_TOKEN as patch-notes.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseEnvFile } from './check-environment.mjs';

const PHASES = ['started', 'finished', 'failed'];

async function main() {
  const [phase, commit] = process.argv.slice(2);
  if (!PHASES.includes(phase ?? '') || !/^[0-9a-f]{7,40}$/.test(commit ?? '')) {
    console.log(`Usage: deploy-status.mjs <${PHASES.join('|')}> <commit sha>. Nothing was sent.`);
    return;
  }
  let values;
  try {
    values = parseEnvFile(fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8'));
  } catch {
    console.log('No .env in this directory, so no deploy notice was sent.');
    return;
  }
  const token = values.get('PATCH_NOTES_API_TOKEN');
  if (!token) {
    console.log('Deploy notices are off: set PATCH_NOTES_API_TOKEN in .env. Nothing was sent.');
    return;
  }
  try {
    const response = await fetch(`http://127.0.0.1:${values.get('PORT') || '3001'}/api/internal/ops/deploy`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ phase, commit }),
      signal: AbortSignal.timeout(10_000),
    });
    console.log(response.ok ? `Deploy ${phase} notice sent for ${commit.slice(0, 7)}.` : `The API answered ${response.status}; no deploy ${phase} notice.`);
  } catch (error) {
    console.log(`Could not reach the API (${error instanceof Error ? error.message : error}); no deploy ${phase} notice.`);
  }
}

await main();
