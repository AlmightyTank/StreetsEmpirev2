#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvedArtFile, approvedSemanticSelector } from './ui-style-allowlist.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STYLE_DIR = path.join(ROOT, 'apps/web/src/styles');
const BASELINE_PATH = path.join(ROOT, 'scripts/qa/ui-style-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');
const COLOR = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)/gi;
const COLOR_PROPERTY = /^(?:background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|box-shadow|color|fill|outline(?:-color)?|stroke|text-shadow)$/;
const GLOBAL_SELECTOR = /(^|[\s>+~,])(?::root|html|body|\.se-app|\.se-shell|\.se-panel|\.se-btn|\.se-field|\.se-alert|\.se-pagehead|\.se-tablewrap)(?=$|[\s>+~,.:[#])/;

const normalize = (value) => value.replace(/\s+/g, ' ').trim();
const increment = (record, key) => { record[key] = (record[key] ?? 0) + 1; };

function inspectCss(relativePath) {
  const fileName = path.basename(relativePath);
  const css = readFileSync(path.join(ROOT, relativePath), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const hardColors = {};
  const selectors = [];
  const blocks = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of css.matchAll(blocks)) {
    const selector = normalize(match[1]).replace(/^@[^{}]+\s+/, '');
    if (!selector || selector.startsWith('@')) continue;
    selectors.push(...selector.split(',').map(normalize).filter(Boolean));
    if (approvedArtFile(fileName) || approvedSemanticSelector(selector)) continue;
    for (const declaration of match[2].split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      const property = normalize(declaration.slice(0, colon)).toLowerCase();
      const value = normalize(declaration.slice(colon + 1)).toLowerCase();
      if (property.startsWith('--') || !COLOR_PROPERTY.test(property)) continue;
      for (const literal of value.match(COLOR) ?? []) {
        const signature = `${relativePath}|${selector}|${property}|${literal.toLowerCase()}`;
        increment(hardColors, signature);
      }
    }
  }
  return { hardColors, selectors };
}

const files = readdirSync(STYLE_DIR)
  .filter((name) => name.endsWith('.css'))
  .sort()
  .map((name) => `apps/web/src/styles/${name}`);
const hardColors = {};
const selectorLocations = new Map();
for (const file of files) {
  const inspected = inspectCss(file);
  Object.assign(hardColors, inspected.hardColors);
  for (const selector of inspected.selectors) {
    if (!GLOBAL_SELECTOR.test(selector)) continue;
    const normalized = normalize(selector);
    const locations = selectorLocations.get(normalized) ?? [];
    locations.push(file);
    selectorLocations.set(normalized, locations);
  }
}
const duplicateGlobals = {};
for (const [selector, locations] of selectorLocations) {
  if (locations.length > 1) duplicateGlobals[selector] = locations.length;
}
const snapshot = { version: 1, hardColors, duplicateGlobals };

if (UPDATE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Updated ${path.relative(ROOT, BASELINE_PATH)} (${Object.keys(hardColors).length} legacy color signatures, ${Object.keys(duplicateGlobals).length} duplicate global selectors).`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error('UI style baseline is missing. Run npm run qa:ui:styles:update and review the generated allowlist debt.');
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
const additions = [];
for (const [signature, count] of Object.entries(hardColors)) {
  if (count > (baseline.hardColors?.[signature] ?? 0)) additions.push(`new hard-coded primary UI color signature ${signature} (${count} occurrence(s))`);
}
for (const [signature, count] of Object.entries(duplicateGlobals)) {
  if (count > (baseline.duplicateGlobals?.[signature] ?? 0)) additions.push(`new/increased duplicate global selector ${signature} (${count} occurrences)`);
}
if (additions.length) {
  console.error('UI style guard failed:');
  for (const addition of additions.slice(0, 30)) console.error(`- ${addition}`);
  if (additions.length > 30) console.error(`- …and ${additions.length - 30} more`);
  console.error('Use design tokens/shared selectors, extend the documented art/semantic allowlist, or deliberately refresh the reviewed baseline.');
  process.exit(1);
}
console.log(`UI style guard passed (${files.length} CSS files; ${Object.keys(hardColors).length} grandfathered color signatures; ${Object.keys(duplicateGlobals).length} duplicate global selector signatures).`);
