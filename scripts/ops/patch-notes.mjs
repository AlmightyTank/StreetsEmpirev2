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
 *       The title is "Patch notes for <version>", using APP_VERSION
 *       (MAJOR.MINOR.PATCH, for example 2.2.0).
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

/**
 * Semantic Versioning 2.0.0: MAJOR.MINOR.PATCH, then an optional pre-release
 * (`-alpha.1`) and build metadata (`+build.123`).
 * MAJOR resets MINOR and PATCH. MINOR resets PATCH. PATCH is a drop-in fix.
 */
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const HEADING = /^#{1,6}\s/;
const SECTION = /^#{2,3}\s*patch notes\s*:?\s*$/i;
const NOTHING = /^(none|n\/?a|no|nothing|-+)\.?$/i;
const GENERATED_BYLINE = /(?:generated\s+(?:with|by)\s+\[?claude code|claude\.com\/claude-code|claude\.ai\/code\/session_|discord\.com\/assets\/[\w-]+\.svg)/i;

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
    if (text && !NOTHING.test(text) && !GENERATED_BYLINE.test(text)) notes.push(text);
  }
  return notes;
}

/** APP_VERSION from packages/shared/src/platform.ts. Rejects anything that is not SemVer. */
export function readAppVersion(source) {
  const match = String(source ?? '').match(/export const APP_VERSION = '([^']*)'/);
  const version = match?.[1] ?? '';
  if (!SEMVER.test(version)) {
    throw new Error(`APP_VERSION must be MAJOR.MINOR.PATCH (for example 2.2.0). Got "${version}".`);
  }
  return version;
}

/** Replace the APP_VERSION assignment. Pre-release and build tags are not kept. */
export function writeAppVersion(source, version) {
  if (!SEMVER.test(version ?? '')) {
    throw new Error(`APP_VERSION must be MAJOR.MINOR.PATCH (for example 2.2.0). Got "${version ?? ''}".`);
  }
  if (!/export const APP_VERSION = '[^']*'/.test(String(source ?? ''))) {
    throw new Error('APP_VERSION assignment was not found.');
  }
  return String(source).replace(/export const APP_VERSION = '[^']*'/, `export const APP_VERSION = '${version}'`);
}

const VERSION_SECTION = /^#{2,3}\s*version\s*:?\s*$/i;
const RELEASE_COMMIT = /^chore:\s*release\b/i;
const CHECKED_BOX = /^\[(x|X)\]\s+(major|minor|none)\s*$/i;

function visibleText(value) {
  return String(value ?? '').replace(/<!--[\s\S]*?-->/g, '');
}

function sectionLines(body, heading) {
  const lines = visibleText(body).split(/\r?\n/);
  const start = lines.findIndex((line) => heading.test(line.trim()));
  if (start < 0) return null;
  const kept = [];
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (HEADING.test(line)) break;
    const text = line.replace(/^(?:[-*+]|\d+[.)])\s+/, '').trim();
    if (text) kept.push(text);
  }
  return kept;
}

/** A checked Version box, or a line that is only major, minor, or none. */
function versionChoice(line) {
  const checked = line.match(CHECKED_BOX);
  if (checked) return checked[2].toLowerCase();
  const word = line.trim().toLowerCase();
  return /^(?:major|minor|none|skip)$/.test(word) ? word : null;
}

/**
 * What the pull request's ## Version section asks for. Only a checked box or
 * the word itself counts, so an empty template does not raise minor or major.
 * Major wins when the pull request checks both. Null when it does not say.
 */
export function declaredLevel(body) {
  const lines = sectionLines(body, VERSION_SECTION);
  if (!lines) return null;
  const choices = lines.map(versionChoice).filter(Boolean);
  if (choices.includes('major')) return 'major';
  if (choices.includes('minor')) return 'minor';
  if (choices.includes('none') || choices.includes('skip')) return 'skip';
  return null;
}

/**
 * How one merged pull request moves the release.
 * The pull request raises minor or major by checking that box. Anything else
 * is a patch, and "none" leaves this pull out.
 */
export function classifyRelease(pull) {
  if (RELEASE_COMMIT.test(String(pull?.title ?? '').trim())) return 'skip';
  const declared = declaredLevel(pull?.body);
  if (declared === 'major' || declared === 'minor' || declared === 'skip') return declared;
  return 'patch';
}

/**
 * One bump for a deploy. Major wins over minor, minor over patch.
 * Every pull opting out leaves the version where it is. Changes with no pull
 * request still take a patch bump.
 */
export function releaseLevel(pulls, hasChanges = true) {
  if (!hasChanges) return null;
  const levels = (pulls ?? []).map((pull) => classifyRelease(pull));
  if (levels.includes('major')) return 'major';
  if (levels.includes('minor')) return 'minor';
  if (levels.includes('patch')) return 'patch';
  if (levels.length > 0 && levels.every((level) => level === 'skip')) return null;
  return 'patch';
}

/** Next MAJOR.MINOR.PATCH. Major resets minor and patch. Minor resets patch. */
export function bumpVersion(version, level) {
  const match = SEMVER.exec(String(version ?? ''));
  if (!match || !['major', 'minor', 'patch'].includes(level)) {
    throw new Error(`Cannot bump "${version ?? ''}" by ${level}. A release bump needs major, minor, or patch on a MAJOR.MINOR.PATCH version.`);
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (level === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (level === 'minor') {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

/**
 * One news post for a deploy, or null when no PR had notes. `version` is the
 * release these notes belong to, MAJOR.MINOR.PATCH. Pull requests are listed
 * in merge order; past the body limit the rest are counted, not cut mid-line.
 */
export function buildPatchNotes(pulls, version) {
  if (!SEMVER.test(version ?? '')) {
    throw new Error(`Patch notes need a MAJOR.MINOR.PATCH version (for example 2.2.0). Got "${version ?? ''}".`);
  }
  const notes = [...pulls]
    .sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt))
    .flatMap((pull) => extractPatchNotes(pull.body));
  if (!notes.length) return null;
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
  return { title: `Patch notes for ${version}`.slice(0, TITLE_MAX), body: lines.join('\n') };
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

/** Merged PRs into `branch` for each mainline commit in from..to: merge, squash and rebase merges alike. */
export function mergedPulls(from, to, branch, repo, { includeDirectCommits = false } = {}) {
  const commits = run('git', ['rev-list', '--first-parent', '--reverse', `${from}..${to}`]).split('\n').filter(Boolean);
  const pulls = new Map();
  for (const sha of commits) {
    const associated = JSON.parse(run('gh', ['api', `repos/${repo}/commits/${sha}/pulls`]))
      .filter((pull) => pull.merged_at && pull.base?.ref === branch);
    if (includeDirectCommits && associated.length === 0) {
      const title = run('git', ['log', '-1', '--format=%s', sha]).trim();
      if (!RELEASE_COMMIT.test(title)) {
        pulls.set(`direct:${sha}`, {
          number: 0,
          mergedAt: run('git', ['log', '-1', '--format=%cI', sha]).trim(),
          title,
          body: '',
        });
      }
    }
    for (const pull of associated) {
      if (pulls.has(pull.number)) continue;
      pulls.set(pull.number, {
        number: pull.number,
        mergedAt: pull.merged_at,
        title: pull.title ?? '',
        body: pull.body ?? '',
        labels: (pull.labels ?? []).map((label) => label?.name).filter(Boolean),
      });
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
  const version = readAppVersion(fs.readFileSync(path.resolve(process.cwd(), 'packages/shared/src/platform.ts'), 'utf8'));
  const post = buildPatchNotes(pulls, version);
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
