import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), process.argv[2] ?? '.env');
if (!fs.existsSync(envPath)) {
  console.error(`Missing ${envPath}`);
  process.exit(1);
}

const values = new Map();
for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const equal = line.indexOf('=');
  if (equal < 1) continue;
  const key = line.slice(0, equal).trim();
  const value = line.slice(equal + 1).trim().replace(/^['"]|['"]$/g, '');
  values.set(key, value);
}

const problems = [];
const warnings = [];
const get = (key) => values.get(key) ?? '';

if (get('NODE_ENV') !== 'production') problems.push('NODE_ENV must be production.');
if (get('SESSION_SECRET').length < 32) problems.push('SESSION_SECRET must be at least 32 characters.');
if (/dev-only|change-me|replace-with/i.test(get('SESSION_SECRET'))) problems.push('SESSION_SECRET still looks like a development placeholder.');
if (!get('DATABASE_URL')) problems.push('DATABASE_URL is missing.');
if (!get('CORS_ORIGINS')) problems.push('CORS_ORIGINS is missing.');
if (/localhost|127\.0\.0\.1/i.test(get('CORS_ORIGINS'))) warnings.push('CORS_ORIGINS still contains a local-development origin.');
if (/streets:streets@/i.test(get('DATABASE_URL'))) warnings.push('DATABASE_URL appears to use the example database credentials.');

for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const problem of problems) console.error(`FAIL: ${problem}`);

if (problems.length) process.exit(1);
console.log('Production environment checks passed. No secret values were printed.');
