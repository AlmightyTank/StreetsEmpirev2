#!/usr/bin/env node
/**
 * Easter egg: generates the 8-Bit collection's SVG masters from the Classic
 * item and crew art, then render-cosmetic-art.mjs turns them into WebP like
 * every other collection.
 *
 *   node scripts/art/generate-eight-bit-art.mjs
 *   node scripts/art/render-cosmetic-art.mjs eight-bit
 *
 * Each Classic SVG is rasterised large with Chromium, and scripts/art/eight-bit.py
 * box-filters it to a sprite grid (32 px per 128-unit cell), snaps it to the NES
 * palette and outlines it. Uses CHROMIUM_PATH when set; needs Python 3 with Pillow.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const classicDir = path.join(root, 'apps/web/public/items');
const mastersDir = path.join(root, 'apps/web/art/cosmetics');
/** Sprite pixels per 128 viewBox units. */
const PIXELS_PER_CELL = 32;
const RASTER_SCALE = 8;

/** Classic file -> master group, matching the other collections' file names. */
const ITEMS = {
  weapons: ['pistol', 'shotgun', 'tek9', 'ak47'],
  rides: ['low-rider', 'sedan', 'van'],
  products: ['crack', 'weed', 'ecstasy', 'meth', 'cocaine', 'heroin'],
  supplies: ['condoms', 'medicine', 'beer'],
  crew: ['thug', 'hoe'],
};

async function launch() {
  if (process.env.CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // try the next installed browser
    }
  }
  if (existsSync('/opt/pw-browsers/chromium')) return chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--headless=new'] });
  return chromium.launch();
}

const scratch = await mkdtemp(path.join(os.tmpdir(), 'se-eight-bit-'));
const browser = await launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');

for (const [group, names] of Object.entries(ITEMS)) {
  for (const name of names) {
    const svg = await readFile(path.join(classicDir, `${name}.svg`), 'utf8');
    const match = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    if (!match) throw new Error(`${name}.svg needs a "0 0 w h" viewBox`);
    const [vw, vh] = [Number(match[1]), Number(match[2])];
    const [gw, gh] = [vw / 128 * PIXELS_PER_CELL, vh / 128 * PIXELS_PER_CELL];
    const [w, h] = [gw * RASTER_SCALE, gh * RASTER_SCALE];
    const sized = svg.replace('<svg ', `<svg width="${w}" height="${h}" `);
    const dataUrl = await page.evaluate(async ({ markup, w, h }) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      return canvas.toDataURL('image/png');
    }, { markup: sized, w, h });
    const png = path.join(scratch, `${name}.png`);
    await writeFile(png, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
    const out = path.join(mastersDir, group, `${name}-eight-bit.svg`);
    execFileSync(process.env.PYTHON || 'python3', [path.join(root, 'scripts/art/eight-bit.py'), png, out, String(gw), String(gh), String(vw), String(vh)], { stdio: 'inherit' });
    console.log(`${name}.svg -> ${path.relative(root, out)} (${gw}x${gh} sprite)`);
  }
}

await browser.close();
await rm(scratch, { recursive: true, force: true });
