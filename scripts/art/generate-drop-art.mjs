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

await mkdir(outDir, { recursive: true });
for (const [name, recipe] of Object.entries(recipes)) {
  const svg = await recipe();
  const header = `<!-- The Drop: ${name}. Generated by scripts/art/generate-drop-art.mjs from the Classic geometry. -->\n`;
  await writeFile(path.join(outDir, `${name}.svg`), svg.replace(/(<svg[^>]*>)/, `$1\n  ${header.trim()}`));
  console.log(`wrote ${name}.svg`);
}
