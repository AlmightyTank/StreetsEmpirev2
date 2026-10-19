import type { QuestCosmeticDefinition, QuestCosmeticKind, QuestCosmeticRarity } from './types.js';

/**
 * The Drop: an account-level cosmetic storefront paid in Crowns. Everything
 * here is authored for The Drop and nowhere else; nothing on the Street Pass,
 * login track, supporter catalogue or an event is ever resold. Ownership is an
 * AccountCosmeticUnlock with sourceQuestKey = DROP_SOURCE, kept for good.
 * See docs/THE-DROP.md.
 */
export const DROP_SOURCE = 'drop';
export const DROP_SOURCE_VERSION = '1';
/** Every Drop unlock key starts with this, so it can never collide with an older reward. */
export const DROP_KEY_PREFIX = 'drop-';

export type DropCategory = 'VEHICLES' | 'CREW' | 'WEAPONS' | 'PROFILES' | 'SHELLS';
/** Honest return language. NEVER_RETURNING needs an admin approval on the catalog entry. */
export type DropReturnPolicy = 'MAY_RETURN' | 'PERMANENT' | 'NEVER_RETURNING';

export interface DropCollectionDefinition {
  readonly key: string;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  /** Hex accent used on the collection's hero and cards. */
  readonly accent: string;
  /**
   * A holiday set's season, e.g. 'December'. Its items and bundle start held
   * (Draft) and stay out of the shop until an admin releases them.
   */
  readonly season?: string;
  /**
   * A holiday set's release windows (UTC, from inclusive, until exclusive).
   * Inside one it is Live and takes a Featured slot; outside, it is held again.
   * An admin catalog entry still overrides either way.
   */
  readonly windows?: readonly { readonly from: string; readonly until: string }[];
  /** One-off pieces with no set: no bundle, no shell, never featured; they fill the daily picks. */
  readonly singles?: boolean;
}

/** What the detail page draws for an item. */
export type DropPreview =
  | { readonly type: 'ITEM'; readonly items: readonly string[] }
  | { readonly type: 'FRAME' }
  | { readonly type: 'ACCENT'; readonly color: string }
  | { readonly type: 'TITLE'; readonly title: string }
  /** A full game-shell theme: palette, panels, controls and an illustrated backdrop. */
  | { readonly type: 'THEME' };

export interface DropItemDefinition extends QuestCosmeticDefinition {
  readonly kind: Extract<QuestCosmeticKind, 'ITEM_COLLECTION' | 'PROFILE_FRAME' | 'ACCENT' | 'TITLE_BADGE' | 'SITE_THEME'>;
  readonly collection: string;
  readonly category: DropCategory;
  /** List price in Crowns. Admins can override it per catalog entry. */
  readonly priceCrowns: number;
  readonly preview: DropPreview;
  /**
   * The gameplay item this look dresses. Owning the look never grants the item:
   * it shows only on Sedans, guns or crew the player already has in a round.
   */
  readonly dresses?: string;
}

export interface DropBundleDefinition {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly collection: string;
  readonly itemKeys: readonly string[];
  readonly priceCrowns: number;
}

export const DROP_COLLECTIONS = {
  'kingpin-luxe': {
    key: 'kingpin-luxe',
    name: 'Kingpin Luxe',
    tagline: 'Black lacquer. Warm brass. Quiet money.',
    description: 'Tailored street luxury: black lacquer, restrained brass pinlines and bespoke geometry. Nothing loud, everything expensive.',
    accent: '#d6a35c',
  },
  'neon-underworld': {
    key: 'neon-underworld',
    name: 'Neon Underworld',
    tagline: 'After hours, the city glows violet.',
    description: 'Moody nightlife: steel, violet and teal light, wet-street reflections and custom edge patterns.',
    accent: '#b46bff',
  },
  'winter-heist': {
    key: 'winter-heist',
    name: 'Winter Heist',
    tagline: 'Cold job. Clean getaway.',
    description: 'An urban winter operation: frosted glass, layered outerwear, icy road texture and city dusk.',
    accent: '#8fd3ff',
  },
  'biscayne-sunset': {
    key: 'biscayne-sunset',
    name: 'Biscayne Sunset',
    tagline: 'Pastel money on the waterfront.',
    description: 'Eighties waterfront wealth: flamingo pink, sea-glass teal, white linen and deco hotel fronts at golden hour.',
    accent: '#ff8fb1',
  },
  'velvet-speakeasy': {
    key: 'velvet-speakeasy',
    name: 'Velvet Speakeasy',
    tagline: 'Knock twice. Ask for nobody.',
    description: 'Prohibition nightlife: merlot velvet, cream silk, pewter fittings and cigar smoke behind a hidden door.',
    accent: '#c2405c',
  },
  'platinum-funk': {
    key: 'platinum-funk',
    name: 'Platinum Funk',
    tagline: 'Smooth as the seventies.',
    description: 'Seventies street royalty: tangerine and chocolate, platinum trim, plush fur and a mirror-ball glow.',
    accent: '#ff8a2a',
  },
  'redline-syndicate': {
    key: 'redline-syndicate',
    name: 'Redline Syndicate',
    tagline: 'Meet at midnight. Leave at redline.',
    description: 'Underground street racing: carbon fibre, signal red, race livery and light trails in a parking-garage meet.',
    accent: '#ff3344',
  },
  'wet-paint': {
    key: 'wet-paint',
    name: 'Wet Paint',
    tagline: 'Every wall is a canvas.',
    description: 'Train-yard graffiti: bubble letters, chrome fills, spray drips and fresh mint paint that never quite dries.',
    accent: '#36e2a0',
  },
  'hazard-cook': {
    key: 'hazard-cook',
    name: 'Hazard Cook',
    tagline: 'Suit up. Seal the door.',
    description: 'The cookhouse in full protection: hazmat yellow, brushed stainless steel and black warning stripes.',
    accent: '#ffd400',
  },
  dockside: {
    key: 'dockside',
    name: 'Dockside',
    tagline: 'Nothing on the manifest.',
    description: 'The harbour after dark: navy steel, rust, safety orange and container cranes in the fog.',
    accent: '#5b9bd5',
  },
  'crown-jewels': {
    key: 'crown-jewels',
    name: 'Crown Jewels',
    tagline: 'Wear the currency.',
    description: 'The flagship set named for Crowns: emerald, ruby and sapphire on platinum and royal velvet.',
    accent: '#4a78ff',
  },
  'bayou-smoke': {
    key: 'bayou-smoke',
    name: 'Bayou Smoke',
    tagline: 'Low water. Lower profile.',
    description: 'Back-country swamp runs: moss green, cypress brown, gator hide and fireflies in the evening haze.',
    accent: '#b6e05a',
  },
  'desert-mirage': {
    key: 'desert-mirage',
    name: 'Desert Mirage',
    tagline: 'Heat on the horizon.',
    description: 'A border run under a white sun: bleached sand, rust canyon, turquoise stone and heat shimmer.',
    accent: '#3fc1c9',
  },
  rewind: {
    key: 'rewind',
    name: 'Rewind',
    tagline: 'Pause. Rewind. Run it back.',
    description: 'A tape from the eighties: magenta and lime on black, scan lines, tracking glitches and a glowing CRT.',
    accent: '#e04bff',
  },
  'snake-eyes': {
    key: 'snake-eyes',
    name: 'Snake Eyes',
    tagline: 'The house is always watching.',
    description: 'A back-room card game: green felt, ivory dice, red and black card suits under a low lamp.',
    accent: '#1fae6a',
  },
  // Movie homages: original names and art, no film names, logos or characters.
  'quarter-mile': {
    key: 'quarter-mile',
    name: 'Quarter Mile',
    tagline: 'Live a quarter mile at a time.',
    description: 'Street racing with your crew as family: tuner livery, nitrous bottles, a black muscle car with a supercharger, and the start lights at the strip.',
    accent: '#2f9bff',
  },
  '88-club': {
    key: '88-club',
    name: '88 Club',
    tagline: 'Hit eighty-eight and hold on.',
    description: 'A time-travel caper: flux-blue glow, flaming tyre trails, a clock tower and a lightning storm, and fashion from two different decades.',
    accent: '#4fd2ff',
  },
  'swamp-kingdom': {
    key: 'swamp-kingdom',
    name: 'Swamp Kingdom',
    tagline: 'Far, far away. Keep out.',
    description: 'A fairytale gone muddy: a storybook swamp, an outhouse with a KEEP OUT sign, a castle on the hill and a dragon circling it.',
    accent: '#7aa83a',
  },
  'street-singles': {
    key: 'street-singles',
    name: 'Street Singles',
    tagline: 'One-offs. No set required.',
    description: 'Single pieces with no set or bundle: ride and gun looks, outfits, frames, accents and titles that turn up in the daily picks.',
    accent: '#9aa3af',
    singles: true,
  },
  // Holiday sets: built, held as Draft until an admin releases them in their season.
  'graveyard-shift': {
    key: 'graveyard-shift',
    name: 'Graveyard Shift',
    tagline: 'Some jobs only happen after dark.',
    description: 'Moonlit cemetery work: bone white, moss, wrought iron and a cold ghost-green glow.',
    accent: '#a8f0c6',
    season: 'October–November',
    // Halloween 2026: live now, through All Souls' Day.
    windows: [{ from: '2026-10-19T00:00:00Z', until: '2026-11-03T00:00:00Z' }],
  },
  'naughty-list': {
    key: 'naughty-list',
    name: 'Naughty List',
    tagline: 'Checked it twice. Still made the list.',
    description: 'The stash house at Christmas: candy-stripe red, foil green, wrapping paper and ribbon.',
    accent: '#e23a3a',
    season: 'December',
  },
  heartbreaker: {
    key: 'heartbreaker',
    name: 'Heartbreaker',
    tagline: 'Love gone cold.',
    description: 'Valentine’s with an edge: crimson satin, black roses and thorns.',
    accent: '#ff4d6d',
    season: 'February',
  },
  'block-party': {
    key: 'block-party',
    name: 'Block Party',
    tagline: 'Hydrant open. Speakers up.',
    description: 'High summer on the block: mango, sky blue, hydrant red and music in the street.',
    accent: '#ffb627',
    season: 'July',
  },
} as const satisfies Readonly<Record<string, DropCollectionDefinition>>;

export type DropCollectionKey = keyof typeof DROP_COLLECTIONS;

function item(
  collection: DropCollectionKey,
  slug: string,
  def: {
    name: string;
    description: string;
    kind: DropItemDefinition['kind'];
    rarity: QuestCosmeticRarity;
    category: DropCategory;
    priceCrowns: number;
    styleKey?: string;
    preview: DropPreview;
    dresses?: string;
  },
): DropItemDefinition {
  return { key: `${DROP_KEY_PREFIX}${collection}-${slug}`, collection, ...def };
}

/**
 * The catalogue: the three launch collections and twelve more, seven or eight SKUs
 * each. Item looks are
 * partial-coverage collections (see COLLECTION_COVERAGE in @streets/shared),
 * so each SKU is one style key that dresses only the items it names.
 */
const ITEMS: readonly DropItemDefinition[] = [
  // Kingpin Luxe
  item('kingpin-luxe', 'sedan', {
    name: 'Kingpin Luxe Sedan', description: 'Black lacquer paint, brass pinstripe, tinted glass and turned-metal wheels. A Sedan look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 800, styleKey: 'kingpin-luxe-sedan',
    preview: { type: 'ITEM', items: ['SEDAN'] }, dresses: 'SEDAN',
  }),
  item('kingpin-luxe', 'thug', {
    name: 'Kingpin Luxe Thug', description: 'A black double-breasted overcoat, brass cufflinks and a low brim. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'kingpin-luxe-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('kingpin-luxe', 'hoe', {
    name: 'Kingpin Luxe Hoe', description: 'A black satin column gown with brass-chain straps and a lacquer clutch. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'kingpin-luxe-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('kingpin-luxe', 'frame', {
    name: 'Kingpin Luxe Frame', description: 'A black lacquer ring with a narrow warm-brass inlay for the profile and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'kingpin-luxe-frame',
    preview: { type: 'FRAME' },
  }),
  item('kingpin-luxe', 'accent', {
    name: 'Lacquer Brass Accent', description: 'A warm brass profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 350, styleKey: 'luxe-lacquer',
    preview: { type: 'ACCENT', color: '#d6a35c' },
  }),
  item('kingpin-luxe', 'shell', {
    name: 'Kingpin Luxe Shell', description: 'The whole game in black lacquer and warm brass: deco panels, brass-lined controls and a night skyline of private towers behind the page.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1250, styleKey: 'kingpin-luxe-shell',
    preview: { type: 'THEME' },
  }),
  item('kingpin-luxe', 'title', {
    name: 'Old Money', description: 'A Kingpin Luxe title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'Old Money' },
  }),
  // Neon Underworld
  item('neon-underworld', 'low-rider', {
    name: 'Neon Underworld Low-Rider', description: 'Gunmetal body, violet underglow and teal edge lines that catch the wet street. A Low-Rider look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 850, styleKey: 'neon-underworld-low-rider',
    preview: { type: 'ITEM', items: ['LOW_RIDER'] }, dresses: 'LOW_RIDER',
  }),
  item('neon-underworld', 'thug', {
    name: 'Neon Underworld Thug', description: 'A steel-grey bomber with violet piping, a teal visor and a reflective hem. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'neon-underworld-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('neon-underworld', 'hoe', {
    name: 'Neon Underworld Hoe', description: 'A gunmetal vinyl jacket with a violet lining, teal edge light and a steel choker. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'neon-underworld-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('neon-underworld', 'tek9', {
    name: 'Neon Underworld Tek-9', description: 'A gunmetal finish with violet and teal edge lines. A visual finish only; it never gives you a Tek-9 or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 600, styleKey: 'neon-underworld-tek9',
    preview: { type: 'ITEM', items: ['TEK9'] }, dresses: 'TEK9',
  }),
  item('neon-underworld', 'frame', {
    name: 'Neon Underworld Frame', description: 'A steel ring split by violet and teal light for the profile and avatar. Its glow pulses slowly, and holds still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'neon-underworld-frame',
    preview: { type: 'FRAME' },
  }),
  item('neon-underworld', 'accent', {
    name: 'Underworld Violet Accent', description: 'A neon violet profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 350, styleKey: 'underworld-violet',
    preview: { type: 'ACCENT', color: '#b46bff' },
  }),
  item('neon-underworld', 'shell', {
    name: 'Neon Underworld Shell', description: 'The whole game after hours: steel panels split by violet and teal light, rain on the glass and neon signs buzzing behind the page.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1250, styleKey: 'neon-underworld-shell',
    preview: { type: 'THEME' },
  }),
  item('neon-underworld', 'title', {
    name: 'After Hours', description: 'A Neon Underworld title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'After Hours' },
  }),
  // Winter Heist
  item('winter-heist', 'van', {
    name: 'Winter Heist Van', description: 'A frost-white panel van with chained tyres, a snow-loaded roof and fogged glass. A Van look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 800, styleKey: 'winter-heist-van',
    preview: { type: 'ITEM', items: ['VAN'] }, dresses: 'VAN',
  }),
  item('winter-heist', 'crew', {
    name: 'Winter Heist Crew Set', description: 'Layered winter gear for both crew types: a padded parka and knit cap, and a belted shearling coat.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 900, styleKey: 'winter-heist-crew',
    preview: { type: 'ITEM', items: ['THUG', 'HOE'] }, dresses: 'THUG',
  }),
  item('winter-heist', 'shotgun', {
    name: 'Winter Heist Shotgun', description: 'Frosted steel with a white-wrapped grip. A visual finish only; it never gives you a shotgun or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 550, styleKey: 'winter-heist-shotgun',
    preview: { type: 'ITEM', items: ['SHOTGUN'] }, dresses: 'SHOTGUN',
  }),
  item('winter-heist', 'frame', {
    name: 'Winter Heist Frame', description: 'An ice-blue ring with frosted edges and light snowfall. The snow is off under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'winter-heist-frame',
    preview: { type: 'FRAME' },
  }),
  item('winter-heist', 'accent', {
    name: 'Heist Frost Accent', description: 'A pale frost-blue profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 300, styleKey: 'heist-frost',
    preview: { type: 'ACCENT', color: '#8fd3ff' },
  }),
  item('winter-heist', 'shell', {
    name: 'Winter Heist Shell', description: 'The whole game on a cold job: frosted panels, ice-blue controls and snow falling over a dusk skyline. The snow holds still under reduced motion.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1200, styleKey: 'winter-heist-shell',
    preview: { type: 'THEME' },
  }),
  item('winter-heist', 'title', {
    name: 'Cold Case', description: 'A Winter Heist title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 200,
    preview: { type: 'TITLE', title: 'Cold Case' },
  }),
  // Biscayne Sunset
  item('biscayne-sunset', 'sedan', {
    name: 'Biscayne Sunset Sedan', description: 'A white convertible look with a flamingo pinstripe, teal interior and whitewall tyres. A Sedan look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 800, styleKey: 'biscayne-sunset-sedan',
    preview: { type: 'ITEM', items: ['SEDAN'] }, dresses: 'SEDAN',
  }),
  item('biscayne-sunset', 'thug', {
    name: 'Biscayne Sunset Thug', description: 'A white linen suit over a pastel tee, sleeves pushed up, loafers and no socks. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'biscayne-sunset-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('biscayne-sunset', 'hoe', {
    name: 'Biscayne Sunset Hoe', description: 'A sea-glass teal sequin dress under a palm-print wrap, with big white sunglasses. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'biscayne-sunset-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('biscayne-sunset', 'pistol', {
    name: 'Biscayne Sunset Pistol', description: 'A polished slide with a pearl grip and a flamingo inlay. A visual finish only; it never gives you a pistol or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 550, styleKey: 'biscayne-sunset-pistol',
    preview: { type: 'ITEM', items: ['PISTOL'] }, dresses: 'PISTOL',
  }),
  item('biscayne-sunset', 'frame', {
    name: 'Biscayne Sunset Frame', description: 'A flamingo-pink and teal deco ring for the profile and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'biscayne-sunset-frame',
    preview: { type: 'FRAME' },
  }),
  item('biscayne-sunset', 'accent', {
    name: 'Flamingo Pink Accent', description: 'A flamingo-pink profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 300, styleKey: 'biscayne-flamingo',
    preview: { type: 'ACCENT', color: '#ff8fb1' },
  }),
  item('biscayne-sunset', 'shell', {
    name: 'Biscayne Sunset Shell', description: 'The whole game on the waterfront: pastel panels, teal controls, deco hotel fronts and palms swaying at sunset.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1200, styleKey: 'biscayne-sunset-shell',
    preview: { type: 'THEME' },
  }),
  item('biscayne-sunset', 'title', {
    name: 'Ocean Drive', description: 'A Biscayne Sunset title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 200,
    preview: { type: 'TITLE', title: 'Ocean Drive' },
  }),
  // Velvet Speakeasy
  item('velvet-speakeasy', 'sedan', {
    name: 'Velvet Speakeasy Sedan', description: 'A vintage sedan with running boards, a merlot body, cream whitewalls and pewter trim. A Sedan look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 850, styleKey: 'velvet-speakeasy-sedan',
    preview: { type: 'ITEM', items: ['SEDAN'] }, dresses: 'SEDAN',
  }),
  item('velvet-speakeasy', 'thug', {
    name: 'Velvet Speakeasy Thug', description: 'A charcoal pinstripe three-piece, a merlot tie and a pewter-banded fedora. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'velvet-speakeasy-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('velvet-speakeasy', 'hoe', {
    name: 'Velvet Speakeasy Hoe', description: 'A beaded cream flapper dress, a long pearl strand and a feathered headband. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'velvet-speakeasy-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('velvet-speakeasy', 'ak47', {
    name: 'Velvet Speakeasy AK-47', description: 'Walnut furniture, a drum magazine and pewter fittings. A visual finish only; it never gives you an AK-47 or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 600, styleKey: 'velvet-speakeasy-ak47',
    preview: { type: 'ITEM', items: ['AK47'] }, dresses: 'AK47',
  }),
  item('velvet-speakeasy', 'frame', {
    name: 'Velvet Speakeasy Frame', description: 'A velvet-rope ring on pewter posts for the profile and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'velvet-speakeasy-frame',
    preview: { type: 'FRAME' },
  }),
  item('velvet-speakeasy', 'accent', {
    name: 'Merlot Velvet Accent', description: 'A deep merlot profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 350, styleKey: 'speakeasy-merlot',
    preview: { type: 'ACCENT', color: '#c2405c' },
  }),
  item('velvet-speakeasy', 'shell', {
    name: 'Velvet Speakeasy Shell', description: 'The whole game behind the hidden door: merlot velvet panels, pewter controls, a sliding bookcase and cigar smoke drifting past the gramophone.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1250, styleKey: 'velvet-speakeasy-shell',
    preview: { type: 'THEME' },
  }),
  item('velvet-speakeasy', 'title', {
    name: 'Bootlegger', description: 'A Velvet Speakeasy title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'Bootlegger' },
  }),
  // Platinum Funk
  item('platinum-funk', 'low-rider', {
    name: 'Platinum Funk Low-Rider', description: 'A long-hood cruiser in chocolate and tangerine with a fur dash, platinum trim and whitewalls. A Low-Rider look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 850, styleKey: 'platinum-funk-low-rider',
    preview: { type: 'ITEM', items: ['LOW_RIDER'] }, dresses: 'LOW_RIDER',
  }),
  item('platinum-funk', 'thug', {
    name: 'Platinum Funk Thug', description: 'A wide-lapel tangerine suit, a patterned shirt open at the collar and a platinum chain. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'platinum-funk-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('platinum-funk', 'hoe', {
    name: 'Platinum Funk Hoe', description: 'A plush white fur coat over a platinum disco jumpsuit. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'platinum-funk-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('platinum-funk', 'frame', {
    name: 'Platinum Funk Frame', description: 'A mirror-ball ring that throws slow flecks of light. The flecks hold still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'platinum-funk-frame',
    preview: { type: 'FRAME' },
  }),
  item('platinum-funk', 'accent', {
    name: 'Tangerine Funk Accent', description: 'A warm tangerine profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 350, styleKey: 'funk-tangerine',
    preview: { type: 'ACCENT', color: '#ff8a2a' },
  }),
  item('platinum-funk', 'shell', {
    name: 'Platinum Funk Shell', description: 'The whole game on the roller-disco floor: chocolate panels, tangerine controls, sunburst stripes and a mirror ball turning overhead.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1250, styleKey: 'platinum-funk-shell',
    preview: { type: 'THEME' },
  }),
  item('platinum-funk', 'title', {
    name: 'Funk Royalty', description: 'A Platinum Funk title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'Funk Royalty' },
  }),
  // Redline Syndicate
  item('redline-syndicate', 'sedan', {
    name: 'Redline Syndicate Sedan', description: 'A widebody kit, a carbon rear wing, red race livery and a number on the door. A Sedan look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 850, styleKey: 'redline-syndicate-sedan',
    preview: { type: 'ITEM', items: ['SEDAN'] }, dresses: 'SEDAN',
  }),
  item('redline-syndicate', 'thug', {
    name: 'Redline Syndicate Thug', description: 'A carbon-black racing jacket covered in sponsor-style patches, with red shoulder stripes. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'redline-syndicate-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('redline-syndicate', 'hoe', {
    name: 'Redline Syndicate Hoe', description: 'A red and white pit-crew jumpsuit with a headset and fingerless gloves. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'redline-syndicate-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('redline-syndicate', 'ak47', {
    name: 'Redline Syndicate AK-47', description: 'Carbon-fibre furniture with signal-red trim. A visual finish only; it never gives you an AK-47 or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 600, styleKey: 'redline-syndicate-ak47',
    preview: { type: 'ITEM', items: ['AK47'] }, dresses: 'AK47',
  }),
  item('redline-syndicate', 'frame', {
    name: 'Redline Syndicate Frame', description: 'A tachometer ring whose needle sweeps up to the redline. The needle holds still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'redline-syndicate-frame',
    preview: { type: 'FRAME' },
  }),
  item('redline-syndicate', 'accent', {
    name: 'Redline Red Accent', description: 'A signal-red profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 350, styleKey: 'redline-red',
    preview: { type: 'ACCENT', color: '#ff3344' },
  }),
  item('redline-syndicate', 'shell', {
    name: 'Redline Syndicate Shell', description: 'The whole game at the midnight meet: carbon panels, red controls, light trails and tyre smoke under the parking-garage lights.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1250, styleKey: 'redline-syndicate-shell',
    preview: { type: 'THEME' },
  }),
  item('redline-syndicate', 'title', {
    name: 'Redline', description: 'A Redline Syndicate title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'Redline' },
  }),
  // Wet Paint
  item('wet-paint', 'low-rider', {
    name: 'Wet Paint Low-Rider', description: 'A full mural paint job: mint and chrome bubble letters with drips running down the doors. A Low-Rider look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 800, styleKey: 'wet-paint-low-rider',
    preview: { type: 'ITEM', items: ['LOW_RIDER'] }, dresses: 'LOW_RIDER',
  }),
  item('wet-paint', 'thug', {
    name: 'Wet Paint Thug', description: 'A paint-splattered black hoodie and a respirator pushed up on the head. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 650, styleKey: 'wet-paint-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('wet-paint', 'hoe', {
    name: 'Wet Paint Hoe', description: 'A tagged denim jacket over a mint crop top, with spray-can hoop earrings. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 650, styleKey: 'wet-paint-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('wet-paint', 'pistol', {
    name: 'Wet Paint Pistol', description: 'A mint drip finish over chrome, with a tag on the slide. A visual finish only; it never gives you a pistol or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 550, styleKey: 'wet-paint-pistol',
    preview: { type: 'ITEM', items: ['PISTOL'] }, dresses: 'PISTOL',
  }),
  item('wet-paint', 'frame', {
    name: 'Wet Paint Frame', description: 'A ring of spray paint with a drip that slowly runs. The drip holds still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'wet-paint-frame',
    preview: { type: 'FRAME' },
  }),
  item('wet-paint', 'accent', {
    name: 'Spray Mint Accent', description: 'A fresh spray-mint profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 300, styleKey: 'wet-paint-mint',
    preview: { type: 'ACCENT', color: '#36e2a0' },
  }),
  item('wet-paint', 'shell', {
    name: 'Wet Paint Shell', description: 'The whole game in the train yard: concrete panels, mint controls and a wall of tags with a fresh piece slowly filling in.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1200, styleKey: 'wet-paint-shell',
    preview: { type: 'THEME' },
  }),
  item('wet-paint', 'title', {
    name: 'All City', description: 'A Wet Paint title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 200,
    preview: { type: 'TITLE', title: 'All City' },
  }),
  // Hazard Cook
  item('hazard-cook', 'van', {
    name: 'Hazard Cook Van', description: 'A lab van in hazmat yellow with warning stripes, a roof vent stack and drums strapped to the back. A Van look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 800, styleKey: 'hazard-cook-van',
    preview: { type: 'ITEM', items: ['VAN'] }, dresses: 'VAN',
  }),
  item('hazard-cook', 'crew', {
    name: 'Hazard Cook Crew Set', description: 'Sealed hazmat suits with respirators and taped gloves for both crew types.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 900, styleKey: 'hazard-cook-crew',
    preview: { type: 'ITEM', items: ['THUG', 'HOE'] }, dresses: 'THUG',
  }),
  item('hazard-cook', 'shotgun', {
    name: 'Hazard Cook Shotgun', description: 'Brushed stainless steel wrapped in black and yellow hazard tape. A visual finish only; it never gives you a shotgun or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 550, styleKey: 'hazard-cook-shotgun',
    preview: { type: 'ITEM', items: ['SHOTGUN'] }, dresses: 'SHOTGUN',
  }),
  item('hazard-cook', 'frame', {
    name: 'Hazard Cook Frame', description: 'A black and yellow hazard-stripe ring for the profile and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'hazard-cook-frame',
    preview: { type: 'FRAME' },
  }),
  item('hazard-cook', 'accent', {
    name: 'Hazard Yellow Accent', description: 'A warning-yellow profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 300, styleKey: 'hazard-yellow',
    preview: { type: 'ACCENT', color: '#ffd400' },
  }),
  item('hazard-cook', 'shell', {
    name: 'Hazard Cook Shell', description: 'The whole game in the cookhouse: stainless panels, hazard-yellow controls and a desert lab at dusk with flasks bubbling under a work lamp.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1200, styleKey: 'hazard-cook-shell',
    preview: { type: 'THEME' },
  }),
  item('hazard-cook', 'title', {
    name: 'The Chemist', description: 'A Hazard Cook title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'The Chemist' },
  }),
  // Dockside
  item('dockside', 'van', {
    name: 'Dockside Van', description: 'A box van in shipping-container livery: corrugated navy panels, rust streaks and an orange stencil. A Van look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 800, styleKey: 'dockside-van',
    preview: { type: 'ITEM', items: ['VAN'] }, dresses: 'VAN',
  }),
  item('dockside', 'thug', {
    name: 'Dockside Thug', description: 'A navy peacoat with the collar up and a ribbed watch cap. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'dockside-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('dockside', 'hoe', {
    name: 'Dockside Hoe', description: 'A safety-orange longshore jacket over navy work overalls and steel-toe boots. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'dockside-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('dockside', 'ak47', {
    name: 'Dockside AK-47', description: 'A weathered finish with salt-pitted steel and rope-wrapped furniture. A visual finish only; it never gives you an AK-47 or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 600, styleKey: 'dockside-ak47',
    preview: { type: 'ITEM', items: ['AK47'] }, dresses: 'AK47',
  }),
  item('dockside', 'frame', {
    name: 'Dockside Frame', description: 'An anchor-chain ring lashed with rope for the profile and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'dockside-frame',
    preview: { type: 'FRAME' },
  }),
  item('dockside', 'accent', {
    name: 'Harbour Blue Accent', description: 'A harbour-blue profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 300, styleKey: 'dockside-harbor',
    preview: { type: 'ACCENT', color: '#5b9bd5' },
  }),
  item('dockside', 'shell', {
    name: 'Dockside Shell', description: 'The whole game on the docks: navy steel panels, safety-orange controls, container cranes and a searchlight sweeping slowly through the fog.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1200, styleKey: 'dockside-shell',
    preview: { type: 'THEME' },
  }),
  item('dockside', 'title', {
    name: 'Off the Books', description: 'A Dockside title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 200,
    preview: { type: 'TITLE', title: 'Off the Books' },
  }),
  // Crown Jewels
  item('crown-jewels', 'sedan', {
    name: 'Crown Jewels Sedan', description: 'An armoured state car in royal sapphire with a jewelled grille, platinum trim and a crown on the hood. A Sedan look only.',
    kind: 'ITEM_COLLECTION', rarity: 'legendary', category: 'VEHICLES', priceCrowns: 1000, styleKey: 'crown-jewels-sedan',
    preview: { type: 'ITEM', items: ['SEDAN'] }, dresses: 'SEDAN',
  }),
  item('crown-jewels', 'crew', {
    name: 'Crown Jewels Crew Set', description: 'An ermine-collared sapphire coat with a jewelled chain, and a ruby-studded emerald gown with a tiara.',
    kind: 'ITEM_COLLECTION', rarity: 'legendary', category: 'CREW', priceCrowns: 1000, styleKey: 'crown-jewels-crew',
    preview: { type: 'ITEM', items: ['THUG', 'HOE'] }, dresses: 'THUG',
  }),
  item('crown-jewels', 'ak47', {
    name: 'Crown Jewels AK-47', description: 'Platinum with emerald, ruby and sapphire inlays. A visual finish only; it never gives you an AK-47 or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 650, styleKey: 'crown-jewels-ak47',
    preview: { type: 'ITEM', items: ['AK47'] }, dresses: 'AK47',
  }),
  item('crown-jewels', 'frame', {
    name: 'Crown Jewels Frame', description: 'A platinum crown ring whose emerald, ruby and sapphire glint in turn. The glints hold still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 500, styleKey: 'crown-jewels-frame',
    preview: { type: 'FRAME' },
  }),
  item('crown-jewels', 'accent', {
    name: 'Sapphire Accent', description: 'A royal sapphire profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 350, styleKey: 'jewel-sapphire',
    preview: { type: 'ACCENT', color: '#4a78ff' },
  }),
  item('crown-jewels', 'shell', {
    name: 'Crown Jewels Shell', description: 'The whole game in the treasury: velvet panels, platinum controls and a vault of jewels glittering behind the open door.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1350, styleKey: 'crown-jewels-shell',
    preview: { type: 'THEME' },
  }),
  item('crown-jewels', 'title', {
    name: 'Crowned', description: 'A Crown Jewels title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'Crowned' },
  }),
  // Bayou Smoke
  item('bayou-smoke', 'van', {
    name: 'Bayou Smoke Van', description: 'A mud-caked moss-green swamp van with a roof rack, a winch and Spanish moss hanging off the mirrors. A Van look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 800, styleKey: 'bayou-smoke-van',
    preview: { type: 'ITEM', items: ['VAN'] }, dresses: 'VAN',
  }),
  item('bayou-smoke', 'thug', {
    name: 'Bayou Smoke Thug', description: 'A waxed moss-green field jacket, chest waders and a gator-tooth necklace. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'bayou-smoke-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('bayou-smoke', 'hoe', {
    name: 'Bayou Smoke Hoe', description: 'A cypress-brown linen dress, gator-hide boots and a firefly charm bracelet. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'bayou-smoke-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('bayou-smoke', 'shotgun', {
    name: 'Bayou Smoke Shotgun', description: 'Cypress-wood furniture with a gator-hide wrap on the grip. A visual finish only; it never gives you a shotgun or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 550, styleKey: 'bayou-smoke-shotgun',
    preview: { type: 'ITEM', items: ['SHOTGUN'] }, dresses: 'SHOTGUN',
  }),
  item('bayou-smoke', 'frame', {
    name: 'Bayou Smoke Frame', description: 'A ring of twisted cypress with fireflies drifting around it. The fireflies hold still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'bayou-smoke-frame',
    preview: { type: 'FRAME' },
  }),
  item('bayou-smoke', 'accent', {
    name: 'Firefly Green Accent', description: 'A glowing firefly-green profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 300, styleKey: 'bayou-firefly',
    preview: { type: 'ACCENT', color: '#b6e05a' },
  }),
  item('bayou-smoke', 'shell', {
    name: 'Bayou Smoke Shell', description: 'The whole game deep in the swamp: moss panels, firefly-green controls, cypress knees in the water and fireflies drifting through the haze.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1200, styleKey: 'bayou-smoke-shell',
    preview: { type: 'THEME' },
  }),
  item('bayou-smoke', 'title', {
    name: 'Swamp King', description: 'A Bayou Smoke title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 200,
    preview: { type: 'TITLE', title: 'Swamp King' },
  }),
  // Desert Mirage
  item('desert-mirage', 'low-rider', {
    name: 'Desert Mirage Low-Rider', description: 'A sun-bleached sand cruiser with rust-canyon fades, turquoise pinstripes and dust on the sills. A Low-Rider look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 850, styleKey: 'desert-mirage-low-rider',
    preview: { type: 'ITEM', items: ['LOW_RIDER'] }, dresses: 'LOW_RIDER',
  }),
  item('desert-mirage', 'thug', {
    name: 'Desert Mirage Thug', description: 'A long sand duster, a rust bandana and a turquoise bolo tie. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'desert-mirage-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('desert-mirage', 'hoe', {
    name: 'Desert Mirage Hoe', description: 'A fringed suede jacket over a rust slip dress, with stacked turquoise jewellery. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'desert-mirage-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('desert-mirage', 'tek9', {
    name: 'Desert Mirage Tek-9', description: 'A sandblasted finish with turquoise stone inlays. A visual finish only; it never gives you a Tek-9 or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 600, styleKey: 'desert-mirage-tek9',
    preview: { type: 'ITEM', items: ['TEK9'] }, dresses: 'TEK9',
  }),
  item('desert-mirage', 'frame', {
    name: 'Desert Mirage Frame', description: 'A sandstone ring set with turquoise, with heat shimmer rising off it. The shimmer holds still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'desert-mirage-frame',
    preview: { type: 'FRAME' },
  }),
  item('desert-mirage', 'accent', {
    name: 'Turquoise Stone Accent', description: 'A turquoise-stone profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 350, styleKey: 'mirage-turquoise',
    preview: { type: 'ACCENT', color: '#3fc1c9' },
  }),
  item('desert-mirage', 'shell', {
    name: 'Desert Mirage Shell', description: 'The whole game on a border run: sand panels, turquoise controls, red mesas under a white sun and heat shimmer on the road.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1250, styleKey: 'desert-mirage-shell',
    preview: { type: 'THEME' },
  }),
  item('desert-mirage', 'title', {
    name: 'Dust Devil', description: 'A Desert Mirage title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'Dust Devil' },
  }),
  // Rewind
  item('rewind', 'van', {
    name: 'Rewind Van', description: 'A black conversion van with magenta and lime racing stripes, a sunset decal and a bubble window. A Van look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 800, styleKey: 'rewind-van',
    preview: { type: 'ITEM', items: ['VAN'] }, dresses: 'VAN',
  }),
  item('rewind', 'thug', {
    name: 'Rewind Thug', description: 'A colour-block windbreaker in magenta, lime and black, with a cassette on a chain. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'rewind-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('rewind', 'hoe', {
    name: 'Rewind Hoe', description: 'A lime and magenta jacket with big shoulders, leg warmers and a side ponytail. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'rewind-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('rewind', 'tek9', {
    name: 'Rewind Tek-9', description: 'Black with magenta and lime tape stripes. A visual finish only; it never gives you a Tek-9 or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 550, styleKey: 'rewind-tek9',
    preview: { type: 'ITEM', items: ['TEK9'] }, dresses: 'TEK9',
  }),
  item('rewind', 'frame', {
    name: 'Rewind Frame', description: 'A CRT ring with scan lines and a tracking glitch that rolls through. The glitch holds still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'rewind-frame',
    preview: { type: 'FRAME' },
  }),
  item('rewind', 'accent', {
    name: 'Tracking Magenta Accent', description: 'A glowing VHS-magenta profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 300, styleKey: 'rewind-magenta',
    preview: { type: 'ACCENT', color: '#e04bff' },
  }),
  item('rewind', 'shell', {
    name: 'Rewind Shell', description: 'The whole game on tape: black panels with scan lines, magenta controls and a CRT glowing behind the page, with a tracking glitch rolling past.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1200, styleKey: 'rewind-shell',
    preview: { type: 'THEME' },
  }),
  item('rewind', 'title', {
    name: 'Run It Back', description: 'A Rewind title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 200,
    preview: { type: 'TITLE', title: 'Run It Back' },
  }),
  // Snake Eyes
  item('snake-eyes', 'sedan', {
    name: 'Snake Eyes Sedan', description: 'A black stretch look with felt-green pinstripes, card suits on the doors and fuzzy dice on the mirror. A Sedan look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 850, styleKey: 'snake-eyes-sedan',
    preview: { type: 'ITEM', items: ['SEDAN'] }, dresses: 'SEDAN',
  }),
  item('snake-eyes', 'thug', {
    name: 'Snake Eyes Thug', description: 'A dealer\'s waistcoat and bow tie with sleeve garters and a deck in the pocket. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'snake-eyes-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('snake-eyes', 'hoe', {
    name: 'Snake Eyes Hoe', description: 'A black sequin dress with red card suits and a stack of chips in her hand. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'snake-eyes-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('snake-eyes', 'pistol', {
    name: 'Snake Eyes Pistol', description: 'A black slide with ivory dice-pip grips. A visual finish only; it never gives you a pistol or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 550, styleKey: 'snake-eyes-pistol',
    preview: { type: 'ITEM', items: ['PISTOL'] }, dresses: 'PISTOL',
  }),
  item('snake-eyes', 'frame', {
    name: 'Snake Eyes Frame', description: 'A ring of poker chips around green felt for the profile and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'snake-eyes-frame',
    preview: { type: 'FRAME' },
  }),
  item('snake-eyes', 'accent', {
    name: 'Card Felt Accent', description: 'A card-table felt-green profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 350, styleKey: 'felt-green',
    preview: { type: 'ACCENT', color: '#1fae6a' },
  }),
  item('snake-eyes', 'shell', {
    name: 'Snake Eyes Shell', description: 'The whole game in the back room: felt-green panels, ivory controls and a card table under a swinging lamp, with chips stacked high.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1250, styleKey: 'snake-eyes-shell',
    preview: { type: 'THEME' },
  }),
  item('snake-eyes', 'title', {
    name: 'Loaded Dice', description: 'A Snake Eyes title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'Loaded Dice' },
  }),
  // Graveyard Shift
  item('graveyard-shift', 'sedan', {
    name: 'Graveyard Shift Sedan', description: 'A black hearse conversion with a wrought-iron roof rail and lace curtains in the rear glass. A Sedan look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 850, styleKey: 'graveyard-shift-sedan',
    preview: { type: 'ITEM', items: ['SEDAN'] }, dresses: 'SEDAN',
  }),
  item('graveyard-shift', 'thug', {
    name: 'Graveyard Shift Thug', description: 'An undertaker\'s frock coat, a bowler and a bone-handled cane. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'graveyard-shift-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('graveyard-shift', 'hoe', {
    name: 'Graveyard Shift Hoe', description: 'A black lace mourning dress with a veil and a ghost-green cameo. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'graveyard-shift-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('graveyard-shift', 'pistol', {
    name: 'Graveyard Shift Pistol', description: 'A bone-inlay grip and a slide etched with skulls and vines. A visual finish only; it never gives you a pistol or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 550, styleKey: 'graveyard-shift-pistol',
    preview: { type: 'ITEM', items: ['PISTOL'] }, dresses: 'PISTOL',
  }),
  item('graveyard-shift', 'frame', {
    name: 'Graveyard Shift Frame', description: 'A wrought-iron gate ring with mist drifting through the bars. The mist holds still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'graveyard-shift-frame',
    preview: { type: 'FRAME' },
  }),
  item('graveyard-shift', 'accent', {
    name: 'Ghost Green Accent', description: 'A cold ghost-green profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 300, styleKey: 'ghost-green',
    preview: { type: 'ACCENT', color: '#a8f0c6' },
  }),
  item('graveyard-shift', 'shell', {
    name: 'Graveyard Shift Shell', description: 'The whole game after midnight: iron-grey panels, ghost-green controls, cemetery gates, crooked trees and fog rolling low across the page.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1250, styleKey: 'graveyard-shift-shell',
    preview: { type: 'THEME' },
  }),
  item('graveyard-shift', 'title', {
    name: 'Night Shift', description: 'A Graveyard Shift title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'Night Shift' },
  }),
  // Naughty List
  item('naughty-list', 'van', {
    name: 'Naughty List Van', description: 'A candy-stripe delivery van with a giant bow on the roof and a NAUGHTY plate. A Van look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 800, styleKey: 'naughty-list-van',
    preview: { type: 'ITEM', items: ['VAN'] }, dresses: 'VAN',
  }),
  item('naughty-list', 'crew', {
    name: 'Naughty List Crew Set', description: 'An ugly-sweater hoodie with a chain, and a red velvet coat with white trim.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 900, styleKey: 'naughty-list-crew',
    preview: { type: 'ITEM', items: ['THUG', 'HOE'] }, dresses: 'THUG',
  }),
  item('naughty-list', 'tek9', {
    name: 'Naughty List Tek-9', description: 'A gift-wrap finish with a ribbon tied round the grip. A visual finish only; it never gives you a Tek-9 or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 550, styleKey: 'naughty-list-tek9',
    preview: { type: 'ITEM', items: ['TEK9'] }, dresses: 'TEK9',
  }),
  item('naughty-list', 'frame', {
    name: 'Naughty List Frame', description: 'A ribbon ring tied off with a bow, with foil sparkle that glints in turn. The sparkle holds still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'naughty-list-frame',
    preview: { type: 'FRAME' },
  }),
  item('naughty-list', 'accent', {
    name: 'Candy Red Accent', description: 'A candy-stripe red profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 300, styleKey: 'candy-red',
    preview: { type: 'ACCENT', color: '#e23a3a' },
  }),
  item('naughty-list', 'shell', {
    name: 'Naughty List Shell', description: 'The whole game wrapped for the holidays: foil-green panels, candy-red controls, rooftops and wrapped boxes stacked by a back door, with a sack of coal.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1200, styleKey: 'naughty-list-shell',
    preview: { type: 'THEME' },
  }),
  item('naughty-list', 'title', {
    name: 'Coal Collector', description: 'A Naughty List title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 200,
    preview: { type: 'TITLE', title: 'Coal Collector' },
  }),
  // Heartbreaker
  item('heartbreaker', 'low-rider', {
    name: 'Heartbreaker Low-Rider', description: 'Candy-apple red with a chain heart steering wheel and a rose-vine pinstripe. A Low-Rider look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 850, styleKey: 'heartbreaker-low-rider',
    preview: { type: 'ITEM', items: ['LOW_RIDER'] }, dresses: 'LOW_RIDER',
  }),
  item('heartbreaker', 'thug', {
    name: 'Heartbreaker Thug', description: 'A black bomber embroidered with roses and thorns. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'heartbreaker-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('heartbreaker', 'hoe', {
    name: 'Heartbreaker Hoe', description: 'A red satin dress with heart-shaped shades and a thorned choker. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'heartbreaker-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('heartbreaker', 'tek9', {
    name: 'Heartbreaker Tek-9', description: 'Rose-chrome with an engraved thorn vine. A visual finish only; it never gives you a Tek-9 or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 600, styleKey: 'heartbreaker-tek9',
    preview: { type: 'ITEM', items: ['TEK9'] }, dresses: 'TEK9',
  }),
  item('heartbreaker', 'frame', {
    name: 'Heartbreaker Frame', description: 'A thorned rose ring with a single petal drifting down. The petal holds still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'heartbreaker-frame',
    preview: { type: 'FRAME' },
  }),
  item('heartbreaker', 'accent', {
    name: 'Heartbreak Rose Accent', description: 'A rose-red profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 350, styleKey: 'heartbreak-rose',
    preview: { type: 'ACCENT', color: '#ff4d6d' },
  }),
  item('heartbreaker', 'shell', {
    name: 'Heartbreaker Shell', description: 'The whole game after a bad breakup: crimson panels, rose controls, rain on the street and a broken-heart sign flickering softly.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1250, styleKey: 'heartbreaker-shell',
    preview: { type: 'THEME' },
  }),
  item('heartbreaker', 'title', {
    name: 'Cold Hearted', description: 'A Heartbreaker title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'Cold Hearted' },
  }),
  // Block Party
  item('block-party', 'van', {
    name: 'Block Party Van', description: 'An ice-cream truck with a speaker stack on the roof and a swirl cone on the side. A Van look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 800, styleKey: 'block-party-van',
    preview: { type: 'ITEM', items: ['VAN'] }, dresses: 'VAN',
  }),
  item('block-party', 'thug', {
    name: 'Block Party Thug', description: 'A sky-blue track jacket and a bucket hat. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'block-party-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('block-party', 'hoe', {
    name: 'Block Party Hoe', description: 'A bright two-piece with big silver hoops and a mango scrunchie. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'block-party-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('block-party', 'shotgun', {
    name: 'Block Party Shotgun', description: 'A sticker-bombed finish in summer colours. A visual finish only; it never gives you a shotgun or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 550, styleKey: 'block-party-shotgun',
    preview: { type: 'ITEM', items: ['SHOTGUN'] }, dresses: 'SHOTGUN',
  }),
  item('block-party', 'frame', {
    name: 'Block Party Frame', description: 'A speaker-cone ring that thumps gently to a beat. The beat holds still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'block-party-frame',
    preview: { type: 'FRAME' },
  }),
  item('block-party', 'accent', {
    name: 'Mango Heat Accent', description: 'A hot mango profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 300, styleKey: 'block-party-mango',
    preview: { type: 'ACCENT', color: '#ffb627' },
  }),
  item('block-party', 'shell', {
    name: 'Block Party Shell', description: 'The whole game on a summer afternoon: sky panels, mango controls, brownstones, string flags and an open hydrant spraying.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1200, styleKey: 'block-party-shell',
    preview: { type: 'THEME' },
  }),
  item('block-party', 'title', {
    name: 'Block Captain', description: 'A Block Party title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 200,
    preview: { type: 'TITLE', title: 'Block Captain' },
  }),
  // Movie homages
  // Quarter Mile
  item('quarter-mile', 'sedan', {
    name: 'Quarter Mile Sedan', description: 'A bright orange tuner with racing livery, a big rear wing and blue nitrous bottles in the back. A Sedan look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 850, styleKey: 'quarter-mile-sedan',
    preview: { type: 'ITEM', items: ['SEDAN'] }, dresses: 'SEDAN',
  }),
  item('quarter-mile', 'low-rider', {
    name: 'Quarter Mile Low-Rider', description: 'A gloss-black muscle car with a supercharger punching through the hood and fat rear tyres. A Low-Rider look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 850, styleKey: 'quarter-mile-low-rider',
    preview: { type: 'ITEM', items: ['LOW_RIDER'] }, dresses: 'LOW_RIDER',
  }),
  item('quarter-mile', 'thug', {
    name: 'Quarter Mile Thug', description: 'A white tank top, a heavy cross chain and dark jeans: dressed for a family cookout after the race. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'quarter-mile-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('quarter-mile', 'hoe', {
    name: 'Quarter Mile Hoe', description: 'A black racing-leather jacket with orange stripes and aviator shades. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'quarter-mile-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('quarter-mile', 'tek9', {
    name: 'Quarter Mile Tek-9', description: 'Nitrous blue with white racing stripes. A visual finish only; it never gives you a Tek-9 or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 600, styleKey: 'quarter-mile-tek9',
    preview: { type: 'ITEM', items: ['TEK9'] }, dresses: 'TEK9',
  }),
  item('quarter-mile', 'frame', {
    name: 'Quarter Mile Frame', description: 'A drag-strip start tree: amber lights count down, then go green. The lights hold still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'quarter-mile-frame',
    preview: { type: 'FRAME' },
  }),
  item('quarter-mile', 'accent', {
    name: 'Nitrous Blue Accent', description: 'A nitrous-blue profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 350, styleKey: 'nitrous-blue',
    preview: { type: 'ACCENT', color: '#2f9bff' },
  }),
  item('quarter-mile', 'shell', {
    name: 'Quarter Mile Shell', description: 'The whole game at the strip after midnight: asphalt panels, nitrous-blue controls, the start tree counting down and the finish line under the lights.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1250, styleKey: 'quarter-mile-shell',
    preview: { type: 'THEME' },
  }),
  item('quarter-mile', 'title', {
    name: 'Ride or Die', description: 'A Quarter Mile title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'Ride or Die' },
  }),
  // 88 Club
  item('88-club', 'van', {
    name: '88 Club Van', description: 'A lab van wired with coils and cables, glowing flux blue, with twin trails of fire behind the tyres. A Van look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 800, styleKey: '88-club-van',
    preview: { type: 'ITEM', items: ['VAN'] }, dresses: 'VAN',
  }),
  item('88-club', 'thug', {
    name: '88 Club Thug', description: 'An eighties puffer vest over a denim jacket, with a calculator watch. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: '88-club-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('88-club', 'hoe', {
    name: '88 Club Hoe', description: 'A fifties prom dress in powder blue with a corsage and a ribbon in her hair. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: '88-club-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('88-club', 'pistol', {
    name: '88 Club Pistol', description: 'Brushed chrome with a glowing flux coil along the slide. A visual finish only; it never gives you a pistol or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 550, styleKey: '88-club-pistol',
    preview: { type: 'ITEM', items: ['PISTOL'] }, dresses: 'PISTOL',
  }),
  item('88-club', 'frame', {
    name: '88 Club Frame', description: 'A clock face with the hands stopped at 10:04 and lightning crackling round the rim. The lightning holds still under reduced motion.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: '88-club-frame',
    preview: { type: 'FRAME' },
  }),
  item('88-club', 'accent', {
    name: 'Flux Blue Accent', description: 'A crackling flux-blue profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 300, styleKey: 'flux-blue',
    preview: { type: 'ACCENT', color: '#4fd2ff' },
  }),
  item('88-club', 'shell', {
    name: '88 Club Shell', description: 'The whole game on a stormy night: steel panels, flux-blue controls, a clock tower struck by lightning and fire trails burning across the page.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1200, styleKey: '88-club-shell',
    preview: { type: 'THEME' },
  }),
  item('88-club', 'title', {
    name: 'Ahead of Time', description: 'A 88 Club title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 250,
    preview: { type: 'TITLE', title: 'Ahead of Time' },
  }),
  // Swamp Kingdom
  item('swamp-kingdom', 'van', {
    name: 'Swamp Kingdom Van', description: 'A storybook carriage van: mossy wood panels, curled gold trim, cartwheel rims and a KEEP OUT sign on the side. A Van look only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'VEHICLES', priceCrowns: 800, styleKey: 'swamp-kingdom-van',
    preview: { type: 'ITEM', items: ['VAN'] }, dresses: 'VAN',
  }),
  item('swamp-kingdom', 'thug', {
    name: 'Swamp Kingdom Thug', description: 'A rough burlap tunic under a worn leather vest, with a rope belt. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'swamp-kingdom-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('swamp-kingdom', 'hoe', {
    name: 'Swamp Kingdom Hoe', description: 'A moss-green velvet princess gown with gold braid and a little gold crown. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'epic', category: 'CREW', priceCrowns: 700, styleKey: 'swamp-kingdom-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('swamp-kingdom', 'shotgun', {
    name: 'Swamp Kingdom Shotgun', description: 'A carved-wood blunderbuss with ivy growing round the barrel. A visual finish only; it never gives you a shotgun or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 550, styleKey: 'swamp-kingdom-shotgun',
    preview: { type: 'ITEM', items: ['SHOTGUN'] }, dresses: 'SHOTGUN',
  }),
  item('swamp-kingdom', 'frame', {
    name: 'Swamp Kingdom Frame', description: 'A storybook page edged with curling vines and a little gold crown.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'swamp-kingdom-frame',
    preview: { type: 'FRAME' },
  }),
  item('swamp-kingdom', 'accent', {
    name: 'Swamp Moss Accent', description: 'A mossy swamp-green profile and banner accent.',
    kind: 'ACCENT', rarity: 'rare', category: 'SHELLS', priceCrowns: 300, styleKey: 'swamp-moss',
    preview: { type: 'ACCENT', color: '#7aa83a' },
  }),
  item('swamp-kingdom', 'shell', {
    name: 'Swamp Kingdom Shell', description: 'The whole game in a fairytale swamp: mossy panels, swamp-green controls, an outhouse with a KEEP OUT sign, a castle on the hill and a dragon circling it.',
    kind: 'SITE_THEME', rarity: 'legendary', category: 'SHELLS', priceCrowns: 1200, styleKey: 'swamp-kingdom-shell',
    preview: { type: 'THEME' },
  }),
  item('swamp-kingdom', 'title', {
    name: 'Got Layers', description: 'A Swamp Kingdom title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 200,
    preview: { type: 'TITLE', title: 'Got Layers' },
  }),
  // Street Singles: one-off pieces with no set or bundle, for the daily picks.
  item('street-singles', 'taxi-hustle', {
    name: 'Taxi Hustle Sedan', description: 'Cab yellow with a checker stripe, a roof light and a meter in the window. Nobody looks twice at a taxi. A Sedan look only.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'VEHICLES', priceCrowns: 650, styleKey: 'taxi-hustle-sedan',
    preview: { type: 'ITEM', items: ['SEDAN'] }, dresses: 'SEDAN',
  }),
  item('street-singles', 'two-tone', {
    name: 'Two-Tone Classic Sedan', description: 'Fifties two-tone: cream roof and teal body, a chrome spear down the side and whitewall tyres. A Sedan look only.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'VEHICLES', priceCrowns: 600, styleKey: 'two-tone-classic-sedan',
    preview: { type: 'ITEM', items: ['SEDAN'] }, dresses: 'SEDAN',
  }),
  item('street-singles', 'lime-flake', {
    name: 'Lime Flake Low-Rider', description: 'Candy lime metal flake that sparkles under the streetlights, with gold-leaf scrolls on the doors. A Low-Rider look only.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'VEHICLES', priceCrowns: 650, styleKey: 'lime-flake-low-rider',
    preview: { type: 'ITEM', items: ['LOW_RIDER'] }, dresses: 'LOW_RIDER',
  }),
  item('street-singles', 'hot-flames', {
    name: 'Hot Flames Low-Rider', description: 'Gloss black with orange-to-yellow hot-rod flames licking back from the front wheels. A Low-Rider look only.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'VEHICLES', priceCrowns: 650, styleKey: 'hot-flames-low-rider',
    preview: { type: 'ITEM', items: ['LOW_RIDER'] }, dresses: 'LOW_RIDER',
  }),
  item('street-singles', 'pipe-dreams', {
    name: 'Pipe Dreams Plumbing Van', description: 'A white work van for Pipe Dreams Plumbing, with a ladder on the roof and a phone number nobody answers. A Van look only.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'VEHICLES', priceCrowns: 600, styleKey: 'pipe-dreams-van',
    preview: { type: 'ITEM', items: ['VAN'] }, dresses: 'VAN',
  }),
  item('street-singles', 'flower-power', {
    name: 'Flower Power Van', description: 'A sky-blue van covered in big daisies and swirls, straight out of a summer of love. A Van look only.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'VEHICLES', priceCrowns: 600, styleKey: 'flower-power-van',
    preview: { type: 'ITEM', items: ['VAN'] }, dresses: 'VAN',
  }),
  item('street-singles', 'tiger-stripe', {
    name: 'Tiger Stripe Pistol', description: 'Orange and black tiger stripes down the slide and grip. A visual finish only; it never gives you a pistol or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'uncommon', category: 'WEAPONS', priceCrowns: 450, styleKey: 'tiger-stripe-pistol',
    preview: { type: 'ITEM', items: ['PISTOL'] }, dresses: 'PISTOL',
  }),
  item('street-singles', 'damascus', {
    name: 'Damascus AK-47', description: 'Folded Damascus steel with its wavy grain, on dark oiled walnut. A visual finish only; it never gives you an AK-47 or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'WEAPONS', priceCrowns: 500, styleKey: 'damascus-ak47',
    preview: { type: 'ITEM', items: ['AK47'] }, dresses: 'AK47',
  }),
  item('street-singles', 'rust-bucket', {
    name: 'Rust Bucket Shotgun', description: 'Rusted steel, a cracked stock and grey duct tape holding it all together. Still works. A visual finish only; it never gives you a shotgun or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'uncommon', category: 'WEAPONS', priceCrowns: 400, styleKey: 'rust-bucket-shotgun',
    preview: { type: 'ITEM', items: ['SHOTGUN'] }, dresses: 'SHOTGUN',
  }),
  item('street-singles', 'bubblegum', {
    name: 'Bubblegum Tek-9', description: 'Bubblegum pink with a glitter coat and a sticker on the mag. A visual finish only; it never gives you a Tek-9 or the right to buy one.',
    kind: 'ITEM_COLLECTION', rarity: 'uncommon', category: 'WEAPONS', priceCrowns: 450, styleKey: 'bubblegum-tek9',
    preview: { type: 'ITEM', items: ['TEK9'] }, dresses: 'TEK9',
  }),
  item('street-singles', 'velour-tracksuit', {
    name: 'Velour Tracksuit Thug', description: 'A maroon velour tracksuit with gold zips and white piping. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'CREW', priceCrowns: 550, styleKey: 'velour-tracksuit-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('street-singles', 'bowling-shirt', {
    name: 'Bowling Shirt Thug', description: 'A retro two-tone bowling shirt, cream and teal, with a pin stitched on the chest. A Thug outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'CREW', priceCrowns: 500, styleKey: 'bowling-shirt-thug',
    preview: { type: 'ITEM', items: ['THUG'] }, dresses: 'THUG',
  }),
  item('street-singles', 'leopard-coat', {
    name: 'Leopard Coat Hoe', description: 'A leopard-print coat over a little black dress. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'CREW', priceCrowns: 550, styleKey: 'leopard-coat-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('street-singles', 'tie-dye', {
    name: 'Tie-Dye Hoe', description: 'A tie-dye jacket in sunset swirls over a white tee. A Hoe outfit only.',
    kind: 'ITEM_COLLECTION', rarity: 'rare', category: 'CREW', priceCrowns: 500, styleKey: 'tie-dye-hoe',
    preview: { type: 'ITEM', items: ['HOE'] }, dresses: 'HOE',
  }),
  item('street-singles', 'barbed-wire', {
    name: 'Barbed Wire Frame', description: 'A ring of barbed wire around your profile and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'rare', category: 'PROFILES', priceCrowns: 400, styleKey: 'barbed-wire-frame',
    preview: { type: 'FRAME' },
  }),
  item('street-singles', 'cuban-link', {
    name: 'Cuban Link Frame', description: 'A heavy Cuban-link chain around your profile and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'cuban-link-frame',
    preview: { type: 'FRAME' },
  }),
  item('street-singles', 'brick-wall', {
    name: 'Brick Wall Frame', description: 'Red brick and mortar around your profile and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 350, styleKey: 'brick-wall-frame',
    preview: { type: 'FRAME' },
  }),
  item('street-singles', 'cash-stack', {
    name: 'Cash Stack Frame', description: 'Banded stacks of cash around your profile and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'epic', category: 'PROFILES', priceCrowns: 450, styleKey: 'cash-stack-frame',
    preview: { type: 'FRAME' },
  }),
  item('street-singles', 'police-tape', {
    name: 'Police Tape Frame', description: 'Do-not-cross tape around your profile and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 350, styleKey: 'police-tape-frame',
    preview: { type: 'FRAME' },
  }),
  item('street-singles', 'bullet-belt', {
    name: 'Bullet Belt Frame', description: 'A bandolier of brass rounds around your profile and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'rare', category: 'PROFILES', priceCrowns: 400, styleKey: 'bullet-belt-frame',
    preview: { type: 'FRAME' },
  }),
  item('street-singles', 'money-green-accent', {
    name: 'Money Green Accent', description: 'A money green profile and banner accent.',
    kind: 'ACCENT', rarity: 'uncommon', category: 'SHELLS', priceCrowns: 250, styleKey: 'money-green',
    preview: { type: 'ACCENT', color: '#4caf50' },
  }),
  item('street-singles', 'blood-orange-accent', {
    name: 'Blood Orange Accent', description: 'A blood orange profile and banner accent.',
    kind: 'ACCENT', rarity: 'uncommon', category: 'SHELLS', priceCrowns: 250, styleKey: 'blood-orange',
    preview: { type: 'ACCENT', color: '#ff5f1f' },
  }),
  item('street-singles', 'steel-silver-accent', {
    name: 'Steel Silver Accent', description: 'A steel silver profile and banner accent.',
    kind: 'ACCENT', rarity: 'uncommon', category: 'SHELLS', priceCrowns: 250, styleKey: 'steel-silver',
    preview: { type: 'ACCENT', color: '#b8c4d0' },
  }),
  item('street-singles', 'cobalt-accent', {
    name: 'Cobalt Accent', description: 'A cobalt profile and banner accent.',
    kind: 'ACCENT', rarity: 'uncommon', category: 'SHELLS', priceCrowns: 250, styleKey: 'cobalt-blue',
    preview: { type: 'ACCENT', color: '#2f6bff' },
  }),
  item('street-singles', 'bubblegum-accent', {
    name: 'Bubblegum Accent', description: 'A bubblegum profile and banner accent.',
    kind: 'ACCENT', rarity: 'uncommon', category: 'SHELLS', priceCrowns: 250, styleKey: 'bubblegum-pink',
    preview: { type: 'ACCENT', color: '#ff7ad9' },
  }),
  item('street-singles', 'mustard-accent', {
    name: 'Mustard Accent', description: 'A mustard profile and banner accent.',
    kind: 'ACCENT', rarity: 'uncommon', category: 'SHELLS', priceCrowns: 250, styleKey: 'mustard-yellow',
    preview: { type: 'ACCENT', color: '#e3b505' },
  }),
  item('street-singles', 'made-it-rain', {
    name: 'Made It Rain', description: 'A Street Singles title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 200,
    preview: { type: 'TITLE', title: 'Made It Rain' },
  }),
  item('street-singles', 'corner-legend', {
    name: 'Corner Legend', description: 'A Street Singles title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'rare', category: 'PROFILES', priceCrowns: 200,
    preview: { type: 'TITLE', title: 'Corner Legend' },
  }),
  item('street-singles', 'night-owl', {
    name: 'Night Owl', description: 'A Street Singles title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 150,
    preview: { type: 'TITLE', title: 'Night Owl' },
  }),
  item('street-singles', 'clean-money', {
    name: 'Clean Money', description: 'A Street Singles title. Wear it as a title or feature it as a badge.',
    kind: 'TITLE_BADGE', rarity: 'uncommon', category: 'PROFILES', priceCrowns: 150,
    preview: { type: 'TITLE', title: 'Clean Money' },
  }),
];

export const DROP_ITEMS: Readonly<Record<string, DropItemDefinition>> = Object.fromEntries(ITEMS.map((entry) => [entry.key, entry]));

function bundleOf(collection: DropCollectionKey, priceCrowns: number, description: string): DropBundleDefinition {
  return {
    key: `${DROP_KEY_PREFIX}${collection}-bundle`,
    name: `${DROP_COLLECTIONS[collection].name} Bundle`,
    description,
    collection,
    itemKeys: ITEMS.filter((entry) => entry.collection === collection).map((entry) => entry.key),
    priceCrowns,
  };
}

export const DROP_BUNDLES: Readonly<Record<string, DropBundleDefinition>> = Object.fromEntries([
  bundleOf('kingpin-luxe', 2800, 'All seven Kingpin Luxe pieces: the Sedan, both crew outfits, the frame, the accent, the shell theme and the Old Money title.'),
  bundleOf('neon-underworld', 2800, 'All eight Neon Underworld pieces: the Low-Rider, both crew outfits, the Tek-9 finish, the frame, the accent, the shell theme and the After Hours title.'),
  bundleOf('winter-heist', 2750, 'All seven Winter Heist pieces: the Van, the crew set, the shotgun finish, the frame, the accent, the shell theme and the Cold Case title.'),
  bundleOf('biscayne-sunset', 2750, 'All eight Biscayne Sunset pieces: the Sedan, both crew outfits, the Pistol finish, the frame, the accent, the shell theme and the Ocean Drive title.'),
  bundleOf('velvet-speakeasy', 2800, 'All eight Velvet Speakeasy pieces: the Sedan, both crew outfits, the AK-47 finish, the frame, the accent, the shell theme and the Bootlegger title.'),
  bundleOf('platinum-funk', 2650, 'All seven Platinum Funk pieces: the Low-Rider, both crew outfits, the frame, the accent, the shell theme and the Funk Royalty title.'),
  bundleOf('redline-syndicate', 2800, 'All eight Redline Syndicate pieces: the Sedan, both crew outfits, the AK-47 finish, the frame, the accent, the shell theme and the Redline title.'),
  bundleOf('wet-paint', 2700, 'All eight Wet Paint pieces: the Low-Rider, both crew outfits, the Pistol finish, the frame, the accent, the shell theme and the All City title.'),
  bundleOf('hazard-cook', 2650, 'All seven Hazard Cook pieces: the Van, the crew set, the Shotgun finish, the frame, the accent, the shell theme and the The Chemist title.'),
  bundleOf('dockside', 2750, 'All eight Dockside pieces: the Van, both crew outfits, the AK-47 finish, the frame, the accent, the shell theme and the Off the Books title.'),
  bundleOf('crown-jewels', 2800, 'All seven Crown Jewels pieces: the Sedan, the crew set, the AK-47 finish, the frame, the accent, the shell theme and the Crowned title.'),
  bundleOf('bayou-smoke', 2750, 'All eight Bayou Smoke pieces: the Van, both crew outfits, the Shotgun finish, the frame, the accent, the shell theme and the Swamp King title.'),
  bundleOf('desert-mirage', 2800, 'All eight Desert Mirage pieces: the Low-Rider, both crew outfits, the Tek-9 finish, the frame, the accent, the shell theme and the Dust Devil title.'),
  bundleOf('rewind', 2750, 'All eight Rewind pieces: the Van, both crew outfits, the Tek-9 finish, the frame, the accent, the shell theme and the Run It Back title.'),
  bundleOf('snake-eyes', 2800, 'All eight Snake Eyes pieces: the Sedan, both crew outfits, the Pistol finish, the frame, the accent, the shell theme and the Loaded Dice title.'),
  bundleOf('graveyard-shift', 2800, 'All eight Graveyard Shift pieces: the Sedan, both crew outfits, the Pistol finish, the frame, the accent, the shell theme and the Night Shift title.'),
  bundleOf('naughty-list', 2650, 'All seven Naughty List pieces: the Van, the crew set, the Tek-9 finish, the frame, the accent, the shell theme and the Coal Collector title.'),
  bundleOf('heartbreaker', 2800, 'All eight Heartbreaker pieces: the Low-Rider, both crew outfits, the Tek-9 finish, the frame, the accent, the shell theme and the Cold Hearted title.'),
  bundleOf('block-party', 2700, 'All eight Block Party pieces: the Van, both crew outfits, the Shotgun finish, the frame, the accent, the shell theme and the Block Captain title.'),
  bundleOf('quarter-mile', 2800, 'All nine Quarter Mile pieces: the Sedan, the Low-Rider, both crew outfits, the Tek-9 finish, the frame, the accent, the shell theme and the Ride or Die title.'),
  bundleOf('88-club', 2750, 'All eight 88 Club pieces: the Van, both crew outfits, the Pistol finish, the frame, the accent, the shell theme and the Ahead of Time title.'),
  bundleOf('swamp-kingdom', 2750, 'All eight Swamp Kingdom pieces: the Van, both crew outfits, the Shotgun finish, the frame, the accent, the shell theme and the Got Layers title.'),
].map((bundle) => [bundle.key, bundle]));

/** Whether a holiday set is inside one of its release windows at `now`. */
export function inReleaseWindow(collection: string, now: Date): boolean {
  const definition = (DROP_COLLECTIONS as Readonly<Record<string, DropCollectionDefinition>>)[collection];
  return Boolean(definition?.windows?.some((window) => now >= new Date(window.from) && now < new Date(window.until)));
}

/**
 * The state a Drop entry has when no admin catalog entry sets one: everything
 * Live, except holiday sets, which are held (Draft) outside their release windows.
 */
export function dropDefaultState(key: string, now: Date = new Date()): 'LIVE' | 'DRAFT' {
  const collection = (DROP_ITEMS[key] ?? DROP_BUNDLES[key])?.collection;
  const definition = collection ? (DROP_COLLECTIONS as Readonly<Record<string, DropCollectionDefinition>>)[collection] : undefined;
  if (!definition?.season) return 'LIVE';
  return inReleaseWindow(definition.key, now) ? 'LIVE' : 'DRAFT';
}

export function dropItem(key: string): DropItemDefinition | null {
  return DROP_ITEMS[key] ?? null;
}

export function dropBundle(key: string): DropBundleDefinition | null {
  return DROP_BUNDLES[key] ?? null;
}

/** Item looks the Drop sells, by style key, with the items each dresses. Feeds COLLECTION_COVERAGE checks. */
export function dropItemStyleKeys(): string[] {
  return ITEMS.filter((entry) => entry.kind === 'ITEM_COLLECTION' && entry.styleKey).map((entry) => entry.styleKey!);
}

/** The sum of the bundle's items at their list prices. */
export function bundleListPrice(bundle: DropBundleDefinition, prices: (key: string) => number = (key) => DROP_ITEMS[key]?.priceCrowns ?? 0): number {
  return bundle.itemKeys.reduce((sum, key) => sum + prices(key), 0);
}

/**
 * The documented partial-ownership rule: a bundle costs its price scaled by the
 * share of its list value the account does not own yet, rounded up to a whole
 * Crown. Owning nothing pays the bundle price; owning everything means it can't
 * be bought. The saving against buying the missing singles is kept in proportion.
 */
export function bundlePriceFor(
  bundlePrice: number,
  listPrices: readonly { key: string; price: number }[],
  owned: ReadonlySet<string>,
): { price: number; missing: string[]; listMissing: number; listTotal: number } {
  const listTotal = listPrices.reduce((sum, entry) => sum + entry.price, 0);
  const missingEntries = listPrices.filter((entry) => !owned.has(entry.key));
  const listMissing = missingEntries.reduce((sum, entry) => sum + entry.price, 0);
  const missing = missingEntries.map((entry) => entry.key);
  if (!missing.length || listTotal <= 0) return { price: 0, missing, listMissing, listTotal };
  if (missing.length === listPrices.length) return { price: bundlePrice, missing, listMissing, listTotal };
  return { price: Math.max(1, Math.ceil((bundlePrice * listMissing) / listTotal)), missing, listMissing, listTotal };
}

/* ---------- Crown packs ---------- */

export interface CrownPackDefinition {
  readonly id: string;
  readonly name: string;
  readonly priceCents: number;
  readonly currency: 'usd';
  readonly crowns: number;
  readonly featured?: boolean;
}

/** Draft pricing from the roadmap. Not live until checkout is switched on. */
export const CROWN_PACKS: readonly CrownPackDefinition[] = [
  { id: 'starter', name: 'Starter', priceCents: 499, currency: 'usd', crowns: 500 },
  { id: 'street', name: 'Street', priceCents: 899, currency: 'usd', crowns: 1_000 },
  { id: 'boss', name: 'Boss', priceCents: 2_299, currency: 'usd', crowns: 2_800, featured: true },
  { id: 'kingpin', name: 'Kingpin', priceCents: 3_699, currency: 'usd', crowns: 5_000 },
  { id: 'empire', name: 'Empire', priceCents: 8_999, currency: 'usd', crowns: 13_500 },
];

export function crownPack(id: string): CrownPackDefinition | null {
  return CROWN_PACKS.find((pack) => pack.id === id) ?? null;
}

/* ---------- Earning ---------- */

/** Earnable Crowns per standard 28-day round, tuned to about 500. */
export const CROWN_EARN_RULES = {
  /** Most Crowns one account can earn from play in one round. */
  roundCap: 500,
  /** First daily contract each UTC day. */
  dailyContract: 5,
  /** First weekly contract each ISO week. */
  weeklyContract: 40,
  /** Distinct login check-in days in a round that pay a milestone. */
  checkInMilestones: [5, 12, 20] as readonly number[],
  milestone: 50,
  /** Per finished event contract, up to eventCap a round. */
  eventContract: 25,
  eventCap: 50,
} as const;

/* ---------- Discounts ---------- */

/**
 * Active, paid supporters (not free trials) pay this much less for Drop items,
 * bundles and Street Pass skips. A birthday week gives BIRTHDAY_DISCOUNT_PERCENT
 * (birthday.ts) instead; an account gets the larger of the two, never both.
 * Applied last, after any bundle adjustment. Crown packs are never discounted.
 */
export const SUPPORTER_DROP_DISCOUNT_PERCENT = 10;

/** A discounted Drop price: rounded in the player's favour, never below 1 Crown. */
export function discountedDropPrice(price: number, percent: number): number {
  if (!Number.isSafeInteger(price) || price <= 0 || percent <= 0) return price;
  return Math.max(1, Math.floor((price * (100 - percent)) / 100));
}

/* ---------- Street Pass level skips ---------- */

/** Crown price of Street Pass level skips. Any tier can be skipped. */
export const STREET_PASS_SKIP_PRICES = {
  single: 150,
  /** Ten skips bought together. */
  tenPack: 1_200,
  /** Most tiers one purchase can skip. */
  maxPerPurchase: 30,
} as const;

/** Tens at the pack price, the rest at the single price. */
export function streetPassSkipPrice(count: number, prices: { single: number; tenPack: number } = STREET_PASS_SKIP_PRICES): number {
  if (!Number.isSafeInteger(count) || count <= 0) return 0;
  return Math.floor(count / 10) * prices.tenPack + (count % 10) * prices.single;
}

/* ---------- Rotation ---------- */

const DAY_MS = 86_400_000;

/** The UTC day window the daily shop is on, with the reset at `resetHourUtc`. */
export function dropDailyWindow(now: Date, resetHourUtc = 0): { key: string; startsAt: Date; endsAt: Date } {
  const shifted = now.getTime() - resetHourUtc * 3_600_000;
  const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  const startsAt = new Date(dayStart + resetHourUtc * 3_600_000);
  return { key: new Date(dayStart).toISOString().slice(0, 10), startsAt, endsAt: new Date(startsAt.getTime() + DAY_MS) };
}

/** The featured week: Monday 00:00 UTC (plus the reset hour) to the next Monday. */
export function dropWeeklyWindow(now: Date, resetHourUtc = 0): { key: string; index: number; startsAt: Date; endsAt: Date } {
  const shifted = now.getTime() - resetHourUtc * 3_600_000;
  // 1970-01-05 was a Monday.
  const MONDAY = 4 * DAY_MS;
  const index = Math.floor((shifted - MONDAY) / (7 * DAY_MS));
  const startsAt = new Date(MONDAY + index * 7 * DAY_MS + resetHourUtc * 3_600_000);
  return { key: `W${index}`, index, startsAt, endsAt: new Date(startsAt.getTime() + 7 * DAY_MS) };
}

/** A small deterministic hash so every server picks the same daily items. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** `count` keys from the pool for this day, the same on every server. */
export function pickDaily(pool: readonly string[], dayKey: string, count: number): string[] {
  return [...pool]
    .sort()
    .map((key) => ({ key, rank: hash(`${dayKey}:${key}`) }))
    .sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key))
    .slice(0, Math.max(0, count))
    .map((entry) => entry.key);
}

/** The collection featured this week, in a fixed cycle. */
/** Collections in the cycle by default: every one except the held holiday sets. */
export function evergreenDropCollections(): string[] {
  return Object.values(DROP_COLLECTIONS as Readonly<Record<string, DropCollectionDefinition>>)
    .filter((collection) => !collection.season && !collection.singles)
    .map((collection) => collection.key);
}

/** How many collections the shop features at once, each shown as its bundle and the pieces in it. */
export const DROP_FEATURED_SETS = 2;

/** This week's featured collections: consecutive pairs from the cycle, so every set gets its turn. */
export function featuredCollectionsFor(weekIndex: number, collections: readonly string[] = evergreenDropCollections(), count = DROP_FEATURED_SETS): string[] {
  if (!collections.length || count <= 0) return [];
  const take = Math.min(count, collections.length);
  return Array.from({ length: take }, (_, offset) => {
    const index = weekIndex * take + offset;
    return collections[((index % collections.length) + collections.length) % collections.length]!;
  });
}

export function featuredCollectionFor(weekIndex: number, collections: readonly string[] = evergreenDropCollections()): string | null {
  if (!collections.length) return null;
  return collections[((weekIndex % collections.length) + collections.length) % collections.length]!;
}
