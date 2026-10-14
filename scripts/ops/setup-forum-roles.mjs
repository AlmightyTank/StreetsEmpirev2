#!/usr/bin/env node
/**
 * Interactive setup for the forum sync role credentials.
 *
 * Asks for each value it needs (Flarum origin, shared link secret, one API
 * key + user id per role, tag ids), writes them into the game .env, and
 * prints the matching Flarum config.php snippet.
 *
 *   node scripts/ops/setup-forum-roles.mjs [--env PATH] [--yes] [--set KEY=VALUE ...]
 *
 * --set pre-fills a value (skips that prompt); --yes accepts all remaining
 * defaults and the final confirmation. (--env is used instead of --env-file
 * because current Node versions reserve --env-file for their own loader.) Existing lines are replaced in place,
 * missing keys appended; a .bak backup is written first.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const preset = new Map();
let envFile = path.resolve(here, '../../.env');
let autoYes = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--yes') autoYes = true;
  else if (arg === '--env' || arg.startsWith('--env=')) {
    const value = arg === '--env' ? args[++i] : arg.slice('--env='.length);
    if (!value) fail('bad --env (want --env PATH)');
    envFile = path.resolve(value);
  } else if (arg === '--set' || arg.startsWith('--set=')) {
    const pair = arg === '--set' ? args[++i] : arg.slice('--set='.length);
    if (!pair || !pair.includes('=')) fail(`bad --set (want KEY=VALUE): ${pair ?? '(missing)'}`);
    const eq = pair.indexOf('=');
    preset.set(pair.slice(0, eq), pair.slice(eq + 1));
  } else fail(`unknown argument: ${arg}\nusage: setup-forum-roles.mjs [--env PATH] [--yes] [--set KEY=VALUE ...]`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** Minimal KEY="value" reader; the writer below preserves every other byte. */
function loadEnv(file) {
  const found = new Map();
  if (!fs.existsSync(file)) return found;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    found.set(match[1], value);
  }
  return found;
}

const current = loadEnv(envFile);

/**
 * readline.question() drops piped lines that arrive before the next question
 * is registered, so answers vanish on redirected stdin. This tiny reader
 * buffers every line and serves prompts in order, on TTY and pipe alike.
 */
let stdinBuffer = '';
let stdinEnded = false;
const lineWaiters = [];
function pumpLines() {
  while (lineWaiters.length > 0) {
    if (stdinEnded && stdinBuffer.indexOf('\n') < 0) {
      const last = stdinBuffer;
      stdinBuffer = '';
      lineWaiters.shift()(last.replace(/\r$/, '').trim());
      while (lineWaiters.length > 0) lineWaiters.shift()('');
      return;
    }
    const nl = stdinBuffer.indexOf('\n');
    if (nl < 0) return;
    lineWaiters.shift()(stdinBuffer.slice(0, nl).replace(/\r$/, '').trim());
    stdinBuffer = stdinBuffer.slice(nl + 1);
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdinBuffer += chunk; pumpLines(); });
process.stdin.on('end', () => { stdinEnded = true; pumpLines(); });
const ask = (question) => new Promise((resolve) => {
  process.stdout.write(question);
  lineWaiters.push(resolve);
  pumpLines();
});

const isOrigin = (value) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.hostname === 'localhost') && ['/', ''].includes(url.pathname) && !url.search && !url.hash;
  } catch { return false; }
};
const isUserId = (value) => /^[1-9][0-9]{0,9}$/.test(value);
const isTagId = (value) => value === '' || /^[1-9][0-9]*$/.test(value);

async function prompt({ key, label, def = '', validate = null, hint = '' }) {
  if (preset.has(key)) {
    const value = preset.get(key);
    if (validate && !validate(value)) fail(`invalid --set ${key}="${value}"${hint ? ` (${hint})` : ''}`);
    return value;
  }
  if (autoYes) return def;
  const shown = key === 'FORUM_LINK_SECRET' || key.endsWith('_API_KEY')
    ? (current.get(key) ? '(set, blank keeps it)' : def ? `(default: ${def})` : '(blank for none)')
    : ` (default: ${def || 'none'})`;
  for (;;) {
    const answer = await ask(`${label}\n  ${key}${shown}: `);
    const value = answer === '' ? (current.get(key) ?? def) : answer;
    if (validate && !validate(value)) {
      process.stdout.write(`  not valid${hint ? `: ${hint}` : ''} — try again.\n`);
      continue;
    }
    return value;
  }
}

const secretAnswer = await prompt({
  key: 'FORUM_LINK_SECRET', label: '\nShared link secret (also goes in Flarum config.php as street_empire.link_secret).',
  def: 'generate', validate: (v) => v === 'generate' || v.length >= 64, hint: 'at least 64 characters, or "generate"',
});
const secret = secretAnswer === 'generate' ? crypto.randomBytes(48).toString('hex') : secretAnswer;

const values = new Map();
values.set('FORUM_ORIGIN', await prompt({ key: 'FORUM_ORIGIN', label: '\nForum origin (Flarum base URL, no path).', def: 'https://forum.streetsempire.dev', validate: isOrigin, hint: 'an https origin without a path' }));
values.set('FORUM_LINK_SECRET', secret);
values.set('FORUM_NEWS_API_KEY', await prompt({ key: 'FORUM_NEWS_API_KEY', label: '\nNews writer: Flarum API key (create/edit/lock only in the announcements tag).' }));
values.set('FORUM_NEWS_API_USER_ID', await prompt({ key: 'FORUM_NEWS_API_USER_ID', label: 'News writer: numeric forum user id.', def: '1', validate: isUserId }));
values.set('FORUM_NEWS_TAG_ID', await prompt({ key: 'FORUM_NEWS_TAG_ID', label: 'News writer: numeric announcements tag id.', def: '', validate: isTagId, hint: 'digits, blank disables' }));
values.set('FORUM_RECRUITMENT_API_KEY', await prompt({ key: 'FORUM_RECRUITMENT_API_KEY', label: '\nRecruitment writer: Flarum API key (create/edit/lock only in the recruitment tag).' }));
values.set('FORUM_RECRUITMENT_API_USER_ID', await prompt({ key: 'FORUM_RECRUITMENT_API_USER_ID', label: 'Recruitment writer: numeric forum user id.', def: '1', validate: isUserId }));
values.set('FORUM_RECRUITMENT_TAG_ID', await prompt({ key: 'FORUM_RECRUITMENT_TAG_ID', label: 'Recruitment writer: numeric recruitment tag id.', def: '', validate: isTagId, hint: 'digits, blank disables' }));
values.set('FORUM_MODERATION_API_KEY', await prompt({ key: 'FORUM_MODERATION_API_KEY', label: '\nModeration: Flarum API key of a forum admin (Suspend extension required).' }));
values.set('FORUM_MODERATION_API_USER_ID', await prompt({ key: 'FORUM_MODERATION_API_USER_ID', label: 'Moderation: numeric forum user id.', def: '1', validate: isUserId }));
values.set('FORUM_RECONCILE_API_KEY', await prompt({ key: 'FORUM_RECONCILE_API_KEY', label: '\nReconcile: read-only Flarum API key (refreshes renames, removes deleted links).' }));
values.set('FORUM_RECONCILE_API_USER_ID', await prompt({ key: 'FORUM_RECONCILE_API_USER_ID', label: 'Reconcile: numeric forum user id.', def: '1', validate: isUserId }));

process.stdout.write('\nAbout to write:\n');
for (const [key, value] of values) {
  const display = key === 'FORUM_LINK_SECRET' || key.endsWith('_API_KEY')
    ? (value ? '(set, hidden)' : '(empty — role stays off)')
    : (value || '(empty — role stays off)');
  const changed = (current.get(key) ?? '') !== value ? ' *' : '';
  process.stdout.write(`  ${key}=${display}${changed}\n`);
}
if (!autoYes) {
  const confirm = await ask(`\nWrite to ${envFile}? [Y/n] `);
  if (!/^y?$|yes$/i.test(confirm)) {
    process.stdout.write('Aborted; nothing written.\n');
    process.exit(0);
  }
}

const raw = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
const lines = raw ? raw.split('\n') : [];
for (const [key, value] of values) {
  const line = `${key}="${value.replace(/"/g, "'").replace(/[\r\n]+/g, ' ')}"`;
  const index = lines.findIndex((row) => row.startsWith(`${key}=`));
  if (index >= 0) lines[index] = line;
  else lines.splice(lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length, 0, line);
}
if (fs.existsSync(envFile)) fs.copyFileSync(envFile, `${envFile}.bak`);
fs.writeFileSync(envFile, lines.join('\n'));

const gameOrigin = current.get('FRONTEND_ORIGIN') ?? '<your FRONTEND_ORIGIN>';
process.stdout.write(`
Wrote ${envFile}${fs.existsSync(`${envFile}.bak`) ? ' (previous copy at .bak)' : ''}.
Restart the game server, then check Admin → Monitoring → Forum sync.

Matching Flarum config.php block (beside 'url'):

'url' => '${values.get('FORUM_ORIGIN')}',
'street_empire' => [
    'game_origin' => '${gameOrigin}',
    'link_secret' => '${secret}',
],
`);
