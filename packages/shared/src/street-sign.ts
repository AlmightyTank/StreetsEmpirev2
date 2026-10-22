import { z } from 'zod';

/** Saved street-sign design contract. Bump the version when the persisted shape changes. */
export const STREET_SIGN_VERSION = 3 as const;
export const STREET_SIGN_TEXT_MAX = 32;
export const STREET_SIGN_TAG_MAX = 20;

export const STREET_SIGN_SHAPES = ['classic', 'wide'] as const;
export const STREET_SIGN_FONTS = ['road-condensed', 'block', 'stencil', 'handstyle', 'rounded', 'sign-painter', 'graffiti-script', 'wildstyle'] as const;
export const STREET_SIGN_FREE_FONTS = ['road-condensed', 'block', 'stencil', 'handstyle', 'rounded'] as const;
export const STREET_SIGN_FONT_PACKS = [
  { key: 'street-sign-font-sign-painter', label: 'Sign Painter Pack', level: 10, description: 'Adds a classic hand-painted sign face for street text and tags.', fonts: ['sign-painter'], streetText: true, graffiti: true },
  { key: 'street-sign-graffiti-pack', label: 'Graffiti Pack', level: 20, description: 'Adds Graffiti Script and Wildstyle for your crew tag.', fonts: ['graffiti-script', 'wildstyle'], streetText: false, graffiti: true },
] as const;
export const STREET_SIGN_STREET_TYPES = ['DR', 'ST', 'AVE', 'BLVD', 'CT', 'WAY', 'LN', 'PL'] as const;
export const STREET_SIGN_TAG_SCALES = ['small', 'medium', 'large'] as const;
export const STREET_SIGN_TAG_PLACEMENTS = ['lower-left', 'lower-center', 'lower-right'] as const;
export const STREET_SIGN_TRIMS = ['single', 'double', 'beveled'] as const;
export const STREET_SIGN_SHADOWS = ['soft', 'strong', 'none'] as const;
export const STREET_SIGN_TREATMENTS = ['reflective', 'municipal', 'weathered'] as const;

/**
 * Printed backdrops for the sign face. Every one is owned through The Drop:
 * - `dropKey`: sold on its own as a Street Singles piece (skylines, the stockpile).
 * - `themeKey`: comes with that collection's shell theme, bought alone or in its
 *   bundle, and is never sold separately.
 * The palette is applied when the backdrop is picked and stays editable after.
 */
export const STREET_SIGN_BACKDROPS = [
  { key: 'skyline', label: 'Downtown Skyline', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-skyline', background: '#1b2a44', text: '#ffffff', tag: '#ffd76a' },
  { key: 'skyline-new-york', label: 'New York', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-skyline-new-york', background: '#141c33', text: '#ffffff', tag: '#ffcf5a' },
  { key: 'skyline-chicago', label: 'Chicago', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-skyline-chicago', background: '#23324f', text: '#ffffff', tag: '#7fd3ff' },
  { key: 'skyline-las-vegas', label: 'Las Vegas', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-skyline-las-vegas', background: '#1c0d2e', text: '#fff4fb', tag: '#ffd23f' },
  { key: 'skyline-miami-beach', label: 'Miami Beach', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-skyline-miami-beach', background: '#7a2a5e', text: '#fff8ef', tag: '#5ff2dc' },
  { key: 'skyline-seattle', label: 'Seattle', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-skyline-seattle', background: '#1f3a4a', text: '#f2fbff', tag: '#9be7a8' },
  { key: 'skyline-san-francisco', label: 'San Francisco', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-skyline-san-francisco', background: '#3a4554', text: '#ffffff', tag: '#ff8a5c' },
  { key: 'stockpile', label: 'Gun Stockpile', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-stockpile', background: '#262b27', text: '#f3f1e8', tag: '#ffb000' },
  { key: 'alley-dice', label: 'Back Alley Dice', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-alley-dice', background: '#5a2e22', text: '#fff3e6', tag: '#ffd34e' },
  { key: 'royal-flush', label: 'Royal Flush', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-royal-flush', background: '#0f4d33', text: '#fdf8ea', tag: '#ffd76a' },
  { key: 'roulette', label: 'Roulette Wheel', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-roulette', background: '#10402c', text: '#ffffff', tag: '#ff7a6e' },
  { key: 'finish-line', label: 'Finish Line', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-finish-line', background: '#1f5a2e', text: '#ffffff', tag: '#ffe14d' },
  { key: 'cash-stack', label: 'Cash Stack', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-cash-stack', background: '#173a28', text: '#f1f7e8', tag: '#c8f06a' },
  { key: 'black-book', label: 'Black Book', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-black-book', background: '#1a1512', text: '#f3e7cf', tag: '#d9b26a' },
  { key: 'loan-shark', label: 'Loan Shark', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-loan-shark', background: '#0d2f45', text: '#eefaff', tag: '#7fe0ff' },
  { key: 'police-lights', label: 'Police Lights', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-police-lights', background: '#0b0f1a', text: '#ffffff', tag: '#ff6b6b' },
  { key: 'turf-map', label: 'Turf Map', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-turf-map', background: '#1d2430', text: '#ffffff', tag: '#ffb627' },
  { key: 'getaway-route', label: 'Getaway Route', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-getaway-route', background: '#e8dcc0', text: '#1d1a14', tag: '#b3140f' },
  { key: 'grow-house', label: 'Grow House', collection: 'Street Singles', themeKey: null, dropKey: 'drop-street-singles-sign-grow-house', background: '#22143a', text: '#f5eaff', tag: '#c8f06a' },
  { key: 'kingpin-luxe', label: 'Brass Pinline', collection: 'Kingpin Luxe', themeKey: 'kingpin-luxe-shell', dropKey: null, background: '#141110', text: '#f0d39a', tag: '#d6a35c' },
  { key: 'neon-underworld', label: 'After Hours', collection: 'Neon Underworld', themeKey: 'neon-underworld-shell', dropKey: null, background: '#1d1035', text: '#f6eeff', tag: '#3df5e0' },
  { key: 'winter-heist', label: 'Frostbite', collection: 'Winter Heist', themeKey: 'winter-heist-shell', dropKey: null, background: '#173f5f', text: '#f4fbff', tag: '#8fd3ff' },
  { key: 'biscayne-sunset', label: 'Ocean Drive', collection: 'Biscayne Sunset', themeKey: 'biscayne-sunset-shell', dropKey: null, background: '#a8366b', text: '#fff8ef', tag: '#3ff0d2' },
  { key: 'velvet-speakeasy', label: 'Back Room', collection: 'Velvet Speakeasy', themeKey: 'velvet-speakeasy-shell', dropKey: null, background: '#561526', text: '#f7e8c9', tag: '#f2b8c6' },
  { key: 'platinum-funk', label: 'Mirror Ball', collection: 'Platinum Funk', themeKey: 'platinum-funk-shell', dropKey: null, background: '#3a1f13', text: '#ffe9c9', tag: '#ff9a3c' },
  { key: 'redline-syndicate', label: 'Redline', collection: 'Redline Syndicate', themeKey: 'redline-syndicate-shell', dropKey: null, background: '#161616', text: '#ffffff', tag: '#ff3344' },
  { key: 'wet-paint', label: 'Fresh Coat', collection: 'Wet Paint', themeKey: 'wet-paint-shell', dropKey: null, background: '#0d5f47', text: '#ffffff', tag: '#ffe14d' },
  { key: 'hazard-cook', label: 'Caution Tape', collection: 'Hazard Cook', themeKey: 'hazard-cook-shell', dropKey: null, background: '#f2c500', text: '#121212', tag: '#b3140f' },
  { key: 'dockside', label: 'Container Yard', collection: 'Dockside', themeKey: 'dockside-shell', dropKey: null, background: '#1b3150', text: '#ffffff', tag: '#ff8a1f' },
  { key: 'crown-jewels', label: 'Royal Velvet', collection: 'Crown Jewels', themeKey: 'crown-jewels-shell', dropKey: null, background: '#1a2672', text: '#f5f7ff', tag: '#ffd76a' },
  { key: 'bayou-smoke', label: 'Low Water', collection: 'Bayou Smoke', themeKey: 'bayou-smoke-shell', dropKey: null, background: '#2b4219', text: '#f2f8de', tag: '#c8f06a' },
  { key: 'desert-mirage', label: 'Heat Shimmer', collection: 'Desert Mirage', themeKey: 'desert-mirage-shell', dropKey: null, background: '#9a3f22', text: '#fff6e6', tag: '#4fd8df' },
  { key: 'rewind', label: 'Tracking Lines', collection: 'Rewind', themeKey: 'rewind-shell', dropKey: null, background: '#0d0a14', text: '#f7f4ff', tag: '#b6ff3b' },
  { key: 'snake-eyes', label: 'Green Felt', collection: 'Snake Eyes', themeKey: 'snake-eyes-shell', dropKey: null, background: '#13563a', text: '#fdf8ea', tag: '#ffe9a8' },
  { key: 'quarter-mile', label: 'Start Line', collection: 'Quarter Mile', themeKey: 'quarter-mile-shell', dropKey: null, background: '#0e3a73', text: '#ffffff', tag: '#ffd400' },
  { key: '88-club', label: 'Flux Storm', collection: '88 Club', themeKey: '88-club-shell', dropKey: null, background: '#0a1a2d', text: '#ebfbff', tag: '#ff9a2e' },
  { key: 'swamp-kingdom', label: 'The Loch', collection: 'Swamp Kingdom', themeKey: 'swamp-kingdom-shell', dropKey: null, background: '#304b1c', text: '#f4f8e4', tag: '#ff9a3c' },
  { key: 'zombie-apocalypse', label: 'Barricade', collection: 'Zombie Apocalypse', themeKey: 'zombie-apocalypse-shell', dropKey: null, background: '#3a372f', text: '#f2efe4', tag: '#ff6b2c' },
  { key: 'iron-front', label: 'Armored Steel', collection: 'Iron Front', themeKey: 'iron-front-shell', dropKey: null, background: '#252c28', text: '#f2f1df', tag: '#ffd06a' },
  { key: 'graveyard-shift', label: 'Ghost Light', collection: 'Graveyard Shift', themeKey: 'graveyard-shift-shell', dropKey: null, background: '#172420', text: '#ecfff4', tag: '#a8f0c6' },
  { key: 'naughty-list', label: 'Candy Stripe', collection: 'Naughty List', themeKey: 'naughty-list-shell', dropKey: null, background: '#a81d1d', text: '#ffffff', tag: '#5be37f' },
  { key: 'heartbreaker', label: 'Black Roses', collection: 'Heartbreaker', themeKey: 'heartbreaker-shell', dropKey: null, background: '#4a0a18', text: '#ffeef1', tag: '#ff9fb2' },
  { key: 'block-party', label: 'Hydrant Open', collection: 'Block Party', themeKey: 'block-party-shell', dropKey: null, background: '#145f9e', text: '#ffffff', tag: '#ffc23d' },
] as const;
export type StreetSignBackdropKey = 'plain' | (typeof STREET_SIGN_BACKDROPS)[number]['key'];
export const STREET_SIGN_BACKDROP_KEYS = ['plain', ...STREET_SIGN_BACKDROPS.map((backdrop) => backdrop.key)] as [StreetSignBackdropKey, ...StreetSignBackdropKey[]];

/** The themed backdrop for a key; undefined for plain or unknown keys. */
export function streetSignBackdropFor(key: string) {
  return STREET_SIGN_BACKDROPS.find((backdrop) => backdrop.key === key);
}

const signText = (max: number, label: string) => z.string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ' '))
  .pipe(z.string().max(max, `${label} can be at most ${max} characters.`))
  .refine((value) => /^[\p{L}\p{N} .,'&!?-]*$/u.test(value), `${label} can use letters, numbers, spaces and simple punctuation.`);

const legacyStreetSignDesignSchema = z.object({
  version: z.literal(1),
  shape: z.enum(STREET_SIGN_SHAPES),
  streetName: signText(STREET_SIGN_TEXT_MAX, 'Street name').refine((value) => value.length > 0, 'Add street text before saving.'),
  streetType: z.enum(STREET_SIGN_STREET_TYPES),
  font: z.enum(STREET_SIGN_FONTS),
  tag: signText(STREET_SIGN_TAG_MAX, 'Graffiti tag'),
  tagFont: z.enum(STREET_SIGN_FONTS),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid sign color.'),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid lettering color.'),
  tagColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid graffiti color.'),
}).strict();

const streetSignV2Fields = {
  shape: z.enum(STREET_SIGN_SHAPES),
  streetName: signText(STREET_SIGN_TEXT_MAX, 'Street name').refine((value) => value.length > 0, 'Add street text before saving.'),
  streetType: z.enum(STREET_SIGN_STREET_TYPES),
  font: z.enum(STREET_SIGN_FONTS),
  tag: signText(STREET_SIGN_TAG_MAX, 'Graffiti tag'),
  tagFont: z.enum(STREET_SIGN_FONTS),
  tagScale: z.enum(STREET_SIGN_TAG_SCALES),
  tagPlacement: z.enum(STREET_SIGN_TAG_PLACEMENTS),
  tagOffsetX: z.number().min(-160).max(160).optional(),
  tagOffsetY: z.number().min(-80).max(80).optional(),
  trim: z.enum(STREET_SIGN_TRIMS),
  shadow: z.enum(STREET_SIGN_SHADOWS),
  treatment: z.enum(STREET_SIGN_TREATMENTS),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid sign color.'),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid lettering color.'),
  tagColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid graffiti color.'),
};

const legacyV2StreetSignDesignSchema = z.object({ ...streetSignV2Fields, version: z.literal(2) }).strict();

export const streetSignDesignSchema = z.object({
  ...streetSignV2Fields,
  backdrop: z.enum(STREET_SIGN_BACKDROP_KEYS),
  version: z.literal(STREET_SIGN_VERSION),
}).strict();

export type StreetSignDesign = z.infer<typeof streetSignDesignSchema>;

export const DEFAULT_STREET_SIGN: StreetSignDesign = {
  version: STREET_SIGN_VERSION,
  shape: 'classic',
  streetName: '',
  streetType: 'DR',
  font: 'road-condensed',
  tag: '',
  tagFont: 'handstyle',
  tagScale: 'medium',
  tagPlacement: 'lower-right',
  trim: 'double',
  shadow: 'soft',
  treatment: 'reflective',
  backdrop: 'plain',
  backgroundColor: '#087b62',
  textColor: '#ffffff',
  tagColor: '#ffd34e',
};

function migrateLegacyStreetSign(
  value: z.infer<typeof legacyStreetSignDesignSchema> | z.infer<typeof legacyV2StreetSignDesignSchema>,
): StreetSignDesign {
  return {
    tagScale: 'medium',
    tagPlacement: 'lower-right',
    trim: 'double',
    shadow: 'soft',
    treatment: 'reflective',
    ...value,
    backdrop: 'plain',
    version: STREET_SIGN_VERSION,
  };
}

/** New clients write v3; old open tabs can still submit a valid v1 or v2 design, read as a plain backdrop. */
export const streetSignInputSchema = z.union([streetSignDesignSchema, legacyV2StreetSignDesignSchema, legacyStreetSignDesignSchema])
  .transform((value): StreetSignDesign => value.version === STREET_SIGN_VERSION ? value : migrateLegacyStreetSign(value));

/** JSON from older versions or manually edited rows is never trusted as a display DTO. */
export function readStreetSignDesign(value: unknown): StreetSignDesign | null {
  const parsed = streetSignInputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The sign face always carries the crew name; visual styling remains independently customizable. */
export function streetSignForCrewName(value: unknown, crewName: string | null | undefined): StreetSignDesign | null {
  const design = readStreetSignDesign(value);
  if (!design) return null;
  const linkedName = crewName?.trim();
  return linkedName ? { ...design, streetName: linkedName.slice(0, STREET_SIGN_TEXT_MAX) } : null;
}
