#!/usr/bin/env node
/**
 * Move APP_VERSION (MAJOR.MINOR.PATCH) for a deploy.
 *
 *   node scripts/ops/bump-version.mjs plan --to <sha> --branch <name> --repo <owner/name>
 *       Prints JSON { level, previous, version } or null. Looks at pull requests
 *       merged since the commit that last set APP_VERSION. Patch is automatic.
 *       A pull request raises minor or major only by checking that box, so
 *       2.x.x becomes 3.0.0 when its pull request checks major. Needs git history and gh.
 *   node scripts/ops/bump-version.mjs apply --version <x.y.z>
 *       Writes that version into packages/shared/src/platform.ts.
 *
 * The deploy workflow commits the result. A release commit does not bump again.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { bumpVersion, mergedPulls, readAppVersion, releaseLevel, writeAppVersion } from './patch-notes.mjs';

const PLATFORM = path.resolve(process.cwd(), 'packages/shared/src/platform.ts');

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

/** The commit that last changed the APP_VERSION assignment, if history has one. */
export function lastVersionCommit() {
  const sha = run('git', ['log', '-1', '--format=%H', '-G', "APP_VERSION = '", '--', 'packages/shared/src/platform.ts']).trim();
  return sha || null;
}

/**
 * The bump for commits after the last APP_VERSION change, or null when this
 * checkout is already that release.
 */
export function planRelease({ to, branch, repo, from = lastVersionCommit(), pullsFor }) {
  if (!from || !to || from === to) return null;
  const hasChanges = run('git', ['rev-list', '--count', `${from}..${to}`]).trim() !== '0';
  if (!hasChanges) return null;
  let pulls = [];
  try {
    pulls = pullsFor ? pullsFor(from, to) : mergedPulls(from, to, branch, repo, { includeDirectCommits: true });
  } catch (error) {
    console.error(`Version bump left the release unchanged: ${error instanceof Error ? error.message : error}`);
    return null;
  }
  const level = releaseLevel(pulls, true);
  if (!level) return null;
  const previous = readAppVersion(fs.readFileSync(PLATFORM, 'utf8'));
  return { level, previous, version: bumpVersion(previous, level) };
}

function plan() {
  const [to, branch, repo] = ['to', 'branch', 'repo'].map(arg);
  if (!to || !branch || !repo) {
    console.error('Usage: bump-version.mjs plan --to <sha> --branch <name> --repo <owner/name>');
    process.exit(2);
  }
  const resolved = run('git', ['rev-parse', '--verify', `${to}^{commit}`]).trim();
  console.log(JSON.stringify(planRelease({ to: resolved, branch, repo })));
}

function apply() {
  const version = arg('version');
  if (!version) {
    console.error('Usage: bump-version.mjs apply --version <x.y.z>');
    process.exit(2);
  }
  const source = fs.readFileSync(PLATFORM, 'utf8');
  fs.writeFileSync(PLATFORM, writeAppVersion(source, version));
  console.error(`APP_VERSION is ${version}.`);
}

async function main() {
  const command = process.argv[2];
  if (command === 'plan') return plan();
  if (command === 'apply') return apply();
  console.error('Usage: bump-version.mjs <plan|apply> [options]');
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
