import type { DropCatalogEntry, PrismaClient } from '@prisma/client';
import {
  DROP_BUNDLES,
  DROP_COLLECTIONS,
  DROP_ITEMS,
  DROP_KEY_PREFIX,
  bundleListPrice,
  bundlePriceFor,
  SUPPORTER_DROP_DISCOUNT_PERCENT,
  discountedDropPrice,
  dropDefaultState,
  dropDailyWindow,
  dropWeeklyWindow,
  featuredCollectionsFor,
  DROP_FEATURED_SETS,
  pickDaily,
  type DropBundleDefinition,
  type DropItemDefinition,
} from '@streets/rulesets';
import type {
  DropBundleDto,
  DropCollectionDto,
  DropDiscountDto,
  DropEntryStateDto,
  DropItemDetailDto,
  DropItemDto,
  DropOfferBadgeDto,
  DropOfferDto,
  DropOfferSlotDto,
  DropOfferStateDto,
  DropPreviewDto,
  DropReturnPolicyDto,
  DropStorefrontDto,
} from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActiveSupporterService } from './active-supporter.service.js';
import { birthdayDiscount } from './birthday.service.js';
import { CrownWalletService } from './crown-wallet.service.js';
import { DropSettingsService, switchesFor, type DropSettingsValues } from './drop-settings.service.js';
import { RoundService } from './round.service.js';

/**
 * The Drop, Slices A, B and E: the catalog, the rotation and what one account
 * sees. Item art, names and kinds live in code; the database only overrides
 * state, price, return policy and placement. Every offer window is computed on
 * the server clock, so a price or offer can never come from the client.
 */

const ENTRY_STATES: readonly DropEntryStateDto[] = ['DRAFT', 'QA', 'SCHEDULED', 'LIVE', 'VAULTED', 'ARCHIVED'];
const RETURN_POLICIES: readonly DropReturnPolicyDto[] = ['MAY_RETURN', 'PERMANENT', 'NEVER_RETURNING'];
/** How far ahead an admin offer shows as Coming soon. */
const UPCOMING_MS = 7 * 86_400_000;

export interface CatalogEntry {
  key: string;
  kind: 'ITEM' | 'BUNDLE';
  state: DropEntryStateDto;
  priceCrowns: number;
  defaultPriceCrowns: number;
  returnPolicy: DropReturnPolicyDto;
  inDailyPool: boolean;
  homepageSlot: number | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

export type Catalog = Map<string, CatalogEntry>;

export interface ResolvedOffer {
  id: string;
  kind: 'ITEM' | 'BUNDLE';
  refKey: string;
  slot: DropOfferSlotDto;
  badge: DropOfferBadgeDto;
  /** The offer price before any bundle partial-ownership adjustment. */
  priceCrowns: number;
  startsAt: Date;
  endsAt: Date | null;
}

export function isEntryState(value: string): value is DropEntryStateDto {
  return (ENTRY_STATES as readonly string[]).includes(value);
}

export function isReturnPolicy(value: string): value is DropReturnPolicyDto {
  return (RETURN_POLICIES as readonly string[]).includes(value);
}

function resolveEntry(key: string, kind: 'ITEM' | 'BUNDLE', defaultPrice: number, row: DropCatalogEntry | undefined, now: Date): CatalogEntry {
  return {
    key,
    kind,
    // Holiday sets start held (Draft) until an admin entry releases them.
    state: row && isEntryState(row.state) ? row.state : dropDefaultState(key, now),
    priceCrowns: row?.priceCrowns ?? defaultPrice,
    defaultPriceCrowns: defaultPrice,
    returnPolicy: row && isReturnPolicy(row.returnPolicy) ? row.returnPolicy : 'MAY_RETURN',
    inDailyPool: row?.inDailyPool ?? true,
    homepageSlot: row?.homepageSlot ?? null,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedByUsername ?? null,
  };
}

export async function loadCatalog(db: Db | PrismaClient, now: Date = new Date()): Promise<Catalog> {
  const rows = new Map((await db.dropCatalogEntry.findMany()).map((row) => [row.key, row]));
  const catalog: Catalog = new Map();
  for (const item of Object.values(DROP_ITEMS)) catalog.set(item.key, resolveEntry(item.key, 'ITEM', item.priceCrowns, rows.get(item.key), now));
  for (const bundle of Object.values(DROP_BUNDLES)) catalog.set(bundle.key, resolveEntry(bundle.key, 'BUNDLE', bundle.priceCrowns, rows.get(bundle.key), now));
  return catalog;
}

function isLive(catalog: Catalog, key: string): boolean {
  return catalog.get(key)?.state === 'LIVE';
}

/** The keys an offer would grant. */
export function offerKeys(kind: 'ITEM' | 'BUNDLE', refKey: string): string[] {
  if (kind === 'ITEM') return DROP_ITEMS[refKey] ? [refKey] : [];
  return [...(DROP_BUNDLES[refKey]?.itemKeys ?? [])];
}

export interface RotationView {
  offers: ResolvedOffer[];
  upcoming: ResolvedOffer[];
  /** The featured collections, in display order (up to DROP_FEATURED_SETS). */
  featuredCollections: string[];
  featuredEndsAt: Date;
  dailyResetsAt: Date;
}

/** Keep curated homepage placements first, with unplaced entries after them. */
function homepageOrder(offer: ResolvedOffer, catalog: Catalog): number {
  return catalog.get(offer.refKey)?.homepageSlot ?? Number.MAX_SAFE_INTEGER;
}

export function sortHomepageOffers(offers: readonly ResolvedOffer[], catalog: Catalog): ResolvedOffer[] {
  return [...offers].sort((a, b) => {
    const aHomepage = a.slot === 'FEATURED' || a.slot === 'CATALOG';
    const bHomepage = b.slot === 'FEATURED' || b.slot === 'CATALOG';
    if (aHomepage !== bHomepage) return aHomepage ? -1 : 1;
    if (!aHomepage) return 0;
    return homepageOrder(a, catalog) - homepageOrder(b, catalog) || a.refKey.localeCompare(b.refKey);
  });
}

/**
 * Everything on sale at `now`: admin-scheduled offers, the weekly featured
 * collections (two, each with its bundle and pieces; a live holiday set takes
 * a slot first), the daily picks and the permanent catalog. Recomputed for every
 * request and every purchase, so a window boundary switches offers exactly
 * once and an expired offer can never be bought.
 */
export async function rotationAt(db: Db | PrismaClient, settings: DropSettingsValues, catalog: Catalog, now: Date): Promise<RotationView> {
  const week = dropWeeklyWindow(now, settings.dailyResetHourUtc);
  const day = dropDailyWindow(now, settings.dailyResetHourUtc);
  const scheduled = await db.dropOffer.findMany({
    where: {
      cancelledAt: null,
      startsAt: { lte: new Date(now.getTime() + UPCOMING_MS) },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  });

  const offers: ResolvedOffer[] = [];
  const upcoming: ResolvedOffer[] = [];
  const onSale = new Set<string>();
  for (const row of scheduled) {
    const kind = row.kind === 'BUNDLE' ? 'BUNDLE' : 'ITEM';
    const entry = catalog.get(row.refKey);
    if (!entry || entry.kind !== kind) continue;
    const offer: ResolvedOffer = {
      id: `adm:${row.id}`,
      kind,
      refKey: row.refKey,
      slot: (['FEATURED', 'DAILY', 'CATALOG'].includes(row.slot) ? row.slot : 'CATALOG') as DropOfferSlotDto,
      badge: (['DROP_EXCLUSIVE', 'DAILY', 'FEATURED', 'RETURNING', 'PERMANENT'].includes(row.badge) ? row.badge : 'DROP_EXCLUSIVE') as DropOfferBadgeDto,
      priceCrowns: row.priceCrowns ?? entry.priceCrowns,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
    };
    if (row.startsAt.getTime() > now.getTime()) {
      if (entry.state === 'LIVE' || entry.state === 'SCHEDULED') upcoming.push(offer);
    } else if (entry.state === 'LIVE') {
      offers.push(offer);
      onSale.add(row.refKey);
    }
  }

  // An admin featured campaign replaces the automatic weekly feature.
  const adminFeatured = offers.some((offer) => offer.slot === 'FEATURED');
  const liveCollections = Object.keys(DROP_COLLECTIONS).filter((collection) =>
    Object.values(DROP_ITEMS).some((item) => item.collection === collection && isLive(catalog, item.key)));
  const definitionOf = (collection: string) => (DROP_COLLECTIONS as Readonly<Record<string, { season?: string; singles?: boolean }>>)[collection];
  const seasonal = (collection: string) => Boolean(definitionOf(collection)?.season);
  // Street Singles have no set to show off, so they never take a featured slot.
  const featurable = liveCollections.filter((collection) => !definitionOf(collection)?.singles);
  const featuredCollections = adminFeatured
    ? [...new Set(offers.filter((offer) => offer.slot === 'FEATURED')
      .map((offer) => DROP_ITEMS[offer.refKey]?.collection ?? DROP_BUNDLES[offer.refKey]?.collection)
      .filter((collection): collection is string => Boolean(collection)))]
    : settings.autoFeatured
      ? [
        // A live holiday set always takes a featured slot; the rest cycle week by week.
        ...featurable.filter(seasonal),
        ...featuredCollectionsFor(week.index, featurable.filter((collection) => !seasonal(collection))),
      ].slice(0, DROP_FEATURED_SETS)
      : [];

  for (const featuredCollection of adminFeatured ? [] : featuredCollections) {
    const keys = [
      ...Object.values(DROP_BUNDLES).filter((bundle) => bundle.collection === featuredCollection).map((bundle) => bundle.key),
      ...Object.values(DROP_ITEMS).filter((item) => item.collection === featuredCollection).map((item) => item.key),
    ];
    for (const key of keys) {
      const entry = catalog.get(key);
      if (!entry || entry.state !== 'LIVE' || onSale.has(key)) continue;
      offers.push({ id: `rot:F:${week.key}:${key}`, kind: entry.kind, refKey: key, slot: 'FEATURED', badge: 'FEATURED', priceCrowns: entry.priceCrowns, startsAt: week.startsAt, endsAt: week.endsAt });
      onSale.add(key);
    }
  }

  for (const entry of catalog.values()) {
    if (entry.state !== 'LIVE' || entry.returnPolicy !== 'PERMANENT' || onSale.has(entry.key)) continue;
    offers.push({ id: `cat:${entry.key}`, kind: entry.kind, refKey: entry.key, slot: 'CATALOG', badge: 'PERMANENT', priceCrowns: entry.priceCrowns, startsAt: new Date(0), endsAt: null });
    onSale.add(entry.key);
  }

  const pool = [...catalog.values()]
    .filter((entry) => entry.kind === 'ITEM' && entry.state === 'LIVE' && entry.inDailyPool && !onSale.has(entry.key))
    .map((entry) => entry.key);
  for (const key of pickDaily(pool, day.key, settings.dailyOfferCount)) {
    const entry = catalog.get(key)!;
    offers.push({ id: `rot:D:${day.key}:${key}`, kind: 'ITEM', refKey: key, slot: 'DAILY', badge: 'DAILY', priceCrowns: entry.priceCrowns, startsAt: day.startsAt, endsAt: day.endsAt });
  }

  return { offers: sortHomepageOffers(offers, catalog), upcoming: sortHomepageOffers(upcoming, catalog), featuredCollections, featuredEndsAt: week.endsAt, dailyResetsAt: day.endsAt };
}

/** The offer by id if it is on sale at `now`; otherwise a clear refusal. */
export async function resolveOffer(db: Db | PrismaClient, offerId: string, now: Date): Promise<{ offer: ResolvedOffer; catalog: Catalog }> {
  const [settings, catalog] = await Promise.all([DropSettingsService.get(db), loadCatalog(db, now)]);
  const rotation = await rotationAt(db, settings, catalog, now);
  const offer = rotation.offers.find((candidate) => candidate.id === offerId);
  if (!offer) {
    if (rotation.upcoming.some((candidate) => candidate.id === offerId)) {
      throw AppError.conflict('DROP_OFFER_NOT_STARTED', 'That offer has not started yet.');
    }
    throw AppError.conflict('DROP_OFFER_EXPIRED', 'That offer has ended or is not in the shop right now. Refresh The Drop for today’s offers.');
  }
  return { offer, catalog };
}

/* ---------- DTOs ---------- */

export function collectionDto(key: string): DropCollectionDto | null {
  const collection = (DROP_COLLECTIONS as Record<string, (typeof DROP_COLLECTIONS)[keyof typeof DROP_COLLECTIONS]>)[key];
  return collection ? { ...collection } : null;
}

export function slugFor(key: string): string {
  return key.startsWith(DROP_KEY_PREFIX) ? key.slice(DROP_KEY_PREFIX.length) : key;
}

function equipHint(item: DropItemDefinition): string {
  switch (item.kind) {
    case 'ITEM_COLLECTION':
      return item.dresses === 'THUG' || item.dresses === 'HOE'
        ? 'Equip it in Collection → Looks under Crew outfits.'
        : 'Equip it in Collection → Looks. It shows on items you already have in a round.';
    case 'PROFILE_FRAME':
      return 'Equip it in Account → Profile as your profile or avatar frame.';
    case 'ACCENT':
      return 'Pick it in Account → Profile as your accent.';
    case 'SITE_THEME':
      return 'Equip it in Account → Profile as your site theme. It reskins the whole game for you.';
    case 'AVATAR_PART':
      return 'Wear it in Account → Profile → Build one. It shows on your built avatar.';
    case 'STREET_SIGN_BACKDROP':
      return 'Pick it in Account → Profile → Your street sign as the sign backdrop.';
    default:
      return 'Wear it as your title, or feature it as a badge, in Account → Profile.';
  }
}

function previewDto(item: DropItemDefinition): DropPreviewDto {
  switch (item.preview.type) {
    case 'ITEM':
      return { type: 'ITEM', items: [...item.preview.items], styleKey: item.styleKey ?? '' };
    case 'FRAME':
      return { type: 'FRAME', styleKey: item.styleKey ?? '' };
    case 'ACCENT':
      return { type: 'ACCENT', styleKey: item.styleKey ?? '', color: item.preview.color };
    case 'THEME':
      return { type: 'THEME', styleKey: item.styleKey ?? '' };
    case 'AVATAR':
      return { type: 'AVATAR', part: item.preview.part, option: item.preview.option };
    case 'SIGN':
      return { type: 'SIGN', styleKey: item.styleKey ?? '' };
    default:
      return { type: 'TITLE', title: item.preview.title };
  }
}

export function itemDto(item: DropItemDefinition, entry: CatalogEntry, owned: ReadonlySet<string>): DropItemDto {
  return {
    key: item.key,
    slug: slugFor(item.key),
    name: item.name,
    description: item.description,
    collection: item.collection,
    category: item.category,
    rarity: item.rarity,
    kind: item.kind,
    priceCrowns: entry.priceCrowns,
    returnPolicy: entry.returnPolicy,
    preview: previewDto(item),
    dresses: item.dresses ?? null,
    equipHint: equipHint(item),
    owned: owned.has(item.key),
    vaulted: entry.state === 'VAULTED',
  };
}

export function bundleDto(bundle: DropBundleDefinition, entry: CatalogEntry, catalog: Catalog, owned: ReadonlySet<string>, price = entry.priceCrowns): DropBundleDto {
  const prices = bundle.itemKeys.map((key) => ({ key, price: catalog.get(key)?.priceCrowns ?? DROP_ITEMS[key]?.priceCrowns ?? 0 }));
  const adjusted = bundlePriceFor(price, prices, owned);
  return {
    key: bundle.key,
    slug: slugFor(bundle.key),
    name: bundle.name,
    description: bundle.description,
    collection: bundle.collection,
    itemKeys: [...bundle.itemKeys],
    priceCrowns: price,
    listPriceCrowns: bundleListPrice(bundle, (key) => catalog.get(key)?.priceCrowns ?? 0),
    yourPriceCrowns: adjusted.price,
    ownedCount: bundle.itemKeys.length - adjusted.missing.length,
    returnPolicy: entry.returnPolicy,
    vaulted: entry.state === 'VAULTED',
  };
}

/**
 * What the account would pay for this offer now: the bundle adjustment first,
 * then any discount. `basePrice` is the price before the discount.
 */
export function priceForAccount(
  offer: ResolvedOffer,
  catalog: Catalog,
  owned: ReadonlySet<string>,
  discountPercent = 0,
): { price: number; basePrice: number; grants: string[] } {
  const discounted = (basePrice: number, grants: string[]) => ({ price: discountedDropPrice(basePrice, discountPercent), basePrice, grants });
  if (offer.kind === 'ITEM') return discounted(offer.priceCrowns, owned.has(offer.refKey) ? [] : [offer.refKey]);
  const bundle = DROP_BUNDLES[offer.refKey];
  if (!bundle) return { price: 0, basePrice: 0, grants: [] };
  const prices = bundle.itemKeys.map((key) => ({ key, price: catalog.get(key)?.priceCrowns ?? 0 }));
  const adjusted = bundlePriceFor(offer.priceCrowns, prices, owned);
  return discounted(adjusted.price, adjusted.missing);
}

/**
 * The discount this account gets in The Drop right now: a birthday week's or
 * an active paid supporter's, whichever is larger. They never stack.
 */
export async function dropDiscountFor(db: Db | PrismaClient, accountId: string | null, now: Date): Promise<DropDiscountDto | null> {
  if (!accountId) return null;
  const [birthday, supporter] = await Promise.all([
    birthdayDiscount(db, accountId, now),
    ActiveSupporterService.paid(db, accountId, now),
  ]);
  const supporterPercent = supporter ? SUPPORTER_DROP_DISCOUNT_PERCENT : 0;
  if (birthday && birthday.percent >= supporterPercent) {
    return { percent: birthday.percent, reason: 'BIRTHDAY', endsAt: birthday.endsAt.toISOString() };
  }
  return supporter ? { percent: supporterPercent, reason: 'SUPPORTER', endsAt: null } : null;
}

function offerDto(offer: ResolvedOffer, catalog: Catalog, owned: ReadonlySet<string>, now: Date, discountPercent: number): DropOfferDto {
  const { price, basePrice, grants } = priceForAccount(offer, catalog, owned, discountPercent);
  const keys = offerKeys(offer.kind, offer.refKey);
  let state: DropOfferStateDto = 'AVAILABLE';
  if (offer.startsAt.getTime() > now.getTime()) state = 'COMING_SOON';
  else if (offer.endsAt && offer.endsAt.getTime() <= now.getTime()) state = 'EXPIRED';
  else if (!grants.length) state = 'OWNED';
  else if (grants.length < keys.length) state = 'PARTIALLY_OWNED';
  return {
    id: offer.id,
    kind: offer.kind,
    refKey: offer.refKey,
    slot: offer.slot,
    badge: offer.badge,
    priceCrowns: price || discountedDropPrice(offer.priceCrowns, discountPercent),
    basePriceCrowns: basePrice || offer.priceCrowns,
    startsAt: offer.startsAt.toISOString(),
    endsAt: offer.endsAt?.toISOString() ?? null,
    state,
  };
}

async function ownedDropKeys(db: Db | PrismaClient, accountId: string | null): Promise<Set<string>> {
  if (!accountId) return new Set();
  const rows = await db.accountCosmeticUnlock.findMany({
    where: { accountId, key: { startsWith: DROP_KEY_PREFIX } },
    select: { key: true },
  });
  return new Set(rows.map((row) => row.key));
}

/** A player sees LIVE and VAULTED entries, owned ones whatever their state, and anything coming soon. */
function visible(entry: CatalogEntry | undefined, owned: boolean, upcoming: boolean): boolean {
  if (!entry) return false;
  return owned || upcoming || entry.state === 'LIVE' || entry.state === 'VAULTED';
}

export const DropCatalogService = {
  async storefront(prisma: PrismaClient, accountId: string | null, now = new Date()): Promise<DropStorefrontDto> {
    const [settings, catalog, owned, round, discount] = await Promise.all([
      DropSettingsService.get(prisma),
      loadCatalog(prisma, now),
      ownedDropKeys(prisma, accountId),
      RoundService.getCurrent(prisma),
      dropDiscountFor(prisma, accountId, now),
    ]);
    const switches = switchesFor(settings);
    const rotation = await rotationAt(prisma, settings, catalog, now);
    const upcomingKeys = new Set(rotation.upcoming.map((offer) => offer.refKey));
    const wallet = accountId ? await CrownWalletService.view(prisma, accountId, round?.id ?? null, settings.roundEarnCap) : null;
    const items = Object.values(DROP_ITEMS)
      .filter((item) => visible(catalog.get(item.key), owned.has(item.key), upcomingKeys.has(item.key)))
      .map((item) => itemDto(item, catalog.get(item.key)!, owned));
    const bundles = Object.values(DROP_BUNDLES)
      .filter((bundle) => visible(catalog.get(bundle.key), bundle.itemKeys.every((key) => owned.has(key)), upcomingKeys.has(bundle.key)))
      .map((bundle) => bundleDto(bundle, catalog.get(bundle.key)!, catalog, owned));
    return {
      enabled: switches.storefront,
      serverTime: now.toISOString(),
      switches,
      wallet,
      discount,
      featured: {
        collection: rotation.featuredCollections[0] ? collectionDto(rotation.featuredCollections[0]) : null,
        collections: rotation.featuredCollections.map((key) => collectionDto(key)!),
        endsAt: rotation.featuredEndsAt.toISOString(),
      },
      daily: { resetsAt: rotation.dailyResetsAt.toISOString() },
      // Only collections with something to show, so a held holiday set stays a surprise.
      collections: Object.keys(DROP_COLLECTIONS)
        .filter((key) => items.some((item) => item.collection === key))
        .map((key) => collectionDto(key)!),
      items,
      bundles,
      offers: switches.storefront
        ? [...rotation.offers, ...rotation.upcoming].map((offer) => offerDto(offer, catalog, owned, now, discount?.percent ?? 0))
        : [],
    };
  },

  async detail(prisma: PrismaClient, accountId: string | null, slug: string, now = new Date()): Promise<DropItemDetailDto> {
    const key = `${DROP_KEY_PREFIX}${slug}`;
    const [settings, catalog, owned, discount] = await Promise.all([
      DropSettingsService.get(prisma),
      loadCatalog(prisma, now),
      ownedDropKeys(prisma, accountId),
      dropDiscountFor(prisma, accountId, now),
    ]);
    const rotation = await rotationAt(prisma, settings, catalog, now);
    const offers = [...rotation.offers, ...rotation.upcoming].filter((offer) => offer.refKey === key);
    const item = DROP_ITEMS[key];
    const bundle = DROP_BUNDLES[key];
    const entry = catalog.get(key);
    const ownsAll = item ? owned.has(key) : Boolean(bundle?.itemKeys.every((itemKey) => owned.has(itemKey)));
    if ((!item && !bundle) || !visible(entry, ownsAll, offers.length > 0)) {
      throw AppError.notFound('DROP_ITEM_NOT_FOUND', 'That item is not in The Drop.');
    }
    const switches = switchesFor(settings);
    return {
      serverTime: now.toISOString(),
      item: item ? itemDto(item, entry!, owned) : null,
      bundle: bundle
        ? { ...bundleDto(bundle, entry!, catalog, owned), items: bundle.itemKeys.map((itemKey) => itemDto(DROP_ITEMS[itemKey]!, catalog.get(itemKey)!, owned)) }
        : null,
      collection: collectionDto((item ?? bundle)!.collection),
      discount,
      offers: switches.storefront ? offers.map((offer) => offerDto(offer, catalog, owned, now, discount?.percent ?? 0)) : [],
    };
  },

  /** Admin-only content preview; this never participates in rotation or purchase resolution. */
  async preview(prisma: PrismaClient, key: string): Promise<DropItemDetailDto> {
    const [catalog, owned] = await Promise.all([loadCatalog(prisma), Promise.resolve(new Set<string>())]);
    const item = DROP_ITEMS[key];
    const bundle = DROP_BUNDLES[key];
    const entry = catalog.get(key);
    if ((!item && !bundle) || !entry) throw AppError.notFound('DROP_ITEM_NOT_FOUND', 'That item is not in The Drop catalog.');
    return {
      serverTime: new Date().toISOString(),
      item: item ? itemDto(item, entry, owned) : null,
      bundle: bundle ? { ...bundleDto(bundle, entry, catalog, owned), items: bundle.itemKeys.map((itemKey) => itemDto(DROP_ITEMS[itemKey]!, catalog.get(itemKey)!, owned)) } : null,
      collection: collectionDto((item ?? bundle)!.collection),
      discount: null,
      offers: [],
    };
  },
};
