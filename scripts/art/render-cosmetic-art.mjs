#!/usr/bin/env node
/**
 * Renders the authored cosmetic SVG masters in apps/web/art/cosmetics/ to the
 * runtime WebP files in apps/web/public/items/cosmetics/.
 *
 * Masters are drawn on the same 128×128 / 256×128 grid as the Classic item art
 * so orientation and scale match; this script rasterises them at 4× to the
 * Slice A source canvases (512×512 pistol, 1024×512 everything else) with
 * Chromium, then encodes lossless WebP with alpha through Pillow (Chromium's
 * canvas encoder only produces lossy WebP).
 *
 *   node scripts/art/render-cosmetic-art.mjs            # render every master
 *   node scripts/art/render-cosmetic-art.mjs ak47 rides # only matching names
 *
 * Uses CHROMIUM_PATH when set, otherwise the installed Chrome or Edge.
 * Needs Python 3 with Pillow (`pip install pillow`); PYTHON overrides the
 * interpreter name.
 */
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceDir = path.join(root, 'apps/web/art/cosmetics');
const outputDir = path.join(root, 'apps/web/public/items/cosmetics');
const SCALE = 4;
const filters = process.argv.slice(2);

async function launch() {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // try the next installed browser
    }
  }
  if (existsSync('/opt/pw-browsers/chromium')) return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  return chromium.launch();
}

function viewBoxSize(svg, file) {
  const match = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!match) throw new Error(`${file}: master needs a "0 0 w h" viewBox`);
  return [Number(match[1]), Number(match[2])];
}

const jobs = [];
for (const group of await readdir(sourceDir, { withFileTypes: true })) {
  if (!group.isDirectory()) continue;
  for (const name of await readdir(path.join(sourceDir, group.name))) {
    if (!name.endsWith('.svg')) continue;
    const rel = `${group.name}/${name}`;
    if (filters.length && !filters.some((f) => rel.includes(f))) continue;
    jobs.push(rel);
  }
}
if (!jobs.length) {
  console.error('No cosmetic masters matched.');
  process.exit(1);
}

function encodeWebp(png, out) {
  execFileSync(process.env.PYTHON || 'python', [
    '-c',
    'import sys; from PIL import Image; Image.open(sys.argv[1]).convert("RGBA").save(sys.argv[2], "WEBP", lossless=True, quality=100, method=6)',
    png,
    out,
  ], { stdio: 'inherit' });
}

const scratch = await mkdtemp(path.join(os.tmpdir(), 'se-cosmetic-art-'));
const browser = await launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');

for (const rel of jobs.sort()) {
  const svg = await readFile(path.join(sourceDir, rel), 'utf8');
  const [vw, vh] = viewBoxSize(svg, rel);
  const width = vw * SCALE;
  const height = vh * SCALE;
  // Give the root explicit pixel dimensions so Chromium rasterises the vector
  // at the output size instead of upscaling a 1× bitmap.
  const sized = svg.replace('<svg ', `<svg width="${width}" height="${height}" `);
  const dataUrl = await page.evaluate(async ({ markup, w, h }) => {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/png');
  }, { markup: sized, w: width, h: height });
  const png = path.join(scratch, rel.replaceAll('/', '_').replace(/\.svg$/, '.png'));
  await writeFile(png, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
  const out = path.join(outputDir, rel.replace(/\.svg$/, '.webp'));
  await mkdir(path.dirname(out), { recursive: true });
  encodeWebp(png, out);
  const bytes = await readFile(out);
  if (bytes.subarray(12, 16).toString('ascii') !== 'VP8L') throw new Error(`${rel}: expected a lossless WebP`);
  console.log(`${rel} -> ${path.relative(root, out)} ${width}x${height} ${(bytes.length / 1024).toFixed(1)} KiB`);
}

await browser.close();
await rm(scratch, { recursive: true, force: true });
