#!/usr/bin/env node
/**
 * The Drop launch art (docs/THE-DROP.md): vehicle, weapon and crew looks.
 *
 * Each look keeps the Classic item's silhouette so it lines up with every other
 * collection on the same grid, then gets its own paint, glass, metal or
 * clothes, plus details drawn only for The Drop (Kingpin Luxe brass pinstripes,
 * turned wheels and tailoring; Neon Underworld underglow, edge light and
 * piping; Winter Heist snow, frost, tyre chains and winter layers). Crew
 * outfits keep the Classic face and build.
 *
 *   node scripts/art/generate-drop-art.mjs
 *
 * Output is plain SVG in apps/web/public/items/cosmetics/drop/, so no render
 * step is needed. Re-run after changing a recipe; commit the output.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const classicDir = path.join(root, 'apps/web/public/items');
const outDir = path.join(root, 'apps/web/public/items/cosmetics/drop');

/** Replace a gradient's stops with evenly spaced new ones. A stop is a colour or [colour, opacity]. */
function restop(svg, id, stops) {
  const pattern = new RegExp(`<(linearGradient|radialGradient) id="${id}"([^>]*)>[\\s\\S]*?</\\1>`);
  if (!pattern.test(svg)) throw new Error(`no gradient ${id}`);
  return svg.replace(pattern, (_match, tag, attrs) => {
    const body = stops.map((stop, index) => {
      const [color, opacity] = Array.isArray(stop) ? stop : [stop, undefined];
      const offset = stops.length === 1 ? 0 : +(index / (stops.length - 1)).toFixed(3);
      return `<stop offset="${offset}" stop-color="${color}"${opacity === undefined ? '' : ` stop-opacity="${opacity}"`}/>`;
    }).join('');
    return `<${tag} id="${id}"${attrs}>${body}</${tag}>`;
  });
}

/** Swap exact flat colours (fill, stroke, stop-color attributes). */
function recolor(svg, map) {
  let out = svg;
  for (const [from, to] of Object.entries(map)) {
    out = out.replace(new RegExp(`(fill|stroke|stop-color|flood-color)="${from}"`, 'gi'), `$1="${to}"`);
  }
  return out;
}

/** Add defs and draw extra layers inside the item's main group (same coordinates as the art). */
function decorate(svg, { defs = '', under = '', over = '' }) {
  let out = svg.replace('</defs>', `${defs}</defs>`);
  if (under) {
    // Just after the ground shadow, before the body.
    out = out.replace(/(<ellipse [^>]*opacity="\.45"\/>)/, `$1\n    ${under}`);
  }
  if (over) {
    const close = out.lastIndexOf('</g>');
    const svgClose = out.lastIndexOf('</svg>');
    // Vehicles wrap everything in a translate group; weapons end with loose paths.
    const target = out.slice(close, svgClose).trim() === '</g>' ? close : svgClose;
    out = `${out.slice(0, target)}  ${over}\n${out.slice(target)}`;
  }
  return out;
}

const BRASS = '#d6a35c';
const VIOLET = '#b46bff';
const TEAL = '#39e6d6';
const FROST = '#e8f4fb';

const recipes = {
  'sedan-kingpin-luxe': async () => {
    let svg = await readFile(path.join(classicDir, 'sedan.svg'), 'utf8');
    svg = restop(svg, 'paint', ['#55555f', '#1c1c23', '#0d0d12', '#040406']);
    svg = restop(svg, 'glass', ['#454956', '#12141a', '#07080b']);
    svg = restop(svg, 'rim', ['#fff3d2', BRASS, '#6b4a1e']);
    svg = recolor(svg, { '#5e4e35': '#000000', '#5a4a32': '#2b2a31', '#6e5c3e': '#2b2a31', '#c2ad85': BRASS, '#9aa2ab': '#b88a46' });
    return decorate(svg, {
      over: [
        // Brass pinstripe twinned along the belt line, and a fine lower stripe.
        `<path d="M24 75.6 Q130 72.1 238 74.6" stroke="${BRASS}" stroke-width="1.15" fill="none"/>`,
        `<path d="M26 77.4 Q130 73.9 236 76.4" stroke="#8a6630" stroke-width=".55" fill="none"/>`,
        `<path d="M14 88.5 Q30 89.3 46 88.8 M86 88.6 H172 M212 88.6 Q230 88.8 246 87.6" stroke="${BRASS}" stroke-opacity=".75" stroke-width=".8" fill="none"/>`,
        // Window surround in brass.
        `<path d="M73 58.5 C88 46.5 106 40.5 129 40.5 C149 40.5 163 45 179 58" stroke="${BRASS}" stroke-width=".9" fill="none"/>`,
        // Hood crest.
        `<path d="M231 66.2 l2.2 -2.6 l2.2 2.6 l-2.2 2.6 Z" fill="${BRASS}" stroke="#4a3312" stroke-width=".5"/>`,
        // Turned-metal wheel rings.
        ...[[192, 94], [66, 94]].map(([x, y]) => `<g transform="translate(${x} ${y})" fill="none"><circle r="11.6" stroke="${BRASS}" stroke-width="1.3"/><circle r="8.4" stroke="#b88a46" stroke-width=".6"/><circle r="6.2" stroke="#e9c98e" stroke-opacity=".7" stroke-width=".5"/></g>`),
        // Lacquer gloss sweep.
        `<path d="M70 52 C92 40 116 37 132 37" stroke="#ffffff" stroke-opacity=".35" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
      ].join('\n    '),
    });
  },

  'low-rider-neon-underworld': async () => {
    let svg = await readFile(path.join(classicDir, 'low-rider.svg'), 'utf8');
    const gunmetal = ['#6a7389', '#363d50', '#1d2230', '#0d1018'];
    svg = restop(svg, 'paint', gunmetal);
    svg = restop(svg, 'roof', ['#2a3042', '#121521']);
    svg = restop(svg, 'door', ['#3c4458', '#1d2230']);
    svg = restop(svg, 'primer', [['#262b3a', 0], ['#262b3a', 0]]);
    svg = restop(svg, 'glass', ['#3a2d5c', '#141127', '#08070f']);
    svg = recolor(svg, { '#e02a3a': VIOLET, '#e0b3a0': TEAL, '#e7c3a8': TEAL, '#16384a': VIOLET, '#2a1512': '#0b0d14', '#1e0f0c': '#0b0d14', '#3a1f1a': '#4c5570', '#c2222e': '#ff3d9a' });
    return decorate(svg, {
      defs: `<filter id="glow" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="3.2"/></filter>`
        + `<linearGradient id="under" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${VIOLET}" stop-opacity="0"/><stop offset=".2" stop-color="${VIOLET}"/><stop offset=".8" stop-color="${TEAL}"/><stop offset="1" stop-color="${TEAL}" stop-opacity="0"/></linearGradient>`,
      under: `<ellipse cx="136" cy="102" rx="112" ry="5.5" fill="url(#under)" opacity=".85" filter="url(#glow)"/>`,
      over: [
        `<path d="M14 73.2 L244 76.2" stroke="${TEAL}" stroke-width="1" stroke-opacity=".9" fill="none"/>`,
        `<path d="M76 61.6 C85 54.5 93 48 102 47 L152 47 C158 48 165 56 171 63" stroke="${VIOLET}" stroke-width="1" fill="none"/>`,
        `<path d="M96 93.5 L194 92.7" stroke="${VIOLET}" stroke-width="1.4" stroke-opacity=".9" fill="none"/>`,
        // Neon edge chevrons on the rear quarter.
        `<path d="M186 80 l6 -4 l6 4 M190 86 l6 -4 l6 4" stroke="${TEAL}" stroke-width="1" fill="none" stroke-linecap="round"/>`,
        `<path d="M110 59 L120 51" stroke="${TEAL}" stroke-opacity=".35" stroke-width="2.2"/>`,
      ].join('\n    '),
    });
  },

  'van-winter-heist': async () => {
    let svg = await readFile(path.join(classicDir, 'van.svg'), 'utf8');
    svg = restop(svg, 'paint', ['#ffffff', '#e6f0f6', '#bccdd9', '#7e94a5']);
    svg = restop(svg, 'trim', ['#5a6a78', '#26313b']);
    svg = restop(svg, 'glass', ['#e1eef6', '#8aa3b5', '#4b6072']);
    svg = restop(svg, 'decal', ['#2a4a6b', '#152a40']);
    svg = restop(svg, 'rust', [['#ffffff', 1], ['#f4fbff', 0.85], ['#f4fbff', 0]]);
    svg = restop(svg, 'steel', ['#dfe9f0', '#8fa3b2', '#4a5a67']);
    svg = recolor(svg, { '#b8bcba': '#9fd2f0', '#2a2d30': '#51626f' });
    return decorate(svg, {
      over: [
        // Snow loaded on the roof and the bonnet.
        `<path d="M11 30 Q12 22.5 20 23 Q34 19.5 50 22.5 Q66 18.8 86 22 Q104 18.5 124 22 Q144 18.8 162 22.3 Q178 19.6 189 25.5 L191 30 Q100 27.5 11 30 Z" fill="#ffffff" stroke="#b7ccdb" stroke-width=".8"/>`,
        `<path d="M214 58.5 Q222 55.4 231 58.4 Q238 59.4 240 63.6 L214 60 Z" fill="#ffffff" stroke="#b7ccdb" stroke-width=".6"/>`,
        // Icicles along the roof edge.
        `<path d="M30 29.6 l1.4 5 l1.4 -5 M58 29.6 l1.2 4 l1.2 -4 M118 29.4 l1.5 5.6 l1.5 -5.6 M150 29.4 l1.1 3.6 l1.1 -3.6" fill="#f4fbff" stroke="#b7ccdb" stroke-width=".5"/>`,
        // Snowflake crest on the panel.
        `<g transform="translate(71 58)" stroke="#dff2ff" stroke-width="1.3" stroke-linecap="round" fill="none"><path d="M0 -8 V8 M-7 -4 L7 4 M-7 4 L7 -4"/><path d="M-2 -6 L0 -8 L2 -6 M-2 6 L0 8 L2 6"/></g>`,
        `<text x="84" y="61.5" font-family="Arial, sans-serif" font-size="6.5" font-weight="700" letter-spacing=".8" fill="#dff2ff">COLD</text>`,
        // Frost on the glass.
        `<path d="M173 35 Q180 40 176 50 Q183 46 188 52 Q186 44 190 39" stroke="#ffffff" stroke-opacity=".7" stroke-width=".8" fill="none"/>`,
        // Tyre chains.
        ...[[203, 95], [67, 95]].map(([x, y]) => `<g transform="translate(${x} ${y})" stroke="#d9e3ea" stroke-width="1.15" fill="none" stroke-linecap="round"><path d="M-13 -5 L13 5 M-13 5 L13 -5 M-5 -13 L5 13 M5 -13 L-5 13"/><circle r="13.2" stroke-dasharray="2 1.6"/></g>`),
      ].join('\n    '),
    });
  },

  'tek9-neon-underworld': async () => {
    let svg = await readFile(path.join(classicDir, 'tek9.svg'), 'utf8');
    svg = restop(svg, 'steel', ['#6c7590', '#363d50', '#161a24']);
    svg = restop(svg, 'shroud', ['#4c5570', '#1d2230', '#0d1018']);
    svg = restop(svg, 'poly', ['#2a2f3f', '#11141c']);
    svg = recolor(svg, { '#26292e': '#1a1e2a', '#44484f': '#2e3446', '#2f3237': '#363d50' });
    return decorate(svg, {
      over: [
        `<path d="M60 62.6 H160" stroke="${VIOLET}" stroke-width="1.3"/>`,
        `<path d="M160 61 H220" stroke="${TEAL}" stroke-width="1.1"/>`,
        `<path d="M78 68 L96 68 M132 68 L150 68" stroke="${TEAL}" stroke-opacity=".8" stroke-width=".9"/>`,
        `<path d="M66 50 l4 3 l-4 3 M74 50 l4 3 l-4 3" stroke="${VIOLET}" stroke-width="1" fill="none" stroke-linecap="round"/>`,
      ].join('\n  '),
    });
  },

  'shotgun-winter-heist': async () => {
    let svg = await readFile(path.join(classicDir, 'shotgun.svg'), 'utf8');
    svg = restop(svg, 'barrel', ['#f2f8fc', '#a9bccb', '#5b6d7c']);
    svg = restop(svg, 'steel', ['#dce7ef', '#8ea2b2', '#46566a']);
    svg = restop(svg, 'wood', ['#ffffff', '#e2ebf1', '#b4c4d0']);
    svg = recolor(svg, { '#3a1d08': '#8ea2b2', '#e6a868': '#ffffff', '#d9c07a': '#bfe6ff', '#141416': '#2c3a46', '#3d4148': '#5b6d7c' });
    return decorate(svg, {
      over: [
        // Wrap bands on the stock and grip.
        `<path d="M24 54 L30 84 M36 53 L42 80 M48 52 L54 76 M60 51 L66 72 M72 50 L76 69" stroke="#9fb3c2" stroke-width="1.4" stroke-linecap="round"/>`,
        // Frost speckles along the barrel.
        `<g fill="#ffffff" opacity=".85"><circle cx="136" cy="49" r=".9"/><circle cx="158" cy="51" r=".7"/><circle cx="181" cy="48.5" r="1"/><circle cx="204" cy="50.5" r=".7"/><circle cx="229" cy="48.6" r=".9"/><circle cx="214" cy="59" r=".7"/></g>`,
        `<path d="M122 45.6 Q150 43.6 176 45.4 Q200 43.4 246 45.2" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
      ].join('\n  '),
    });
  },
};

/** Replace a pattern's tiles. */
function repattern(svg, id, inner) {
  const pattern = new RegExp(`(<pattern id="${id}"[^>]*>)[\\s\\S]*?(</pattern>)`);
  if (!pattern.test(svg)) throw new Error(`no pattern ${id}`);
  return svg.replace(pattern, (_match, open, close) => `${open}${inner}${close}`);
}

/** Crew outfits: the Classic face and build, new clothes. */
Object.assign(recipes, {
  'thug-kingpin-luxe': async () => {
    let svg = await readFile(path.join(classicDir, 'thug.svg'), 'utf8');
    // Black wool overcoat with a faint herringbone.
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#121216"/><path d="M0 14 L7 0 L14 14" stroke="#24242c" stroke-width="1.2" fill="none"/><path d="M0 7 L3.5 0 M10.5 14 L14 7" stroke="#1a1a20" stroke-width=".8" fill="none"/>');
    svg = restop(svg, 'tank', ['#ffffff', '#d9dde3']);
    svg = restop(svg, 'band', ['#25252d', '#08080b']);
    svg = restop(svg, 'lens', ['#3a3426', '#0b0a08', '#2a2418']);
    svg = recolor(svg, { '#e9fff0': BRASS, '#b5f5c5': '#e9c98e', '#6ee095': BRASS });
    return decorate(svg, {
      over: [
        // Wide peaked lapels and brass double-breasted buttons.
        '<path d="M50 86 L58 104 L46 126 M78 86 L70 104 L82 126" stroke="#000" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
        '<path d="M51 88 L57 103 M77 88 L71 103" stroke="#3a3a46" stroke-width=".9" fill="none"/>',
        `<g fill="${BRASS}" stroke="#4a3312" stroke-width=".5"><circle cx="40" cy="108" r="1.8"/><circle cx="40" cy="118" r="1.8"/><circle cx="88" cy="108" r="1.8"/><circle cx="88" cy="118" r="1.8"/></g>`,
        // Black silk tie over the white shirt.
        '<path d="M61.5 90 H66.5 L67.5 94 L65 120 L64 122 L63 120 L60.5 94 Z" fill="#0b0b0f" stroke="#000" stroke-width=".8"/>',
        // Low-brim fedora with a brass band, over the do-rag silhouette.
        '<path d="M36 47 Q64 40 92 47 Q90 51 64 49 Q38 51 36 47 Z" fill="#141419" stroke="#000" stroke-width="1.3"/>',
        '<path d="M45 46 Q44 30 64 27 Q84 30 83 46 Q64 42 45 46 Z" fill="#1c1c23" stroke="#000" stroke-width="1.3"/>',
        `<path d="M45.5 43.5 Q64 39.6 82.5 43.5" stroke="${BRASS}" stroke-width="2.2" fill="none"/>`,
        '<path d="M57 30 Q64 33 71 30" stroke="#3a3a46" stroke-width="1" fill="none"/>',
        // Brass rims on the shades.
        `<path d="M45 52 H83 Q84 59 77 60 H69 L64 56 L59 60 H51 Q44 59 45 52 Z" fill="none" stroke="${BRASS}" stroke-width=".7"/>`,
      ].join('\n  '),
    });
  },

  'thug-neon-underworld': async () => {
    let svg = await readFile(path.join(classicDir, 'thug.svg'), 'utf8');
    // Steel-grey bomber, smooth nylon with a faint rib.
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#3b4255"/><path d="M0 4 H14 M0 11 H14" stroke="#2c3242" stroke-width="1.2"/>');
    svg = restop(svg, 'tank', ['#20242f', '#0d1018']);
    svg = restop(svg, 'band', ['#1b1f2a', '#08090d']);
    svg = restop(svg, 'lens', [TEAL, '#0d4a52', '#2fd0c4']);
    svg = recolor(svg, { '#e9fff0': VIOLET, '#b5f5c5': VIOLET, '#6ee095': '#ffffff' });
    return decorate(svg, {
      over: [
        // Violet piping down the zip and along the raglan seams.
        `<path d="M50 86 L46 126 M78 86 L82 126" stroke="${VIOLET}" stroke-width="1.3" fill="none"/>`,
        `<path d="M14 112 Q22 98 34 93 M114 112 Q106 98 94 93" stroke="${VIOLET}" stroke-width="1" fill="none" stroke-opacity=".85"/>`,
        // Reflective ribbed hem.
        `<path d="M11 121 H46 M82 121 H117" stroke="${TEAL}" stroke-width="2.2"/>`,
        '<path d="M11 124 H46 M82 124 H117" stroke="#1b1f2a" stroke-width="1"/>',
        // Visor glow.
        '<path d="M47 54.5 H81" stroke="#ffffff" stroke-opacity=".75" stroke-width="1" stroke-linecap="round"/>',
        `<path d="M44 51.5 H84" stroke="${TEAL}" stroke-opacity=".35" stroke-width="4" stroke-linecap="round"/>`,
        // A neon tag on the tee.
        `<path d="M58 106 l6 -5 l6 5 l-6 5 Z" fill="none" stroke="${VIOLET}" stroke-width="1.1"/>`,
      ].join('\n  '),
    });
  },

  'thug-winter-heist': async () => {
    let svg = await readFile(path.join(classicDir, 'thug.svg'), 'utf8');
    // Quilted ice-white parka.
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#dfeaf2"/><path d="M0 0.6 H14 M0 7.6 H14" stroke="#9fb3c2" stroke-width="1.1"/><path d="M0 3.5 H14 M0 10.5 H14" stroke="#ffffff" stroke-width="1.2" opacity=".8"/>');
    svg = restop(svg, 'tank', ['#2a4a6b', '#152a40']);
    svg = restop(svg, 'band', ['#2a4a6b', '#152a40']);
    svg = restop(svg, 'lens', ['#c9e4f5', '#5f7f96', '#a9cfe6']);
    svg = recolor(svg, { '#e9fff0': '#ffffff', '#b5f5c5': '#ffffff', '#6ee095': '#ffffff' });
    return decorate(svg, {
      over: [
        // Knit cap ribbing and a pompom.
        '<path d="M46 47 Q64 40 82 47 L82 51 Q64 45 46 51 Z" fill="#1d3b57" stroke="#0b1724" stroke-width="1.1"/>',
        '<path d="M50 45.6 V50 M55 44.5 V48.9 M60 43.9 V48.2 M65 43.8 V48.1 M70 44.1 V48.5 M75 44.9 V49.3" stroke="#3d6489" stroke-width="1"/>',
        '<circle cx="64" cy="26" r="5" fill="#ffffff" stroke="#9fb3c2" stroke-width="1"/>',
        // Fur-trimmed hood ring behind the shoulders.
        '<path d="M30 94 Q40 84 50 86 M98 94 Q88 84 78 86" stroke="#f4ead8" stroke-width="5" stroke-linecap="round" fill="none"/>',
        // Scarf.
        '<path d="M52 86 Q64 94 76 86 L76 92 Q64 100 52 92 Z" fill="#b03a48" stroke="#4a0f17" stroke-width="1"/>',
        '<path d="M70 92 L74 112 L68 112 L66 94 Z" fill="#b03a48" stroke="#4a0f17" stroke-width="1"/>',
        '<path d="M68.5 108 H74 M68.2 110.5 H74.2" stroke="#f4ead8" stroke-width=".9"/>',
        // Falling snow.
        '<g fill="#ffffff"><circle cx="16" cy="40" r="1.4"/><circle cx="26" cy="22" r="1"/><circle cx="104" cy="30" r="1.3"/><circle cx="114" cy="58" r="1"/><circle cx="20" cy="70" r="1"/><circle cx="108" cy="80" r="1.2"/></g>',
      ].join('\n  '),
    });
  },

  'hoe-kingpin-luxe': async () => {
    let svg = await readFile(path.join(classicDir, 'hoe.svg'), 'utf8');
    // The red fur becomes a smooth black satin wrap.
    svg = restop(svg, 'fur', ['#4a4a55', '#16161c', '#050507']);
    svg = repattern(svg, 'tufts', `<path d="M0 7 L7 0" stroke="${BRASS}" stroke-width=".35" opacity=".35"/>`);
    svg = svg.replace(/ filter="url\(#fuzz\)"/g, '');
    svg = recolor(svg, { '#5a060c': '#000000', '#17131a': '#0a0a0e', '#3d3346': '#2a2a33' });
    return decorate(svg, {
      over: [
        // Satin sheen down the gown.
        '<path d="M56 100 Q60 116 58 136 M70 100 Q67 118 70 136" stroke="#5a5a68" stroke-width="1.2" fill="none" stroke-opacity=".8"/>',
        // Brass chain straps.
        '<path d="M49.5 95 L54.5 83 M78.5 95 L73.5 83" stroke="#4a3312" stroke-width="2.4" stroke-linecap="round"/>',
        `<path d="M49.5 95 L54.5 83 M78.5 95 L73.5 83" stroke="${BRASS}" stroke-width="1.5" stroke-dasharray="1.3 .7" stroke-linecap="round"/>`,
        // Lacquer clutch with a brass clasp.
        '<rect x="88" y="112" width="22" height="13" rx="2.5" fill="#0d0d12" stroke="#000" stroke-width="1.1"/>',
        `<path d="M88 117 H110" stroke="${BRASS}" stroke-width="1"/><rect x="97" y="115.2" width="4" height="3.6" rx=".8" fill="${BRASS}" stroke="#4a3312" stroke-width=".5"/>`,
        '<path d="M90 114 H101" stroke="#ffffff" stroke-opacity=".35" stroke-width=".8"/>',
      ].join('\n  '),
    });
  },

  'hoe-neon-underworld': async () => {
    let svg = await readFile(path.join(classicDir, 'hoe.svg'), 'utf8');
    // The red fur becomes a smooth gunmetal vinyl jacket over a violet-black dress.
    svg = restop(svg, 'fur', ['#6a7389', '#2f3546', '#11141c']);
    svg = repattern(svg, 'tufts', `<path d="M0 7 L7 0" stroke="${VIOLET}" stroke-width=".4" opacity=".4"/>`);
    svg = svg.replace(/ filter="url\(#fuzz\)"/g, '');
    svg = restop(svg, 'gold', ['#f2f5fa', '#9aa3b5', '#4c5570']);
    svg = recolor(svg, { '#5a060c': '#0b0d14', '#17131a': '#1a0f2a', '#3d3346': VIOLET, '#5a4208': '#2e3446' });
    return decorate(svg, {
      over: [
        // Violet lining and teal edge light down the jacket fronts.
        `<path d="M47 86 Q55 90 56 103 L53 136 M81 86 Q73 90 72 103 L75 136" stroke="${VIOLET}" stroke-width="3" fill="none" stroke-linejoin="round"/>`,
        `<path d="M46 85 Q54 89.5 55 103 L52 136 M82 85 Q74 89.5 73 103 L76 136" stroke="${TEAL}" stroke-width="1" fill="none" stroke-linejoin="round"/>`,
        // Teal shoulder seams and a reflective cuff line.
        `<path d="M14 104 Q24 92 40 88 M114 104 Q104 92 88 88" stroke="${TEAL}" stroke-opacity=".75" stroke-width="1" fill="none"/>`,
        `<path d="M4 128 H30 M98 128 H124" stroke="${TEAL}" stroke-width="2"/>`,
        // Steel choker with a violet stud.
        '<path d="M57.4 80.6 Q64 84.2 70.6 80.6" stroke="#9aa3b5" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
        `<circle cx="64" cy="83" r="1.6" fill="${VIOLET}" stroke="#2e3446" stroke-width=".5"/>`,
      ].join('\n  '),
    });
  },

  'hoe-winter-heist': async () => {
    let svg = await readFile(path.join(classicDir, 'hoe.svg'), 'utf8');
    // Cream shearling coat over a navy knit.
    svg = restop(svg, 'fur', ['#fffaf0', '#e8dcc6', '#a99878']);
    svg = repattern(svg, 'tufts', '<path d="M1 6 q1-3 0-5 M4.5 6.5 q1.2-3 .2-5.5" stroke="#ffffff" stroke-width=".8" fill="none" opacity=".8"/><path d="M3 3 q.8-2 0-3" stroke="#b7a98f" stroke-width=".8" fill="none" opacity=".6"/>');
    svg = recolor(svg, { '#5a060c': '#8a7a66', '#17131a': '#1d3b57', '#3d3346': '#3d6489' });
    return decorate(svg, {
      over: [
        // Rolled turtleneck and knit ribbing.
        '<path d="M53 93 Q64 102 75 93 L75.5 98 Q64 107 52.5 98 Z" fill="#2a4a6b" stroke="#0b1724" stroke-width="1"/>',
        '<path d="M54 110 V136 M58 108 V136 M62 107 V136 M66 107 V136 M70 108 V136 M74 110 V136" stroke="#2a4a6b" stroke-width=".8" opacity=".9"/>',
        // Belt.
        '<path d="M30 120 H98" stroke="#5b4a35" stroke-width="4"/>',
        '<rect x="59" y="116.8" width="10" height="6.4" rx="1" fill="none" stroke="#d9e3ea" stroke-width="1.3"/>',
        // Falling snow and frost on the collar.
        '<g fill="#ffffff"><circle cx="12" cy="30" r="1.3"/><circle cx="22" cy="54" r="1"/><circle cx="110" cy="26" r="1.4"/><circle cx="118" cy="48" r="1"/><circle cx="8" cy="80" r="1.1"/><circle cx="120" cy="76" r="1"/></g>',
        '<path d="M22 92 l2 -2 M30 88 l2 -2 M98 88 l2 2 M106 92 l2 2" stroke="#dff2ff" stroke-width="1" stroke-linecap="round"/>',
      ].join('\n  '),
    });
  },
});


/* ---------- Twelve more collections ---------- */

/** Insert markup just before the first match of `needle` (a literal string). */
function before(svg, needle, markup) {
  const at = svg.indexOf(needle);
  if (at < 0) throw new Error(`no ${needle.slice(0, 40)}`);
  return `${svg.slice(0, at)}${markup}\n    ${svg.slice(at)}`;
}

/** Replace one literal element. */
function swap(svg, needle, markup) {
  if (!svg.includes(needle)) throw new Error(`no ${needle.slice(0, 40)}`);
  return svg.replace(needle, markup);
}

const load = (name) => readFile(path.join(classicDir, `${name}.svg`), 'utf8');

/** Rings drawn over each wheel (vehicle coordinates), e.g. whitewalls or coloured rims. */
const rings = (centres, ring) => centres.map(([x, y]) => `<g transform="translate(${x} ${y})" fill="none">${ring}</g>`).join('\n    ');
const SEDAN_WHEELS = [[192, 94], [66, 94]];
const LOW_RIDER_WHEELS = [[213, 91], [77, 91]];
const VAN_WHEELS = [[203, 95], [67, 95]];

/** Card suits, centred on 0 0, about 8 units tall. */
const SUIT = {
  heart: 'M0 3.6 C-5 0 -4.6 -4 -2.2 -4 C-1 -4 0 -3 0 -2 C0 -3 1 -4 2.2 -4 C4.6 -4 5 0 0 3.6 Z',
  diamond: 'M0 -4.2 L3.2 0 L0 4.2 L-3.2 0 Z',
  spade: 'M0 -4 C4.4 -.6 4.6 2.4 2.2 2.4 C1.2 2.4 .5 1.8 .3 1.2 L1.2 4 H-1.2 L-.3 1.2 C-.5 1.8 -1.2 2.4 -2.2 2.4 C-4.6 2.4 -4.4 -.6 0 -4 Z',
  club: 'M0 -4.2 A1.9 1.9 0 1 1 0 -.4 A1.9 1.9 0 1 1 -1.2 1.6 A1.9 1.9 0 1 1 -1.2 1.6 Z M-2.2 -.6 A1.9 1.9 0 1 0 -.4 1.6 M2.2 -.6 A1.9 1.9 0 1 1 .4 1.6 M-.5 1 L-1.2 4 H1.2 L.5 1 Z',
};
const suit = (kind, x, y, fill, scale = 1) => `<path transform="translate(${x} ${y}) scale(${scale})" d="${SUIT[kind]}" fill="${fill}"/>`;

/** A die face of `pips` (1-6) with its top-left at x y, `size` wide. */
function die(x, y, size, pips, body = '#f6f1e3', pip = '#141416') {
  const at = { 1: [[.5, .5]], 2: [[.25, .25], [.75, .75]], 3: [[.25, .25], [.5, .5], [.75, .75]], 4: [[.25, .25], [.75, .25], [.25, .75], [.75, .75]], 5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]], 6: [[.25, .22], [.75, .22], [.25, .5], [.75, .5], [.25, .78], [.75, .78]] }[pips];
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${size / 5}" fill="${body}" stroke="#000" stroke-width=".6"/>`
    + at.map(([u, v]) => `<circle cx="${(x + u * size).toFixed(2)}" cy="${(y + v * size).toFixed(2)}" r="${(size / 10).toFixed(2)}" fill="${pip}"/>`).join('');
}

/** The Hoe's coat as a smooth fabric: restop the fur, swap its tufts, drop the fuzz. */
function hoeCoat(svg, stops, tufts) {
  let out = restop(svg, 'fur', stops);
  out = repattern(out, 'tufts', tufts);
  return out.replace(/ filter="url\(#fuzz\)"/g, '');
}

const FLAMINGO = '#ff8fb1';
const SEAGLASS = '#4fd6c7';
const MERLOT = '#7a1f33';
const PEWTER = '#9aa0a6';
const CREAM = '#efe4cc';
const TANGERINE = '#ff8a2a';
const CHOCOLATE = '#4a2a17';
const PLATINUM = '#d9dee6';
const SIGNAL = '#ff3344';
const CARBON = '#1d1f23';
const MINT = '#36e2a0';
const SPRAY_PINK = '#ff5fa2';
const HAZARD = '#ffd400';
const NAVY = '#1d3350';
const SAFETY = '#ff7a2f';
const SAPPHIRE = '#3157d6';
const EMERALD = '#2fbf71';
const RUBY = '#e0263f';
const MOSS = '#4a6b3a';
const CYPRESS = '#6a4a30';
const FIREFLY = '#e8ff6a';
const SAND = '#e8cfa0';
const CANYON = '#c25a22';
const TURQUOISE = '#3fc1c9';
const MAGENTA = '#e04bff';
const LIME = '#c6ff3d';
const FELT = '#1f7a4a';
const IVORY = '#f1e6c8';

Object.assign(recipes, {
  /* Biscayne Sunset */
  'sedan-biscayne-sunset': async () => {
    let svg = await load('sedan');
    svg = restop(svg, 'paint', ['#ffffff', '#f4f1ea', '#dcd5c9', '#a89f92']);
    svg = restop(svg, 'glass', ['#c6f5ee', '#58b3ab', '#1f5652']);
    svg = recolor(svg, { '#5e4e35': '#2a7a73', '#5a4a32': '#7a7266', '#6e5c3e': '#c95680', '#c2ad85': '#ffffff', '#9aa2ab': '#e9ecef' });
    return decorate(svg, {
      over: [
        `<path d="M24 76.4 Q130 72.9 238 75.4" stroke="${FLAMINGO}" stroke-width="1.6" fill="none"/>`,
        `<path d="M24 79 Q130 75.5 238 78" stroke="${SEAGLASS}" stroke-width=".9" fill="none"/>`,
        // A sunset decal on the rear door: half a sun with deco bars.
        `<g transform="translate(150 88)"><path d="M-10 0 A10 10 0 0 1 10 0 Z" fill="${FLAMINGO}" stroke="#c95680" stroke-width=".6"/><path d="M-9.4 -2.4 H9.4 M-8 -5 H8 M-5.6 -7.6 H5.6" stroke="#ffffff" stroke-width="1"/></g>`,
        // Teal interior showing through the glass.
        `<path d="M94 56.6 H124 M134 56.6 H170" stroke="${SEAGLASS}" stroke-width="2" stroke-opacity=".8"/>`,
        // Whitewalls.
        rings(SEDAN_WHEELS, '<circle r="13" stroke="#fbfaf6" stroke-width="2.8"/><circle r="11.4" stroke="#c95680" stroke-width=".5"/>'),
        `<path d="M70 52 C92 40 116 37 132 37" stroke="#ffffff" stroke-opacity=".6" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
      ].join('\n    '),
    });
  },
  'thug-biscayne-sunset': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#f4f1ea"/><path d="M0 3.5 H14 M0 10.5 H14" stroke="#e2dccf" stroke-width=".7"/><path d="M3.5 0 V14 M10.5 0 V14" stroke="#ebe6dc" stroke-width=".6"/>');
    svg = restop(svg, 'tank', ['#ffd3e0', FLAMINGO]);
    svg = restop(svg, 'band', ['#2a1b12', '#120a06']);
    svg = restop(svg, 'lens', ['#c6f5ee', '#1f5652', SEAGLASS]);
    svg = recolor(svg, { '#e9fff0': '#ffffff', '#b5f5c5': '#ffffff', '#6ee095': '#ffffff' });
    return decorate(svg, {
      over: [
        // Soft linen lapels and pushed-up sleeves.
        '<path d="M50 86 L57 102 L47 126 M78 86 L71 102 L81 126" stroke="#cfc8bb" stroke-width="1.3" fill="none" stroke-linejoin="round"/>',
        '<path d="M12 116 Q22 113 30 116 M98 116 Q106 113 116 116" stroke="#dcd5c9" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
        // Straw panama with a flamingo band.
        '<path d="M34 47 Q64 39 94 47 Q92 51.5 64 49.5 Q36 51.5 34 47 Z" fill="#efe2bf" stroke="#8a7a52" stroke-width="1.2"/>',
        '<path d="M45 46 Q44 31 64 28 Q84 31 83 46 Q64 42 45 46 Z" fill="#f4e9cb" stroke="#8a7a52" stroke-width="1.2"/>',
        `<path d="M45.5 43.5 Q64 39.6 82.5 43.5" stroke="${FLAMINGO}" stroke-width="2.4" fill="none"/>`,
        '<path d="M50 36 Q64 32 78 36 M48 40 Q64 36 80 40" stroke="#d9c99e" stroke-width=".7" fill="none"/>',
      ].join('\n  '),
    });
  },
  'hoe-biscayne-sunset': async () => {
    let svg = await load('hoe');
    // A palm-print wrap over a sea-glass sequin dress.
    svg = hoeCoat(svg, ['#ffffff', '#f6f2ea', '#d6cdbd'], `<path d="M1 6 Q3 2 6 1 M3.5 4 L5.5 6.5" stroke="#3a9a6a" stroke-width=".7" fill="none"/><circle cx="5.6" cy="2.2" r=".9" fill="${FLAMINGO}"/>`);
    svg = recolor(svg, { '#5a060c': '#8a8273', '#17131a': '#1f9c92', '#3d3346': '#c6f5ee' });
    return decorate(svg, {
      over: [
        '<g fill="#c6f5ee" opacity=".8"><circle cx="54" cy="112" r=".8"/><circle cx="60" cy="118" r=".8"/><circle cx="68" cy="113" r=".8"/><circle cx="74" cy="121" r=".8"/><circle cx="56" cy="127" r=".8"/><circle cx="66" cy="130" r=".8"/><circle cx="72" cy="106" r=".8"/></g>',
        // Big white sunglasses with flamingo lenses.
        `<g stroke="#ffffff" stroke-width="1.6"><rect x="47.5" y="48" width="14" height="10" rx="4.5" fill="${FLAMINGO}" fill-opacity=".85"/><rect x="66.5" y="48" width="14" height="10" rx="4.5" fill="${FLAMINGO}" fill-opacity=".85"/><path d="M61.5 52 Q64 50.6 66.5 52" fill="none"/></g>`,
        '<path d="M50 50.5 L54 49.5 M69 50.5 L73 49.5" stroke="#ffffff" stroke-opacity=".8" stroke-width=".9" stroke-linecap="round"/>',
      ].join('\n  '),
    });
  },
  'pistol-biscayne-sunset': async () => {
    let svg = await load('pistol');
    svg = restop(svg, 'slide', ['#ffffff', '#ccd2d8', '#7d848c']);
    svg = restop(svg, 'frame', ['#4fd6c7', '#1f7f78']);
    svg = restop(svg, 'grip', ['#fffaf2', '#efe3d6', '#c9b6a6']);
    svg = recolor(svg, { '#2a2d32': '#c9ced4', '#1c1e22': '#1f7f78', '#15171a': '#5a6168' });
    return decorate(svg, {
      over: [
        '<path d="M36 64 Q44 61 52 64" stroke="#ffffff" stroke-opacity=".7" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
        `<ellipse cx="40" cy="84" rx="5" ry="7.5" fill="${FLAMINGO}" stroke="#c95680" stroke-width=".8"/>`,
        '<path d="M38.5 80 Q40 78 41.5 80" stroke="#ffffff" stroke-width=".7" fill="none"/>',
        `<path d="M22 49.5 H111" stroke="${FLAMINGO}" stroke-width="1.1"/>`,
      ].join('\n  '),
    });
  },

  /* Velvet Speakeasy */
  'sedan-velvet-speakeasy': async () => {
    let svg = await load('sedan');
    svg = restop(svg, 'paint', ['#b84a62', '#7a1f33', '#4a0f1e', '#22060d']);
    svg = restop(svg, 'glass', ['#3a2a2e', '#140c0e', '#070405']);
    svg = restop(svg, 'rim', ['#f4f5f6', PEWTER, '#4f555b']);
    svg = recolor(svg, { '#5e4e35': '#1a0509', '#5a4a32': '#3a0f1a', '#6e5c3e': '#3a0f1a', '#c2ad85': PEWTER, '#9aa2ab': PEWTER });
    return decorate(svg, {
      over: [
        // Running boards between the wheels.
        '<path d="M86 97.5 H172" stroke="#141416" stroke-width="4" stroke-linecap="round"/>',
        `<path d="M88 96.2 H170" stroke="${PEWTER}" stroke-width=".9"/>`,
        `<path d="M24 76.6 Q130 73.1 238 75.6" stroke="${PEWTER}" stroke-width="1.1" fill="none"/>`,
        `<path d="M73 58.5 C88 46.5 106 40.5 129 40.5 C149 40.5 163 45 179 58" stroke="${CREAM}" stroke-opacity=".7" stroke-width=".8" fill="none"/>`,
        // Cream whitewalls and a pewter hood ornament.
        rings(SEDAN_WHEELS, `<circle r="13" stroke="${CREAM}" stroke-width="3"/><circle r="11.3" stroke="#5a5f66" stroke-width=".5"/>`),
        `<path d="M233 64.5 l3 -5 l1.4 5 Z" fill="${PEWTER}" stroke="#3a3e45" stroke-width=".5"/>`,
        '<path d="M70 52 C92 40 116 37 132 37" stroke="#ffffff" stroke-opacity=".3" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
      ].join('\n    '),
    });
  },
  'thug-velvet-speakeasy': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#2b2d33"/><path d="M2 0 V14 M6.5 0 V14 M11 0 V14" stroke="#8c8a84" stroke-width=".45"/>');
    svg = restop(svg, 'tank', ['#f6f0e2', '#d9cfba']);
    svg = restop(svg, 'band', ['#2a1b12', '#120a06']);
    svg = restop(svg, 'lens', ['#3a3426', '#0b0a08', '#2a2418']);
    svg = recolor(svg, { '#e9fff0': PEWTER, '#b5f5c5': '#c9ced4', '#6ee095': PEWTER });
    return decorate(svg, {
      over: [
        // The waistcoat over the shirt, with pewter buttons.
        '<path d="M46 92 L58 104 L57 126 H45 Z M82 92 L70 104 L71 126 H83 Z" fill="#2b2d33" stroke="#0b0c0e" stroke-width="1"/>',
        `<g fill="${PEWTER}" stroke="#2a2d32" stroke-width=".4"><circle cx="56" cy="110" r="1.2"/><circle cx="56" cy="116" r="1.2"/><circle cx="56" cy="122" r="1.2"/></g>`,
        `<path d="M61.5 90 H66.5 L67.5 94 L65 118 L64 120 L63 118 L60.5 94 Z" fill="${MERLOT}" stroke="#2a0710" stroke-width=".8"/>`,
        // Fedora with a pewter band.
        '<path d="M36 47 Q64 40 92 47 Q90 51 64 49 Q38 51 36 47 Z" fill="#26282e" stroke="#000" stroke-width="1.3"/>',
        '<path d="M45 46 Q44 30 64 27 Q84 30 83 46 Q64 42 45 46 Z" fill="#30333a" stroke="#000" stroke-width="1.3"/>',
        `<path d="M45.5 43.5 Q64 39.6 82.5 43.5" stroke="${MERLOT}" stroke-width="2.4" fill="none"/>`,
        '<path d="M57 30 Q64 33 71 30" stroke="#4a4e56" stroke-width="1" fill="none"/>',
      ].join('\n  '),
    });
  },
  'hoe-velvet-speakeasy': async () => {
    let svg = await load('hoe');
    // A merlot velvet shawl over a beaded cream flapper dress.
    svg = hoeCoat(svg, ['#c25670', MERLOT, '#36091a'], '<path d="M0 7 Q3.5 5 7 7" stroke="#d27a8e" stroke-width=".35" fill="none" opacity=".5"/>');
    svg = recolor(svg, { '#5a060c': '#2a0710', '#17131a': '#e9dcc0', '#3d3346': '#b9a888' });
    return decorate(svg, {
      over: [
        // Beaded fringe rows.
        '<path d="M47 112 H81 M46.5 120 H81.5 M46 128 H82" stroke="#b9a888" stroke-width="1.6" stroke-dasharray=".8 1.2"/>',
        '<path d="M48 113 V118 M52 113 V118 M56 113 V118 M60 113 V118 M64 113 V118 M68 113 V118 M72 113 V118 M76 113 V118 M80 113 V118" stroke="#cdbd93" stroke-width=".5"/>',
        // A long pearl strand.
        '<path d="M57 84 Q58 104 64 112 Q70 104 71 84" fill="none" stroke="#fbf6ee" stroke-width="1.8" stroke-dasharray="1.6 .7" stroke-linecap="round"/>',
        // Feathered headband across the brow.
        `<path d="M47 38 Q64 32 81 38" stroke="${MERLOT}" stroke-width="2.4" fill="none"/>`,
        `<circle cx="77" cy="36.5" r="2" fill="${PEWTER}" stroke="#3a3e45" stroke-width=".5"/>`,
        '<path d="M78 35 Q86 22 82 10 Q80 22 76 34 Z" fill="#f6efe0" stroke="#b9a888" stroke-width=".7"/>',
        '<path d="M79 31 L82 27 M80 26 L83 22 M80.5 21 L83 17" stroke="#b9a888" stroke-width=".5"/>',
      ].join('\n  '),
    });
  },
  'ak47-velvet-speakeasy': async () => {
    let svg = await load('ak47');
    svg = restop(svg, 'wood', ['#9a6a40', '#6a4224', '#3a2210']);
    svg = restop(svg, 'steel', ['#d4d8dc', '#80868c', '#3f4449']);
    svg = recolor(svg, { '#454a52': '#b0b5ba', '#2c2f34': '#5f656b', '#26292e': '#4f555b', '#4a1f07': '#2a1608', '#f0a060': '#e2b98a' });
    // A drum magazine in place of the box.
    svg = swap(svg, '<path d="M128 62 H152 Q158 88 176 106 L154 116 Q134 94 128 62 Z" fill="url(#mag)"/>',
      `<circle cx="141" cy="84" r="20" fill="url(#steel)"/><circle cx="141" cy="84" r="13" fill="none" stroke="#3f4449" stroke-width="1.2"/><circle cx="141" cy="84" r="4" fill="${PEWTER}"/><rect x="132" y="60" width="18" height="8" fill="url(#steel)"/>`);
    svg = svg.replace('<path d="M133 70 Q138 72 154 70M136 82 Q141 84 160 82M142 94 Q148 96 168 93"/>', '');
    return decorate(svg, {
      over: [
        '<path d="M141 66 A18 18 0 0 1 159 84" stroke="#ffffff" stroke-opacity=".45" stroke-width="1.4" fill="none"/>',
        `<path d="M16 63 L68 54 M154 45.5 H186" stroke="${CREAM}" stroke-opacity=".4" stroke-width="1"/>`,
        `<rect x="186" y="44" width="12" height="14" rx="1.5" fill="${PEWTER}" stroke="#0a0b0d" stroke-width="1.2"/>`,
      ].join('\n  '),
    });
  },

  /* Platinum Funk */
  'low-rider-platinum-funk': async () => {
    let svg = await load('low-rider');
    svg = restop(svg, 'paint', ['#ffb067', TANGERINE, '#b5541a', '#5a2a0c']);
    svg = restop(svg, 'roof', ['#5a3520', '#2a170b']);
    svg = restop(svg, 'door', ['#6a3e24', CHOCOLATE]);
    svg = restop(svg, 'primer', [['#262b3a', 0], ['#262b3a', 0]]);
    svg = restop(svg, 'glass', ['#5a3a24', '#22140a', '#0d0703']);
    svg = recolor(svg, { '#e02a3a': PLATINUM, '#c2222e': '#ffffff', '#16384a': CHOCOLATE, '#3a1f1a': '#c9651a' });
    return decorate(svg, {
      over: [
        `<path d="M14 73.4 L244 76.4" stroke="${PLATINUM}" stroke-width="1.3" fill="none"/>`,
        // Sunburst stripes down the flank.
        `<path d="M98 84 L196 84.6" stroke="${CHOCOLATE}" stroke-width="2.6"/><path d="M100 88.4 L194 89" stroke="#ffcf8a" stroke-width="1.6"/><path d="M102 91.8 L192 92.3" stroke="${CHOCOLATE}" stroke-width="1.2"/>`,
        // Fur on the dash and a platinum hood ornament.
        '<path d="M150 61 Q154 57.5 158 60.5 Q161 57 164 61" fill="#fbf8f2" stroke="#b9b0a4" stroke-width=".6"/>',
        `<path d="M236 68 l3 -5.5 l1.6 5.5 Z" fill="${PLATINUM}" stroke="#5a5f66" stroke-width=".5"/>`,
        rings(LOW_RIDER_WHEELS, '<circle r="13.4" stroke="#fbfaf6" stroke-width="2.4"/>'),
      ].join('\n    '),
    });
  },
  'thug-platinum-funk': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', `<rect width="14" height="14" fill="${TANGERINE}"/><path d="M0 14 L14 0" stroke="#e8761a" stroke-width=".8"/>`);
    svg = restop(svg, 'tank', ['#fff1e2', '#f3d3ad']);
    svg = restop(svg, 'band', ['#1b100a', '#0b0604']);
    svg = restop(svg, 'gold', ['#ffffff', PLATINUM, '#7d848c']);
    svg = restop(svg, 'lens', ['#ffcf8a', '#b5541a', '#ff9a45']);
    svg = recolor(svg, { '#e9fff0': '#2a170b', '#b5f5c5': '#3a2010', '#6ee095': '#ffe2b8', '#3a2a05': '#5a5f66' });
    // A full afro behind the face.
    svg = before(svg, '<ellipse cx="64" cy="55" rx="19" ry="23" fill="url(#skin)"/>',
      '<path d="M64 14 C90 14 98 30 96 46 C98 56 92 64 86 62 L42 62 C36 64 30 56 32 46 C30 30 38 14 64 14 Z" fill="#1b100a" stroke="#07100a" stroke-width="1.4"/>');
    return decorate(svg, {
      over: [
        // Wide lapels and a patterned shirt.
        '<path d="M50 86 L60 104 L44 126 L40 112 Z M78 86 L68 104 L84 126 L88 112 Z" fill="#c9651a" stroke="#5a2a0c" stroke-width="1"/>',
        `<path d="M50 96 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 M48 106 q4 -3 8 0 q4 3 8 0 q4 -3 8 0 M50 116 q4 -3 8 0 q4 3 8 0 q4 -3 8 0" stroke="${CHOCOLATE}" stroke-width="1" fill="none" opacity=".75"/>`,
        '<path d="M44 46 Q62 36 84 46" stroke="#3a2010" stroke-width="1" fill="none" opacity=".6"/>',
      ].join('\n  '),
    });
  },
  'hoe-platinum-funk': async () => {
    let svg = await load('hoe');
    // A plush white fur coat (the fuzz stays) over a platinum disco jumpsuit.
    svg = restop(svg, 'fur', ['#ffffff', '#f3eee6', '#bdb4a7']);
    svg = repattern(svg, 'tufts', '<path d="M1 6 q1-3 0-5 M4.5 6.5 q1.2-3 .2-5.5" stroke="#ffffff" stroke-width=".8" fill="none"/><path d="M3 3 q.8-2 0-3" stroke="#c9c0b2" stroke-width=".8" fill="none" opacity=".7"/>');
    svg = recolor(svg, { '#5a060c': '#9a9085', '#17131a': '#c9ced6', '#3d3346': '#ffffff' });
    return decorate(svg, {
      over: [
        // Disco sparkle on the jumpsuit.
        '<g fill="#ffffff"><path d="M56 110 l1 -2.5 l1 2.5 l2.5 1 l-2.5 1 l-1 2.5 l-1 -2.5 l-2.5 -1 Z"/><path d="M70 120 l.8 -2 l.8 2 l2 .8 l-2 .8 l-.8 2 l-.8 -2 l-2 -.8 Z"/><path d="M62 128 l.7 -1.8 l.7 1.8 l1.8 .7 l-1.8 .7 l-.7 1.8 l-.7 -1.8 l-1.8 -.7 Z"/></g>',
        '<path d="M50 100 L58 136 M78 100 L70 136" stroke="#8a93a3" stroke-width=".8" opacity=".7"/>',
        `<path d="M47 104 H81" stroke="${TANGERINE}" stroke-width="2.2"/>`,
      ].join('\n  '),
    });
  },

  /* Redline Syndicate */
  'sedan-redline-syndicate': async () => {
    let svg = await load('sedan');
    svg = restop(svg, 'paint', ['#ff7380', SIGNAL, '#b5121f', '#5a0710']);
    svg = restop(svg, 'glass', ['#3a3e45', '#121417', '#050607']);
    svg = restop(svg, 'rim', ['#5a5f66', '#1c1e22', '#0a0b0d']);
    svg = recolor(svg, { '#5e4e35': '#000000', '#5a4a32': '#2a0508', '#6e5c3e': '#2a0508', '#c2ad85': CARBON, '#9aa2ab': '#3a3e45' });
    return decorate(svg, {
      over: [
        // Widebody arches.
        rings(SEDAN_WHEELS, `<path d="M-20 2 A20 20 0 0 1 20 2" stroke="${CARBON}" stroke-width="3.6" stroke-linecap="round"/><circle r="12" stroke="${SIGNAL}" stroke-width="1"/>`),
        // Carbon rear wing.
        `<path d="M22 62 V55 M34 61.5 V55" stroke="${CARBON}" stroke-width="2"/><path d="M10 51.5 H46 L44 55.8 H12 Z" fill="${CARBON}" stroke="#000" stroke-width=".8"/>`,
        // Livery: a white stripe and a door number.
        '<path d="M28 82.5 Q130 79 236 81.5" stroke="#ffffff" stroke-width="2.2" fill="none"/>',
        `<circle cx="130" cy="72" r="7" fill="#ffffff" stroke="${CARBON}" stroke-width="1.2"/><text x="130" y="75.2" text-anchor="middle" font-family="Arial, sans-serif" font-size="8.5" font-weight="900" fill="${CARBON}">07</text>`,
        `<path d="M232 92 H250" stroke="${CARBON}" stroke-width="2.4"/>`,
        '<path d="M70 52 C92 40 116 37 132 37" stroke="#ffffff" stroke-opacity=".4" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
      ].join('\n    '),
    });
  },
  'thug-redline-syndicate': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', `<rect width="14" height="14" fill="${CARBON}"/><path d="M0 0 H7 V7 H0 Z M7 7 H14 V14 H7 Z" fill="#2a2d32"/>`);
    svg = restop(svg, 'tank', ['#ffffff', '#d9dde3']);
    svg = restop(svg, 'band', ['#ff6b78', '#b5121f']);
    svg = restop(svg, 'lens', ['#ff8a94', '#5a0710', SIGNAL]);
    svg = recolor(svg, { '#e9fff0': '#ffffff', '#b5f5c5': '#ffd3d7', '#6ee095': '#ffffff' });
    return decorate(svg, {
      over: [
        `<path d="M14 112 Q22 98 34 93 M114 112 Q106 98 94 93" stroke="${SIGNAL}" stroke-width="2.4" fill="none"/>`,
        '<path d="M16 115 Q24 101 36 96 M112 115 Q104 101 92 96" stroke="#ffffff" stroke-width="1" fill="none"/>',
        // Patches.
        `<rect x="22" y="104" width="10" height="6" rx="1" fill="${SIGNAL}" stroke="#000" stroke-width=".6"/><rect x="96" y="104" width="10" height="6" rx="1" fill="#ffffff" stroke="#000" stroke-width=".6"/><rect x="28" y="114" width="8" height="5" rx="1" fill="${HAZARD}" stroke="#000" stroke-width=".6"/><circle cx="100" cy="117" r="3.2" fill="#2f8cff" stroke="#000" stroke-width=".6"/>`,
        `<path d="M50 86 L46 126 M78 86 L82 126" stroke="${SIGNAL}" stroke-width="1.2" fill="none"/>`,
      ].join('\n  '),
    });
  },
  'hoe-redline-syndicate': async () => {
    let svg = await load('hoe');
    svg = hoeCoat(svg, ['#ff7380', SIGNAL, '#8e0e1b'], '<path d="M0 7 L7 0" stroke="#ffffff" stroke-width=".3" opacity=".2"/>');
    svg = recolor(svg, { '#5a060c': '#3a0408', '#17131a': '#f3f4f6', '#3d3346': CARBON });
    return decorate(svg, {
      over: [
        // White shoulder stripes and a zip down the suit.
        '<path d="M10 110 Q18 96 34 90 M118 110 Q110 96 94 90" stroke="#ffffff" stroke-width="2.6" fill="none"/>',
        `<path d="M64 98 V136" stroke="${CARBON}" stroke-width="1.2" stroke-dasharray="1 1"/>`,
        `<rect x="48" y="112" width="9" height="6" rx="1" fill="${SIGNAL}" stroke="#000" stroke-width=".5"/>`,
        // Pit headset.
        `<path d="M40 52 Q40 16 64 15 Q88 16 88 52" stroke="${CARBON}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
        `<rect x="35" y="46" width="8" height="12" rx="3" fill="${CARBON}" stroke="#000" stroke-width=".8"/><rect x="85" y="46" width="8" height="12" rx="3" fill="${CARBON}" stroke="#000" stroke-width=".8"/>`,
        `<path d="M88 56 Q86 70 72 71" stroke="${CARBON}" stroke-width="1.4" fill="none"/><circle cx="71" cy="71" r="1.6" fill="${SIGNAL}"/>`,
      ].join('\n  '),
    });
  },
  'ak47-redline-syndicate': async () => {
    let svg = await load('ak47');
    svg = restop(svg, 'wood', ['#3a3d43', CARBON, '#0a0b0d']);
    svg = restop(svg, 'steel', ['#5a5f66', '#26292e', '#0f1012']);
    svg = restop(svg, 'mag', ['#2a2d32', '#3a3e45', '#141518']);
    svg = recolor(svg, { '#4a1f07': '#000000', '#f0a060': '#ff8a94', '#454a52': '#3a3e45' });
    return decorate(svg, {
      over: [
        `<path d="M14 66 L70 57" stroke="${SIGNAL}" stroke-width="2.2"/>`,
        `<path d="M152 61 H188" stroke="${SIGNAL}" stroke-width="1.6"/>`,
        `<path d="M136 66 L150 66 M140 80 L156 80" stroke="${SIGNAL}" stroke-width="1.4"/>`,
        '<path d="M20 62 l6 -1 M30 60.4 l6 -1 M40 58.8 l6 -1" stroke="#ffffff" stroke-opacity=".25" stroke-width="3"/>',
      ].join('\n  '),
    });
  },

  /* Wet Paint */
  'low-rider-wet-paint': async () => {
    let svg = await load('low-rider');
    svg = restop(svg, 'paint', ['#3a3e45', '#1e2024', '#0d0e10', '#050505']);
    svg = restop(svg, 'roof', ['#7ff2c4', MINT]);
    svg = restop(svg, 'door', ['#2a2d32', '#111316']);
    svg = restop(svg, 'primer', [['#262b3a', 0], ['#262b3a', 0]]);
    svg = recolor(svg, { '#e02a3a': SPRAY_PINK, '#16384a': MINT, '#c2222e': SPRAY_PINK });
    const letters = [[112, 82, 11], [131, 80, 10], [149, 83, 11], [168, 81, 10]];
    return decorate(svg, {
      over: [
        // Bubble letters with chrome highlights, then the drips.
        ...letters.map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.72}" fill="${MINT}" stroke="#000" stroke-width="1.2"/><ellipse cx="${x - 2}" cy="${y - 2.5}" rx="${r * 0.5}" ry="${r * 0.22}" fill="#ffffff" opacity=".75"/><ellipse cx="${x}" cy="${y}" rx="${r + 1.6}" ry="${r * 0.72 + 1.6}" fill="none" stroke="${SPRAY_PINK}" stroke-width="1"/>`),
        `<g stroke="${MINT}" stroke-width="1.6" stroke-linecap="round"><path d="M106 88 V96 M124 86 V93 M147 89 V97.5 M171 87 V94"/></g>`,
        `<g fill="${MINT}"><circle cx="106" cy="96.6" r="1.4"/><circle cx="147" cy="98" r="1.4"/></g>`,
        `<path d="M18 74 l8 -3 M22 78 l10 -4" stroke="${SPRAY_PINK}" stroke-width="1.2" stroke-linecap="round"/>`,
        rings(LOW_RIDER_WHEELS, `<circle r="12.4" stroke="${MINT}" stroke-width="1.3"/>`),
      ].join('\n    '),
    });
  },
  'thug-wet-paint': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', `<rect width="14" height="14" fill="#16181c"/><circle cx="3" cy="4" r="1.1" fill="${MINT}"/><circle cx="10" cy="9" r=".8" fill="${SPRAY_PINK}"/><circle cx="6" cy="12" r=".6" fill="${HAZARD}"/><circle cx="12" cy="2" r=".5" fill="#ffffff"/>`);
    svg = restop(svg, 'tank', ['#2a2d32', '#111316']);
    svg = restop(svg, 'band', ['#9aa0a6', '#4f555b']);
    svg = restop(svg, 'lens', ['#7ff2c4', '#0d4a32', MINT]);
    svg = recolor(svg, { '#e9fff0': '#ffffff', '#b5f5c5': '#c9ced4', '#6ee095': '#ffffff' });
    return decorate(svg, {
      over: [
        // Respirator pushed up on the head.
        '<path d="M50 40 Q64 33 78 40 L76 46 Q64 41 52 46 Z" fill="#3a3e45" stroke="#000" stroke-width="1"/>',
        `<circle cx="50" cy="42" r="5" fill="${MINT}" stroke="#000" stroke-width="1"/><circle cx="78" cy="42" r="5" fill="${MINT}" stroke="#000" stroke-width="1"/>`,
        '<path d="M47.5 42 H52.5 M75.5 42 H80.5" stroke="#0d4a32" stroke-width="1"/>',
        // Hoodie drawstrings and splatter on the front.
        '<path d="M58 90 V108 M70 90 V108" stroke="#d9dde3" stroke-width="1" stroke-linecap="round"/>',
        `<path d="M50 112 q3 -4 6 0 q2 3 5 -1 M64 118 l3 4 M72 110 q2 2 4 0" stroke="${SPRAY_PINK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
        `<circle cx="76" cy="122" r="1.6" fill="${MINT}"/>`,
      ].join('\n  '),
    });
  },
  'hoe-wet-paint': async () => {
    let svg = await load('hoe');
    svg = hoeCoat(svg, ['#8ab0de', '#4a6fa5', '#253d63'], '<path d="M0 2 H7 M0 5 H7" stroke="#6d93c9" stroke-width=".35" opacity=".6"/>');
    svg = recolor(svg, { '#5a060c': '#162845', '#17131a': MINT, '#3d3346': '#1d8f63' });
    return decorate(svg, {
      over: [
        // Tags on the denim and a few drips.
        `<path d="M14 112 q4 -6 8 -1 q3 4 6 -2 q2 -4 6 0" stroke="${SPRAY_PINK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
        `<path d="M94 108 q4 -5 8 0 q4 5 8 0" stroke="${MINT}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
        `<path d="M20 111 V120 M104 110 V117" stroke="${SPRAY_PINK}" stroke-width="1.2" stroke-linecap="round"/>`,
        '<path d="M48 88 L52 136 M80 88 L76 136" stroke="#d9a74a" stroke-width=".8" stroke-dasharray="1.4 1"/>',
        // Spray-can hoops.
        `<circle cx="45" cy="72" r="4" fill="none" stroke="${MINT}" stroke-width="1.2"/><circle cx="83" cy="72" r="4" fill="none" stroke="${MINT}" stroke-width="1.2"/>`,
      ].join('\n  '),
    });
  },
  'pistol-wet-paint': async () => {
    let svg = await load('pistol');
    svg = restop(svg, 'slide', ['#ffffff', '#c9ced6', '#7d848c']);
    svg = restop(svg, 'frame', ['#2a2d32', '#111316']);
    svg = restop(svg, 'grip', ['#2a2d32', '#0d0e10']);
    return decorate(svg, {
      over: [
        // Mint paint running off the top of the slide.
        `<path d="M20 38 H112 Q116 38 116 42 V44 Q108 44 106 48 Q104 52 102 46 Q98 42 92 44 Q88 50 86 44 Q80 42 74 45 Q70 54 68 45 Q60 42 54 44 Q50 50 48 44 Q40 41 34 44 Q31 49 29 44 Q24 42 17 44 V41 Q17 38 20 38 Z" fill="${MINT}" stroke="#0a0b0d" stroke-width=".8"/>`,
        `<path d="M70 52 V57 M50 48 V52 M104 50 V54" stroke="${MINT}" stroke-width="1.4" stroke-linecap="round"/>`,
        `<path d="M78 50 q3 -3 6 0 q3 3 6 0" stroke="${SPRAY_PINK}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
        `<path d="M30 74 l10 -6 M30 86 l12 -8" stroke="${MINT}" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>`,
      ].join('\n  '),
    });
  },

  /* Hazard Cook */
  'van-hazard-cook': async () => {
    let svg = await load('van');
    svg = restop(svg, 'paint', ['#fff38a', HAZARD, '#c9a700', '#7a6600']);
    svg = restop(svg, 'trim', ['#2a2d32', '#0d0e10']);
    svg = restop(svg, 'decal', ['#1a1a1a', '#000000']);
    svg = restop(svg, 'rust', [['#6a5a10', 0.5], ['#6a5a10', 0.2], ['#6a5a10', 0]]);
    svg = restop(svg, 'steel', ['#f2f4f6', '#a9b0b8', '#5a6168']);
    svg = recolor(svg, { '#b8bcba': HAZARD });
    return decorate(svg, {
      defs: `<pattern id="hz" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="${HAZARD}"/><rect width="4" height="8" fill="#111111"/></pattern>`,
      over: [
        '<rect x="12" y="74" width="198" height="7" fill="url(#hz)" stroke="#000" stroke-width=".6"/>',
        // Warning triangle and lettering on the cargo panel.
        `<path d="M58 66 L66 52 L74 66 Z" fill="${HAZARD}" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/><path d="M66 56.5 V61.5" stroke="#000" stroke-width="1.6" stroke-linecap="round"/><circle cx="66" cy="64" r=".9" fill="#000"/>`,
        `<text x="78" y="62.5" font-family="Arial, sans-serif" font-size="6.5" font-weight="900" letter-spacing=".6" fill="${HAZARD}">LAB</text>`,
        // Roof vent stack with smoke.
        '<rect x="132" y="12" width="8" height="15" fill="url(#steel)" stroke="#0a0b0d" stroke-width="1"/><rect x="130" y="10" width="12" height="3" rx="1" fill="url(#steel)" stroke="#0a0b0d" stroke-width=".8"/>',
        '<path d="M136 8 Q131 3 136 -2 Q141 -6 137 -11" stroke="#d9dde3" stroke-opacity=".5" stroke-width="3" fill="none" stroke-linecap="round"/>',
        // A drum strapped to the back.
        `<rect x="2" y="56" width="10" height="26" rx="2" fill="#2f6bb5" stroke="#0a0b0d" stroke-width="1"/><path d="M2 62 H12 M2 76 H12" stroke="#173a66" stroke-width="1"/><path d="M4 69 H12" stroke="${HAZARD}" stroke-width="2"/>`,
      ].join('\n    '),
    });
  },
  'thug-hazard-cook': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#f2cb00"/><path d="M0 7 H14" stroke="#c9a700" stroke-width=".6"/>');
    svg = restop(svg, 'tank', ['#ffe45c', '#d9b400']);
    svg = restop(svg, 'band', ['#ffe45c', '#c9a700']);
    svg = restop(svg, 'gold', ['#f2f4f6', '#a9b0b8', '#5a6168']);
    svg = restop(svg, 'lens', ['#eef8f6', '#8fb5ae', '#d4ebe7']);
    svg = recolor(svg, { '#e9fff0': '#fff38a', '#b5f5c5': '#ffffff', '#6ee095': '#ffffff', '#3a2a05': '#3a3e45' });
    return decorate(svg, {
      over: [
        // The hood seals around the face.
        '<path d="M44 50 Q42 29 64 28 Q86 29 84 50 Q88 66 82 78 L76 82 Q86 66 82 52 Q80 36 64 36 Q48 36 46 52 Q42 66 52 82 L46 78 Q40 66 44 50 Z" fill="#ffd400" stroke="#7a6600" stroke-width="1.2"/>',
        // Goggle strap and a respirator over the mouth.
        '<path d="M44 55 H84" stroke="#141416" stroke-width="2" opacity=".85"/>',
        '<path d="M54 64 Q64 60 74 64 L72 76 Q64 80 56 76 Z" fill="#26292e" stroke="#000" stroke-width="1"/>',
        `<circle cx="52" cy="72" r="4.2" fill="#3a3e45" stroke="#000" stroke-width="1"/><circle cx="76" cy="72" r="4.2" fill="#3a3e45" stroke="#000" stroke-width="1"/><circle cx="52" cy="72" r="1.8" fill="${HAZARD}"/><circle cx="76" cy="72" r="1.8" fill="${HAZARD}"/>`,
        // Taped seams.
        '<path d="M64 90 V126 M14 110 H44 M84 110 H114" stroke="#c9ced4" stroke-width="2.2" opacity=".85"/>',
      ].join('\n  '),
    });
  },
  'hoe-hazard-cook': async () => {
    let svg = await load('hoe');
    // Not in a hazmat suit: her own hair, a hazard-yellow coat trimmed in warning stripes, and the fumes got to her.
    // Keeps the fur's fuzz (no hoeCoat) so it reads as a coat, not a slick suit.
    svg = restop(svg, 'fur', ['#fff38a', HAZARD, '#a88a00']);
    svg = repattern(svg, 'tufts', '<path d="M0 3.5 H7" stroke="#c9a700" stroke-width=".4" opacity=".7"/>');
    svg = recolor(svg, { '#5a060c': '#5a4a00', '#17131a': '#141416', '#3d3346': HAZARD });
    // Infected by the cook: sickly skin, bruised lips, toxic eyes.
    svg = restop(svg, 'skin', ['#dfe0b4', '#b9bc84', '#7f8650']);
    svg = restop(svg, 'blush', [['#7fae3a', 0.55], ['#8fb04a', 0.3], ['#9ab45a', 0]]);
    svg = restop(svg, 'contour', [['#4f5a2a', 0.55], ['#4f5a2a', 0]]);
    svg = recolor(svg, {
      '#6a3a26': '#3f4620', '#a8684e': '#6f7a3e', '#b0705a': '#6f7a3e', '#b2745a': '#6f7a3e', '#8a4a38': '#4f5a2a',
      '#c8182c': '#6a3a5e', '#5e0a1c': '#2a1426', '#ff8a96': '#a07a9a',
      '#3a6a8a': '#8cff3a', '#1d3a4e': '#2f6a10',
    });
    const coat = 'M2 136 Q4 99 22 90 Q36 83 47 86 Q55 90 56 103 L53 136 Z M126 136 Q124 99 106 90 Q92 83 81 86 Q73 90 72 103 L75 136 Z';
    return decorate(svg, {
      defs: [
        `<pattern id="hz" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${HAZARD}"/><rect width="3" height="6" fill="#111111"/></pattern>`,
        `<clipPath id="coat"><path d="${coat}"/></clipPath>`,
      ].join('\n    '),
      over: [
        // Warning-stripe hem and lapel edges.
        '<g clip-path="url(#coat)"><rect x="0" y="124" width="128" height="7" fill="url(#hz)"/><path d="M56 103 L53 136 M72 103 L75 136" stroke="url(#hz)" stroke-width="5"/></g>',
        '<path d="M2 124 H54 M74 124 H126 M2 131 H54 M74 131 H126" stroke="#5a4a00" stroke-width=".7"/>',
        // Lab goggles pushed up into her hair.
        '<path d="M42 29 Q64 22 86 29" stroke="#141416" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
        '<rect x="48" y="22.5" width="14" height="9" rx="4.5" fill="#d4ebe7" fill-opacity=".6" stroke="#141416" stroke-width="1.4"/><rect x="66" y="22.5" width="14" height="9" rx="4.5" fill="#d4ebe7" fill-opacity=".6" stroke="#141416" stroke-width="1.4"/>',
        '<path d="M62 27 H66" stroke="#141416" stroke-width="1.4"/><path d="M50.5 25 Q53 23.8 55.5 24.4 M68.5 25 Q71 23.8 73.5 24.4" stroke="#ffffff" stroke-width=".8" fill="none" stroke-linecap="round" opacity=".8"/>',
        // A warning-sign charm on the choker.
        `<path d="M64 88.6 L69 97 H59 Z" fill="${HAZARD}" stroke="#141416" stroke-width="1" stroke-linejoin="round"/><path d="M64 91.2 V94" stroke="#141416" stroke-width="1.1" stroke-linecap="round"/><circle cx="64" cy="95.4" r=".55" fill="#141416"/>`,
        // Dark rings under the eyes, sores, and green veins up the neck.
        '<path d="M50.6 56.2 Q55.5 60.4 60.2 56 M77.4 56.2 Q72.5 60.4 67.8 56" stroke="#3f2a3a" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".55"/>',
        '<g fill="#c9d64a" stroke="#6a7a1a" stroke-width=".5"><circle cx="51.5" cy="63" r="1.3"/><circle cx="53.6" cy="65.6" r=".8"/><circle cx="76.8" cy="62.4" r="1"/><circle cx="68.6" cy="43.2" r=".9"/><circle cx="60" cy="84.6" r="1.1"/></g>',
        '<g fill="#fff9c0" opacity=".8"><circle cx="51.1" cy="62.6" r=".4"/><circle cx="76.5" cy="62.1" r=".3"/><circle cx="59.6" cy="84.2" r=".35"/></g>',
        '<path d="M58.5 86 Q60 82 58.8 79 Q60.2 77.6 59.6 75.8 M69.5 86.5 Q68 83 69.4 80 Q68.2 78.4 68.8 76.4" stroke="#4a8a2a" stroke-width=".7" fill="none" stroke-linecap="round" opacity=".75"/>',
        // Toxic drool at the corner of the mouth.
        '<path d="M70.6 67.6 Q71.4 70.6 70.8 73.6" stroke="#8cff3a" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".85"/><circle cx="70.8" cy="74.4" r=".9" fill="#8cff3a" opacity=".85"/>',
        // Yellow hoops.
        `<circle cx="45" cy="72" r="3.8" fill="none" stroke="${HAZARD}" stroke-width="1.3"/><circle cx="83" cy="72" r="3.8" fill="none" stroke="${HAZARD}" stroke-width="1.3"/>`,
      ].join('\n  '),
    });
  },
  'shotgun-hazard-cook': async () => {
    let svg = await load('shotgun');
    svg = restop(svg, 'barrel', ['#f4f6f8', '#b0b7be', '#5f666d']);
    svg = restop(svg, 'steel', ['#e2e6ea', '#9aa2aa', '#4f565d']);
    svg = restop(svg, 'wood', ['#3a3d43', '#1d1f23', '#0a0b0d']);
    svg = recolor(svg, { '#3a1d08': '#000000', '#e6a868': '#5f666d' });
    return decorate(svg, {
      defs: `<pattern id="hz" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${HAZARD}"/><rect width="3" height="6" fill="#111111"/></pattern>`,
      over: [
        // Hazard tape round the stock and the pump.
        '<path d="M40 50.5 L48 50 L52 74 L44 77.6 Z M60 49.2 L68 48.7 L68 69 L60 70.6 Z" fill="url(#hz)" stroke="#000" stroke-width=".7"/>',
        '<rect x="156" y="53" width="10" height="15" fill="url(#hz)" stroke="#000" stroke-width=".7"/><rect x="178" y="53" width="10" height="15" fill="url(#hz)" stroke="#000" stroke-width=".7"/>',
        '<path d="M122 47.5 H246" stroke="#ffffff" stroke-opacity=".7" stroke-width="1.2"/>',
      ].join('\n  '),
    });
  },

  /* Dockside */
  'van-dockside': async () => {
    let svg = await load('van');
    svg = restop(svg, 'paint', ['#4f6f96', '#2a4566', '#1a2d45', '#0c1622']);
    svg = restop(svg, 'trim', ['#3a3e45', '#141518']);
    svg = restop(svg, 'decal', [SAFETY, '#b5501a']);
    svg = restop(svg, 'glass', ['#9fb3c6', '#3d5268', '#1a2636']);
    svg = recolor(svg, { '#b8bcba': '#ffffff' });
    const ribs = Array.from({ length: 16 }, (_, index) => `M${16 + index * 6} 30 V86`).join(' ');
    return decorate(svg, {
      over: [
        // Corrugated container panels, then rust streaks from the roof seam.
        `<path d="${ribs}" stroke="#0c1622" stroke-opacity=".55" stroke-width="1.6"/>`,
        `<path d="M17 30 V86 M23 30 V86" stroke="#ffffff" stroke-opacity=".08" stroke-width="1"/>`,
        '<path d="M30 30 Q31 40 29 50 M74 30 Q75 36 73 44 M126 30 Q127 42 125 54 M150 30 Q151 36 150 42" stroke="#8a4a2a" stroke-opacity=".8" stroke-width="1.4" fill="none"/>',
        // Stencils.
        '<text x="46" y="56" font-family="Arial, sans-serif" font-size="7" font-weight="900" letter-spacing="1" fill="#ffffff">SEKU 4471</text>',
        '<text x="46" y="65" font-family="Arial, sans-serif" font-size="5.5" font-weight="700" letter-spacing=".8" fill="#0c1622">NO MANIFEST</text>',
        `<path d="M170 34 V58" stroke="${SAFETY}" stroke-width="1.6"/>`,
      ].join('\n    '),
    });
  },
  'thug-dockside': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', `<rect width="14" height="14" fill="${NAVY}"/><path d="M0 3 L3 0 M5 14 L14 5 M9 14 L14 9" stroke="#25405f" stroke-width=".6"/>`);
    svg = restop(svg, 'tank', ['#efe8d8', '#cfc4ad']);
    svg = restop(svg, 'band', ['#2a3d55', '#121d2b']);
    svg = restop(svg, 'lens', ['#4a5a6a', '#0c1622', '#2a3d55']);
    svg = recolor(svg, { '#e9fff0': '#4a6a90', '#b5f5c5': '#4a6a90', '#6ee095': '#c9d6e2' });
    return decorate(svg, {
      over: [
        // Turned-up collar and double-breasted buttons.
        `<path d="M44 86 L52 76 L58 92 Z M84 86 L76 76 L70 92 Z" fill="${NAVY}" stroke="#060b12" stroke-width="1.1"/>`,
        `<g fill="${PEWTER}" stroke="#2a2d32" stroke-width=".4"><circle cx="38" cy="106" r="1.8"/><circle cx="38" cy="116" r="1.8"/><circle cx="90" cy="106" r="1.8"/><circle cx="90" cy="116" r="1.8"/></g>`,
        // Ribbed knit at the neck and a watch cap.
        '<path d="M52 89 Q64 96 76 89" stroke="#b9ad94" stroke-width="2.2" fill="none" stroke-dasharray="1 .8"/>',
        '<path d="M44 48 Q42 28 64 26 Q86 28 84 48 Q64 42 44 48 Z" fill="#1d3350" stroke="#060b12" stroke-width="1.2"/>',
        '<path d="M44 44 Q64 38 84 44 L84 49 Q64 43 44 49 Z" fill="#25405f" stroke="#060b12" stroke-width="1"/>',
        '<path d="M50 30 V44 M56 28 V42 M62 27 V41 M68 27 V41 M74 28 V42 M80 31 V45" stroke="#2a4a70" stroke-width="1"/>',
      ].join('\n  '),
    });
  },
  'hoe-dockside': async () => {
    let svg = await load('hoe');
    svg = hoeCoat(svg, ['#ffa060', SAFETY, '#b5501a'], '<path d="M0 7 L7 0" stroke="#ffffff" stroke-width=".25" opacity=".2"/>');
    svg = recolor(svg, { '#5a060c': '#5a2008', '#17131a': NAVY, '#3d3346': '#0c1622' });
    return decorate(svg, {
      over: [
        // Reflective bands.
        '<path d="M4 120 H52 M76 120 H124" stroke="#e2e6ea" stroke-width="3"/><path d="M4 120 H52 M76 120 H124" stroke="#ffffff" stroke-width="1" opacity=".9"/>',
        // Overall bib and straps.
        `<path d="M50 96 L56 136 M78 96 L72 136" stroke="#2a4566" stroke-width="2.4"/>`,
        `<rect x="56" y="108" width="16" height="11" rx="1" fill="#25405f" stroke="#0c1622" stroke-width=".8"/><path d="M58 111 H70" stroke="${SAFETY}" stroke-width=".8"/>`,
        `<g fill="${PEWTER}"><circle cx="51" cy="98" r="1.3"/><circle cx="77" cy="98" r="1.3"/></g>`,
      ].join('\n  '),
    });
  },
  'ak47-dockside': async () => {
    let svg = await load('ak47');
    svg = restop(svg, 'wood', ['#7a6a56', '#4f4232', '#2a2219']);
    svg = restop(svg, 'steel', ['#9aa3a8', '#5c666b', '#2c3236']);
    svg = restop(svg, 'mag', ['#4a5358', '#6a7378', '#2c3236']);
    svg = recolor(svg, { '#4a1f07': '#1a140d', '#f0a060': '#c9b48a', '#454a52': '#7a8388' });
    const rope = (x1, y1, count, dx, dy) => Array.from({ length: count }, (_, index) => `M${x1 + index * dx} ${y1 + index * dy} l3 9`).join(' ');
    return decorate(svg, {
      over: [
        // Rope wraps on the stock and handguard.
        `<path d="${rope(26, 55, 8, 5, -0.8)}" stroke="#c9b48a" stroke-width="1.8" stroke-linecap="round"/>`,
        `<path d="${rope(26, 55, 8, 5, -0.8)}" stroke="#8a7550" stroke-width=".6" stroke-linecap="round" transform="translate(1 0)"/>`,
        `<path d="${rope(154, 51, 7, 5, 0)}" stroke="#c9b48a" stroke-width="1.8" stroke-linecap="round"/>`,
        // Salt pitting.
        '<g fill="#e8eef0" opacity=".6"><circle cx="80" cy="52" r=".7"/><circle cx="94" cy="57" r=".5"/><circle cx="108" cy="50" r=".6"/><circle cx="122" cy="58" r=".5"/><circle cx="136" cy="53" r=".7"/><circle cx="204" cy="52" r=".5"/><circle cx="222" cy="51" r=".6"/><circle cx="146" cy="88" r=".6"/><circle cx="156" cy="100" r=".5"/></g>',
      ].join('\n  '),
    });
  },

  /* Crown Jewels */
  'sedan-crown-jewels': async () => {
    let svg = await load('sedan');
    svg = restop(svg, 'paint', ['#7a9cff', SAPPHIRE, '#1a2f8a', '#0b1440']);
    svg = restop(svg, 'glass', ['#2a3050', '#0e1124', '#05060f']);
    svg = restop(svg, 'rim', ['#ffffff', '#e1e6ee', '#8a93a3']);
    svg = recolor(svg, { '#5e4e35': '#05081f', '#5a4a32': '#0e1a52', '#6e5c3e': '#0e1a52', '#c2ad85': PLATINUM, '#9aa2ab': PLATINUM });
    const jewels = [RUBY, EMERALD, '#7aa2ff'];
    return decorate(svg, {
      over: [
        `<path d="M24 76.4 Q130 72.9 238 75.4" stroke="${PLATINUM}" stroke-width="1.4" fill="none"/>`,
        // A row of set stones along the belt line.
        ...Array.from({ length: 10 }, (_, index) => {
          const x = 34 + index * 20;
          const y = 77.6 - Math.sin((x / 256) * Math.PI) * 3.2;
          return `<circle cx="${x}" cy="${y.toFixed(1)}" r="1.5" fill="${jewels[index % 3]}" stroke="${PLATINUM}" stroke-width=".6"/>`;
        }),
        // Armoured window surround and a crown on the hood.
        `<path d="M73 58.5 C88 46.5 106 40.5 129 40.5 C149 40.5 163 45 179 58" stroke="${PLATINUM}" stroke-width="1.6" fill="none"/>`,
        `<path d="M224 64.5 L225 58.5 L228 61.5 L230.5 57 L233 61.5 L236 58.5 L237 64.5 Z" fill="${PLATINUM}" stroke="#4a5262" stroke-width=".6" stroke-linejoin="round"/><circle cx="230.5" cy="62.4" r="1" fill="${RUBY}"/>`,
        // The jewelled grille.
        `<rect x="240" y="78" width="8" height="7" rx="1.5" fill="${PLATINUM}" stroke="#4a5262" stroke-width=".6"/><circle cx="242.5" cy="81.5" r="1" fill="${EMERALD}"/><circle cx="245.6" cy="81.5" r="1" fill="${RUBY}"/>`,
        rings(SEDAN_WHEELS, `<circle r="11.6" stroke="${PLATINUM}" stroke-width="1.4"/><circle r="8.4" stroke="${EMERALD}" stroke-width=".8"/>`),
        '<path d="M70 52 C92 40 116 37 132 37" stroke="#ffffff" stroke-opacity=".45" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
      ].join('\n    '),
    });
  },
  'thug-crown-jewels': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', `<rect width="14" height="14" fill="${SAPPHIRE}"/><path d="M0 14 L14 0" stroke="#4a70e8" stroke-width="1.4" opacity=".5"/>`);
    svg = restop(svg, 'tank', ['#ff6b80', '#8a0f20']);
    svg = restop(svg, 'band', ['#1b100a', '#0b0604']);
    svg = restop(svg, 'gold', ['#ffffff', PLATINUM, '#7d848c']);
    svg = restop(svg, 'lens', ['#2a3050', '#05060f', '#1a2f8a']);
    svg = recolor(svg, { '#e9fff0': '#3a2010', '#b5f5c5': '#3a2010', '#6ee095': '#ffffff', '#3a2a05': '#4a5262' });
    const spots = [[18, 100], [26, 94], [36, 90], [102, 100], [94, 94], [84, 90]].map(([x, y]) => `<path d="M${x} ${y - 1.4} v2.8" stroke="#111" stroke-width="1.1" stroke-linecap="round"/>`).join('');
    return decorate(svg, {
      over: [
        // Ermine collar over the shoulders.
        '<path d="M12 106 Q16 92 34 88 L50 86 M116 106 Q112 92 94 88 L78 86" stroke="#fbf8f2" stroke-width="7" fill="none" stroke-linecap="round"/>',
        spots,
        // An emerald pendant on the chain, and a small platinum crown.
        `<circle cx="64" cy="99" r="4.6" fill="${EMERALD}" stroke="#0e5a32" stroke-width="1"/><path d="M62.2 97.6 L64 96.4" stroke="#ffffff" stroke-width=".8"/>`,
        `<path d="M50 30 L52 20 L57.5 25.5 L64 16 L70.5 25.5 L76 20 L78 30 Z" fill="${PLATINUM}" stroke="#4a5262" stroke-width="1" stroke-linejoin="round"/>`,
        `<circle cx="64" cy="25" r="1.8" fill="${RUBY}"/><circle cx="55.5" cy="27" r="1.2" fill="${EMERALD}"/><circle cx="72.5" cy="27" r="1.2" fill="#7aa2ff"/>`,
      ].join('\n  '),
    });
  },
  'hoe-crown-jewels': async () => {
    let svg = await load('hoe');
    svg = hoeCoat(svg, ['#6fe6aa', EMERALD, '#0e5a32'], `<path d="M0 7 Q3.5 5 7 7" stroke="#9af0c4" stroke-width=".35" fill="none" opacity=".5"/>`);
    svg = recolor(svg, { '#5a060c': '#0a3a20', '#17131a': '#16804a', '#3d3346': PLATINUM });
    return decorate(svg, {
      over: [
        // Ermine trim down the coat fronts.
        '<path d="M47 86 Q55 90 56 103 L53 136 M81 86 Q73 90 72 103 L75 136" stroke="#fbf8f2" stroke-width="4.5" fill="none"/>',
        '<path d="M54.6 104 v3 M54 116 v3 M53.6 128 v3 M73.4 104 v3 M74 116 v3 M74.4 128 v3" stroke="#111" stroke-width="1.1" stroke-linecap="round"/>',
        // Ruby studs on the gown.
        `<g fill="${RUBY}" stroke="#5a0710" stroke-width=".4"><circle cx="60" cy="110" r="1.2"/><circle cx="68" cy="110" r="1.2"/><circle cx="64" cy="118" r="1.2"/><circle cx="58" cy="126" r="1.2"/><circle cx="70" cy="126" r="1.2"/></g>`,
        // A tiara.
        `<path d="M53 18 L56 10.5 L59.5 14.5 L64 7 L68.5 14.5 L72 10.5 L75 18 Q64 15.5 53 18 Z" fill="${PLATINUM}" stroke="#4a5262" stroke-width=".8" stroke-linejoin="round"/>`,
        `<circle cx="64" cy="12.6" r="1.6" fill="${RUBY}"/><circle cx="57.8" cy="15.6" r="1" fill="#7aa2ff"/><circle cx="70.2" cy="15.6" r="1" fill="#7aa2ff"/>`,
      ].join('\n  '),
    });
  },
  'ak47-crown-jewels': async () => {
    let svg = await load('ak47');
    svg = restop(svg, 'wood', ['#5a7cf0', SAPPHIRE, '#132a7a']);
    svg = restop(svg, 'steel', ['#ffffff', PLATINUM, '#8a93a3']);
    svg = restop(svg, 'mag', ['#c9d0da', '#9aa3b2', '#5f6878']);
    svg = recolor(svg, { '#4a1f07': '#0b1440', '#f0a060': '#a8bcff', '#454a52': '#e1e6ee', '#2c2f34': '#a9b0bc', '#26292e': '#8a93a3' });
    const stone = (x, y, color) => `<circle cx="${x}" cy="${y}" r="2.2" fill="${color}" stroke="${PLATINUM}" stroke-width=".9"/><circle cx="${x - 0.7}" cy="${y - 0.7}" r=".6" fill="#ffffff"/>`;
    return decorate(svg, {
      over: [
        stone(30, 62, RUBY), stone(42, 60, EMERALD), stone(54, 58, '#7aa2ff'),
        stone(90, 54, EMERALD), stone(110, 54, RUBY), stone(130, 54, EMERALD),
        stone(166, 57, RUBY), stone(178, 57, '#7aa2ff'),
        `<path d="M16 58 L70 49" stroke="${PLATINUM}" stroke-width="1.2"/>`,
      ].join('\n  '),
    });
  },

  /* Bayou Smoke */
  'van-bayou-smoke': async () => {
    let svg = await load('van');
    svg = restop(svg, 'paint', ['#86a266', MOSS, '#2e4524', '#18240f']);
    svg = restop(svg, 'trim', ['#3a2a1a', '#1a120a']);
    svg = restop(svg, 'decal', ['#3e2a18', '#1e140a']);
    svg = restop(svg, 'glass', ['#a6b88e', '#4a5a3a', '#1e2818']);
    svg = restop(svg, 'rust', [['#5a3e22', 1], ['#5a3e22', 0.7], ['#5a3e22', 0]]);
    svg = recolor(svg, { '#b8bcba': '#c9b48a' });
    return decorate(svg, {
      defs: `<filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.6"/></filter>`,
      over: [
        // Mud up the sills.
        '<path d="M12 86 Q20 80 28 86 Q36 78 44 85 L48 92 L12 92 Z M88 86 Q98 79 110 85 Q122 78 134 85 Q146 80 160 86 L184 92 L86 92 Z M222 86 Q232 80 244 85 L246 92 L222 92 Z" fill="#5a3e22" opacity=".9"/>',
        '<g fill="#5a3e22"><circle cx="60" cy="78" r="1.6"/><circle cx="140" cy="76" r="1.2"/><circle cx="170" cy="80" r="1.8"/><circle cx="236" cy="76" r="1.2"/></g>',
        // Roof rack and a winch.
        '<path d="M20 20 H180 M30 20 V26 M80 20 V26 M130 20 V26 M175 20 V26" stroke="#141416" stroke-width="2"/>',
        '<rect x="240" y="80" width="10" height="8" rx="2" fill="#3a3e45" stroke="#0a0b0d" stroke-width=".8"/><path d="M250 84 H254" stroke="#9aa0a6" stroke-width="1"/>',
        // Spanish moss from the mirror, and fireflies.
        '<path d="M202 53 Q200 60 203 66 M205 53 Q206 60 204 68 M208 54 Q207 59 209 64" stroke="#a6b88e" stroke-width="1" fill="none"/>',
        `<g fill="${FIREFLY}"><circle cx="30" cy="12" r="2.4" filter="url(#glow)"/><circle cx="30" cy="12" r=".9"/><circle cx="160" cy="8" r="2.4" filter="url(#glow)"/><circle cx="160" cy="8" r=".9"/><circle cx="228" cy="44" r="2" filter="url(#glow)"/><circle cx="228" cy="44" r=".8"/></g>`,
      ].join('\n    '),
    });
  },
  'thug-bayou-smoke': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', `<rect width="14" height="14" fill="${MOSS}"/><path d="M0 4 Q7 2 14 4 M0 11 Q7 9 14 11" stroke="#5f8248" stroke-width=".8" fill="none"/>`);
    svg = restop(svg, 'tank', ['#7a8a44', '#3e4a22']);
    svg = restop(svg, 'band', ['#5a3e28', '#2e1f12']);
    svg = restop(svg, 'gold', ['#fffaf0', '#e8dcc0', '#9a8a68']);
    svg = restop(svg, 'lens', ['#3a4a2a', '#0b0f08', '#2a3a1a']);
    svg = recolor(svg, { '#e9fff0': '#7a5a3a', '#b5f5c5': '#7a5a3a', '#6ee095': '#e8ff6a', '#3a2a05': '#5a4a30' });
    return decorate(svg, {
      over: [
        // Wader straps and buckles.
        '<path d="M52 92 L54 126 M76 92 L74 126" stroke="#2e3a14" stroke-width="2.4"/>',
        '<rect x="51" y="100" width="5" height="4" rx=".8" fill="none" stroke="#c9ced4" stroke-width=".9"/><rect x="72" y="100" width="5" height="4" rx=".8" fill="none" stroke="#c9ced4" stroke-width=".9"/>',
        // A gator tooth on the cord.
        '<path d="M61.5 96 Q64 108 66.5 96 Z" fill="#fffaf0" stroke="#6a5a40" stroke-width=".8"/>',
        // Waxed sheen and a pocket flap.
        '<path d="M18 104 Q24 98 30 98 M98 98 Q104 98 110 104" stroke="#9ab878" stroke-width="1" fill="none" opacity=".7"/>',
        '<path d="M24 112 H38 V117 H24 Z M90 112 H104 V117 H90 Z" fill="#3e5a30" stroke="#1e2a14" stroke-width=".8"/>',
      ].join('\n  '),
    });
  },
  'hoe-bayou-smoke': async () => {
    let svg = await load('hoe');
    svg = hoeCoat(svg, ['#9aaa5a', '#5a6b2a', '#2e3a14'], '<rect x=".6" y=".6" width="2.6" height="2.2" rx=".8" fill="none" stroke="#3a4a1a" stroke-width=".4"/><rect x="3.8" y="3.8" width="2.6" height="2.2" rx=".8" fill="none" stroke="#3a4a1a" stroke-width=".4"/>');
    svg = recolor(svg, { '#5a060c': '#1e2a0a', '#17131a': CYPRESS, '#3d3346': '#a8845e' });
    return decorate(svg, {
      defs: `<filter id="ffglow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.4"/></filter>`,
      over: [
        '<path d="M50 100 L52 136 M78 100 L76 136 M58 104 L59 136 M70 104 L69 136" stroke="#7a5a3a" stroke-width=".6" opacity=".7"/>',
        // Fireflies.
        `<g fill="${FIREFLY}"><circle cx="14" cy="40" r="2.2" filter="url(#ffglow)"/><circle cx="14" cy="40" r=".9"/><circle cx="114" cy="28" r="2.2" filter="url(#ffglow)"/><circle cx="114" cy="28" r=".9"/><circle cx="120" cy="80" r="2" filter="url(#ffglow)"/><circle cx="120" cy="80" r=".8"/><circle cx="10" cy="84" r="2" filter="url(#ffglow)"/><circle cx="10" cy="84" r=".8"/></g>`,
        // A firefly charm on a cord.
        `<path d="M58 84 Q64 92 70 84" stroke="#7a5a3a" stroke-width="1" fill="none"/><circle cx="64" cy="89" r="1.6" fill="${FIREFLY}"/>`,
      ].join('\n  '),
    });
  },
  'shotgun-bayou-smoke': async () => {
    let svg = await load('shotgun');
    svg = restop(svg, 'barrel', ['#6a7378', '#363d42', '#16191c']);
    svg = restop(svg, 'steel', ['#5a6268', '#30363a', '#121416']);
    svg = restop(svg, 'wood', ['#a8845e', '#7a5a3a', '#3e2a18']);
    svg = recolor(svg, { '#3a1d08': '#2a1a0c', '#e6a868': '#c9a67a' });
    const scales = Array.from({ length: 5 }, (_, row) => Array.from({ length: 4 }, (_, col) => `<rect x="${40 + col * 6 + (row % 2) * 3}" y="${56 + row * 4}" width="4.6" height="3.2" rx="1.2"/>`).join('')).join('');
    return decorate(svg, {
      over: [
        // Gator-hide wrap at the wrist of the stock.
        `<path d="M38 52 L66 49.5 L68 68 L42 77 Z" fill="#5a6b2a" stroke="#1e2a0a" stroke-width=".8"/>`,
        `<g fill="#7a8a44" stroke="#2e3a14" stroke-width=".4">${scales}</g>`,
        '<path d="M122 47.5 H246" stroke="#c9ced4" stroke-opacity=".35" stroke-width="1.2"/>',
      ].join('\n  '),
    });
  },

  /* Desert Mirage */
  'low-rider-desert-mirage': async () => {
    let svg = await load('low-rider');
    svg = restop(svg, 'paint', ['#fff3dc', SAND, '#c9a678', '#8a6a44']);
    svg = restop(svg, 'roof', ['#d9733a', '#8a3e14']);
    svg = restop(svg, 'door', ['#f4dfb6', '#d6b787']);
    svg = restop(svg, 'primer', [['#262b3a', 0], ['#262b3a', 0]]);
    svg = restop(svg, 'glass', ['#f0e2c8', '#a89070', '#5a4a38']);
    svg = recolor(svg, { '#e02a3a': TURQUOISE, '#16384a': '#8a3e14', '#c2222e': TURQUOISE });
    return decorate(svg, {
      defs: `<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CANYON}" stop-opacity="0"/><stop offset="1" stop-color="${CANYON}" stop-opacity=".9"/></linearGradient>`,
      over: [
        // Rust-canyon fade up from the sills.
        '<path d="M12 80 L250 82 L249 90 L232 95 L195 95 L96 95 L59 95 L14 92 Z" fill="url(#fade)"/>',
        `<path d="M14 73.4 L244 76.4" stroke="${TURQUOISE}" stroke-width="1.4" fill="none"/>`,
        `<path d="M100 78 Q130 74 160 78 Q176 80 190 76" stroke="${TURQUOISE}" stroke-width=".9" fill="none"/>`,
        // Dust on the sills and tyres.
        '<g fill="#f4e6c8" opacity=".75"><circle cx="104" cy="92" r=".8"/><circle cx="118" cy="93" r=".6"/><circle cx="134" cy="91.5" r=".8"/><circle cx="150" cy="93" r=".6"/><circle cx="166" cy="92" r=".8"/><circle cx="182" cy="93" r=".6"/></g>',
        rings(LOW_RIDER_WHEELS, `<circle r="12.4" stroke="${SAND}" stroke-width="1.3" stroke-dasharray="3 2"/>`),
      ].join('\n    '),
    });
  },
  'thug-desert-mirage': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#c9a678"/><path d="M0 7 H14 M7 0 V14" stroke="#b8956a" stroke-width=".5"/>');
    svg = restop(svg, 'tank', ['#f6ead2', '#d9c4a0']);
    svg = restop(svg, 'band', ['#d9733a', '#8a3e14']);
    svg = restop(svg, 'gold', ['#e8eef0', '#a9b0b8', '#5a6168']);
    svg = restop(svg, 'lens', ['#ffd88a', '#7a4a10', '#e8a33a']);
    svg = recolor(svg, { '#e9fff0': '#fff3dc', '#b5f5c5': '#fff3dc', '#6ee095': '#ffffff', '#3a2a05': '#3a2a1a' });
    return decorate(svg, {
      over: [
        // The duster's long collar.
        '<path d="M50 86 L58 106 L44 126 M78 86 L70 106 L84 126" stroke="#8a6a44" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
        // Bolo tie: two cords and a turquoise slide.
        '<path d="M60 90 L61 112 M68 90 L67 112" stroke="#3a2a1a" stroke-width="1"/>',
        `<ellipse cx="64" cy="94" rx="3.6" ry="4.6" fill="${TURQUOISE}" stroke="#c9ced4" stroke-width="1.1"/>`,
        '<path d="M63 92 l1.6 2 l-1 1.4" stroke="#1d6a70" stroke-width=".5" fill="none"/>',
        '<path d="M60 112 l-1 3 M68 112 l1 3" stroke="#c9ced4" stroke-width="1.6" stroke-linecap="round"/>',
        // Dots on the bandana.
        '<g fill="#fff3dc"><circle cx="52" cy="40" r=".8"/><circle cx="60" cy="36" r=".8"/><circle cx="68" cy="36" r=".8"/><circle cx="76" cy="40" r=".8"/></g>',
      ].join('\n  '),
    });
  },
  'hoe-desert-mirage': async () => {
    let svg = await load('hoe');
    svg = hoeCoat(svg, ['#e2b07a', '#b5803e', '#7a5222'], '<path d="M0 7 L7 0" stroke="#9a6a32" stroke-width=".3" opacity=".4"/>');
    svg = recolor(svg, { '#5a060c': '#4a3014', '#17131a': CANYON, '#3d3346': TURQUOISE });
    const fringe = (x0, x1, y) => Array.from({ length: Math.floor((x1 - x0) / 3) + 1 }, (_, index) => `M${x0 + index * 3} ${y} v7`).join(' ');
    return decorate(svg, {
      over: [
        // Suede fringe off the sleeves and yoke.
        `<path d="${fringe(6, 34, 124)} ${fringe(94, 122, 124)}" stroke="#9a6a32" stroke-width="1.1" stroke-linecap="round"/>`,
        '<path d="M14 104 Q28 96 44 96 M114 104 Q100 96 84 96" stroke="#9a6a32" stroke-width="1" fill="none"/>',
        // Stacked turquoise beads.
        ...[[57, 85], [59.5, 88], [62, 90], [64.5, 90.4], [67, 89.6], [69.5, 87.6], [71.5, 85]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="${TURQUOISE}" stroke="#1d6a70" stroke-width=".4"/>`),
        `<ellipse cx="64" cy="95" rx="2.6" ry="3.4" fill="${TURQUOISE}" stroke="#c9ced4" stroke-width=".9"/>`,
      ].join('\n  '),
    });
  },
  'tek9-desert-mirage': async () => {
    let svg = await load('tek9');
    svg = restop(svg, 'steel', ['#efe4cf', '#b5a68e', '#7a6d5a']);
    svg = restop(svg, 'shroud', ['#d6c7ac', '#9a8a70', '#5f5444']);
    svg = restop(svg, 'poly', ['#a8845e', '#6a4a30']);
    svg = recolor(svg, { '#26292e': '#6a5a48', '#44484f': '#8a7a62', '#2f3237': '#9a8a70' });
    const inlay = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="${TURQUOISE}" stroke="#c9ced4" stroke-width=".8"/><path d="M${x + 1.5} ${y + 3} l${w / 3} -1.6 l${w / 3} 1.4" stroke="#1d6a70" stroke-width=".4" fill="none"/>`;
    return decorate(svg, {
      over: [
        inlay(70, 50, 22), inlay(122, 50, 16), inlay(70, 84, 12),
        `<path d="M62 62.6 H160" stroke="${CANYON}" stroke-width="1"/>`,
      ].join('\n  '),
    });
  },

  /* Rewind */
  'van-rewind': async () => {
    let svg = await load('van');
    svg = restop(svg, 'paint', ['#3a3e45', '#1e2024', '#0d0e10', '#050505']);
    svg = restop(svg, 'trim', ['#2a2d32', '#0d0e10']);
    svg = restop(svg, 'decal', [MAGENTA, '#7a1aa0']);
    svg = restop(svg, 'rust', [['#000000', 0], ['#000000', 0]]);
    svg = restop(svg, 'glass', ['#5a3a6a', '#1a1024', '#07040a']);
    svg = recolor(svg, { '#b8bcba': LIME });
    return decorate(svg, {
      defs: `<linearGradient id="sunset" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${LIME}"/><stop offset=".5" stop-color="#ffb627"/><stop offset="1" stop-color="${MAGENTA}"/></linearGradient>`,
      over: [
        // Racing stripes, magenta over lime.
        `<path d="M12 72 H120 Q140 72 150 64 H246" stroke="${MAGENTA}" stroke-width="3.2" fill="none"/>`,
        `<path d="M12 78 H122 Q144 78 154 70 H247" stroke="${LIME}" stroke-width="2" fill="none"/>`,
        // A sunset decal and a bubble window.
        '<g transform="translate(71 58)"><circle r="9" fill="url(#sunset)" stroke="#000" stroke-width=".8"/><path d="M-9 2 H9 M-8.4 4.4 H8.4 M-7 6.6 H7" stroke="#0d0e10" stroke-width="1.2"/></g>',
        '<ellipse cx="136" cy="46" rx="16" ry="9" fill="url(#glass)" stroke="#0a0b0d" stroke-width="1.4"/><path d="M126 42 Q130 39 136 39" stroke="#ffffff" stroke-opacity=".45" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
      ].join('\n    '),
    });
  },
  'thug-rewind': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#141416"/><path d="M0 0 H14" stroke="#2a2d32" stroke-width=".6"/>');
    svg = restop(svg, 'tank', ['#ffffff', '#d9dde3']);
    svg = restop(svg, 'band', ['#1b100a', '#0b0604']);
    svg = restop(svg, 'lens', ['#ff9af0', '#2a0a36', MAGENTA]);
    svg = recolor(svg, { '#e9fff0': '#3a2010', '#b5f5c5': '#3a2010', '#6ee095': '#ffffff' });
    return decorate(svg, {
      over: [
        // Colour-block panels on the windbreaker.
        `<path d="M14 108 Q20 96 32 92 L50 86 L54 94 L48 108 Z" fill="${MAGENTA}" stroke="#000" stroke-width="1"/>`,
        `<path d="M114 108 Q108 96 96 92 L78 86 L74 94 L80 108 Z" fill="${LIME}" stroke="#000" stroke-width="1"/>`,
        `<path d="M11 116 H47 M81 116 H117" stroke="${LIME}" stroke-width="3"/><path d="M11 120 H46 M82 120 H117" stroke="${MAGENTA}" stroke-width="2"/>`,
        // A cassette on the chain.
        '<rect x="57" y="95" width="14" height="9" rx="1.2" fill="#1e2024" stroke="#000" stroke-width=".8"/>',
        `<rect x="59" y="96.4" width="10" height="3.6" rx=".6" fill="${MAGENTA}"/><circle cx="61.6" cy="101.6" r="1.2" fill="#d9dde3"/><circle cx="66.4" cy="101.6" r="1.2" fill="#d9dde3"/>`,
      ].join('\n  '),
    });
  },
  'hoe-rewind': async () => {
    let svg = await load('hoe');
    svg = hoeCoat(svg, ['#e2ff8a', LIME, '#7aa81a'], '<path d="M0 3.5 H7" stroke="#9acd2a" stroke-width=".3" opacity=".6"/>');
    svg = recolor(svg, { '#5a060c': '#3a5208', '#17131a': '#16141c', '#3d3346': MAGENTA });
    return decorate(svg, {
      over: [
        // Big shoulders.
        `<path d="M10 98 Q16 82 34 84 Q46 86 48 92 Q34 90 22 98 Z" fill="${MAGENTA}" stroke="#000" stroke-width="1"/>`,
        `<path d="M118 98 Q112 82 94 84 Q82 86 80 92 Q94 90 106 98 Z" fill="${MAGENTA}" stroke="#000" stroke-width="1"/>`,
        // Zigzag across the top and a scrunchie on the side ponytail.
        `<path d="M48 110 l4 -4 l4 4 l4 -4 l4 4 l4 -4 l4 4 l4 -4 l4 4" stroke="${LIME}" stroke-width="1.6" fill="none"/>`,
        `<circle cx="98" cy="30" r="5" fill="${MAGENTA}" stroke="#000" stroke-width="1"/><path d="M95 28 q3 -2 6 0 M95 32 q3 2 6 0" stroke="#ff9af0" stroke-width=".8" fill="none"/>`,
        `<path d="M44 72 v6 M84 72 v6" stroke="${LIME}" stroke-width="2.4" stroke-linecap="round"/>`,
      ].join('\n  '),
    });
  },
  'tek9-rewind': async () => {
    let svg = await load('tek9');
    svg = restop(svg, 'steel', ['#3a3e45', '#1e2024', '#0d0e10']);
    svg = restop(svg, 'shroud', ['#2a2d32', '#141518', '#050505']);
    svg = restop(svg, 'poly', ['#1e2024', '#0d0e10']);
    return decorate(svg, {
      over: [
        `<path d="M168 45 L176 63 M180 45 L188 63" stroke="${MAGENTA}" stroke-width="3.4"/>`,
        `<path d="M174 45 L182 63 M186 45 L194 63" stroke="${LIME}" stroke-width="2"/>`,
        `<path d="M60 62.6 H158" stroke="${MAGENTA}" stroke-width="1.4"/><path d="M60 47.6 H158" stroke="${LIME}" stroke-width="1"/>`,
        `<path d="M80 74 L94 74 M79 84 L92 84" stroke="${LIME}" stroke-width="1.6"/>`,
      ].join('\n  '),
    });
  },

  /* Snake Eyes */
  'sedan-snake-eyes': async () => {
    let svg = await load('sedan');
    svg = restop(svg, 'paint', ['#4a4e56', '#1c1e22', '#0b0c0e', '#030304']);
    svg = restop(svg, 'glass', ['#3a3e45', '#121417', '#050607']);
    svg = recolor(svg, { '#5e4e35': '#000000', '#5a4a32': '#2a2d32', '#6e5c3e': '#2a2d32', '#c2ad85': IVORY, '#9aa2ab': '#c9ced4' });
    return decorate(svg, {
      over: [
        `<path d="M24 76.4 Q130 72.9 238 75.4" stroke="${FELT}" stroke-width="1.8" fill="none"/>`,
        `<path d="M24 79 Q130 75.5 238 78" stroke="${IVORY}" stroke-width=".6" fill="none"/>`,
        // Card suits on the rear door.
        suit('spade', 140, 86, IVORY), suit('heart', 151, 86, RUBY), suit('club', 162, 86, IVORY), suit('diamond', 116, 86, RUBY),
        // Fuzzy dice on the mirror.
        '<path d="M150 43 V48 M154 43 V50" stroke="#c9ced4" stroke-width=".6"/>',
        die(146.5, 47.5, 6, 5, '#ffffff'), die(151.5, 49.5, 6, 6, '#ffffff'),
        rings(SEDAN_WHEELS, `<circle r="11.4" stroke="${FELT}" stroke-width="1.6"/>`),
        '<path d="M70 52 C92 40 116 37 132 37" stroke="#ffffff" stroke-opacity=".35" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
      ].join('\n    '),
    });
  },
  'thug-snake-eyes': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#f6f3ea"/><path d="M0 9 Q7 7 14 9" stroke="#dcd6c6" stroke-width=".7" fill="none"/>');
    svg = restop(svg, 'tank', ['#2a2d32', '#0b0c0e']);
    svg = restop(svg, 'band', ['#1b100a', '#0b0604']);
    svg = restop(svg, 'lens', ['#3a3e45', '#0b0c0e', '#2a2d32']);
    svg = recolor(svg, { '#e9fff0': '#3a2010', '#b5f5c5': '#3a2010', '#6ee095': '#ffffff' });
    return decorate(svg, {
      over: [
        // Waistcoat buttons, a red bow tie and sleeve garters.
        `<g fill="${IVORY}"><circle cx="64" cy="106" r="1.2"/><circle cx="64" cy="113" r="1.2"/><circle cx="64" cy="120" r="1.2"/></g>`,
        `<path d="M57 88 L64 91 L71 88 L71 95 L64 92 L57 95 Z" fill="${RUBY}" stroke="#5a0710" stroke-width=".8"/>`,
        `<path d="M14 112 Q22 109 30 112 M98 112 Q106 109 114 112" stroke="${RUBY}" stroke-width="2.4" fill="none"/>`,
        // The dealer's green visor.
        `<path d="M42 44 Q64 34 86 44 L82 50 Q64 43 46 50 Z" fill="${FELT}" fill-opacity=".85" stroke="#0e3a22" stroke-width="1"/>`,
        // A card in the pocket.
        `<rect x="90" y="100" width="7" height="9" rx="1" fill="#ffffff" stroke="#000" stroke-width=".6" transform="rotate(10 93 104)"/>`,
        suit('heart', 93.4, 104.6, RUBY, 0.45),
      ].join('\n  '),
    });
  },
  'hoe-snake-eyes': async () => {
    let svg = await load('hoe');
    svg = hoeCoat(svg, ['#4a4e56', '#16181c', '#050505'], '<circle cx="2" cy="2" r=".5" fill="#ffffff" opacity=".35"/><circle cx="5.5" cy="5" r=".4" fill="#ffffff" opacity=".25"/>');
    svg = recolor(svg, { '#5a060c': '#000000', '#17131a': '#0b0c0e', '#3d3346': RUBY });
    const chips = [RUBY, '#ffffff', FELT, RUBY, '#141416'].map((color, index) => `<ellipse cx="104" cy="${126 - index * 3}" rx="8" ry="2.6" fill="${color}" stroke="#000" stroke-width=".7"/>`).join('');
    return decorate(svg, {
      over: [
        // Red suits on the sequin dress.
        suit('heart', 58, 112, RUBY, 0.9), suit('diamond', 70, 118, RUBY, 0.9), suit('heart', 62, 128, RUBY, 0.8),
        '<g fill="#ffffff" opacity=".5"><circle cx="54" cy="104" r=".6"/><circle cx="74" cy="108" r=".6"/><circle cx="66" cy="122" r=".6"/><circle cx="52" cy="124" r=".6"/></g>',
        // A stack of chips.
        chips,
      ].join('\n  '),
    });
  },
  'pistol-snake-eyes': async () => {
    let svg = await load('pistol');
    svg = restop(svg, 'slide', ['#4a4e56', '#1c1e22', '#0b0c0e']);
    svg = restop(svg, 'grip', ['#fffaf0', IVORY, '#c9b994']);
    svg = recolor(svg, { '#2a2d32': '#1c1e22' });
    return decorate(svg, {
      over: [
        // A five face of dice pips on the grip.
        '<g fill="#141416"><circle cx="34" cy="70" r="1.8"/><circle cx="48" cy="70" r="1.8"/><circle cx="40" cy="80" r="1.8"/><circle cx="32" cy="90" r="1.8"/><circle cx="46" cy="90" r="1.8"/></g>',
        `<path d="M22 49.5 H111" stroke="${RUBY}" stroke-width="1.1"/>`,
        suit('spade', 92, 46.5, IVORY, 0.8),
      ].join('\n  '),
    });
  },
});


/* ---------- Holiday sets (held until released) ---------- */

const GHOST = '#a8f0c6';
const BONE = '#efe9da';
const IRON = '#2a2f33';
const CANDY = '#e23a3a';
const FOIL = '#2f8a4f';
const ROSE = '#ff4d6d';
const MANGO = '#ffb627';
const SKY = '#5ab4ff';

Object.assign(recipes, {
  /* Graveyard Shift */
  'sedan-graveyard-shift': async () => {
    let svg = await load('sedan');
    svg = restop(svg, 'paint', ['#4a4e56', '#1a1c20', '#0a0b0d', '#020203']);
    svg = restop(svg, 'glass', ['#3a4440', '#121816', '#060807']);
    svg = restop(svg, 'rim', ['#f4f2ec', '#9aa0a6', '#4f555b']);
    svg = recolor(svg, { '#5e4e35': '#000000', '#5a4a32': '#2a2f33', '#6e5c3e': '#2a2f33', '#c2ad85': BONE, '#9aa2ab': '#9aa0a6' });
    return decorate(svg, {
      over: [
        // Wrought-iron roof rail with finials.
        `<path d="M82 36 H182" stroke="${IRON}" stroke-width="2"/><path d="M88 36 V30 M104 36 V30 M120 36 V30 M136 36 V30 M152 36 V30 M168 36 V30" stroke="${IRON}" stroke-width="1.4"/>`,
        `<g fill="${IRON}">${[88, 104, 120, 136, 152, 168].map((x) => `<path d="M${x - 1.6} 30 L${x} 26.5 L${x + 1.6} 30 Z"/>`).join('')}</g>`,
        // Lace curtains in the rear glass and a landau bar.
        '<path d="M92 56 Q98 48 104 56 Q110 48 116 56 Q122 48 126 56" stroke="#efe9da" stroke-opacity=".75" stroke-width="1" fill="none"/>',
        '<path d="M92 52 Q98 44 104 52 Q110 44 116 52" stroke="#efe9da" stroke-opacity=".4" stroke-width=".8" fill="none"/>',
        `<path d="M60 62 Q66 54 74 58" stroke="${BONE}" stroke-width="1.6" fill="none"/>`,
        `<path d="M24 76.6 Q130 73.1 238 75.6" stroke="${GHOST}" stroke-opacity=".7" stroke-width="1" fill="none"/>`,
        rings(SEDAN_WHEELS, `<circle r="12" stroke="${GHOST}" stroke-opacity=".6" stroke-width="1"/>`),
      ].join('\n    '),
    });
  },
  'thug-graveyard-shift': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#16181b"/><path d="M0 7 H14" stroke="#22262a" stroke-width=".6"/>');
    svg = restop(svg, 'tank', ['#f4f2ec', '#d6d1c4']);
    svg = restop(svg, 'band', ['#1b100a', '#0b0604']);
    svg = restop(svg, 'lens', ['#3a4440', '#060807', '#2a3a33']);
    svg = recolor(svg, { '#e9fff0': '#3a2010', '#b5f5c5': '#3a2010', '#6ee095': GHOST });
    return decorate(svg, {
      over: [
        // Frock coat lapels, a black cravat and a bowler.
        '<path d="M50 86 L58 106 L46 126 M78 86 L70 106 L82 126" stroke="#000" stroke-width="1.4" fill="none" stroke-linejoin="round"/>',
        '<path d="M58 88 Q64 96 70 88 L67 100 L61 100 Z" fill="#0b0c0e" stroke="#000" stroke-width=".8"/>',
        '<path d="M38 47 Q64 41 90 47 Q88 50.5 64 49 Q40 50.5 38 47 Z" fill="#141518" stroke="#000" stroke-width="1.2"/>',
        '<path d="M46 47 Q44 26 64 25 Q84 26 82 47 Q64 43 46 47 Z" fill="#1c1e22" stroke="#000" stroke-width="1.2"/>',
        `<path d="M46.5 44 Q64 40 81.5 44" stroke="${GHOST}" stroke-opacity=".5" stroke-width="1.2" fill="none"/>`,
        // A bone-handled cane.
        `<path d="M108 82 V126" stroke="#1c1e22" stroke-width="2.6"/><path d="M104 82 Q108 76 113 80" stroke="${BONE}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
      ].join('\n  '),
    });
  },
  'hoe-graveyard-shift': async () => {
    let svg = await load('hoe');
    svg = hoeCoat(svg, ['#3a3e45', '#16181c', '#050505'], '<path d="M1 1 Q3.5 4 6 1 M1 6 Q3.5 3 6 6" stroke="#4f555b" stroke-width=".35" fill="none" opacity=".6"/>');
    svg = recolor(svg, { '#5a060c': '#000000', '#17131a': '#0b0c0e', '#3d3346': '#4f555b' });
    return decorate(svg, {
      over: [
        // Lace trim, a veil and a ghost-green cameo.
        '<path d="M46 96 Q64 108 82 96" stroke="#d6d1c4" stroke-opacity=".7" stroke-width="1.2" stroke-dasharray="1 1" fill="none"/>',
        '<path d="M46 26 Q64 14 82 26 L86 56 Q64 50 42 56 Z" fill="#0b0c0e" fill-opacity=".35" stroke="#2a2f33" stroke-width=".8"/>',
        '<path d="M48 30 L84 50 M80 30 L44 50" stroke="#d6d1c4" stroke-opacity=".18" stroke-width=".6"/>',
        `<ellipse cx="64" cy="93" rx="3.6" ry="4.4" fill="${GHOST}" stroke="${BONE}" stroke-width="1"/>`,
      ].join('\n  '),
    });
  },
  'pistol-graveyard-shift': async () => {
    let svg = await load('pistol');
    svg = restop(svg, 'slide', ['#9aa0a6', '#4f555b', '#1c1e22']);
    svg = restop(svg, 'grip', ['#fffaf0', BONE, '#c9bfa8']);
    return decorate(svg, {
      over: [
        // A small skull etched on the slide, and vines.
        `<g transform="translate(92 46)" stroke="${GHOST}" stroke-width=".7" fill="none"><circle r="3.2"/><path d="M-1.6 -.4 h.1 M1.5 -.4 h.1 M-1 3 v1.6 M0 3 v1.6 M1 3 v1.6"/></g>`,
        `<path d="M30 46 q5 -4 10 0 t10 0 t10 0" stroke="${GHOST}" stroke-opacity=".7" stroke-width=".8" fill="none"/>`,
        '<path d="M34 70 q6 6 0 12 q-6 6 0 12" stroke="#c9bfa8" stroke-width="1" fill="none"/>',
      ].join('\n  '),
    });
  },

  /* Naughty List */
  'van-naughty-list': async () => {
    let svg = await load('van');
    svg = restop(svg, 'paint', ['#ffffff', '#f4eeee', '#dccccc', '#a89090']);
    svg = restop(svg, 'decal', [FOIL, '#1c5a32']);
    svg = restop(svg, 'rust', [['#000000', 0], ['#000000', 0]]);
    svg = recolor(svg, { '#b8bcba': '#ffd166' });
    const stripes = Array.from({ length: 16 }, (_, index) => `<path d="M${14 + index * 12} 30 L${26 + index * 12} 86" stroke="${CANDY}" stroke-width="4" stroke-opacity=".85"/>`).join('');
    return decorate(svg, {
      defs: '<clipPath id="side"><rect x="12" y="28" width="156" height="58"/></clipPath>',
      over: [
        `<g clip-path="url(#side)">${stripes}</g>`,
        // The giant roof bow.
        `<path d="M90 22 Q70 6 74 22 Q70 34 90 24 Q110 34 106 22 Q110 6 90 22 Z" fill="${CANDY}" stroke="#7a1010" stroke-width="1"/><circle cx="90" cy="23" r="3.2" fill="#b02424" stroke="#7a1010" stroke-width=".8"/>`,
        '<path d="M86 25 L80 34 M94 25 L100 34" stroke="#b02424" stroke-width="3" stroke-linecap="round"/>',
        // A NAUGHTY plate.
        '<rect x="236" y="88" width="14" height="6" rx="1" fill="#ffffff" stroke="#000" stroke-width=".6"/><text x="243" y="92.6" text-anchor="middle" font-family="Arial, sans-serif" font-size="3.4" font-weight="900" fill="#b02424">NAUGHTY</text>',
      ].join('\n    '),
    });
  },
  'thug-naughty-list': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', `<rect width="14" height="14" fill="${FOIL}"/><path d="M0 4 L3.5 1 L7 4 L10.5 1 L14 4" stroke="#ffffff" stroke-width="1" fill="none"/><circle cx="3.5" cy="9" r="1.2" fill="${CANDY}"/><circle cx="10.5" cy="9" r="1.2" fill="#ffffff"/>`);
    svg = restop(svg, 'tank', ['#e85656', '#a11c1c']);
    svg = restop(svg, 'band', ['#e85656', '#a11c1c']);
    svg = recolor(svg, { '#e9fff0': '#ffffff', '#b5f5c5': '#ffffff', '#6ee095': '#ffffff' });
    return decorate(svg, {
      over: [
        '<path d="M44 46 Q64 38 84 46 L84 50 Q64 43 44 50 Z" fill="#ffffff" stroke="#c9c0b2" stroke-width=".8"/>',
        '<circle cx="90" cy="34" r="4.6" fill="#ffffff" stroke="#c9c0b2" stroke-width=".8"/>',
        '<path d="M50 110 L56 104 L62 110 L68 104 L74 110 L80 104" stroke="#ffffff" stroke-width="1.6" fill="none"/>',
      ].join('\n  '),
    });
  },
  'hoe-naughty-list': async () => {
    let svg = await load('hoe');
    svg = restop(svg, 'fur', ['#ff6b6b', CANDY, '#8a1414']);
    svg = repattern(svg, 'tufts', '<path d="M0 7 Q3.5 5 7 7" stroke="#ff9a9a" stroke-width=".35" fill="none" opacity=".5"/>');
    svg = svg.replace(/ filter="url\(#fuzz\)"/g, '');
    svg = recolor(svg, { '#5a060c': '#5a0a0a', '#17131a': FOIL, '#3d3346': '#ffffff' });
    return decorate(svg, {
      over: [
        // White fur trim down the fronts and at the cuffs.
        '<path d="M47 86 Q55 90 56 103 L53 136 M81 86 Q73 90 72 103 L75 136" stroke="#ffffff" stroke-width="4.5" fill="none"/>',
        '<path d="M2 130 H30 M98 130 H126" stroke="#ffffff" stroke-width="5"/>',
        // A tiny bow at the neck and foil sparkle.
        `<path d="M64 92 L58 88 L58 96 Z M64 92 L70 88 L70 96 Z" fill="${CANDY}" stroke="#7a1010" stroke-width=".6"/>`,
        '<g fill="#ffd166"><circle cx="60" cy="114" r=".9"/><circle cx="68" cy="122" r=".9"/><circle cx="62" cy="130" r=".9"/></g>',
      ].join('\n  '),
    });
  },
  'tek9-naughty-list': async () => {
    let svg = await load('tek9');
    svg = restop(svg, 'steel', ['#4fae6f', FOIL, '#1c5a32']);
    svg = restop(svg, 'shroud', ['#ff6b6b', CANDY, '#8a1414']);
    svg = restop(svg, 'poly', ['#2a2d32', '#111316']);
    return decorate(svg, {
      over: [
        // Ribbon across the wrap, tied in a bow on the grip.
        `<path d="M110 44 V65" stroke="#ffd166" stroke-width="3"/><path d="M60 54 H162" stroke="#ffd166" stroke-width="2.4"/>`,
        `<path d="M84 76 L76 70 L76 82 Z M84 76 L92 70 L92 82 Z" fill="#ffd166" stroke="#a37a1a" stroke-width=".6"/>`,
        '<g fill="#ffffff" opacity=".7"><circle cx="72" cy="50" r=".8"/><circle cx="96" cy="60" r=".8"/><circle cx="134" cy="48" r=".8"/><circle cx="150" cy="60" r=".8"/></g>',
      ].join('\n  '),
    });
  },

  /* Heartbreaker */
  'low-rider-heartbreaker': async () => {
    let svg = await load('low-rider');
    svg = restop(svg, 'paint', ['#ff5a6e', '#d81f3a', '#8a0f22', '#3a0610']);
    svg = restop(svg, 'roof', ['#2a0a12', '#120408']);
    svg = restop(svg, 'door', ['#e83250', '#9e1428']);
    svg = restop(svg, 'primer', [['#262b3a', 0], ['#262b3a', 0]]);
    svg = recolor(svg, { '#e02a3a': '#000000', '#16384a': '#2a0a12' });
    const hearts = [[118, 84], [146, 82], [174, 84]].map(([x, y]) => `<path transform="translate(${x} ${y}) scale(1.4)" d="${SUIT.heart}" fill="#1a050a" stroke="#ffb3c0" stroke-width=".4"/>`).join('');
    return decorate(svg, {
      over: [
        // A rose-vine pinstripe with thorns.
        `<path d="M14 73.4 Q60 70 100 75 T190 75 T244 76" stroke="#1a050a" stroke-width="1.2" fill="none"/>`,
        '<path d="M40 72 l2 -3 M70 72 l2 3 M130 75 l2 -3 M160 75 l2 3 M210 75 l2 -3" stroke="#1a050a" stroke-width=".9"/>',
        hearts,
        // The chain heart wheel behind the glass.
        `<path transform="translate(158 56) scale(1.1)" d="${SUIT.heart}" fill="none" stroke="#e1e6ec" stroke-width=".9" stroke-dasharray="1 .6"/>`,
        rings(LOW_RIDER_WHEELS, '<circle r="12.4" stroke="#ffb3c0" stroke-width="1.1"/>'),
      ].join('\n    '),
    });
  },
  'thug-heartbreaker': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#141416"/><path d="M0 0 H14" stroke="#1f1f24" stroke-width=".6"/>');
    svg = restop(svg, 'tank', ['#ff6b80', '#b5122f']);
    svg = restop(svg, 'band', ['#1b100a', '#0b0604']);
    svg = restop(svg, 'lens', ['#ff8a9a', '#3a0610', ROSE]);
    svg = recolor(svg, { '#e9fff0': '#3a2010', '#b5f5c5': '#3a2010', '#6ee095': '#ffffff' });
    const rose = (x, y) => `<g transform="translate(${x} ${y})"><circle r="3.6" fill="${ROSE}" stroke="#5a0a18" stroke-width=".7"/><path d="M-1.6 0 Q0 -2 1.6 0 Q0 1.6 -1.6 0" stroke="#5a0a18" stroke-width=".6" fill="none"/><path d="M-3.4 2.6 l-3 2 M3.2 2.4 l3 2.2" stroke="#2f6b3a" stroke-width="1.2" stroke-linecap="round"/></g>`;
    return decorate(svg, {
      over: [
        rose(26, 108), rose(102, 110), rose(34, 118),
        '<path d="M18 116 q6 -8 14 -2 M96 120 q8 -6 14 0" stroke="#2f6b3a" stroke-width="1" fill="none"/>',
        '<path d="M22 118 l-1.6 2 M100 122 l1.6 2" stroke="#2f6b3a" stroke-width=".8"/>',
      ].join('\n  '),
    });
  },
  'hoe-heartbreaker': async () => {
    let svg = await load('hoe');
    svg = hoeCoat(svg, ['#ff5a6e', '#d81f3a', '#7a0c1c'], '<path d="M0 7 Q3.5 5 7 7" stroke="#ff8a9a" stroke-width=".35" fill="none" opacity=".5"/>');
    svg = recolor(svg, { '#5a060c': '#3a0610', '#17131a': '#b5122f', '#3d3346': '#1a050a' });
    return decorate(svg, {
      over: [
        // Heart-shaped shades.
        `<path transform="translate(55 52.6) scale(1.5)" d="${SUIT.heart}" fill="#1a050a" fill-opacity=".85" stroke="${ROSE}" stroke-width=".5"/>`,
        `<path transform="translate(73 52.6) scale(1.5)" d="${SUIT.heart}" fill="#1a050a" fill-opacity=".85" stroke="${ROSE}" stroke-width=".5"/>`,
        `<path d="M60 52 Q64 50.4 68 52" stroke="${ROSE}" stroke-width=".9" fill="none"/>`,
        // A thorned choker.
        '<path d="M57.4 80.6 Q64 84.2 70.6 80.6" stroke="#1a050a" stroke-width="1.6" fill="none"/>',
        '<path d="M59 81.6 l-.6 1.6 M62 82.6 l0 1.6 M66 82.6 l0 1.6 M69 81.6 l.6 1.6" stroke="#1a050a" stroke-width=".7"/>',
      ].join('\n  '),
    });
  },
  'tek9-heartbreaker': async () => {
    let svg = await load('tek9');
    svg = restop(svg, 'steel', ['#ffd9df', '#d8a0aa', '#8a5a64']);
    svg = restop(svg, 'shroud', ['#e8b8c0', '#a8707a', '#5a3038']);
    svg = restop(svg, 'poly', ['#2a0a12', '#120408']);
    return decorate(svg, {
      over: [
        // An engraved thorn vine along the receiver.
        '<path d="M62 54 q8 -6 16 0 t16 0 t16 0 t16 0 t16 0 t16 0" stroke="#5a1a28" stroke-width="1" fill="none"/>',
        '<path d="M70 51 l1 -2 M86 57 l1 2 M102 51 l1 -2 M118 57 l1 2 M134 51 l1 -2 M150 57 l1 2" stroke="#5a1a28" stroke-width=".8"/>',
        `<path transform="translate(190 54) scale(1.2)" d="${SUIT.heart}" fill="${ROSE}" stroke="#5a0a18" stroke-width=".5"/>`,
      ].join('\n  '),
    });
  },

  /* Block Party */
  'van-block-party': async () => {
    let svg = await load('van');
    svg = restop(svg, 'paint', ['#ffffff', '#eef6ff', '#cfe0f2', '#94acc6']);
    svg = restop(svg, 'decal', [SKY, '#2a7acc']);
    svg = restop(svg, 'rust', [['#000000', 0], ['#000000', 0]]);
    svg = recolor(svg, { '#b8bcba': '#ffffff' });
    return decorate(svg, {
      over: [
        // A swirl cone on the side and a candy band.
        `<path d="M14 80 H168" stroke="${MANGO}" stroke-width="4"/><path d="M14 84 H168" stroke="${SKY}" stroke-width="2"/>`,
        `<path d="M120 70 L128 52 L136 70 Z" fill="#e2b06a" stroke="#8a5a1a" stroke-width=".8"/><path d="M122 52 Q128 40 134 52 Q138 50 134 46 Q128 34 122 46 Q118 50 122 52 Z" fill="#ffd1e0" stroke="#c9758f" stroke-width=".8"/>`,
        '<path d="M124 64 L132 58 M124 58 L132 64" stroke="#8a5a1a" stroke-width=".6"/>',
        // Speaker stack on the roof.
        '<rect x="44" y="10" width="20" height="16" rx="2" fill="#1e2024" stroke="#000" stroke-width="1"/><rect x="66" y="12" width="16" height="14" rx="2" fill="#1e2024" stroke="#000" stroke-width="1"/>',
        `<g fill="none" stroke="${MANGO}" stroke-width="1.2"><circle cx="54" cy="18" r="5"/><circle cx="74" cy="19" r="4"/></g><g fill="#3a3e45"><circle cx="54" cy="18" r="2"/><circle cx="74" cy="19" r="1.6"/></g>`,
        `<path d="M88 12 q4 4 0 8 M92 9 q6 7 0 14" stroke="${SKY}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
      ].join('\n    '),
    });
  },
  'thug-block-party': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', `<rect width="14" height="14" fill="${SKY}"/><path d="M0 7 H14" stroke="#4aa4ef" stroke-width=".6"/>`);
    svg = restop(svg, 'tank', ['#ffffff', '#e6eef8']);
    svg = restop(svg, 'band', ['#1b100a', '#0b0604']);
    svg = restop(svg, 'lens', ['#ffe08a', '#7a4a10', MANGO]);
    svg = recolor(svg, { '#e9fff0': '#3a2010', '#b5f5c5': '#3a2010', '#6ee095': '#ffffff' });
    return decorate(svg, {
      over: [
        // Track stripes and a bucket hat.
        '<path d="M14 112 Q22 98 34 93 M114 112 Q106 98 94 93" stroke="#ffffff" stroke-width="2.4" fill="none"/>',
        `<path d="M16 115 Q24 101 36 96 M112 115 Q104 101 92 96" stroke="${MANGO}" stroke-width="1.2" fill="none"/>`,
        `<path d="M38 48 Q64 42 90 48 L84 52 Q64 47 44 52 Z" fill="${MANGO}" stroke="#8a5a1a" stroke-width="1"/>`,
        `<path d="M46 47 Q46 28 64 27 Q82 28 82 47 Q64 43 46 47 Z" fill="#ffc94a" stroke="#8a5a1a" stroke-width="1"/>`,
        '<path d="M48 40 Q64 36 80 40" stroke="#8a5a1a" stroke-width=".7" fill="none" stroke-dasharray="1.4 1"/>',
      ].join('\n  '),
    });
  },
  'hoe-block-party': async () => {
    let svg = await load('hoe');
    svg = hoeCoat(svg, ['#8ad0ff', SKY, '#2a7acc'], '<circle cx="3.5" cy="3.5" r=".9" fill="#ffffff" opacity=".35"/>');
    svg = recolor(svg, { '#5a060c': '#1a4a7a', '#17131a': MANGO, '#3d3346': '#e8443a' });
    return decorate(svg, {
      over: [
        // Big silver hoops and a mango scrunchie.
        '<circle cx="45" cy="73" r="5.2" fill="none" stroke="#e1e6ec" stroke-width="1.4"/><circle cx="83" cy="73" r="5.2" fill="none" stroke="#e1e6ec" stroke-width="1.4"/>',
        `<path d="M54 14 Q64 8 74 14 Q64 20 54 14 Z" fill="${MANGO}" stroke="#8a5a1a" stroke-width=".8"/>`,
        '<path d="M50 112 H78 M50 118 H78" stroke="#ffffff" stroke-width="1.6" opacity=".8"/>',
      ].join('\n  '),
    });
  },
  'shotgun-block-party': async () => {
    let svg = await load('shotgun');
    svg = restop(svg, 'barrel', ['#ffffff', '#c9d6e4', '#7a8ea4']);
    svg = restop(svg, 'steel', ['#e6eef8', '#9aaec4', '#4f647a']);
    svg = restop(svg, 'wood', ['#8ad0ff', SKY, '#2a7acc']);
    svg = recolor(svg, { '#3a1d08': '#1a4a7a', '#e6a868': '#ffffff' });
    const sticker = (x, y, r, color, rot) => `<rect x="${x}" y="${y}" width="${r}" height="${r * 0.7}" rx="1.4" fill="${color}" stroke="#ffffff" stroke-width=".8" transform="rotate(${rot} ${x + r / 2} ${y + r / 3})"/>`;
    return decorate(svg, {
      over: [
        sticker(22, 58, 10, MANGO, -12), sticker(40, 54, 9, '#e8443a', 8), sticker(56, 52, 10, '#7ef29d', -6), sticker(30, 70, 8, '#ff6fb5', 14),
        sticker(146, 55, 9, MANGO, 6), sticker(168, 56, 9, '#e8443a', -8),
        '<path d="M44 58 l4 3 M60 56 h4" stroke="#ffffff" stroke-width=".8"/>',
      ].join('\n  '),
    });
  },
});


/* ---------- Street Singles (one-off pieces, no set) ---------- */

Object.assign(recipes, {
  'sedan-taxi-hustle': async () => {
    let svg = await load('sedan');
    svg = restop(svg, 'paint', ['#ffe066', '#ffcc00', '#d9a600', '#8a6a00']);
    svg = recolor(svg, { '#c2ad85': '#1e2024', '#5e4e35': '#3a2e00' });
    const checks = Array.from({ length: 24 }, (_, index) => `<rect x="${30 + index * 8}" y="${index % 2 ? 80.5 : 78.5}" width="4" height="2" fill="#111"/>`).join('');
    return decorate(svg, {
      over: [
        `<path d="M28 79 Q130 75.5 234 78" stroke="#ffffff" stroke-width="4.4" fill="none"/>`, checks,
        // Roof light and a TAXI sign.
        '<rect x="118" y="27" width="24" height="9" rx="2" fill="#fff6d8" stroke="#000" stroke-width="1"/><text x="130" y="34" text-anchor="middle" font-family="Arial, sans-serif" font-size="6.4" font-weight="900" fill="#111">TAXI</text>',
        '<rect x="128" y="62" width="14" height="7" rx="1" fill="#111"/><text x="135" y="67.6" text-anchor="middle" font-family="Arial, sans-serif" font-size="4.6" font-weight="700" fill="#ffcc00">$4.50</text>',
      ].join('\n    '),
    });
  },
  'sedan-two-tone': async () => {
    let svg = await load('sedan');
    svg = restop(svg, 'paint', ['#7fd6cc', '#3fa89c', '#2a7a72', '#134a44']);
    svg = recolor(svg, { '#c2ad85': '#e9ecef' });
    return decorate(svg, {
      over: [
        // Cream roof over the teal body, a chrome spear and whitewalls.
        '<path d="M62 55.5 C82 42.5 105 36.5 130 36.5 C153 36.5 171 43 192 58.5 L188 60 C168 46 152 40 130 40 C106 40 84 46 66 58 Z" fill="#fbf3dc" stroke="#c9b994" stroke-width=".6"/>',
        '<path d="M40 74 Q120 70 230 73 L200 76 Q120 74 60 77 Z" fill="#e1e6ec" stroke="#8a93a3" stroke-width=".6"/>',
        rings(SEDAN_WHEELS, '<circle r="13" stroke="#fbfaf6" stroke-width="2.8"/>'),
      ].join('\n    '),
    });
  },
  'low-rider-lime-flake': async () => {
    let svg = await load('low-rider');
    svg = restop(svg, 'paint', ['#d6ff6a', '#8fd400', '#4f8a00', '#244400']);
    svg = restop(svg, 'door', ['#a6e81a', '#5a9a00']);
    svg = restop(svg, 'primer', [['#262b3a', 0], ['#262b3a', 0]]);
    const flakes = Array.from({ length: 40 }, (_, index) => `<circle cx="${20 + ((index * 37) % 220)}" cy="${66 + ((index * 13) % 24)}" r=".6" fill="#ffffff" opacity=".7"/>`).join('');
    return decorate(svg, {
      over: [
        flakes,
        '<path d="M110 82 q8 -8 16 0 q8 8 16 0 M150 82 q8 -8 16 0" stroke="#e8b93a" stroke-width="1.4" fill="none"/>',
        '<path d="M14 73.4 L244 76.4" stroke="#e8b93a" stroke-width="1" fill="none"/>',
      ].join('\n    '),
    });
  },
  'low-rider-hot-flames': async () => {
    let svg = await load('low-rider');
    svg = restop(svg, 'paint', ['#4a4e56', '#1c1e22', '#0b0c0e', '#030304']);
    svg = restop(svg, 'door', ['#2a2d32', '#111316']);
    svg = restop(svg, 'primer', [['#262b3a', 0], ['#262b3a', 0]]);
    return decorate(svg, {
      defs: '<linearGradient id="flame" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ffe066"/><stop offset=".5" stop-color="#ff8a2a"/><stop offset="1" stop-color="#e02a1a"/></linearGradient>',
      over: [
        '<path d="M246 74 Q220 70 210 78 Q200 66 186 76 Q176 64 160 76 Q150 66 136 78 Q128 72 118 80 Q140 84 160 82 Q180 88 196 82 Q214 88 230 82 Q240 84 246 80 Z" fill="url(#flame)" stroke="#8a1a0a" stroke-width=".6"/>',
      ].join('\n    '),
    });
  },
  'van-pipe-dreams': async () => {
    let svg = await load('van');
    svg = restop(svg, 'paint', ['#ffffff', '#eef1f4', '#cfd6dd', '#8a96a3']);
    svg = restop(svg, 'decal', ['#ffffff', '#eef1f4']);
    svg = restop(svg, 'rust', [['#000000', 0], ['#000000', 0]]);
    svg = recolor(svg, { '#b8bcba': '#1d5aa8' });
    return decorate(svg, {
      over: [
        '<text x="71" y="56" text-anchor="middle" font-family="Arial, sans-serif" font-size="7" font-weight="900" fill="#1d5aa8">PIPE DREAMS</text>',
        '<text x="71" y="63.5" text-anchor="middle" font-family="Arial, sans-serif" font-size="5" font-weight="700" fill="#1d5aa8">PLUMBING · 555-0199</text>',
        '<path d="M50 66 H92" stroke="#e8443a" stroke-width="1.2"/>',
        // A ladder on the roof.
        '<path d="M24 22 H160 M24 19 H160" stroke="#9aa0a6" stroke-width="1.4"/><path d="M34 19 V22 M50 19 V22 M66 19 V22 M82 19 V22 M98 19 V22 M114 19 V22 M130 19 V22 M146 19 V22" stroke="#9aa0a6" stroke-width="1"/>',
      ].join('\n    '),
    });
  },
  'van-flower-power': async () => {
    let svg = await load('van');
    svg = restop(svg, 'paint', ['#bfe6ff', '#7cc4f0', '#4a9ad0', '#245a80']);
    svg = restop(svg, 'decal', ['#ffffff', '#fff6d8']);
    svg = restop(svg, 'rust', [['#000000', 0], ['#000000', 0]]);
    const daisy = (x, y, r, centre) => `<g transform="translate(${x} ${y})">${Array.from({ length: 8 }, (_, index) => `<ellipse cx="0" cy="${-r}" rx="${r * 0.42}" ry="${r * 0.75}" transform="rotate(${index * 45})" fill="#ffffff" stroke="#c9d6e2" stroke-width=".4"/>`).join('')}<circle r="${r * 0.45}" fill="${centre}"/></g>`;
    return decorate(svg, {
      over: [
        daisy(30, 72, 6, '#ffb627'), daisy(120, 52, 8, '#ff6fb5'), daisy(150, 76, 5, '#ffb627'), daisy(196, 80, 5, '#ff6fb5'),
        '<path d="M20 50 q10 -10 20 0 t20 0 M140 40 q10 -10 20 0" stroke="#ff8a2a" stroke-width="1.6" fill="none"/>',
      ].join('\n    '),
    });
  },
  'pistol-tiger-stripe': async () => {
    let svg = await load('pistol');
    svg = restop(svg, 'slide', ['#ffb05a', '#ff8a1a', '#b5541a']);
    svg = restop(svg, 'grip', ['#ff9a3a', '#b5541a']);
    svg = restop(svg, 'frame', ['#ff8a1a', '#8a3e0a']);
    return decorate(svg, {
      over: [
        '<path d="M28 38 l6 8 l-4 8 M46 38 l4 6 l-3 10 M64 38 l7 9 l-5 7 M84 38 l4 7 l-2 9 M100 38 l6 9 l-4 7" stroke="#111" stroke-width="2.2" fill="none" stroke-linejoin="round"/>',
        '<path d="M30 66 l8 6 l-6 6 M28 84 l10 4 l-8 8 M40 98 l6 4" stroke="#111" stroke-width="2.4" fill="none"/>',
      ].join('\n  '),
    });
  },
  'ak47-damascus': async () => {
    let svg = await load('ak47');
    svg = restop(svg, 'steel', ['#c9ced4', '#7d848c', '#3a3e45']);
    svg = restop(svg, 'wood', ['#7a4a26', '#4a2a14', '#24140a']);
    svg = restop(svg, 'mag', ['#5a6168', '#8a939c', '#3a3e45']);
    const waves = Array.from({ length: 6 }, (_, index) => `<path d="M72 ${46 + index * 3} q10 -2 20 0 t20 0 t20 0 t20 0" stroke="#1e2024" stroke-opacity=".55" stroke-width=".9" fill="none"/>`).join('');
    return decorate(svg, { over: [waves, '<path d="M196 50 q10 -1.5 20 0 t20 0 M196 53 q10 1.5 20 0 t20 0" stroke="#e1e6ec" stroke-opacity=".45" stroke-width=".6" fill="none"/>'].join('\n  ') });
  },
  'shotgun-rust-bucket': async () => {
    let svg = await load('shotgun');
    svg = restop(svg, 'barrel', ['#b07a4a', '#7a4a26', '#3e2412']);
    svg = restop(svg, 'steel', ['#9a6a3e', '#6a4024', '#30180a']);
    svg = restop(svg, 'wood', ['#8a6a4a', '#5a4026', '#2e2010']);
    return decorate(svg, {
      over: [
        '<path d="M44 50 L52 74 M60 49 L64 70" stroke="#9aa0a6" stroke-width="5" stroke-linecap="round"/>',
        '<path d="M44 50 L52 74 M60 49 L64 70" stroke="#c9ced4" stroke-width="1" stroke-dasharray="2 2"/>',
        '<path d="M30 60 l10 10 M24 72 l6 -4" stroke="#1a0e06" stroke-width="1"/>',
        '<g fill="#c8641e" opacity=".8"><circle cx="150" cy="49" r="1.6"/><circle cx="182" cy="51" r="2"/><circle cx="214" cy="48" r="1.4"/><circle cx="96" cy="60" r="2.2"/></g>',
      ].join('\n  '),
    });
  },
  'tek9-bubblegum': async () => {
    let svg = await load('tek9');
    svg = restop(svg, 'steel', ['#ffc2e8', '#ff7ad9', '#c9529f']);
    svg = restop(svg, 'shroud', ['#ffd6f0', '#ff9ae2', '#d96ab4']);
    svg = restop(svg, 'poly', ['#ff9ae2', '#c9529f']);
    return decorate(svg, {
      over: [
        '<g fill="#ffffff" opacity=".85"><circle cx="70" cy="50" r=".8"/><circle cx="92" cy="58" r=".7"/><circle cx="118" cy="50" r=".9"/><circle cx="140" cy="58" r=".7"/><circle cx="176" cy="48" r=".8"/></g>',
        '<g transform="translate(142 92) rotate(-12)"><circle r="6" fill="#ffd166" stroke="#c98a12" stroke-width=".8"/><path d="M-2.4 -1 h.1 M2.3 -1 h.1 M-2.4 2 Q0 4 2.4 2" stroke="#7a4a10" stroke-width="1" fill="none" stroke-linecap="round"/></g>',
      ].join('\n  '),
    });
  },

  'thug-velour-tracksuit': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#7a1f33"/><path d="M0 7 Q7 5 14 7" stroke="#8f2a40" stroke-width="1" fill="none" opacity=".7"/>');
    svg = restop(svg, 'tank', ['#7a1f33', '#5a1424']);
    svg = restop(svg, 'band', ['#9a2a44', '#5a1424']);
    svg = recolor(svg, { '#e9fff0': '#e8b93a', '#b5f5c5': '#ffd9a0', '#6ee095': '#ffffff' });
    return decorate(svg, {
      over: [
        '<path d="M64 88 V126" stroke="#e8b93a" stroke-width="1.6" stroke-dasharray="1.4 .8"/>',
        '<path d="M14 112 Q22 98 34 93 M114 112 Q106 98 94 93" stroke="#ffffff" stroke-width="1.6" fill="none"/>',
        '<path d="M50 86 L56 92 M78 86 L72 92" stroke="#ffffff" stroke-width="1.4"/>',
      ].join('\n  '),
    });
  },
  'thug-bowling-shirt': async () => {
    let svg = await load('thug');
    svg = repattern(svg, 'plaid', '<rect width="14" height="14" fill="#fbf3dc"/>');
    svg = restop(svg, 'tank', ['#3fa89c', '#2a7a72']);
    svg = restop(svg, 'band', ['#1b100a', '#0b0604']);
    svg = recolor(svg, { '#e9fff0': '#3a2010', '#b5f5c5': '#3a2010', '#6ee095': '#ffffff' });
    return decorate(svg, {
      over: [
        '<path d="M50 86 L58 100 L64 92 L70 100 L78 86" stroke="#2a7a72" stroke-width="1.6" fill="none" stroke-linejoin="round"/>',
        '<path d="M28 94 V126 M100 94 V126" stroke="#3fa89c" stroke-width="5"/>',
        '<g transform="translate(36 106)"><ellipse rx="2.2" ry="4.4" fill="#ffffff" stroke="#8a93a3" stroke-width=".6"/><path d="M-1.4 -2.6 H1.4" stroke="#e8443a" stroke-width=".8"/></g>',
      ].join('\n  '),
    });
  },
  'hoe-leopard-coat': async () => {
    let svg = await load('hoe');
    svg = hoeCoat(svg, ['#f0c070', '#d69a3a', '#9a6a1a'], '<g fill="#3a2410" opacity=".85"><path d="M1 1.4 a1.3 1 0 1 0 2.4 0 M4.6 4.2 a1.2 1 0 1 0 2.2 0"/><circle cx="2.2" cy="1.6" r=".4"/><circle cx="5.7" cy="4.4" r=".4"/></g>');
    svg = recolor(svg, { '#5a060c': '#5a3a10', '#17131a': '#0b0c0e', '#3d3346': '#2a2d32' });
    return svg;
  },
  'hoe-tie-dye': async () => {
    let svg = await load('hoe');
    svg = restop(svg, 'fur', ['#ffb627', '#ff6fb5', '#5ab4ff']);
    svg = repattern(svg, 'tufts', '<path d="M0 3.5 Q3.5 0 7 3.5 Q3.5 7 0 3.5" stroke="#ffffff" stroke-width=".5" fill="none" opacity=".45"/>');
    svg = svg.replace(/ filter="url\(#fuzz\)"/g, '');
    svg = recolor(svg, { '#5a060c': '#7a3a6a', '#17131a': '#f4f2ec', '#3d3346': '#c9c0b2' });
    return decorate(svg, {
      over: ['<path d="M20 110 q8 -10 16 0 t16 0 M92 110 q8 -10 16 0" stroke="#7ef29d" stroke-width="1.4" fill="none" opacity=".8"/>'].join('\n  '),
    });
  },
});

await mkdir(outDir, { recursive: true });
for (const [name, recipe] of Object.entries(recipes)) {
  const svg = await recipe();
  const header = `<!-- The Drop: ${name}. Generated by scripts/art/generate-drop-art.mjs from the Classic geometry. -->\n`;
  await writeFile(path.join(outDir, `${name}.svg`), svg.replace(/(<svg[^>]*>)/, `$1\n  ${header.trim()}`));
  console.log(`wrote ${name}.svg`);
}
