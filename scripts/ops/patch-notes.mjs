#!/usr/bin/env node
/**
 * Patch notes from merged pull requests, held for review as game news.
 *
 *   node scripts/ops/patch-notes.mjs collect --from <sha> --to <sha> --branch main --repo owner/name
 *       In GitHub Actions after a deploy: reads the "## Patch notes" section of every
 *       pull request merged into the branch between the two commits and prints one
 *       news post as JSON, or `null` when none had player-facing notes. Needs `gh`
 *       with GH_TOKEN.
 *   node scripts/ops/patch-notes.mjs post < notes.json
 *       On the VPS, from the checkout: sends that post to the local game API, which
 *       schedules it PATCH_NOTES_HOLD_MINUTES ahead so staff can edit, delete or
 *       publish it from Admin → News before players, Discord or the forum see it.
 *
 * Plain Node on purpose, like check-environment.mjs: no install step needed.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnvFile } from './check-environment.mjs';

/** Same limits as Admin → News. */
export const TITLE_MAX = 120;
export const BODY_MAX = 4000;

const HEADING = /^#{1,6}\s/;
const SECTION = /^#{2,3}\s*patch notes\s*:?\s*$/i;
const NOTHING = /^(none|n\/?a|no|nothing|-+)\.?$/i;

/** The player-facing bullets under a PR body's "## Patch notes" heading; empty when there are none. */
export function extractPatchNotes(body) {
  if (!body) return [];
  const lines = body.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const start = lines.findIndex((line) => SECTION.test(line.trim()));
  if (start < 0) return [];
  const notes = [];
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (HEADING.test(line)) break;
    const text = line.replace(/^(?:[-*+]|\d+[.)])\s+/, '').trim();
    if (text && !NOTHING.test(text)) notes.push(text);
  }
  return notes;
}

/**
 * One news post for a deploy, or null when no PR had notes. Pull requests are
 * listed in merge order; past the body limit the rest are counted, not cut mid-line.
 */
export function buildPatchNotes(pulls, date = new Date()) {
  const notes = [...pulls]
    .sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt))
    .flatMap((pull) => extractPatchNotes(pull.body));
  if (!notes.length) return null;
  const day = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const lines = [];
  for (const [index, note] of notes.entries()) {
    const line = `- ${note}`;
    const rest = notes.length - index - 1;
    const more = rest ? `\n…and ${rest} more change${rest === 1 ? '' : 's'}.`.length : 0;
    if ([...lines, line].join('\n').length + more > BODY_MAX) {
      const left = notes.length - index;
      lines.push(`…and ${left} more change${left === 1 ? '' : 's'}.`);
      break;
    }
    lines.push(line);
  }
  return { title: `Patch notes: ${day}`.slice(0, TITLE_MAX), body: lines.join('\n') };
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

/** Merged PRs into `branch` for each mainline commit in from..to: merge, squash and rebase merges alike. */
function mergedPulls(from, to, branch, repo) {
  const commits = run('git', ['rev-list', '--first-parent', '--reverse', `${from}..${to}`]).split('\n').filter(Boolean);
  const pulls = new Map();
  for (const sha of commits) {
    for (const pull of JSON.parse(run('gh', ['api', `repos/${repo}/commits/${sha}/pulls`]))) {
      if (!pull.merged_at || pull.base?.ref !== branch || pulls.has(pull.number)) continue;
      pulls.set(pull.number, { number: pull.number, mergedAt: pull.merged_at, body: pull.body ?? '' });
    }
  }
  return [...pulls.values()];
}

async function collect() {
  const [from, to, branch, repo] = ['from', 'to', 'branch', 'repo'].map(arg);
  if (!from || !to || !branch || !repo) {
    console.error('Usage: patch-notes.mjs collect --from <sha> --to <sha> --branch <name> --repo <owner/name>');
    process.exit(2);
  }
  const pulls = mergedPulls(from, to, branch, repo);
  const post = buildPatchNotes(pulls);
  console.error(`${pulls.length} merged pull request${pulls.length === 1 ? '' : 's'}${pulls.length ? ` (#${pulls.map((pull) => pull.number).join(', #')})` : ''}; ${post ? 'patch notes found' : 'none had patch notes'}.`);
  console.log(JSON.stringify(post));
}

async function post() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const notes = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!notes) return;
  const envPath = path.resolve(process.cwd(), '.env');
  const values = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
  const token = values.get('PATCH_NOTES_API_TOKEN');
  if (!token) {
    console.log('Patch notes are off: set PATCH_NOTES_API_TOKEN in .env and restart the API. Nothing was posted.');
    return;
  }
  const url = `http://127.0.0.1:${values.get('PORT') || '3001'}/api/internal/patch-notes`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ title: notes.title, body: notes.body }),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    console.error(`FAIL: the API answered ${response.status}: ${result?.error?.message ?? 'no details'}`);
    process.exit(1);
  }
  console.log(result.duplicate
    ? `"${result.title}" was already held; nothing new was posted.`
    : `Held "${result.title}" until ${result.publishedAt}. Edit, delete or publish it now under Admin → News.`);
}

async function main() {
  const command = process.argv[2];
  if (command === 'collect') return collect();
  if (command === 'post') return post();
  console.error('Usage: patch-notes.mjs <collect|post> [options]');
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
