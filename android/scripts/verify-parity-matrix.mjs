import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const appPath = path.join(root, 'apps', 'web', 'src', 'App.tsx');
const matrixPath = path.join(root, 'android', 'PARITY_MATRIX.md');
const source = fs.readFileSync(appPath, 'utf8');
const matrix = fs.readFileSync(matrixPath, 'utf8');

const routeBlock = source.slice(source.indexOf('<Routes>'), source.indexOf('</Routes>'));
const declarations = [];
for (const line of routeBlock.split(/\r?\n/)) {
  const pathMatch = line.match(/<Route\s+path="([^"]+)"/);
  if (pathMatch && !pathMatch[1].startsWith('admin')) declarations.push(pathMatch[1]);
  if (/<Route\s+index\b/.test(line)) declarations.push('index@/game');
}

const rows = [...matrix.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]);
const counts = (values) => values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map());
const sourceCounts = counts(declarations);
const matrixCounts = counts(rows);

const duplicates = [...matrixCounts].filter(([, count]) => count !== 1);
const missing = [...sourceCounts.keys()].filter((route) => !matrixCounts.has(route));
const extra = [...matrixCounts.keys()].filter((route) => !sourceCounts.has(route));
const sourceDuplicates = [...sourceCounts].filter(([, count]) => count !== 1);

if (sourceDuplicates.length || duplicates.length || missing.length || extra.length) {
  console.error('Android parity matrix verification failed.');
  if (sourceDuplicates.length) console.error('Duplicate source declarations:', sourceDuplicates);
  if (duplicates.length) console.error('Duplicate matrix rows:', duplicates);
  if (missing.length) console.error('Missing matrix rows:', missing);
  if (extra.length) console.error('Extra matrix rows:', extra);
  process.exit(1);
}

console.log(`Android parity matrix verified: ${declarations.length} non-admin routes mapped exactly once.`);
