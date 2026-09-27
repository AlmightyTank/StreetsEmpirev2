#!/usr/bin/env node
/**
 * 1.0.0-F. Set KEY="value" in this checkout's .env, replacing the line or appending it.
 *
 *   node scripts/ops/set-env.mjs MAINTENANCE_MODE true
 *
 * dotenv does not unescape \" inside quotes, so double quotes become apostrophes
 * and newlines become spaces.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [key, value] = process.argv.slice(2);
if (!key || !/^[A-Z][A-Z0-9_]*$/.test(key) || value === undefined) {
  process.stderr.write('usage: set-env.mjs KEY value\n');
  process.exit(1);
}
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
const lines = fs.readFileSync(file, 'utf8').split('\n');
const line = `${key}="${value.replace(/"/g, "'").replace(/[\r\n]+/g, ' ')}"`;
const index = lines.findIndex((row) => row.startsWith(`${key}=`));
if (index >= 0) lines[index] = line;
else lines.splice(lines[lines.length - 1] === '' ? lines.length - 1 : lines.length, 0, line);
fs.writeFileSync(file, lines.join('\n'));
