#!/usr/bin/env node
/**
 * Generates the achievement badge art in
 * apps/web/public/assets/profile-badges/items/ as standalone SVGs.
 *
 * Badges are drawn like the item and cosmetic art (apps/web/public/items/,
 * apps/web/art/cosmetics/): one frameless prop on the 128×128 grid, dark
 * outline, gradient cel shading, one white gloss and the shared soft drop
 * shadow. Where a badge is literally about an item (a gun, a ride, a
 * Street Pass reward) the Classic item art is inlined so the two always match.
 *
 *   node scripts/art/generate-badge-art.mjs            # write every badge
 *   node scripts/art/generate-badge-art.mjs whale chip # only matching keys
 *
 * ProfileBadgeArt.tsx lists the keys; ProfileBadgeArt.test.ts checks every
 * listed key has a file here and every file is listed.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const itemsDir = path.join(root, 'apps/web/public/items');
const outputDir = path.join(root, 'apps/web/public/assets/profile-badges/items');
const filters = process.argv.slice(2);

// ---------------------------------------------------------------------------
// Shared paint. Only the gradients a badge references are written into it.

const K = '#0b0c0e';
const ramp = (id, stops, dir = 'x1="0" y1="0" x2=".35" y2="1"') =>
  `<linearGradient id="${id}" ${dir}>${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;

const PAINT = {
  'b-s': '<filter id="b-s" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="#000" flood-opacity=".6"/></filter>',
  'b-gold': ramp('b-gold', [[0, '#fff4c2'], [0.35, '#f6d061'], [0.7, '#d39a1c'], [1, '#8a5a0a']]),
  'b-silver': ramp('b-silver', [[0, '#ffffff'], [0.4, '#d9dfe7'], [0.75, '#9ba5b2'], [1, '#5d6672']]),
  'b-bronze': ramp('b-bronze', [[0, '#ffd9b0'], [0.4, '#d98f4e'], [0.75, '#a45a24'], [1, '#5e2f10']]),
  'b-plat': ramp('b-plat', [[0, '#f4fbff'], [0.4, '#bfe6f2'], [0.75, '#76b5cc'], [1, '#3b6f86']]),
  'b-steel': ramp('b-steel', [[0, '#9aa5b3'], [0.5, '#56606c'], [1, '#262b31']]),
  'b-black': ramp('b-black', [[0, '#4d535c'], [0.55, '#1f2227'], [1, '#0f1114']]),
  'b-red': ramp('b-red', [[0, '#ff9f90'], [0.45, '#e5383b'], [1, '#8c1418']]),
  'b-green': ramp('b-green', [[0, '#c4f2ae'], [0.45, '#4fb35a'], [1, '#1f6a2c']]),
  'b-cash': ramp('b-cash', [[0, '#dcefc8'], [0.5, '#9cc47f'], [1, '#5f8a47']]),
  'b-blue': ramp('b-blue', [[0, '#b4ddff'], [0.45, '#3b8fe0'], [1, '#174c8c']]),
  'b-purple': ramp('b-purple', [[0, '#e6ccff'], [0.45, '#9b5de5'], [1, '#4c1d86']]),
  'b-teal': ramp('b-teal', [[0, '#c0fff2'], [0.45, '#2fc6a6'], [1, '#0f6b5a']]),
  'b-orange': ramp('b-orange', [[0, '#ffd59a'], [0.45, '#ff8a2b'], [1, '#b34a0a']]),
  'b-pink': ramp('b-pink', [[0, '#ffd0e6'], [0.45, '#ff5fa8'], [1, '#a31d5d']]),
  'b-wood': ramp('b-wood', [[0, '#eab57f'], [0.5, '#b06f35'], [1, '#6a3b14']]),
  'b-leather': ramp('b-leather', [[0, '#8f6a4d'], [0.55, '#523626'], [1, '#2a1a10']]),
  'b-paper': ramp('b-paper', [[0, '#fffbf2'], [0.6, '#efe4cc'], [1, '#cdbb98']]),
  'b-white': ramp('b-white', [[0, '#ffffff'], [0.6, '#e4e8ee'], [1, '#aeb6c1']]),
  'b-brick': ramp('b-brick', [[0, '#e48a6a'], [0.5, '#b4492e'], [1, '#6e2416']]),
  'b-concrete': ramp('b-concrete', [[0, '#d6d3cc'], [0.55, '#a29d93'], [1, '#69645b']]),
  'b-velvet': ramp('b-velvet', [[0, '#ff7b8f'], [0.45, '#b3123a'], [1, '#56061b']]),
  'b-ice': ramp('b-ice', [[0, '#ffffff'], [0.45, '#c9f1ff'], [1, '#6cc3e6']]),
  'b-glass': ramp('b-glass', [[0, '#eaf8ff'], [0.5, '#a8d6ef'], [1, '#5a95b8']]),
  'b-flame': ramp('b-flame', [[0, '#fff2a8'], [0.4, '#ffb031'], [1, '#e5383b']], 'x1="0" y1="1" x2="0" y2="0"'),
  'b-sky': ramp('b-sky', [[0, '#3a4a66'], [1, '#141a26']], 'x1="0" y1="0" x2="0" y2="1"'),
};

// ---------------------------------------------------------------------------
// Drawing helpers. Everything is drawn on the 128×128 item grid.

const st = (w = 2, extra = '') => `${extra.includes('stroke="') ? '' : `stroke="${K}" `}stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const sh = (inner) => `<g filter="url(#b-s)">${inner}</g>`;
const at = (t, inner) => `<g transform="${t}">${inner}</g>`;
const p = (d, fill, w = 2, extra = '') => `<path d="${d}" fill="${fill}" ${st(w, extra)} ${extra}/>`;
const line = (d, color = K, w = 2, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const gloss = (d, o = 0.5) => `<path d="${d}" fill="#fff" fill-opacity="${o}"/>`;
const circ = (cx, cy, r, fill, w = 2, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${st(w, extra)} ${extra}/>`;
const rect = (x, y, w, h, fill, rx = 0, sw = 2, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${st(sw, extra)} ${extra}/>`;
const FONT = 'font-family="Arial Black, Impact, Arial, Helvetica, sans-serif" font-weight="900"';
const text = (x, y, size, fill, content, extra = '') =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${size}" text-anchor="middle" fill="${fill}" ${extra}>${content}</text>`;
const outlinedText = (x, y, size, fill, content, w = 3) =>
  text(x, y, size, 'none', content, `stroke="${K}" stroke-width="${w}" stroke-linejoin="round"`) + text(x, y, size, fill, content);

function star(cx, cy, r, fill, w = 1.6, inner = 0.45) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return p(`M${pts.join(' L')} Z`, fill, w);
}

function sparkle(cx, cy, r, fill = '#fff') {
  const q = r * 0.22;
  return `<path d="M${cx} ${cy - r} Q${cx + q} ${cy - q} ${cx + r} ${cy} Q${cx + q} ${cy + q} ${cx} ${cy + r} Q${cx - q} ${cy + q} ${cx - r} ${cy} Q${cx - q} ${cy - q} ${cx} ${cy - r}Z" fill="${fill}"/>`;
}

function flame(cx, cy, s = 1) {
  return at(`translate(${cx} ${cy}) scale(${s})`,
    p('M0 -30 C10 -18 18 -10 16 4 C14 16 6 20 0 20 C-8 20 -16 14 -16 2 C-16 -8 -8 -12 -6 -22 C-2 -16 -2 -10 2 -8 C4 -16 2 -24 0 -30Z', 'url(#b-flame)', 2)
    + `<path d="M0 -4 C6 2 8 8 6 12 C4 16 -4 16 -6 12 C-8 6 -2 2 0 -4Z" fill="#fff6c4"/>`);
}

function coin(cx, cy, r, grad = 'url(#b-gold)', label = '$', labelColor = '#8a5a0a') {
  return circ(cx, cy, r, grad, 2)
    + `<circle cx="${cx}" cy="${cy}" r="${(r * 0.74).toFixed(1)}" fill="none" stroke="${labelColor}" stroke-opacity=".55" stroke-width="1.4"/>`
    + (label ? text(cx, cy + r * 0.36, r * 1.05, labelColor, label) : '')
    + gloss(`M${cx - r * 0.7} ${cy - r * 0.2} A${r * 0.75} ${r * 0.75} 0 0 1 ${cx - r * 0.1} ${cy - r * 0.72} L${cx - r * 0.05} ${cy - r * 0.5} A${r * 0.55} ${r * 0.55} 0 0 0 ${cx - r * 0.5} ${cy - r * 0.1}Z`, 0.55);
}

/** Casino chip, face-on. */
function chip(cx, cy, r, color, edge = '#fff', label = '') {
  const ring = 2 * Math.PI * r * 0.86;
  return circ(cx, cy, r, color, 2)
    + `<circle cx="${cx}" cy="${cy}" r="${(r * 0.86).toFixed(1)}" fill="none" stroke="${edge}" stroke-width="${(r * 0.22).toFixed(1)}" stroke-dasharray="${(ring / 16).toFixed(2)} ${(ring / 16).toFixed(2)}"/>`
    + circ(cx, cy, r * 0.58, color, 1.4)
    + `<circle cx="${cx}" cy="${cy}" r="${(r * 0.5).toFixed(1)}" fill="none" stroke="${edge}" stroke-opacity=".7" stroke-width="1" stroke-dasharray="2 2"/>`
    + (label ? text(cx, cy + r * 0.2, r * 0.55, edge, label) : '')
    + gloss(`M${cx - r * 0.75} ${cy - r * 0.3} A${r * 0.8} ${r * 0.8} 0 0 1 ${cx - r * 0.2} ${cy - r * 0.78} L${cx - r * 0.15} ${cy - r * 0.6} A${r * 0.6} ${r * 0.6} 0 0 0 ${cx - r * 0.58} ${cy - r * 0.2}Z`, 0.4);
}

/** Chip stack seen from a three-quarter angle; bottom-centre at (cx, by). */
function chipStack(cx, by, n, color, edge = '#fff', w = 30) {
  const h = 7;
  let out = '';
  for (let i = 0; i < n; i++) {
    const y = by - i * h;
    out += p(`M${cx - w} ${y - h} V${y} A${w} ${w * 0.32} 0 0 0 ${cx + w} ${y} V${y - h}`, color, 1.8);
    out += line(`M${cx - w * 0.55} ${y + w * 0.26} V${y - h + w * 0.26}M${cx} ${y + w * 0.32} V${y - h + w * 0.32}M${cx + w * 0.55} ${y + w * 0.26} V${y - h + w * 0.26}`, edge, 3.2);
  }
  const top = by - n * h;
  out += `<ellipse cx="${cx}" cy="${top}" rx="${w}" ry="${w * 0.32}" fill="${color}" ${st(1.8)}/>`;
  out += `<ellipse cx="${cx}" cy="${top}" rx="${w * 0.6}" ry="${w * 0.19}" fill="none" stroke="${edge}" stroke-width="1.6" stroke-dasharray="3 3"/>`;
  return out;
}

function crown(cx, cy, s = 1, fill = 'url(#b-gold)', gems = ['#e5383b', '#3b8fe0', '#2fb35a']) {
  return at(`translate(${cx} ${cy}) scale(${s})`,
    p('M-30 14 L-34 -16 L-16 0 L0 -24 L16 0 L34 -16 L30 14 Z', fill, 2.2)
    + p('M-31 14 H31 V24 H-31 Z', fill, 2.2)
    + circ(-34, -18, 4, fill, 1.6) + circ(0, -26, 4.5, fill, 1.6) + circ(34, -18, 4, fill, 1.6)
    + circ(-16, 19, 3, gems[0], 1.4) + circ(0, 19, 3.4, gems[1], 1.4) + circ(16, 19, 3, gems[2], 1.4)
    + gloss('M-27 10 L-30 -8 L-18 3 Z', 0.45) + gloss('M-28 15 H28 V17.5 H-28Z', 0.4));
}

function trophy(fill, label, labelColor = '#7a4b06') {
  return sh(
    p('M38 30 C20 30 18 52 40 58', 'none', 5) + line('M38 30 C20 30 18 52 40 58', '#f6d061', 2.2)
    + p('M90 30 C108 30 110 52 88 58', 'none', 5) + line('M90 30 C108 30 110 52 88 58', '#f6d061', 2.2)
    + p('M36 20 H92 V40 C92 62 80 74 64 76 C48 74 36 62 36 40 Z', fill, 2.4)
    + p('M58 76 H70 L72 92 H56 Z', fill, 2)
    + p('M42 92 H86 V102 H42 Z', fill, 2)
    + p('M36 102 H92 V114 H36 Z', 'url(#b-black)', 2)
    + gloss('M42 24 H50 V44 C50 56 54 64 58 68 C46 64 42 54 42 44Z', 0.55)
    + (label ? outlinedText(64, 56, 24, '#fff7d6', label, 3.4) : '')
    + `<rect x="50" y="105" width="28" height="5" rx="1" fill="${labelColor}" fill-opacity=".9"/>`);
}

function medal(cx, cy, r, fill, label, ribbonA, ribbonB, labelColor = '#7a4b06') {
  return sh(
    p(`M${cx - 18} 10 H${cx - 2} L${cx + 6} ${cy - r + 4} H${cx - 10} Z`, ribbonA, 2)
    + p(`M${cx + 18} 10 H${cx + 2} L${cx - 6} ${cy - r + 4} H${cx + 10} Z`, ribbonB, 2)
    + coin(cx, cy, r, fill, '', labelColor)
    + outlinedText(cx, cy + r * 0.34, r * 0.95, '#fffaf0', label, 3));
}

function moneyBag(cx, cy, s = 1, label = '$') {
  return at(`translate(${cx} ${cy}) scale(${s})`,
    p('M-12 -30 L-18 -42 C-8 -38 8 -38 18 -42 L12 -30 Z', 'url(#b-leather)', 2)
    + p('M-12 -30 C-40 -14 -44 26 -24 36 C-12 42 12 42 24 36 C44 26 40 -14 12 -30 Z', 'url(#b-leather)', 2.2)
    + p('M-14 -30 H14 V-24 H-14 Z', '#c9a36a', 1.6)
    + outlinedText(0, 18, 34, '#f6d061', label, 3.4)
    + gloss('M-20 -18 C-32 -6 -32 16 -24 26 C-30 12 -28 -6 -16 -18Z', 0.35));
}

/** A banded brick of bills, iso view. */
function billBrick(cx, cy, s = 1) {
  return at(`translate(${cx} ${cy}) scale(${s})`,
    p('M-26 -2 L4 10 V20 L-26 8 Z', '#6c9a52', 1.6)
    + p('M4 10 L26 -2 V8 L4 20 Z', '#4e7a38', 1.6)
    + p('M-26 -2 L-4 -14 L26 -2 L4 10 Z', 'url(#b-cash)', 1.6)
    + p('M-14 3 L-12 2 L16 -11 L14 -10Z M-16 4 L14 -9 L18 -7 L-12 6 Z', '#f6d061', 1.2)
    + circ(0, -2, 3.2, 'none', 1.1));
}

function goldBar(cx, cy, s = 1) {
  return at(`translate(${cx} ${cy}) scale(${s})`,
    p('M-24 0 L-16 -10 H16 L24 0 Z', '#ffe9a0', 1.8)
    + p('M-24 0 H24 L20 10 H-20 Z', 'url(#b-gold)', 1.8)
    + gloss('M-14 -8 H4 L0 -3 H-17Z', 0.6));
}

function bill(cx, cy, w, h, rot = 0) {
  return at(`translate(${cx} ${cy}) rotate(${rot})`,
    rect(-w / 2, -h / 2, w, h, 'url(#b-cash)', 2, 1.6)
    + `<rect x="${-w / 2 + 3}" y="${-h / 2 + 3}" width="${w - 6}" height="${h - 6}" rx="1.5" fill="none" stroke="#2f5220" stroke-opacity=".5" stroke-width="1"/>`
    + `<ellipse cx="0" cy="0" rx="${h * 0.28}" ry="${h * 0.32}" fill="#bfe0a6" stroke="#2f5220" stroke-width="1"/>`
    + text(0, h * 0.14, h * 0.42, '#2f5220', '$'));
}

function card(cx, cy, rot, rank, suit, color = '#111') {
  const suits = {
    spade: 'M0 -9 C5 -3 11 0 9 6 C7 10 2 9 1 6 L3 11 H-3 L-1 6 C-2 9 -7 10 -9 6 C-11 0 -5 -3 0 -9Z',
    heart: 'M0 9 C-6 4 -11 0 -10 -5 C-9 -10 -2 -10 0 -5 C2 -10 9 -10 10 -5 C11 0 6 4 0 9Z',
    diamond: 'M0 -10 L8 0 L0 10 L-8 0Z',
    club: 'M0 -10 A4.5 4.5 0 0 1 3.5 -2.5 A4.5 4.5 0 1 1 2 5 L3.5 10 H-3.5 L-2 5 A4.5 4.5 0 1 1 -3.5 -2.5 A4.5 4.5 0 0 1 0 -10Z',
  };
  return at(`translate(${cx} ${cy}) rotate(${rot})`,
    rect(-20, -28, 40, 56, 'url(#b-white)', 4, 2)
    + text(-12, -14, 12, color, rank)
    + at('translate(0 6) scale(1.5)', `<path d="${suits[suit]}" fill="${color}"/>`)
    + at('translate(-12 -6) scale(.55)', `<path d="${suits[suit]}" fill="${color}"/>`));
}

function die(cx, cy, s, pips, face = 'url(#b-white)', pip = '#111', rot = 0) {
  const spots = {
    1: [[0, 0]], 2: [[-6, -6], [6, 6]], 3: [[-6, -6], [0, 0], [6, 6]], 4: [[-6, -6], [6, -6], [-6, 6], [6, 6]],
    5: [[-6, -6], [6, -6], [0, 0], [-6, 6], [6, 6]], 6: [[-6, -7], [6, -7], [-6, 0], [6, 0], [-6, 7], [6, 7]],
  };
  return at(`translate(${cx} ${cy}) rotate(${rot}) scale(${s})`,
    rect(-13, -13, 26, 26, face, 5, 2)
    + spots[pips].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="${pip}"/>`).join('')
    + gloss('M-10 -10 H4 L2 -8 H-8 V2 L-10 4Z', 0.5));
}

/** Storefront: awning, door and window. */
function storefront(x, y, w, h, wall, awning, sign) {
  const stripes = Math.round(w / 8);
  let aw = '';
  for (let i = 0; i < stripes; i++) {
    aw += `<path d="M${x - 3 + i * ((w + 6) / stripes)} ${y + 8} h${(w + 6) / stripes} v8 a${(w + 6) / stripes / 2} 4 0 0 1 ${-(w + 6) / stripes} 0Z" fill="${i % 2 ? '#fff' : awning}" ${st(1.4)}/>`;
  }
  return rect(x, y, w, h, wall, 1, 2)
    + (sign ? rect(x + 4, y - 9, w - 8, 12, '#151820', 2, 1.6) + text(x + w / 2, y, 8.5, '#ffe9a0', sign) : '')
    + aw
    + rect(x + 5, y + 22, w * 0.42, h - 30, 'url(#b-glass)', 1, 1.6)
    + rect(x + w * 0.58, y + 24, w * 0.32, h - 24, '#5a3a22', 1, 1.6)
    + `<circle cx="${x + w * 0.62}" cy="${y + h - 12}" r="1.3" fill="#f6d061"/>`;
}

// Inlined item ids are numbered per badge (reset in render) so a filtered run
// writes the same file as a full one.
let inlineCount = 0;

/** Classic item art from apps/web/public/items, centred on (cx, cy). */
function item(name, cx, cy, s = 1, rot = 0) {
  const svg = readFileSync(path.join(itemsDir, `${name}.svg`), 'utf8');
  const [, w, h] = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/).map(Number);
  const pre = `i${++inlineCount}`;
  const body = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\bid="([^"]+)"/g, `id="${pre}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${pre}-$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${pre}-$1"`);
  return at(`translate(${cx} ${cy}) rotate(${rot}) scale(${s}) translate(${-w / 2} ${-h / 2})`, body);
}

/** Rank insignia for player-level titles: chevrons over a numbered tab. */
function levelPatch(level, metal, chevrons, stars) {
  let ch = '';
  for (let i = 0; i < chevrons; i++) {
    const y = 58 - (chevrons - 1) * 6 + i * 12;
    ch += p(`M38 ${y} L64 ${y - 15} L90 ${y} V${y + 9} L64 ${y - 6} L38 ${y + 9} Z`, metal, 2);
  }
  let starRow = '';
  for (let i = 0; i < stars; i++) starRow += star(64 + (i - (stars - 1) / 2) * 16, 22, 7, metal, 1.6);
  return sh(
    p('M30 14 H98 V74 C98 96 82 108 64 116 C46 108 30 96 30 74 Z', 'url(#b-black)', 2.4)
    + line('M36 20 H92 V74 C92 92 79 102 64 109 C49 102 36 92 36 74 Z', '#fff', 1, 'stroke-opacity=".18"')
    + starRow + ch
    + outlinedText(64, 104, 20, '#fff', String(level), 3.2));
}

function shield(fill, w = 2.4) {
  return p('M64 12 L102 24 V58 C102 86 84 104 64 116 C44 104 26 86 26 58 V24 Z', fill, w);
}

function door(x, y, w, h, fill = 'url(#b-wood)') {
  return rect(x - 4, y - 4, w + 8, h + 4, '#3a2618', 1, 2)
    + rect(x, y, w, h, fill, 1, 2)
    + rect(x + 6, y + 8, w - 12, h * 0.34, 'none', 1, 1.4) + rect(x + 6, y + h * 0.5, w - 12, h * 0.4, 'none', 1, 1.4)
    + circ(x + w - 7, y + h * 0.48, 2.6, 'url(#b-gold)', 1.2);
}

function building(x, y, w, h, fill, cols, rows, lit = '#ffd76a') {
  let win = '';
  const gw = (w - 8) / cols;
  const gh = Math.min(10, (h - 12) / rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const on = (r * 7 + c * 3) % 5 < 2;
    win += `<rect x="${(x + 5 + c * gw).toFixed(1)}" y="${(y + 6 + r * gh).toFixed(1)}" width="${(gw - 3).toFixed(1)}" height="${(gh - 3).toFixed(1)}" fill="${on ? lit : '#26303f'}" stroke="${K}" stroke-width=".8"/>`;
  }
  return rect(x, y, w, h, fill, 1, 2) + win;
}

/** Biker cut (vest), back view, for the Road Saints. */
function vest(rockers, wings) {
  return sh(
    p('M30 20 L50 14 C54 24 74 24 78 14 L98 20 L104 112 H24 Z', 'url(#b-leather)', 2.4)
    + line('M64 22 V112', '#2a1a10', 1.4)
    + (rockers > 0 ? p('M36 34 Q64 22 92 34 L90 44 Q64 33 38 44 Z', '#f2efe6', 1.6) + text(64, 41, 6.5, '#8c1418', 'ROAD SAINTS') : '')
    + (wings ? p('M64 74 C50 60 38 62 32 56 C38 70 48 76 64 80 C80 76 90 70 96 56 C90 62 78 60 64 74Z', '#f2efe6', 1.6) : '')
    + circ(64, 66, 10, '#f2efe6', 1.6) + text(64, 71, 13, '#8c1418', '✝')
    + (rockers > 1 ? p('M38 92 Q64 102 90 92 L92 102 Q64 112 36 102 Z', '#f2efe6', 1.6) + text(64, 103, 6, '#8c1418', 'MOTHER ROAD') : '')
    + p('M84 98 h10 v10 h-10Z', '#f2efe6', 1.4) + text(89, 106, 6, '#8c1418', 'MC')
    + gloss('M34 24 L46 20 L40 100 H30 Z', 0.12));
}

// ---------------------------------------------------------------------------
// The badges. Keys match ProfileBadgeArt.tsx.

const BADGES = {
  // Rank and wealth.
  'national-number-one': () => trophy('url(#b-gold)', '#1') + sparkle(100, 20, 7) + sparkle(24, 70, 5),
  'city-boss': () => sh(
    building(16, 62, 24, 50, 'url(#b-steel)', 2, 4) + building(88, 54, 26, 58, 'url(#b-steel)', 2, 5)
    + p('M64 112 C52 92 36 78 36 56 A28 28 0 0 1 92 56 C92 78 76 92 64 112Z', 'url(#b-red)', 2.4)
    + circ(64, 56, 14, '#fff7e8', 2)
    + crown(64, 58, 0.34)
    + gloss('M44 46 C46 38 52 32 60 30 C54 36 50 42 48 52Z', 0.45)),
  'top-ten': () => medal(64, 76, 30, 'url(#b-silver)', '10', 'url(#b-blue)', 'url(#b-red)', '#3b4552') + sparkle(102, 54, 6),
  climber: () => sh(
    p('M18 110 V92 H42 V74 H66 V56 H90 V38 H110 V110 Z', 'url(#b-concrete)', 2.2)
    + line('M18 92 H42 M42 74 H66 M66 56 H90 M90 38 H110', '#fff', 1.4, 'stroke-opacity=".5"')
    + p('M22 84 L74 32 L66 24 H98 V56 L90 48 L38 100 Z', 'url(#b-green)', 2.4)
    + gloss('M26 84 L72 38 L70 34 L24 80Z', 0.5)),
  'first-stack': () => item('cash', 64, 66, 0.98),
  'six-figures': () => sh(billBrick(44, 92, 1) + billBrick(84, 92, 1) + billBrick(64, 76, 1) + billBrick(44, 70, 0.95) + billBrick(64, 54, 1)) + sparkle(104, 40, 6),
  'quarter-million': () => sh(
    p('M100 64 L118 46 L116 82 Z', 'url(#b-gold)', 2.2)
    + p('M20 64 C34 36 78 32 102 64 C78 96 34 92 20 64Z', 'url(#b-gold)', 2.4)
    + p('M54 40 C60 30 72 28 80 36', 'url(#b-gold)', 2) + p('M58 88 C62 96 70 98 76 92', 'url(#b-gold)', 2)
    + line('M48 50 C54 58 54 70 48 78', '#8a5a0a', 1.6) + line('M64 46 C70 56 70 72 64 82', '#8a5a0a', 1.4, 'stroke-opacity=".5"')
    + circ(34, 60, 4.2, '#fff', 1.6) + `<circle cx="35" cy="60" r="2" fill="${K}"/>`
    + text(78, 72, 20, '#8a5a0a', '$')
    + gloss('M30 56 C40 44 60 40 76 44 C58 44 42 50 34 60Z', 0.6)
    + circ(108, 30, 4, 'url(#b-glass)', 1.2) + circ(116, 18, 2.6, 'url(#b-glass)', 1)),
  millionaire: () => sh(
    p('M22 56 H106 V108 H22 Z', 'url(#b-black)', 2.4)
    + p('M22 56 L30 30 H98 L106 56', 'url(#b-black)', 2.4)
    + p('M30 56 L36 36 H92 L98 56Z', '#14161a', 1.4)
    + billBrick(48, 50, 0.9) + billBrick(80, 50, 0.9) + billBrick(64, 42, 0.9)
    + rect(52, 20, 24, 10, 'none', 4, 2.4)
    + rect(30, 70, 8, 10, 'url(#b-gold)', 1, 1.4) + rect(90, 70, 8, 10, 'url(#b-gold)', 1, 1.4)
    + gloss('M26 60 H40 V104 H26Z', 0.12)),
  'empire-builder': () => sh(
    goldBar(40, 98) + goldBar(88, 98) + goldBar(64, 98) + goldBar(52, 84) + goldBar(76, 84) + goldBar(64, 70)
    + crown(64, 40, 0.68))
    + sparkle(104, 58, 7) + sparkle(22, 70, 5),
  'beta-tester': () => sh(
    p('M50 8 H78 L76 24 H52 Z', 'url(#b-blue)', 2)
    + rect(30, 24, 68, 92, 'url(#b-black)', 8, 2.4)
    + rect(52, 18, 24, 12, 'url(#b-steel)', 3, 2)
    + rect(38, 40, 52, 30, '#1b2a3d', 4, 1.6)
    + line('M44 50 L52 56 L44 62 M56 62 H70', '#5fe0ff', 2.6)
    + outlinedText(64, 92, 18, '#f6d061', 'BETA', 3)
    + line('M40 104 H88', '#f6d061', 2, 'stroke-dasharray="3 3"')
    + gloss('M34 28 H44 L36 112 H34Z', 0.14)),
  veteran: () => sh(
    line('M40 14 C30 40 34 62 46 76 M88 14 C98 40 94 62 82 76', '#9ba5b2', 2.4, 'stroke-dasharray="1 4"')
    + at('rotate(-10 52 90)', rect(32, 66, 40, 48, 'url(#b-silver)', 10, 2.2) + line('M40 80 H64 M40 88 H60 M40 96 H64', '#3b4552', 2.2) + circ(52, 72, 2.8, '#1f2227', 1))
    + at('rotate(12 80 86)', rect(60, 62, 40, 48, 'url(#b-silver)', 10, 2.2) + line('M68 76 H92 M68 84 H88 M68 92 H92', '#3b4552', 2.2) + circ(80, 68, 2.8, '#1f2227', 1)
      + gloss('M64 70 H72 V100 H64Z', 0.4))),
  'top-finisher': () => medal(64, 76, 30, 'url(#b-bronze)', '10', 'url(#b-purple)', 'url(#b-teal)', '#5e2f10'),
  'hall-of-fame': () => sh(
    p('M28 50 C14 72 26 102 56 110 M100 50 C114 72 102 102 72 110', 'none', 6)
    + line('M28 50 C14 72 26 102 56 110 M100 50 C114 72 102 102 72 110', '#4fb35a', 3)
    + [[22, 64, -40], [20, 80, -20], [26, 96, 0], [38, 106, 20], [106, 64, 40], [108, 80, 20], [102, 96, 0], [90, 106, -20]]
      .map(([x, y, r]) => at(`translate(${x} ${y}) rotate(${r})`, p('M0 -7 C5 -4 5 4 0 7 C-5 4 -5 -4 0 -7Z', 'url(#b-green)', 1.4))).join('')
    + star(64, 62, 38, 'url(#b-gold)', 2.4, 0.46)
    + text(64, 72, 16, '#8a5a0a', 'HOF')
    + gloss('M64 30 L70 52 L60 52Z', 0.5)),
  'player-level-5-title': () => levelPatch(5, 'url(#b-bronze)', 1, 0),
  'player-level-10-title': () => levelPatch(10, 'url(#b-silver)', 2, 0),
  'player-level-20-title': () => levelPatch(20, 'url(#b-gold)', 3, 0),
  'player-level-30-title': () => levelPatch(30, 'url(#b-gold)', 3, 1),
  'player-level-50-title': () => levelPatch(50, 'url(#b-plat)', 3, 3) + sparkle(104, 20, 6) + sparkle(24, 96, 5),

  // Combat.
  'knock-knock': () => sh(door(36, 22, 56, 92))
    + sh(at('translate(70 66) rotate(-18)', p('M-14 -12 H10 C16 -12 18 -6 16 0 L14 12 H-14 Z', '#c98a5c', 2.2) + line('M-6 -12 V2 M2 -12 V2 M10 -12 V2', '#7a4a2a', 1.4) + p('M-14 12 H14 V24 H-14Z', '#3a6fb8', 2)))
    + line('M100 40 L112 34 M102 54 L116 54 M100 68 L112 74', '#f6d061', 3),
  'first-blood': () => sh(
    at('rotate(-40 64 64)',
      p('M60 16 L68 16 L72 74 H56 Z', 'url(#b-silver)', 2.2) + line('M64 22 V70', '#5d6672', 1.2)
      + rect(50, 74, 28, 6, 'url(#b-steel)', 2, 2) + rect(56, 80, 16, 32, 'url(#b-black)', 4, 2)
      + gloss('M61 20 H64 L65 70 H59Z', 0.6))
    + p('M86 76 C86 76 98 92 98 100 A12 12 0 0 1 74 100 C74 92 86 76 86 76Z', 'url(#b-red)', 2.2)
    + gloss('M80 96 C80 92 82 88 84 86 C82 92 82 96 84 100Z', 0.6)),
  enforcer: () => sh(
    p('M22 52 C22 40 32 36 40 40 C42 34 52 32 58 38 C62 32 72 32 76 38 C80 32 92 34 94 42 C102 40 108 48 106 58 L102 78 C98 92 84 96 70 94 H40 C28 92 20 80 22 66 Z', 'url(#b-silver)', 2.4)
    + circ(40, 52, 7, '#14161a', 1.8) + circ(58, 50, 7, '#14161a', 1.8) + circ(76, 50, 7, '#14161a', 1.8) + circ(93, 54, 7, '#14161a', 1.8)
    + line('M34 72 C50 80 78 80 98 72', '#5d6672', 1.6)
    + gloss('M28 50 C28 44 34 42 38 44 C32 48 30 58 30 66 C28 62 27 56 28 50Z', 0.6)),
  warpath: () => sh(
    at('rotate(38 64 64)',
      p('M64 6 C78 6 80 14 78 26 L70 104 C70 110 58 110 58 104 L50 26 C48 14 50 6 64 6Z', 'url(#b-wood)', 2.4)
      + rect(58, 92, 12, 18, 'url(#b-black)', 3, 2)
      + line('M60 30 L56 26 M68 36 L72 32 M60 48 L56 44 M68 54 L72 50 M62 22 L58 18', '#c9d1db', 2.4)
      + line('M58 60 L70 60 M58 66 L70 66 M58 72 L70 72 M58 78 L70 78 M57 82 L71 56', '#fff7e8', 1.8)
      + line('M52 22 L44 18 M76 22 L84 18 M53 40 L45 38 M75 40 L83 38', '#c9d1db', 2.4)
      + gloss('M56 10 C60 8 62 8 62 12 L64 96 H62Z', 0.35))),
  'made-enemies': () => sh(
    circ(64, 64, 46, '#f2efe6', 2.4) + circ(64, 64, 36, 'url(#b-red)', 2) + circ(64, 64, 25, '#f2efe6', 2) + circ(64, 64, 14, 'url(#b-red)', 2)
    + [[48, 46], [82, 58], [58, 82], [70, 70]].map(([x, y]) => circ(x, y, 4, '#14161a', 1.6) + line(`M${x - 7} ${y - 3} L${x - 3} ${y - 1} M${x + 3} ${y + 6} L${x + 1} ${y + 3}`, K, 1.2)).join('')
    + gloss('M30 46 C36 32 50 22 64 22 C50 26 40 34 34 48Z', 0.5)),
  'held-the-line': () => sh(
    p('M20 100 C20 88 34 86 42 90 C48 84 60 84 64 90 C70 84 82 84 86 90 C94 86 108 88 108 100 C108 112 20 112 20 100Z', '#b9a37a', 2)
    + line('M42 92 C42 104 42 108 42 110 M64 92 V110 M86 92 V110', '#7d6a48', 1.6)
    + p('M64 14 L98 24 V52 C98 74 84 86 64 96 C44 86 30 74 30 52 V24 Z', 'url(#b-steel)', 2.4)
    + rect(44, 36, 40, 10, 'url(#b-glass)', 3, 1.8)
    + text(64, 70, 13, '#c9d1db', 'POLICE', 'fill-opacity=".0"')
    + circ(52, 64, 3, '#2a2f36', 1.2) + circ(76, 58, 3, '#2a2f36', 1.2) + circ(68, 76, 3, '#2a2f36', 1.2)
    + gloss('M36 28 L52 22 L40 70 C36 64 36 58 36 52Z', 0.3)),
  untouchable: () => sh(
    p('M34 18 L52 14 C54 24 74 24 76 14 L94 18 L98 40 C100 60 100 92 96 110 H32 C28 92 28 60 30 40 Z', 'url(#b-black)', 2.4)
    + rect(42, 46, 44, 22, '#2a2f36', 3, 1.6)
    + outlinedText(64, 63, 12, '#f2efe6', 'SWAT', 2)
    + line('M34 80 H94 M34 92 H94', '#3a3f46', 2)
    + [[48, 30], [80, 88], [56, 100]].map(([x, y]) => circ(x, y, 5, 'url(#b-gold)', 1.6) + line(`M${x - 3} ${y} H${x + 3} M${x} ${y - 3} V${y + 3}`, '#8a5a0a', 1.2)).join('')
    + gloss('M38 22 L48 20 L40 104 H36Z', 0.14)),
  'rolling-deep': () => item('low-rider', 60, 74, 0.5)
    + sh(p('M104 56 L120 48 L114 58 L124 62 L112 64 L118 74 L104 66 Z', 'url(#b-flame)', 1.6))
    + line('M8 60 H24 M4 72 H20 M10 84 H22', '#c9d1db', 2.6),
  'clean-pass': () => item('sedan', 60, 70, 0.52)
    + line('M6 62 H22 M2 74 H18 M8 86 H20', '#c9d1db', 2.6)
    + sh(circ(100, 30, 15, 'url(#b-green)', 2.2) + line('M93 30 L98 35 L108 24', '#fff', 3.4)),
  'bad-batch': () => sh(
    p('M48 18 H80 V28 H76 V44 L96 92 C100 104 92 112 82 112 H46 C36 112 28 104 32 92 L52 44 V28 H48 Z', 'url(#b-glass)', 2.4)
    + p('M40 76 H88 L96 92 C100 104 92 112 82 112 H46 C36 112 28 104 32 92 Z', 'url(#b-green)', 2)
    + rect(46, 10, 36, 12, 'url(#b-wood)', 2, 2)
    + at('translate(64 92) scale(.9)', p('M-10 -8 C-10 -16 10 -16 10 -8 C10 -2 6 0 6 2 H-6 C-6 0 -10 -2 -10 -8Z', '#f2efe6', 1.6) + circ(-4, -7, 2.4, K, 0) + circ(4, -7, 2.4, K, 0) + line('M-3 4 V8 M0 4 V8 M3 4 V8', '#f2efe6', 1.6))
    + gloss('M54 48 L58 30 H62 V46 L46 90 C44 84 48 66 54 48Z', 0.45))
    + circ(90, 62, 4, '#9be36b', 1.2) + circ(100, 46, 3, '#9be36b', 1) + circ(94, 30, 2, '#9be36b', 1),
  'burned-stable': () => sh(
    p('M28 24 H100 L68 66 V100 H60 V66 Z', 'url(#b-glass)', 2.4)
    + p('M38 34 H90 L68 62 H60 Z', 'url(#b-pink)', 1.6)
    + p('M44 106 C44 100 84 100 84 106 C84 112 44 112 44 106Z', 'url(#b-glass)', 2)
    + line('M96 18 L80 40', '#f2efe6', 2.4) + circ(97, 16, 3.4, 'url(#b-red)', 1.4)
    + gloss('M36 28 H46 L58 46 H52Z', 0.55))
    + sh(at('translate(70 30) rotate(-20)', rect(-7, -4, 14, 8, 'url(#b-white)', 4, 1.6) + line('M0 -4 V4', '#9ba5b2', 1)))
    + circ(60, 46, 1.8, '#fff', 0) + circ(72, 50, 1.4, '#fff', 0) + circ(64, 40, 1.2, '#fff', 0),
  boosted: () => sh(
    at('rotate(-30 64 64)',
      p('M54 10 H74 L76 96 C76 104 70 108 64 108 C58 108 52 104 52 96 Z', 'url(#b-silver)', 2.2)
      + p('M52 96 L40 104 L42 112 L56 104Z', 'url(#b-silver)', 2) + gloss('M57 14 H62 L61 96 H57Z', 0.6))
    + p('M76 70 C76 56 98 54 104 66 C110 78 98 92 86 90 L74 112 H66 L66 104 H58 L58 96 L72 82 C70 78 76 74 76 70Z', 'url(#b-gold)', 2.2)
    + circ(92, 70, 5, '#1f2227', 1.6)
    + gloss('M80 66 C84 58 96 58 100 64 C94 62 86 62 82 70Z', 0.55)),
  'chop-shop-regular': () => sh(
    circ(54, 74, 38, 'url(#b-black)', 2.4) + circ(54, 74, 22, 'url(#b-silver)', 2)
    + [0, 72, 144, 216, 288].map((a) => at(`rotate(${a} 54 74)`, p('M51 54 H57 L56 64 H52Z', '#5d6672', 1.2))).join('')
    + circ(54, 74, 6, 'url(#b-gold)', 1.6)
    + at('rotate(40 92 50)', p('M86 14 C80 14 76 20 78 26 L84 30 L82 90 C82 96 90 96 90 90 L92 30 L98 26 C100 20 96 14 90 14 L90 24 H86 Z', 'url(#b-steel)', 2.2))
    + gloss('M26 62 C30 48 42 40 54 38 C42 44 34 52 30 64Z', 0.35)),
  'silver-tongue': () => sh(
    p('M18 28 H110 V82 H58 L38 104 V82 H18 Z', 'url(#b-silver)', 2.4)
    + p('M44 48 C44 42 84 42 84 48 C84 62 76 70 64 70 C52 70 44 62 44 48Z', 'url(#b-pink)', 2)
    + line('M64 48 V62', '#a31d5d', 1.6)
    + gloss('M24 34 H60 L56 40 H28 V60 H24Z', 0.5))
    + sparkle(96, 44, 7) + sparkle(30, 70, 4),
  recruiter: () => sh(
    p('M18 52 L64 30 V96 L18 74 Z', 'url(#b-red)', 2.4)
    + p('M64 24 C72 24 76 42 76 63 C76 84 72 102 64 102 C58 102 56 84 56 63 C56 42 58 24 64 24Z', '#f2efe6', 2.2)
    + rect(12, 52, 10, 22, 'url(#b-white)', 3, 2)
    + p('M30 72 L38 104 H50 L44 78', 'url(#b-black)', 2)
    + gloss('M24 54 L60 36 V44 L24 60Z', 0.45))
    + line('M86 46 C92 52 92 74 86 80 M96 38 C106 50 106 76 96 88 M106 30 C120 46 120 80 106 96', '#f6d061', 3),
  'stick-up-king': () => sh(
    p('M28 58 C26 26 46 12 64 12 C82 12 102 26 100 58 C100 86 90 112 64 112 C38 112 28 86 28 58Z', 'url(#b-black)', 2.4)
    + p('M38 48 C46 42 56 42 60 50 C56 58 44 58 38 52Z M68 50 C72 42 82 42 90 48 L90 52 C84 58 72 58 68 50Z', '#c98a5c', 1.8)
    + circ(50, 50, 3, K, 0) + circ(78, 50, 3, K, 0)
    + p('M52 82 C56 76 72 76 76 82 C72 92 56 92 52 82Z', '#c98a5c', 1.8)
    + line('M34 30 C50 22 78 22 94 30 M30 68 H98', '#2c3036', 2)
    + gloss('M36 34 C40 24 50 18 60 16 C50 22 42 30 40 40Z', 0.18)
    + crown(64, 14, 0.42)),
  'most-wanted': () => sh(
    at('rotate(-4 64 64)',
      p('M24 12 H104 L102 116 H26 Z', 'url(#b-paper)', 2.4)
      + text(64, 32, 16, '#6e2416', 'WANTED')
      + rect(38, 38, 52, 44, '#d9cbab', 1, 1.6)
      + p('M50 82 C50 68 78 68 78 82Z', '#5a4a3a', 0) + circ(64, 58, 10, '#5a4a3a', 0)
      + rect(54, 54, 20, 5, '#14161a', 2, 0)
      + text(64, 98, 7.5, '#6e2416', 'DEAD OR ALIVE')
      + text(64, 110, 10, '#2f5220', '$250,000')
      + circ(64, 16, 2.4, 'url(#b-red)', 1))),

  // Intel.
  'street-intel': () => sh(
    rect(26, 40, 30, 54, 'url(#b-black)', 8, 2.4) + rect(72, 40, 30, 54, 'url(#b-black)', 8, 2.4)
    + rect(52, 52, 24, 22, 'url(#b-steel)', 3, 2)
    + rect(30, 26, 22, 18, 'url(#b-steel)', 4, 2) + rect(76, 26, 22, 18, 'url(#b-steel)', 4, 2)
    + circ(41, 92, 13, 'url(#b-glass)', 2.2) + circ(87, 92, 13, 'url(#b-glass)', 2.2)
    + gloss('M33 88 A9 9 0 0 1 41 82 L42 85 A6 6 0 0 0 36 90Z', 0.8) + gloss('M79 88 A9 9 0 0 1 87 82 L88 85 A6 6 0 0 0 82 90Z', 0.8)),
  'wire-tapper': () => sh(
    p('M26 70 C24 30 44 16 64 16 C84 16 104 30 102 70', 'none', 9) + line('M26 70 C24 30 44 16 64 16 C84 16 104 30 102 70', '#3a3f46', 5)
    + rect(14, 62, 24, 36, 'url(#b-black)', 9, 2.4) + rect(90, 62, 24, 36, 'url(#b-black)', 9, 2.4)
    + rect(32, 66, 8, 28, 'url(#b-steel)', 3, 1.8) + rect(88, 66, 8, 28, 'url(#b-steel)', 3, 1.8)
    + line('M26 98 C26 112 50 112 60 104 C70 96 78 104 82 110', '#e5383b', 2.4)
    + rect(80, 106, 14, 8, 'url(#b-gold)', 2, 1.6)
    + gloss('M18 68 H24 V92 H18Z', 0.25))
    + line('M52 48 C56 44 72 44 76 48 M58 56 C62 53 66 53 70 56', '#5fe0ff', 2.4),
  'eyes-everywhere': () => sh(
    line('M86 24 V14 H108', '#5d6672', 4)
    + p('M104 20 L112 22 V44 L104 46 Z', 'url(#b-steel)', 2)
    + at('rotate(18 64 56)', rect(22, 34, 76, 34, 'url(#b-white)', 6, 2.4) + p('M22 40 L10 46 V58 L22 64 Z', 'url(#b-black)', 2.2)
      + p('M30 34 H96 L100 28 H34 Z', '#c9d1db', 2) + circ(13, 52, 3, 'url(#b-red)', 1)
      + gloss('M30 38 H90 V42 H30Z', 0.6))
    + at('rotate(18 64 56)', circ(10, 52, 1, '#ff4b4b', 0)))
    + sh(p('M30 96 C46 80 82 80 98 96 C82 112 46 112 30 96Z', '#f2efe6', 2.2) + circ(64, 96, 10, 'url(#b-purple)', 1.8) + circ(64, 96, 4, K, 0) + circ(61, 93, 1.6, '#fff', 0)),

  // Reputation and factions.
  'favor-done': () => sh(
    p('M16 34 H112 V100 H16 Z', 'url(#b-paper)', 2.4)
    + line('M16 34 L64 72 L112 34 M16 100 L52 64 M112 100 L76 64', '#a8987a', 1.8)
    + circ(64, 72, 15, 'url(#b-red)', 2.2) + line('M57 72 L62 77 L72 66', '#fff', 3)
    + gloss('M22 38 H50 L46 42 H26 V70 H22Z', 0.4)),
  connected: () => sh(
    p('M22 108 L30 70 H98 L106 108 Z', 'url(#b-black)', 2.4)
    + p('M18 56 C18 34 110 34 110 56 L104 66 C100 72 90 70 90 64 V58 C78 52 50 52 38 58 V64 C38 70 28 72 24 66 Z', 'url(#b-black)', 2.4)
    + circ(64, 88, 16, 'url(#b-steel)', 2)
    + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (-150 + i * 34) * Math.PI / 180; return circ(64 + Math.cos(a) * 11, 88 + Math.sin(a) * 11, 2.6, '#1f2227', 1); }).join('')
    + circ(64, 88, 4.5, 'url(#b-gold)', 1.2)
    + gloss('M26 52 C34 42 54 40 64 40 C52 42 36 46 30 56Z', 0.25))
    + line('M98 22 C104 18 110 22 112 16 M104 30 C110 30 116 28 118 24', '#f6d061', 2.4),
  'shotgun-trust': () => item('shotgun', 60, 56, 0.5, -14)
    + sh([[38, 98], [54, 102], [70, 98]].map(([x, y]) => at(`translate(${x} ${y}) rotate(-14)`, rect(-6, -16, 12, 22, 'url(#b-red)', 2, 1.8) + rect(-6, 4, 12, 7, 'url(#b-gold)', 1, 1.8))).join(''))
    + sh(circ(100, 94, 14, 'url(#b-green)', 2.2) + line('M93 94 L98 99 L108 88', '#fff', 3.2)),
  'tek-runner': () => item('tek9', 64, 54, 0.62, -10)
    + sh(at('translate(40 98) rotate(-80)', rect(-7, -22, 14, 44, 'url(#b-black)', 2, 2) + line('M-3 -16 V14', '#5d6672', 1.4)))
    + sh(at('translate(62 104) rotate(-96)', rect(-7, -22, 14, 44, 'url(#b-black)', 2, 2) + line('M-3 -16 V14', '#5d6672', 1.4))),
  'heavy-metal': () => sh(
    rect(20, 70, 88, 42, 'url(#b-green)', 3, 2.4)
    + line('M20 82 H108', '#1f6a2c', 1.6)
    + rect(52, 64, 24, 8, 'url(#b-steel)', 2, 1.8)
    + text(64, 102, 13, '#f2efe6', '7.62MM', 'fill-opacity=".85"')
    + gloss('M24 74 H40 V108 H24Z', 0.2))
    + item('ak47', 64, 46, 0.42, -12),
  'faction-many-friends': () => sh(
    at('rotate(-18 40 64)', p('M28 30 H52 L50 96 C50 102 30 102 30 96 Z', 'url(#b-glass)', 2.2) + p('M30 60 H50 L50 96 C50 102 30 102 30 96 Z', 'url(#b-orange)', 1.6))
    + at('rotate(18 88 64)', p('M76 30 H100 L98 96 C98 102 78 102 78 96 Z', 'url(#b-glass)', 2.2) + p('M78 60 H98 L98 96 C98 102 78 102 78 96 Z', 'url(#b-orange)', 1.6))
    + p('M52 36 H76 L74 104 C74 110 54 110 54 104 Z', 'url(#b-glass)', 2.2) + p('M54 66 H74 L74 104 C74 110 54 110 54 104 Z', 'url(#b-orange)', 1.6)
    + p('M54 62 C54 54 74 54 74 62 C74 68 54 68 54 62Z', '#fff', 1.6))
    + sparkle(64, 22, 8) + sparkle(36, 24, 5) + sparkle(92, 24, 5),
  'faction-inner-circle': () => sh(
    `<ellipse cx="64" cy="82" rx="34" ry="26" fill="none" stroke="${K}" stroke-width="15"/>`
    + `<ellipse cx="64" cy="82" rx="34" ry="26" fill="none" stroke="url(#b-gold)" stroke-width="11"/>`
    + p('M40 52 C40 30 88 30 88 52 L82 62 H46 Z', 'url(#b-gold)', 2.4)
    + p('M50 48 C50 36 78 36 78 48 L74 54 H54 Z', 'url(#b-black)', 2)
    + text(64, 51, 12, '#f6d061', 'IC')
    + gloss('M34 76 C36 68 44 62 52 60 C44 66 38 72 36 80Z', 0.6) + gloss('M46 46 C48 38 56 34 62 34 C56 38 50 42 48 50Z', 0.5)),
  'faction-two-crowns': () => sh(crown(42, 72, 0.78, 'url(#b-silver)', ['#3b8fe0', '#9b5de5', '#3b8fe0']) + crown(84, 56, 0.86)) + sparkle(108, 20, 7) + sparkle(18, 40, 5),
  'kings-friend': () => sh(
    line('M34 12 C30 40 46 62 64 70 C82 62 98 40 94 12', '#f6d061', 3.2, 'stroke-dasharray="3.5 2.5"')
    + p('M64 54 L98 72 L94 104 C88 112 40 112 34 104 L30 72 Z', 'url(#b-gold)', 2.4)
    + crown(64, 86, 0.56, 'url(#b-black)', ['#2fb35a', '#2fb35a', '#2fb35a'])
    + gloss('M38 74 L60 62 L56 68 L40 78Z', 0.55)),
  'kings-crown-of-the-block': () => sh(
    p('M22 82 L64 70 L106 82 V108 L64 120 L22 108 Z', 'url(#b-concrete)', 2.4)
    + line('M22 82 L64 94 L106 82 M64 94 V120', K, 2)
    + rect(34, 92, 10, 8, '#69645b', 1, 1.2) + rect(84, 92, 10, 8, '#69645b', 1, 1.2)
    + crown(64, 50, 0.92, 'url(#b-gold)', ['#2fb35a', '#2fb35a', '#2fb35a']))
    + sparkle(106, 26, 7),
  'outfit-associate': () => sh(
    p('M64 64 C60 84 66 100 60 116', 'none', 5) + line('M64 64 C60 84 66 100 60 116', '#2f7a35', 3)
    + at('translate(72 92) rotate(30)', p('M0 0 C8 -10 20 -8 22 0 C14 4 6 4 0 0Z', 'url(#b-green)', 1.6))
    + at('translate(60 82) rotate(200)', p('M0 0 C8 -10 20 -8 22 0 C14 4 6 4 0 0Z', 'url(#b-green)', 1.6))
    + p('M64 70 C42 70 34 52 38 38 C42 26 54 22 64 30 C74 22 86 26 90 38 C94 52 86 70 64 70Z', 'url(#b-velvet)', 2.4)
    + line('M64 30 C56 38 56 50 64 56 C72 50 72 38 64 30 M48 40 C52 50 58 56 64 58 M80 40 C76 50 70 56 64 58', '#56061b', 1.6)
    + p('M50 66 C56 72 72 72 78 66 L72 74 H56Z', 'url(#b-velvet)', 1.6)
    + gloss('M42 40 C44 32 50 28 56 30 C50 34 46 40 46 48Z', 0.35)),
  'outfit-seat-at-the-table': () => sh(
    p('M12 82 H116 L108 92 H20 Z', 'url(#b-wood)', 2.2) + p('M24 92 V118 M104 92 V118', 'none', 5) + line('M24 92 V118 M104 92 V118', '#6a3b14', 3)
    + p('M10 78 H118 V84 H10 Z', '#f2efe6', 1.6)
    + p('M30 40 C30 30 50 30 50 40 C50 52 44 58 40 58 C36 58 30 52 30 40Z', 'url(#b-glass)', 2) + p('M31 44 H49 C48 52 44 56 40 56 C36 56 32 52 31 44Z', 'url(#b-velvet)', 1.4)
    + line('M40 58 V76 M32 78 H48', K, 2.4)
    + p('M60 24 H72 V34 C78 38 80 44 80 52 V78 H52 V52 C52 44 54 38 60 34 Z', 'url(#b-black)', 2.2) + rect(56, 50, 20, 16, '#f2efe6', 1, 1.4)
    + at('rotate(-12 96 72)', rect(82, 68, 30, 6, '#7a4a2a', 3, 1.8) + rect(82, 68, 6, 6, '#f6d061', 1, 1.2) + circ(112, 71, 2, '#ff8a2b', 0))
    + line('M114 64 C118 58 112 54 116 48', '#c9d1db', 1.6, 'stroke-opacity=".8"')),
  'saints-prospect': () => vest(1, false),
  'road-saints-full-patch': () => vest(2, true) + sparkle(110, 20, 6),
  'cartel-partner': () => sh(
    p('M18 58 L64 40 L110 58 V92 L64 112 L18 92 Z', '#d9c7a0', 2.4)
    + p('M18 58 L64 76 L110 58 L64 40Z', '#efe2c4', 2)
    + line('M64 76 V112', K, 2)
    + line('M26 61 L72 43 M36 65 L82 47 M46 69 L92 51 M56 73 L100 55', '#c9b48a', 1.4)
    + line('M18 70 L64 88 L110 70', '#c49a3a', 4) + line('M18 70 L64 88 L110 70', '#e8c46a', 2)
    + at('translate(40 90) skewY(22)', circ(0, 0, 11, 'none', 1.8, 'stroke="#8c1418"') + text(0, 4.5, 11, '#8c1418', '♠'))
    + at('translate(87 90) skewY(-22)', text(0, 4, 9, '#8c1418', 'Nº1'))),
  'cartel-line-the-pipeline': () => sh(
    p('M8 56 H70 C82 56 88 62 88 74 V116 H64 V80 H8 Z', 'url(#b-steel)', 2.4)
    + rect(4, 50, 10, 36, 'url(#b-steel)', 2, 2) + rect(58, 108, 36, 10, 'url(#b-steel)', 2, 2)
    + line('M14 62 H66', '#c9d1db', 2, 'stroke-opacity=".6"')
    + at('translate(84 40) rotate(-10)', p('M-18 -8 L0 -16 L18 -8 V8 L0 16 L-18 8 Z', '#d9c7a0', 2) + p('M-18 -8 L0 0 L18 -8 L0 -16Z', '#efe2c4', 1.6) + line('M0 0 V16', K, 1.6) + line('M-18 0 L0 8 L18 0', '#c49a3a', 2.4))
    + rect(30, 50, 10, 36, 'url(#b-red)', 2, 1.8) + circ(35, 46, 6, 'url(#b-red)', 1.8)),
  'civic-contributor': () => sh(
    p('M14 44 L64 14 L114 44 Z', 'url(#b-white)', 2.4) + circ(64, 34, 5, 'url(#b-gold)', 1.4)
    + rect(18, 44, 92, 8, 'url(#b-white)', 1, 2)
    + [28, 46, 64, 82, 100].map((x) => rect(x - 5, 52, 10, 46, 'url(#b-white)', 1, 1.8) + line(`M${x - 1} 56 V94`, '#aeb6c1', 1.2)).join('')
    + rect(12, 98, 104, 8, 'url(#b-white)', 1, 2) + rect(6, 106, 116, 8, 'url(#b-concrete)', 1, 2)),
  'civic-handshake-untouchable': () => sh(
    rect(18, 92, 74, 16, 'url(#b-wood)', 3, 2.2)
    + at('rotate(-30 70 52)', rect(44, 30, 52, 26, 'url(#b-wood)', 6, 2.4) + rect(64, 26, 12, 34, '#f6d061', 2, 2) + rect(66, 56, 8, 52, 'url(#b-wood)', 3, 2.2)
      + gloss('M48 34 H60 V40 H48Z', 0.45))
    + at('translate(100 90) rotate(14)', rect(-14, -10, 28, 20, 'url(#b-paper)', 2, 2) + bill(0, -10, 24, 12, -8)))
    + sparkle(22, 30, 7),

  // Hideout.
  'first-hideout-upgrade': () => sh(
    circ(38, 42, 20, 'none', 6) + `<circle cx="38" cy="42" r="20" fill="none" stroke="url(#b-silver)" stroke-width="3"/>`
    + at('rotate(36 64 64)',
      p('M54 50 C54 36 74 36 74 50 C74 58 70 62 64 62 C58 62 54 58 54 50Z', 'url(#b-gold)', 2.2) + circ(64, 48, 4, '#1f2227', 1.4)
      + p('M61 62 H67 V108 L64 112 L61 108Z', 'url(#b-gold)', 2) + p('M67 80 H74 V86 H67 M67 92 H72 V98 H67', 'url(#b-gold)', 1.8))
    + at('rotate(-20 88 88)', rect(78, 70, 26, 34, 'url(#b-red)', 5, 2) + circ(91, 76, 3, '#14161a', 1) + text(91, 96, 10, '#fff', 'HQ'))),
  'hideout-regular': () => sh(
    p('M24 58 L64 24 L104 58 V108 H24 Z', 'url(#b-pink)', 2.4)
    + p('M16 62 L64 20 L112 62', 'none', 6) + line('M16 62 L64 20 L112 62', '#a31d5d', 3)
    + rect(52, 20, 24, 6, '#14161a', 3, 1.6)
    + circ(64, 76, 15, 'url(#b-gold)', 2) + text(64, 83, 18, '#8a5a0a', '$')
    + rect(32, 104, 12, 10, 'url(#b-pink)', 2, 1.8) + rect(84, 104, 12, 10, 'url(#b-pink)', 2, 1.8)
    + gloss('M30 60 L60 34 L60 40 L34 64Z', 0.45)) + sh(coin(102, 30, 10)),
  'room-maxed': () => sh(
    rect(16, 56, 96, 40, 'url(#b-leather)', 12, 2.4)
    + rect(10, 64, 22, 40, 'url(#b-leather)', 8, 2.4) + rect(96, 64, 22, 40, 'url(#b-leather)', 8, 2.4)
    + rect(30, 72, 68, 26, 'url(#b-leather)', 6, 2.2) + line('M64 72 V98', '#2a1a10', 1.6)
    + [[40, 64], [64, 64], [88, 64]].map(([x, y]) => circ(x, y, 1.8, '#c9a36a', 0.8)).join('')
    + rect(20, 104, 6, 8, '#2a1a10', 1, 1.4) + rect(102, 104, 6, 8, '#2a1a10', 1, 1.4)
    + gloss('M22 60 H50 V64 H22Z', 0.25))
    + sh(rect(40, 18, 48, 24, 'url(#b-red)', 6, 2.2) + outlinedText(64, 36, 15, '#fff', 'MAX', 2.4)),
  'fully-built-hideout': () => sh(
    rect(14, 56, 30, 54, 'url(#b-brick)', 1, 2.2) + rect(84, 56, 30, 54, 'url(#b-brick)', 1, 2.2)
    + p('M10 58 L29 42 L48 58Z', 'url(#b-black)', 2) + p('M80 58 L99 42 L118 58Z', 'url(#b-black)', 2)
    + rect(40, 44, 48, 66, 'url(#b-brick)', 1, 2.4) + p('M34 48 L64 22 L94 48Z', 'url(#b-black)', 2.4)
    + [[20, 66], [32, 66], [20, 84], [32, 84], [90, 66], [102, 66], [90, 84], [102, 84], [48, 54], [72, 54], [48, 72], [72, 72]].map(([x, y]) => rect(x, y, 8, 10, '#ffd76a', 1, 1.4)).join('')
    + door(56, 88, 16, 22)
    + circ(64, 36, 4.5, 'url(#b-gold)', 1.4))
    + sh(star(106, 22, 10, 'url(#b-gold)', 1.8)),

  // Permanent quest badges.
  'ghost-of-the-block': () => sh(
    p('M28 64 C28 34 44 18 64 18 C84 18 100 34 100 64 V112 L90 102 L80 112 L70 102 L64 108 L58 102 L48 112 L38 102 L28 112 Z', 'url(#b-white)', 2.4)
    + p('M30 44 C34 20 94 20 98 44 C90 38 38 38 30 44Z', 'url(#b-black)', 2.2)
    + rect(30, 40, 68, 8, '#2a2f36', 2, 1.8)
    + p('M40 60 C44 54 58 54 60 60 C58 66 44 68 40 62Z M68 60 C70 54 84 54 88 60 C84 68 70 66 68 60Z', '#14161a', 1.4)
    + line('M54 84 C60 88 68 88 74 84', K, 2.2)
    + gloss('M34 60 C34 48 40 52 40 64 V96 L34 100Z', 0.5))
    + line('M10 70 H20 M6 82 H18 M12 94 H22', '#c9d1db', 2.4, 'stroke-opacity=".7"'),
  'top-shelf-operator': () => sh(
    rect(8, 104, 112, 8, 'url(#b-wood)', 1, 2.2)
    + p('M50 12 H62 V30 C72 36 76 44 76 54 V104 H36 V54 C36 44 40 36 50 30 Z', 'url(#b-orange)', 2.4)
    + rect(48, 8, 16, 8, 'url(#b-black)', 2, 2)
    + rect(40, 60, 32, 26, 'url(#b-paper)', 2, 1.8) + text(56, 72, 8, '#6a3b14', 'XO') + text(56, 82, 6, '#6a3b14', 'RESERVE')
    + gloss('M42 50 C42 44 46 40 50 38 V100 H42Z', 0.4)
    + p('M88 54 H104 L102 104 H90 Z', 'url(#b-green)', 2.2) + rect(90, 46, 12, 8, '#f6d061', 2, 1.8) + rect(90, 70, 12, 14, 'url(#b-paper)', 1, 1.4)
    + p('M18 70 H30 V104 H18 Z', 'url(#b-glass)', 2) + p('M18 84 H30 V104 H18Z', 'url(#b-orange)', 1.4))
    + sparkle(94, 22, 6),
  'full-rack-enforcer': () => sh(
    rect(12, 14, 104, 100, 'url(#b-wood)', 4, 2.4) + rect(20, 22, 88, 84, '#3a2618', 2, 1.8)
    + line('M24 46 H104 M24 72 H104 M24 98 H104', '#6a3b14', 2))
    + item('ak47', 64, 38, 0.32) + item('shotgun', 64, 62, 0.32) + item('tek9', 46, 88, 0.3) + item('pistol', 86, 88, 0.26),
  'road-king': () => sh(
    circ(64, 70, 42, 'none', 9) + `<circle cx="64" cy="70" r="42" fill="none" stroke="url(#b-black)" stroke-width="6"/>`
    + p('M24 74 C40 64 52 64 58 74 L60 84 H68 L70 74 C76 64 88 64 104 74', 'none', 8) + line('M24 74 C40 64 52 64 58 74 L60 84 H68 L70 74 C76 64 88 64 104 74 M64 84 V110', '#2a2f36', 5)
    + circ(64, 76, 11, 'url(#b-steel)', 2) + circ(64, 76, 5, 'url(#b-gold)', 1.4)
    + gloss('M30 52 C38 38 50 30 62 28 C50 34 40 42 34 54Z', 0.4)
    + crown(64, 22, 0.5)),
  'no-paper-trail': () => sh(
    line('M36 82 V104 M44 82 V110 M52 82 V100 M60 82 V112 M68 82 V104 M76 82 V108 M84 82 V100 M92 82 V106', '#f2efe6', 4)
    + line('M36 82 V104 M44 82 V110 M52 82 V100 M60 82 V112 M68 82 V104 M76 82 V108 M84 82 V100 M92 82 V106', '#c9bea4', 1.2, 'stroke-dasharray="3 5"')
    + p('M38 12 H86 L92 18 V60 H38 Z', 'url(#b-paper)', 2.2) + line('M46 26 H80 M46 34 H84 M46 42 H76 M46 50 H70', '#a8987a', 2)
    + text(66, 40, 11, '#c0392b', 'CONFIDENTIAL', 'transform="rotate(-14 66 40)" fill-opacity=".85"')
    + rect(20, 58, 88, 26, 'url(#b-black)', 5, 2.4) + rect(30, 66, 68, 5, '#060708', 2, 1.4)
    + circ(98, 76, 3, '#4fd18a', 1)),
  'corner-boss': () => sh(
    rect(60, 30, 8, 86, 'url(#b-steel)', 2, 2.2)
    + at('rotate(-6 64 30)', rect(16, 22, 64, 18, 'url(#b-green)', 3, 2.2) + text(48, 36, 10, '#fff', 'BOSS ST'))
    + at('rotate(8 64 52)', rect(50, 46, 64, 18, 'url(#b-green)', 3, 2.2) + text(82, 60, 10, '#fff', 'KING AV'))
    + rect(52, 110, 24, 8, 'url(#b-concrete)', 2, 2)
    + crown(64, 12, 0.36)),
  'street-pass-s1-badge': () => item('street-pass-s1-badge', 64, 64, 1),
  'street-pass-s1-fresh-face': () => item('street-pass-s1-fresh-face', 64, 64, 1),
  'street-pass-s1-made-man': () => item('street-pass-s1-made-man', 64, 64, 1),
  'street-pass-s1-kingpin': () => item('street-pass-s1-kingpin', 64, 64, 1),

  // Legacy podium.
  kingpin: () => sh(
    rect(46, 52, 36, 60, 'url(#b-gold)', 2, 2.4) + rect(12, 72, 34, 40, 'url(#b-silver)', 2, 2.4) + rect(82, 84, 34, 28, 'url(#b-bronze)', 2, 2.4)
    + outlinedText(64, 90, 24, '#fff7d6', '1', 3) + outlinedText(29, 100, 18, '#fff', '2', 3) + outlinedText(99, 106, 15, '#fff', '3', 3)
    + gloss('M50 56 H58 V108 H50Z', 0.4))
    + sh(crown(64, 30, 0.6)),
  'past-winner': () => trophy('url(#b-gold)', '') + sh(
    p('M40 40 C28 50 34 62 46 64 M88 40 C100 50 94 62 82 64', 'none', 1) + star(64, 44, 13, '#fff7d6', 2))
    + sparkle(104, 18, 7) + sparkle(22, 90, 5),

  // Turf.
  'block-boss': () => sh(
    p('M14 84 L64 66 L114 84 V108 L64 122 L14 108 Z', 'url(#b-brick)', 2.4)
    + line('M14 84 L64 100 L114 84 M64 100 V122 M30 90 V112 M46 95 V117 M82 95 V117 M98 90 V112', K, 1.6)
    + rect(60, 16, 6, 78, 'url(#b-steel)', 2, 2)
    + p('M66 18 C78 14 88 24 104 18 V48 C88 54 78 44 66 48 Z', 'url(#b-red)', 2.2)
    + text(84, 39, 14, '#fff', '5')
    + circ(63, 14, 4, 'url(#b-gold)', 1.4)),
  'turf-veteran': () => sh(
    rect(30, 12, 68, 10, 'url(#b-wood)', 3, 2.2) + rect(30, 106, 68, 10, 'url(#b-wood)', 3, 2.2)
    + line('M36 22 V106 M92 22 V106', '#6a3b14', 4)
    + p('M42 22 H86 C86 44 70 56 64 64 C58 56 42 44 42 22Z M42 106 H86 C86 84 70 72 64 64 C58 72 42 84 42 106Z', 'url(#b-glass)', 2.2)
    + p('M50 32 H78 C76 44 68 52 64 56 C60 52 52 44 50 32Z', '#e8c46a', 0)
    + p('M44 104 C48 92 56 88 64 86 C72 88 80 92 84 104Z', '#e8c46a', 1.4)
    + line('M64 58 V86', '#e8c46a', 1.6, 'stroke-dasharray="2 2"')
    + gloss('M46 26 H52 C52 38 56 46 60 52 C52 46 46 38 46 26Z', 0.6)),
  'war-drums': () => sh(
    p('M28 40 V100 C28 112 100 112 100 100 V40', 'url(#b-red)', 2.4)
    + line('M28 58 C28 66 100 66 100 58 M28 82 C28 90 100 90 100 82', '#8c1418', 3)
    + `<ellipse cx="64" cy="40" rx="36" ry="10" fill="url(#b-steel)" ${st(2.4)}/>`
    + text(64, 80, 12, '#fff7e8', 'WAR', 'fill-opacity=".9"')
    + gloss('M32 46 C34 48 40 50 42 50 V100 C38 98 34 96 32 92Z', 0.3)
    + at('rotate(-30 46 28)', rect(44, 0, 6, 40, 'url(#b-wood)', 3, 2) + circ(47, 2, 5, '#f2efe6', 1.6))
    + at('rotate(34 82 28)', rect(80, 0, 6, 40, 'url(#b-wood)', 3, 2) + circ(83, 2, 5, '#f2efe6', 1.6)))
    + line('M10 34 L20 38 M8 50 L18 50 M108 38 L118 34 M110 50 L120 50', '#f6d061', 2.6),
  'hostile-takeover': () => sh(
    at('rotate(-38 64 64)',
      p('M58 12 C58 6 72 6 74 14 L76 20 H66 V112 H58 Z', 'url(#b-red)', 2.4)
      + p('M58 112 C58 120 50 122 44 118', 'none', 7) + line('M58 112 C58 120 50 122 44 118', '#c22b2f', 4)
      + gloss('M60 18 H63 V108 H60Z', 0.45))
    + rect(76, 76, 36, 30, 'url(#b-paper)', 2, 2) + text(94, 90, 8, '#6e2416', 'DEED') + line('M82 96 H106 M82 101 H100', '#a8987a', 1.4)),
  'smash-and-grab': () => sh(
    p('M18 16 H110 V112 H18 Z', 'url(#b-glass)', 2.4)
    + line('M64 62 L30 22 M64 62 L98 20 M64 62 L110 56 M64 62 L96 112 M64 62 L40 112 M64 62 L18 70 M48 44 L82 40 L92 76 L58 94 L38 70 Z', '#fff', 1.6, 'stroke-opacity=".85"')
    + at('rotate(-12 64 62)', rect(46, 50, 36, 22, 'url(#b-brick)', 2, 2.2) + line('M46 61 H82 M58 50 V61 M70 61 V72', '#6e2416', 1.6))
    + gloss('M22 20 H40 L22 44Z', 0.5))
    + sh(p('M100 92 L120 112 M94 98 L108 92 L106 106Z', 'url(#b-silver)', 2)),
  'fire-sale': () => sh(
    at('rotate(-8 64 70)', rect(18, 52, 92, 50, 'url(#b-paper)', 4, 2.4) + outlinedText(64, 86, 26, '#e5383b', 'SALE', 3)
      + line('M18 62 H110', '#e5383b', 2))
    + flame(34, 46, 0.9) + flame(70, 36, 1.2) + flame(98, 50, 0.8)),
  'siege-boss': () => sh(
    at('rotate(-16 64 64)',
      rect(10, 50, 92, 24, 'url(#b-wood)', 12, 2.4)
      + line('M28 50 V74 M84 50 V74', '#3a2618', 4)
      + p('M102 46 H118 V78 H102 Z', 'url(#b-steel)', 2.4) + rect(98, 44, 8, 36, 'url(#b-steel)', 2, 2)
      + gloss('M14 54 H96 V58 H14Z', 0.3))
    + rect(22, 82, 82, 10, 'url(#b-wood)', 2, 2.2)
    + [36, 90].map((x) => circ(x, 100, 13, 'url(#b-wood)', 2.4) + circ(x, 100, 4, 'url(#b-steel)', 1.6) + line(`M${x - 12} 100 H${x + 12} M${x} 88 V112`, '#6a3b14', 1.6)).join(''))
    + line('M114 26 L120 18 M106 22 L108 12', '#f6d061', 2.6),
  'home-turf': () => sh(
    p('M12 88 L22 74 H106 L116 88 L106 102 H22 Z', 'url(#b-wood)', 2.4)
    + text(64, 94, 15, '#3a2618', 'HOME')
    + line('M24 80 H104', '#c9853f', 1.4, 'stroke-dasharray="2 3"')
    + at('rotate(-58 70 50)', p('M66 0 C74 0 76 6 76 12 L72 92 C72 98 66 98 66 92 L62 12 C62 6 60 0 66 0Z', 'url(#b-wood)', 2.4)
      + rect(64, 80, 10, 14, 'url(#b-black)', 3, 1.8) + gloss('M65 8 H68 L67 80 H65Z', 0.5))),
  'scorched-earth': () => sh(
    p('M28 46 L42 30 H90 V112 H28 Z', 'url(#b-red)', 2.4)
    + p('M84 30 V18 H96 V30', 'url(#b-black)', 2.2) + rect(80, 14, 20, 8, 'url(#b-black)', 2, 2)
    + p('M44 54 H82 V96 H44 Z', 'none', 2) + line('M44 54 L82 96 M82 54 L44 96', '#8c1418', 3)
    + text(63, 108, 9, '#fff7e8', 'GAS')
    + gloss('M32 48 L42 36 V106 H32Z', 0.3))
    + flame(104, 72, 0.9) + flame(18, 92, 0.7),
  'corporate-raider': () => sh(
    rect(16, 46, 96, 62, 'url(#b-black)', 6, 2.4) + rect(48, 32, 32, 16, 'none', 4, 3)
    + line('M16 64 H112', '#2a2f36', 2) + rect(58, 58, 12, 12, 'url(#b-gold)', 2, 1.6)
    + at('translate(64 88)', p('M-10 -6 C-10 -14 10 -14 10 -6 C10 0 6 2 6 4 H-6 C-6 2 -10 0 -10 -6Z', '#f2efe6', 1.6) + circ(-4, -6, 2.4, K, 0) + circ(4, -6, 2.4, K, 0)
      + line('M-14 10 L14 0 M-14 0 L14 10', '#f2efe6', 3))
    + gloss('M20 50 H34 V104 H20Z', 0.12)),
  'war-machine': () => sh(
    p('M8 60 L20 40 H74 L84 60 H112 L118 76 V92 H8 Z', 'url(#b-green)', 2.4)
    + rect(30, 46, 20, 12, 'url(#b-glass)', 2, 1.8) + rect(54, 46, 16, 12, 'url(#b-glass)', 2, 1.8)
    + line('M84 60 V92 M8 74 H118', '#1f6a2c', 1.8)
    + [[16, 66], [26, 66], [96, 66], [106, 66], [16, 84], [106, 84]].map(([x, y]) => circ(x, y, 1.6, '#c4f2ae', 0.6)).join('')
    + p('M48 34 H72 V40 H48 Z', 'url(#b-steel)', 2) + rect(70, 30, 34, 6, 'url(#b-steel)', 2, 2)
    + circ(30, 94, 13, 'url(#b-black)', 2.4) + circ(30, 94, 5, 'url(#b-steel)', 1.6) + circ(94, 94, 13, 'url(#b-black)', 2.4) + circ(94, 94, 5, 'url(#b-steel)', 1.6)
    + gloss('M22 44 H44 L40 48 H24Z', 0.4))
    + sh(star(64, 76, 8, '#f2efe6', 1.6)),

  // Business and cashflow.
  'open-for-business': () => sh(
    rect(10, 34, 108, 60, 'url(#b-black)', 12, 2.4)
    + rect(18, 42, 92, 44, '#0f1114', 8, 1.6)
    + line('M44 30 L52 18 M84 30 L76 18', K, 2)
    + text(64, 74, 30, 'none', 'OPEN', 'stroke="#ff5fa8" stroke-width="5" stroke-opacity=".35"')
    + text(64, 74, 30, 'none', 'OPEN', 'stroke="#ff5fa8" stroke-width="2.4"')
    + text(64, 74, 30, 'none', 'OPEN', 'stroke="#ffe0f0" stroke-width=".9"')
    + gloss('M18 40 H60 L56 44 H22 V60 H18Z', 0.12)),
  'first-payday': () => sh(
    at('rotate(-6 64 64)', rect(12, 36, 104, 56, 'url(#b-paper)', 4, 2.4)
      + text(30, 56, 9, '#2f5220', 'PAY') + rect(44, 48, 62, 10, '#fff', 2, 1.4) + text(76, 56, 8, '#2f5220', '$1,250.00')
      + line('M20 72 H70', '#a8987a', 1.6) + line('M78 80 C84 72 88 84 94 76 C98 72 102 80 108 76', '#1f3c8c', 1.8)
      + rect(20, 80, 40, 6, '#d9cbab', 1, 0))) + sh(coin(102, 26, 14)),
  'side-hustle': () => sh(
    at('rotate(-36 64 64)',
      `<ellipse cx="64" cy="44" rx="28" ry="34" fill="none" stroke="${K}" stroke-width="9"/>`
      + `<ellipse cx="64" cy="44" rx="28" ry="34" fill="none" stroke="url(#b-red)" stroke-width="5"/>`
      + line('M44 24 H84 M40 36 H88 M38 48 H90 M40 60 H88 M46 72 H82 M52 14 V74 M64 10 V78 M76 14 V74', '#f2efe6', 1.2)
      + p('M60 78 H68 L70 120 H58 Z', 'url(#b-black)', 2.2))
    + bill(96, 92, 34, 18, 12) + bill(90, 104, 34, 18, -6)),
  'local-chain': () => sh(
    line('M18 18 C14 60 36 98 64 104 C92 98 114 60 110 18', '#000', 13, 'stroke-dasharray="13 3"')
    + line('M18 18 C14 60 36 98 64 104 C92 98 114 60 110 18', '#f6d061', 9, 'stroke-dasharray="13 3"')
    + line('M18 18 C14 60 36 98 64 104 C92 98 114 60 110 18', '#fff4c2', 2.4, 'stroke-dasharray="6 10"')
    + coin(64, 90, 22, 'url(#b-gold)', '$')),
  'cash-flow': () => sh(
    rect(10, 22, 52, 14, 'url(#b-silver)', 4, 2.2) + p('M62 18 H80 C90 18 96 24 96 34 V46 H82 V36 H62 Z', 'url(#b-silver)', 2.2)
    + rect(30, 12, 12, 10, 'url(#b-silver)', 2, 2) + rect(22, 6, 28, 8, 'url(#b-red)', 3, 2)
    + rect(78, 46, 22, 6, 'url(#b-silver)', 2, 2))
    + sh(bill(88, 70, 28, 14, 80) + bill(94, 96, 28, 14, 60) + bill(70, 108, 28, 14, -10) + coin(104, 112, 8, 'url(#b-gold)', '')),
  'clean-money': () => sh(
    rect(18, 14, 92, 102, 'url(#b-white)', 8, 2.4) + line('M18 34 H110', K, 2)
    + circ(30, 24, 3.6, 'url(#b-red)', 1.2) + circ(42, 24, 3.6, 'url(#b-green)', 1.2) + rect(76, 20, 26, 8, '#1b2a3d', 2, 1.4)
    + circ(64, 74, 32, 'url(#b-steel)', 2.4) + circ(64, 74, 24, 'url(#b-glass)', 2)
    + `<clipPath id="b-drum"><circle cx="64" cy="74" r="23"/></clipPath>`
    + `<g clip-path="url(#b-drum)">${p('M38 80 C48 74 56 86 66 80 C76 74 84 86 92 80 V100 H38Z', '#9fd4ff', 0)}${bill(58, 66, 26, 13, -24)}${bill(74, 82, 26, 13, 20)}</g>`
    + gloss('M48 58 A22 22 0 0 1 64 52 L64 56 A18 18 0 0 0 52 62Z', 0.7))
    + circ(98, 46, 4, '#fff', 1.4, 'fill-opacity=".8"') + circ(106, 38, 2.6, '#fff', 1) + circ(14, 60, 3, '#fff', 1.2),
  'business-district': () => sh(
    building(10, 50, 28, 62, 'url(#b-blue)', 2, 6) + building(36, 20, 32, 92, 'url(#b-steel)', 3, 9) + building(66, 38, 28, 74, 'url(#b-teal)', 2, 7)
    + building(92, 62, 26, 50, 'url(#b-purple)', 2, 4) + rect(50, 10, 4, 12, '#5d6672', 1, 1.4) + circ(52, 9, 2.4, 'url(#b-red)', 1)
    + rect(4, 108, 120, 8, 'url(#b-concrete)', 2, 2)),
  'underworld-conglomerate': () => sh(
    building(14, 56, 26, 56, 'url(#b-black)', 2, 5) + building(88, 48, 28, 64, 'url(#b-black)', 2, 6)
    + p('M42 112 V30 L64 14 L86 30 V112 Z', 'url(#b-black)', 2.4)
    + building(46, 40, 36, 72, '#1f2227', 3, 7, '#f6d061')
    + circ(64, 30, 9, 'url(#b-gold)', 2) + text(64, 34.5, 12, '#8a5a0a', '$')
    + rect(6, 108, 116, 8, 'url(#b-concrete)', 2, 2))
    + sparkle(104, 24, 7) + sparkle(22, 36, 5),
  'money-machine': () => sh(
    p('M18 58 L30 30 H98 L110 58 Z', 'url(#b-steel)', 2.4)
    + rect(14, 56, 100, 52, 'url(#b-white)', 6, 2.4)
    + rect(26, 66, 52, 18, '#13281b', 3, 1.8) + text(52, 80, 12, '#5ff08a', '$9,999')
    + circ(92, 72, 5, 'url(#b-green)', 1.6) + circ(104, 72, 5, 'url(#b-red)', 1.6)
    + rect(26, 92, 76, 6, '#1f2227', 2, 1.6))
    + sh(bill(64, 34, 40, 20, -4) + bill(66, 24, 40, 20, 6) + bill(60, 108, 40, 18, -6)),
  'street-pharmacist': () => sh(
    p('M30 24 H98 L104 112 H24 Z', 'url(#b-white)', 2.4)
    + p('M30 24 L36 14 H92 L98 24', 'url(#b-white)', 2) + line('M40 18 C44 22 52 22 56 18 M72 18 C76 22 84 22 88 18', '#aeb6c1', 1.4)
    + circ(64, 58, 16, 'url(#b-green)', 2) + text(64, 65, 18, '#fff', 'Rx')
    + line('M38 86 H90 M38 94 H80 M38 102 H86', '#aeb6c1', 2))
    + item('ecstasy', 96, 92, 0.42) + sh(at('translate(28 98) rotate(-30)', rect(-11, -5, 22, 10, 'url(#b-red)', 5, 1.8) + p('M0 -5 H6 A5 5 0 0 1 6 5 H0 Z', 'url(#b-white)', 1.4))),
  'high-roller': () => sh(
    `<ellipse cx="64" cy="100" rx="48" ry="14" fill="url(#b-glass)" ${st(2.4)}/>`
    + `<ellipse cx="64" cy="98" rx="36" ry="9" fill="#5a95b8" stroke="${K}" stroke-width="1.4"/>`
    + at('rotate(-14 64 64)', rect(14, 56, 92, 14, 'url(#b-wood)', 7, 2.4) + rect(30, 56, 12, 14, 'url(#b-gold)', 1, 2) + text(36, 66, 7, '#8c1418', '★')
      + p('M100 56 C108 56 108 70 100 70', 'url(#b-orange)', 2) + gloss('M44 58 H96 V61 H44Z', 0.3))
    + line('M108 42 C114 34 104 30 110 20 C114 14 108 10 112 4', '#c9d1db', 2.4, 'stroke-opacity=".75"'))
    + sh(die(28, 30, 0.8, 6, 'url(#b-gold)', '#5e2f10', -14)),
  'street-grinder': () => sh(
    rect(26, 26, 76, 16, 'url(#b-green)', 6, 2.4)
    + line('M32 30 V38 M40 30 V38 M48 30 V38 M56 30 V38 M64 30 V38 M72 30 V38 M80 30 V38 M88 30 V38 M96 30 V38', '#1f6a2c', 1.4)
    + rect(22, 42, 84, 18, 'url(#b-steel)', 3, 2.4)
    + rect(26, 60, 76, 46, 'url(#b-green)', 8, 2.4) + rect(26, 74, 76, 6, '#1f6a2c', 1, 1.4)
    + gloss('M30 64 H40 V100 H30Z', 0.35))
    + item('weed', 98, 34, 0.4, 16) + item('turns', 28, 96, 0.36),

  // Casino and travel.
  'first-chip': () => sh(chip(64, 64, 44, 'url(#b-red)', '#fff', '1')),
  'casino-circuit': () => sh(chipStack(34, 100, 4, 'url(#b-red)', '#fff', 22) + chipStack(94, 100, 5, 'url(#b-blue)', '#fff', 22) + chipStack(64, 112, 7, 'url(#b-green)', '#fff', 22)),
  'velvet-regular': () => sh(
    p('M28 46 C44 76 84 76 100 46', 'none', 11) + line('M28 46 C44 76 84 76 100 46', '#b3123a', 7) + line('M32 50 C46 70 82 70 96 50', '#ff7b8f', 1.6)
    + rect(22, 40, 12, 64, 'url(#b-gold)', 3, 2.2) + rect(94, 40, 12, 64, 'url(#b-gold)', 3, 2.2)
    + circ(28, 34, 9, 'url(#b-gold)', 2.2) + circ(100, 34, 9, 'url(#b-gold)', 2.2)
    + `<ellipse cx="28" cy="108" rx="16" ry="6" fill="url(#b-gold)" ${st(2.2)}/>` + `<ellipse cx="100" cy="108" rx="16" ry="6" fill="url(#b-gold)" ${st(2.2)}/>`
    + gloss('M24 44 H28 V100 H24Z', 0.6) + gloss('M96 44 H100 V100 H96Z', 0.6))
    + sh(rect(46, 82, 36, 16, '#14161a', 3, 2) + text(64, 94, 10, '#f6d061', 'VIP')),
  'house-guest': () => sh(
    rect(10, 100, 108, 10, 'url(#b-wood)', 2, 2.2)
    + p('M22 98 C22 60 106 60 106 98 Z', 'url(#b-gold)', 2.4)
    + rect(18, 96, 92, 6, 'url(#b-gold)', 2, 2) + rect(60, 54, 8, 10, 'url(#b-gold)', 2, 2) + `<ellipse cx="64" cy="52" rx="9" ry="4" fill="url(#b-gold)" ${st(2)}/>`
    + gloss('M32 92 C32 78 44 68 56 66 C46 72 40 82 40 92Z', 0.6))
    + sh(at('rotate(14 96 34)', rect(76, 20, 40, 26, 'url(#b-black)', 4, 2.2) + rect(76, 26, 40, 5, '#f6d061', 0, 1) + text(96, 42, 7, '#f6d061', 'SUITE'))),
  'big-night': () => sh(
    at('rotate(-24 64 72)',
      p('M54 12 H74 V28 C74 34 84 42 84 56 V112 C84 118 44 118 44 112 V56 C44 42 54 34 54 28 Z', 'url(#b-green)', 2.4)
      + p('M54 12 H74 V30 H54Z', 'url(#b-gold)', 2) + rect(46, 64, 36, 28, 'url(#b-paper)', 2, 1.8) + text(64, 82, 9, '#6a3b14', 'BRUT')
      + gloss('M48 56 C48 48 52 42 56 38 V108 H48Z', 0.35))
    + p('M80 10 C86 4 96 6 94 14 C98 16 98 24 92 24 L84 20Z', '#fff7d6', 1.4))
    + circ(98, 30, 3, '#ffe9a0', 1) + circ(108, 22, 2.4, '#ffe9a0', 1) + circ(104, 40, 2, '#ffe9a0', 1) + sparkle(112, 8, 6) + sparkle(30, 26, 5),
  'grand-tour': () => sh(
    rect(16, 36, 96, 76, 'url(#b-leather)', 8, 2.4) + rect(48, 22, 32, 16, 'none', 5, 4)
    + rect(30, 36, 8, 76, '#c9a36a', 1, 1.6) + rect(90, 36, 8, 76, '#c9a36a', 1, 1.6)
    + at('rotate(-10 54 64)', rect(40, 48, 28, 18, 'url(#b-red)', 3, 1.6) + text(54, 61, 7, '#fff', 'VEGAS'))
    + at('rotate(8 76 88)', rect(60, 78, 32, 18, 'url(#b-teal)', 9, 1.6) + text(76, 91, 7, '#fff', 'MIAMI'))
    + at('rotate(-4 50 96)', circ(46, 96, 9, 'url(#b-gold)', 1.6) + text(46, 99, 7, '#8a5a0a', 'NYC'))
    + at('rotate(6 92 56)', rect(80, 48, 24, 16, 'url(#b-purple)', 3, 1.6) + text(92, 59, 7, '#fff', 'LA'))
    + gloss('M20 40 H28 V108 H20Z', 0.15)),
  'jackpot-hitter': () => sh(
    rect(18, 26, 80, 88, 'url(#b-red)', 10, 2.4) + p('M22 26 C22 10 94 10 94 26Z', 'url(#b-gold)', 2.2) + text(58, 24, 9, '#8c1418', 'JACKPOT')
    + rect(26, 40, 64, 30, '#fff', 4, 2) + line('M47 40 V70 M69 40 V70', K, 1.6)
    + outlinedText(36.5, 63, 20, '#e5383b', '7', 2.4) + outlinedText(58, 63, 20, '#e5383b', '7', 2.4) + outlinedText(79.5, 63, 20, '#e5383b', '7', 2.4)
    + rect(28, 78, 60, 12, '#14161a', 2, 1.6) + rect(30, 96, 56, 10, '#14161a', 2, 1.6)
    + rect(98, 46, 8, 6, 'url(#b-silver)', 1, 1.6) + line('M106 49 H112 V24', K, 5) + line('M106 49 H112 V24', '#c9d1db', 2.6) + circ(112, 20, 6, 'url(#b-red)', 2)
    + gloss('M22 30 H30 V108 H22Z', 0.25))
    + sh(coin(40, 112, 8, 'url(#b-gold)', '') + coin(58, 116, 8, 'url(#b-gold)', '') + coin(76, 112, 8, 'url(#b-gold)', '')),
  whale: () => sh(
    p('M12 72 C12 44 46 34 74 42 C94 48 100 62 104 70 C108 62 114 56 122 56 C118 66 116 74 120 84 C112 84 106 80 104 76 C98 98 78 108 54 106 C28 104 12 92 12 72Z', 'url(#b-blue)', 2.4)
    + p('M16 80 C26 94 50 100 72 96 C84 94 96 86 100 78 C90 96 72 104 54 104 C34 104 20 94 16 80Z', '#d6ecff', 1.6)
    + circ(32, 66, 3.4, K, 0) + circ(31, 65, 1.2, '#fff', 0)
    + line('M16 78 C24 82 32 82 40 78', K, 1.8)
    + gloss('M22 58 C30 46 48 42 62 44 C46 46 34 52 26 62Z', 0.5))
    + sh(coin(46, 22, 9, 'url(#b-gold)', '') + coin(62, 14, 7, 'url(#b-gold)', '') + coin(36, 8, 6, 'url(#b-gold)', '') + chip(74, 30, 9, 'url(#b-purple)'))
    + line('M48 38 C46 34 50 32 48 30 M54 40 C56 36 52 34 56 32', '#9fd4ff', 2.2),
  'road-warrior': () => sh(
    p('M14 66 C14 52 30 46 64 46 C98 46 114 52 114 66 V100 C114 108 14 108 14 100 Z', 'url(#b-black)', 2.4)
    + line('M24 56 C40 52 88 52 104 56', '#3a3f46', 2)
    + line('M14 66 C40 72 88 72 114 66', '#f6d061', 2, 'stroke-dasharray="4 3"')
    + p('M38 50 C38 30 90 30 90 50', 'none', 7) + line('M38 50 C38 30 90 30 90 50', '#2a2f36', 4)
    + rect(56, 62, 16, 10, 'url(#b-silver)', 2, 1.6)
    + gloss('M20 62 C28 56 44 54 56 54 C42 58 30 62 22 70Z', 0.2))
    + sh(bill(98, 100, 30, 15, -18) + bill(30, 102, 30, 15, 14)),

  // Law.
  'clean-record': () => sh(
    rect(26, 16, 76, 98, 'url(#b-wood)', 6, 2.4) + rect(32, 26, 64, 82, 'url(#b-paper)', 2, 1.8)
    + rect(48, 10, 32, 14, 'url(#b-silver)', 4, 2.2)
    + text(64, 40, 8, '#6a3b14', 'CRIMINAL RECORD')
    + line('M40 52 H88 M40 62 H88 M40 72 H88', '#d9cbab', 1.6)
    + circ(64, 88, 14, 'url(#b-green)', 2.2) + line('M57 88 L62 93 L72 82', '#fff', 3.2)),
  'nothing-on-paper': () => sh(
    at('rotate(-6 56 64)', rect(18, 16, 72, 96, 'url(#b-paper)', 2, 2.4) + line('M28 32 H70 M28 44 H78 M28 56 H62', '#d9cbab', 2) + line('M28 68 H76 M28 80 H72 M28 92 H58', '#efe4cc', 2)
      + gloss('M22 20 H40 L22 40Z', 0.5))
    + at('rotate(-30 92 72)', rect(68, 60, 50, 22, 'url(#b-pink)', 4, 2.2) + rect(68, 60, 14, 22, 'url(#b-blue)', 3, 2.2) + gloss('M84 63 H112 V66 H84Z', 0.45))
    + circ(48, 98, 2, '#efb3cf', 0.8) + circ(56, 104, 1.6, '#efb3cf', 0.8)),
  'off-the-books': () => sh(
    rect(22, 18, 82, 96, 'url(#b-black)', 4, 2.4) + rect(16, 18, 14, 96, 'url(#b-leather)', 4, 2.4)
    + rect(34, 30, 60, 20, 'url(#b-paper)', 2, 1.6) + text(64, 44, 10, '#14161a', 'LEDGER')
    + line('M104 52 H112 V82 H104', K, 6) + line('M104 52 H112 V82 H104', '#c9853f', 3)
    + p('M54 70 C54 58 74 58 74 70', 'none', 7) + line('M54 70 C54 58 74 58 74 70', '#9ba5b2', 4)
    + rect(48, 70, 32, 28, 'url(#b-gold)', 4, 2.2) + circ(64, 81, 3.4, K, 0) + rect(62.5, 82, 3, 9, K, 1, 0)
    + gloss('M26 22 H34 V110 H26Z', 0.15)),
  'ledger-cool-head': () => sh(
    p('M26 50 L60 34 L102 46 L104 92 L68 110 L26 96 Z', 'url(#b-ice)', 2.4)
    + line('M26 50 L66 64 L102 46 M66 64 L68 110', '#6cc3e6', 2)
    + gloss('M32 54 L60 64 V100 L32 92Z', 0.35) + gloss('M40 48 L60 40 L88 48 L66 56Z', 0.55))
    + sh(at('translate(64 30)', p('M-38 -6 H-4 C-4 8 -10 14 -22 14 C-34 14 -38 8 -38 -6Z M4 -6 H38 C38 8 34 14 22 14 C10 14 4 8 4 -6Z', 'url(#b-black)', 2.2) + line('M-4 -4 C0 -8 0 -8 4 -4 M-38 -6 H38', K, 2.4)
      + gloss('M-34 -3 H-20 L-28 8Z', 0.4) + gloss('M8 -3 H22 L14 8Z', 0.4)))
    + sparkle(110, 34, 6) + sparkle(18, 76, 5),
  'ledger-lawyered-up': () => sh(
    rect(14, 52, 100, 60, 'url(#b-leather)', 6, 2.4) + rect(46, 38, 36, 16, 'none', 5, 3.4)
    + line('M14 70 H114', '#2a1a10', 2) + rect(30, 64, 10, 12, 'url(#b-gold)', 1, 1.4) + rect(88, 64, 10, 12, 'url(#b-gold)', 1, 1.4)
    + gloss('M18 56 H34 V108 H18Z', 0.15))
    + sh(at('translate(64 18)', line('M-26 6 H26 M0 6 V-8', K, 4) + line('M-26 6 H26 M0 6 V-8', '#f6d061', 2.2) + circ(0, -10, 3.2, 'url(#b-gold)', 1.4)
      + line('M-24 6 L-30 22 M-24 6 L-18 22 M24 6 L18 22 M24 6 L30 22', '#8a5a0a', 1.2)
      + p('M-34 22 H-14 C-16 30 -32 30 -34 22Z M14 22 H34 C32 30 16 30 14 22Z', 'url(#b-gold)', 1.8))),
  'ledger-clean-hands': () => sh(
    p('M22 64 C22 50 32 46 64 46 C96 46 106 50 106 64 V86 C106 100 96 104 64 104 C32 104 22 100 22 86 Z', 'url(#b-pink)', 2.4)
    + p('M30 58 C30 54 40 52 64 52 C88 52 98 54 98 58 C98 64 88 66 64 66 C40 66 30 64 30 58Z', '#ffd0e6', 1.6)
    + text(64, 90, 13, '#a31d5d', 'SOAP')
    + gloss('M28 70 C28 64 32 62 36 62 V96 C30 94 28 90 28 86Z', 0.45))
    + sh(circ(36, 34, 12, 'url(#b-glass)', 1.8, 'fill-opacity=".85"') + circ(62, 24, 9, 'url(#b-glass)', 1.6, 'fill-opacity=".85"') + circ(88, 32, 14, 'url(#b-glass)', 1.8, 'fill-opacity=".85"') + circ(108, 52, 7, 'url(#b-glass)', 1.4, 'fill-opacity=".85"'))
    + gloss('M30 30 A6 6 0 0 1 36 26 L36 28 A4 4 0 0 0 32 32Z', 0.9) + gloss('M80 28 A8 8 0 0 1 88 22 L88 25 A5 5 0 0 0 83 30Z', 0.9),
  'ledger-teflon': () => sh(
    circ(50, 64, 40, 'url(#b-black)', 2.4) + circ(50, 64, 31, '#2a2f36', 1.8)
    + at('rotate(-28 50 64)', rect(88, 58, 36, 12, 'url(#b-black)', 6, 2.2) + circ(116, 64, 2.6, '#5d6672', 1))
    + gloss('M24 50 C30 38 40 32 50 32 C40 38 32 44 28 54Z', 0.25))
    + sh(at('translate(44 66)', p('M-12 -16 C-6 -24 6 -24 10 -16 C16 -8 16 8 8 14 C0 20 -12 18 -16 8 C-20 -2 -18 -10 -12 -16Z', '#fff', 2) + circ(-2, -2, 7, '#ffc531', 1.6))
      + [[96, 30, 30], [102, 46, 10], [14, 30, -30]].map(([x, y, r]) => at(`translate(${x} ${y}) rotate(${r})`, p('M0 -6 C3 -2 3 2 0 6 C-3 2 -3 -2 0 -6Z', 'url(#b-silver)', 1.2))).join('')),
  'ledger-case-closed': () => sh(
    p('M14 46 L24 30 H104 L114 46 Z', '#c9a46a', 2.4)
    + rect(14, 46, 100, 66, '#d9b47a', 3, 2.4)
    + rect(50, 58, 28, 12, '#efe2c4', 2, 1.6) + rect(54, 76, 20, 6, '#6a3b14', 2, 1.4)
    + gloss('M18 50 H28 V108 H18Z', 0.25))
    + sh(at('rotate(-14 64 88)', rect(24, 78, 80, 24, 'none', 4, 4.4) + rect(24, 78, 80, 24, 'none', 4, 2.4, 'stroke="#c0392b"') + text(64, 96, 15, '#c0392b', 'CLOSED'))),

  // Casino story-arc titles.
  'ace-floor-walker': () => sh(
    rect(38, 34, 52, 82, 'url(#b-black)', 10, 2.4) + rect(46, 10, 8, 30, 'url(#b-black)', 3, 2.2)
    + rect(46, 44, 36, 24, '#132233', 3, 1.8) + line('M50 52 H78 M50 58 H72', '#5fe0ff', 2)
    + [[54, 80], [64, 80], [74, 80], [54, 90], [64, 90], [74, 90], [54, 100], [64, 100], [74, 100]].map(([x, y]) => circ(x, y, 3, 'url(#b-steel)', 1.2)).join('')
    + circ(80, 38, 3, 'url(#b-red)', 1.2)
    + gloss('M42 38 H48 V110 H42Z', 0.18))
    + line('M62 18 C66 14 72 14 76 18 M60 10 C66 4 76 4 82 10', '#f6d061', 2.4)
    + sh(chip(100, 96, 14, 'url(#b-purple)')),
  'ace-natural': () => sh(card(48, 64, -12, 'A', 'spade') + card(80, 66, 12, 'K', 'heart', '#c0392b'))
    + sh(rect(36, 100, 56, 16, 'url(#b-black)', 4, 2) + text(64, 112, 11, '#f6d061', '21')),
  'ace-road-gambler': () => sh(
    line('M64 6 V28 M64 28 L44 46 M64 28 L84 46', '#f2efe6', 2.6)
    + die(44, 66, 1.4, 5, 'url(#b-pink)', '#fff', -16) + die(86, 76, 1.4, 6, 'url(#b-pink)', '#fff', 18)
    + `<g fill="none" stroke="#ffd0e6" stroke-width="1.4" stroke-linecap="round">${[[24, 50], [30, 88], [70, 52], [106, 60], [104, 98], [64, 98]].map(([x, y]) => `<path d="M${x - 3} ${y} l3 -3 l3 3"/>`).join('')}</g>`),
  'ace-velvet-rope': () => sh(
    p('M12 70 C12 56 116 56 116 70 C116 84 12 84 12 70Z', 'none', 0)
    + p('M14 58 Q64 48 114 58 L114 80 Q64 70 14 80 Z', 'url(#b-velvet)', 2.4)
    + p('M40 52 H88 L86 82 H42 Z', 'url(#b-gold)', 2.2) + text(64, 74, 15, '#56061b', 'VIP')
    + line('M18 64 Q64 54 110 64', '#ff7b8f', 1.4, 'stroke-dasharray="3 3"')
    + gloss('M44 56 H56 L54 62 H44Z', 0.5))
    + sparkle(100, 36, 7) + sparkle(26, 98, 5),
  'ace-black-room': () => sh(
    at('rotate(-10 64 64)', rect(14, 30, 100, 64, 'url(#b-black)', 8, 2.4)
      + rect(26, 46, 18, 14, 'url(#b-gold)', 3, 1.6) + line('M26 53 H44 M35 46 V60', '#8a5a0a', 1)
      + text(78, 84, 9, '#c9d1db', '•••• 0001')
      + at('translate(92 52) scale(1.2)', '<path d="M0 -9 C5 -3 11 0 9 6 C7 10 2 9 1 6 L3 11 H-3 L-1 6 C-2 9 -7 10 -9 6 C-11 0 -5 -3 0 -9Z" fill="#f6d061"/>')
      + gloss('M18 34 H70 L60 40 H18Z', 0.12)))
    + sparkle(108, 22, 6),

  // Faction alignment shown on the profile.
  'faction-kings': () => BADGES['kings-friend'](),
  'faction-outfit': () => BADGES['outfit-associate'](),
  'faction-road-saints': () => BADGES['saints-prospect'](),
  'faction-cartel-line': () => BADGES['cartel-partner'](),
  'faction-civic-handshake': () => BADGES['civic-contributor'](),
};

// ---------------------------------------------------------------------------

function render(key) {
  inlineCount = 0;
  const body = BADGES[key]();
  const used = Object.keys(PAINT).filter((id) => body.includes(`url(#${id})`));
  const title = key.replace(/-/g, ' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${title} badge">\n`
    + `<defs>${used.map((id) => PAINT[id]).join('')}</defs>\n${body}\n</svg>\n`;
}

mkdirSync(outputDir, { recursive: true });
const keys = Object.keys(BADGES).filter((key) => !filters.length || filters.some((f) => key.includes(f)));
if (!keys.length) {
  console.error('No badges matched.');
  process.exit(1);
}
for (const key of keys) writeFileSync(path.join(outputDir, `${key}.svg`), render(key));
console.log(`Wrote ${keys.length} badge${keys.length === 1 ? '' : 's'} to ${path.relative(root, outputDir)}`);
