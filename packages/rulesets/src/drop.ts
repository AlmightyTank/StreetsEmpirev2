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
 * The launch catalogue: three collections, seven or eight SKUs each. Item looks are
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
].map((bundle) => [bundle.key, bundle]));

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
export function featuredCollectionFor(weekIndex: number, collections: readonly string[] = Object.keys(DROP_COLLECTIONS)): string | null {
  if (!collections.length) return null;
  return collections[((weekIndex % collections.length) + collections.length) % collections.length]!;
}
