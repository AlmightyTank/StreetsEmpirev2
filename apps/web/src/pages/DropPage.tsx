import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useParams, useSearchParams } from 'react-router-dom';
import type {
  CrownPacksDto,
  DropBundleDto,
  DropCategoryDto,
  DropCollectionDto,
  DropItemDetailDto,
  DropItemDto,
  DropOfferDto,
  DropStorefrontDto,
  DropWalletDetailDto,
  DropWalletDto,
  ItemCosmeticStyleKey,
  StreetPassSkipQuoteDto,
} from '@streets/shared';
import { discountedDropPrice } from '@streets/rulesets';
import { formatNumber } from '@streets/shared';
import { dropApi } from '../api/drop.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { ItemTile } from '../components/ItemTile.js';
import { Panel, Stat } from '../components/Panel.js';
import { hasItemArt } from '../items/itemArt.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { confirmAction } from '../stores/confirm.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import { isAndroidNativeApp } from '../utils/install.js';
import { supporterApi } from '../api/supporter.js';
import { formatWhen, serverClockOffsetMs } from '../utils/time.js';

export type DropView = 'shop' | 'item' | 'wallet' | 'crowns' | 'pass';

/* ---------- Small pieces ---------- */

function CrownIcon() {
  return (
    <svg className="se-crown-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" fill="currentColor" />
      <path d="M5 19h14" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function Crowns({ value, strike = false }: { value: number; strike?: boolean }) {
  return (
    <span className={`se-crowns${strike ? ' se-crowns--strike' : ''}`}>
      <CrownIcon />
      <span>{formatNumber(value)}</span>
      <span className="se-sr"> Crowns</span>
    </span>
  );
}

const CATEGORY_CHIPS = [
  { id: 'featured', label: 'Featured' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'crew', label: 'Crew & Gear' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'shells', label: 'Shells & Hideouts' },
  { id: 'bundles', label: 'Bundles' },
] as const;
type ChipId = (typeof CATEGORY_CHIPS)[number]['id'];

const CATEGORY_OF: Record<DropCategoryDto, ChipId> = {
  VEHICLES: 'vehicles',
  CREW: 'crew',
  WEAPONS: 'crew',
  PROFILES: 'profiles',
  SHELLS: 'shells',
};

const BADGE_LABEL: Record<DropOfferDto['badge'], string> = {
  DROP_EXCLUSIVE: 'Drop Exclusive',
  DAILY: 'Daily',
  FEATURED: 'Featured',
  RETURNING: 'Returning',
  PERMANENT: 'Permanent Catalog',
};

const RETURN_LABEL: Record<DropItemDto['returnPolicy'], string> = {
  MAY_RETURN: 'May return in a later rotation.',
  PERMANENT: 'Always in the permanent catalog.',
  NEVER_RETURNING: 'Never returning once it leaves the shop.',
};

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Try again.';
}

/** Server time, adjusted for the request round trip, so countdowns never trust the device clock. */
function useServerNow(serverTime: string | null, startedAt: number, receivedAt: number): number {
  const offset = useMemo(() => (serverTime ? serverClockOffsetMs(serverTime, startedAt, receivedAt) : 0), [serverTime, startedAt, receivedAt]);
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    setNow(Date.now() + offset);
    const id = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(id);
  }, [offset]);
  return now;
}

/** Shop-style countdown: "2D 04H" while days remain, then a ticking "03:12:09". */
export function countdown(endsAt: string | null, now: number): string {
  if (!endsAt) return '';
  const total = Math.max(0, Math.floor((Date.parse(endsAt) - now) / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  if (days > 0) return `${days}D ${String(hours).padStart(2, '0')}H`;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** A rotating offer with under a day left, as the shop's "Leaving soon" tag. Daily picks always leave within a day, so they never get it. */
function leavingSoon(offer: DropOfferDto | undefined, now: number): boolean {
  if (!offer?.endsAt || offer.slot === 'DAILY' || offer.state === 'COMING_SOON') return false;
  const ms = Date.parse(offer.endsAt) - now;
  return ms > 0 && ms < 86_400_000;
}

/** The art for an item: its look on the items it dresses, a frame ring, an accent swatch or a title plate. */
export function DropArt({ item, size = 'md' }: { item: DropItemDto; size?: 'sm' | 'md' | 'lg' }) {
  const preview = item.preview;
  if (preview.type === 'ITEM') {
    const items = preview.items.filter(hasItemArt);
    return (
      <div className={`se-drop-art se-drop-art--item se-drop-art--${size}`}>
        {items.map((key) => (
          <ItemTile key={key} item={key} size={size === 'sm' ? 'md' : 'lg'} label={false} cosmeticStyle={preview.styleKey as ItemCosmeticStyleKey} title={item.name} />
        ))}
      </div>
    );
  }
  if (preview.type === 'FRAME') {
    return (
      <div className={`se-drop-art se-drop-art--frame se-drop-art--${size}`}>
        <span className={`se-drop-frame se-drop-frame--${preview.styleKey}`} role="img" aria-label={`${item.name} preview`}>
          <span className="se-drop-frame__face" aria-hidden="true">SE</span>
        </span>
      </div>
    );
  }
  if (preview.type === 'ACCENT') {
    return (
      <div className={`se-drop-art se-drop-art--accent se-drop-art--${size}`} style={{ ['--se-drop-accent' as string]: preview.color }}>
        <span className="se-drop-accent__banner" role="img" aria-label={`${item.name} colour preview`} />
        <span className="se-drop-accent__swatch" aria-hidden="true" />
      </div>
    );
  }
  if (preview.type === 'THEME') {
    return (
      <div className={`se-drop-art se-drop-art--theme se-drop-art--${size}`}>
        <div className={`se-drop-shell se-site-theme--${preview.styleKey}`} role="img" aria-label={`${item.name} preview`}>
          <span className="se-drop-shell__top" />
          <span className="se-drop-shell__side"><i /><i /><i /><i /></span>
          <span className="se-drop-shell__main">
            <span className="se-drop-shell__panel"><b /><i /><i /><span className="se-drop-shell__btn" /></span>
            <span className="se-drop-shell__panel"><i /><i /><i /></span>
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className={`se-drop-art se-drop-art--title se-drop-art--${size}`}>
      <span className="se-drop-title-plate">{preview.title}</span>
    </div>
  );
}

function BundleArt({ bundle, items }: { bundle: DropBundleDto; items: DropItemDto[] }) {
  const pieces = bundle.itemKeys.map((key) => items.find((item) => item.key === key)).filter((item): item is DropItemDto => Boolean(item));
  return (
    <div className="se-drop-art se-drop-art--bundle">
      {pieces.slice(0, 4).map((item) => <DropArt key={item.key} item={item} size="sm" />)}
    </div>
  );
}

type TileSize = 'normal' | 'wide' | 'large';

function DropCard({ item, bundle, offer, items, collection, now, size = 'normal' }: {
  item?: DropItemDto;
  bundle?: DropBundleDto;
  offer?: DropOfferDto;
  items: DropItemDto[];
  collection: DropCollectionDto | undefined;
  now: number;
  size?: TileSize;
}) {
  const name = item?.name ?? bundle?.name ?? '';
  const slug = item?.slug ?? bundle?.slug ?? '';
  const owned = item ? item.owned : Boolean(bundle && bundle.yourPriceCrowns === 0);
  const rarity = item?.rarity ?? 'legendary';
  const price = offer?.priceCrowns ?? item?.priceCrowns ?? bundle?.yourPriceCrowns ?? 0;
  const soon = offer?.state === 'COMING_SOON';
  const leaving = leavingSoon(offer, now);
  const flag = soon ? 'Coming soon' : leaving ? 'Leaving soon' : offer?.state === 'PARTIALLY_OWNED' ? 'Some owned' : offer?.badge === 'RETURNING' ? 'Back again' : null;
  return (
    <Link
      className={`se-drop-card se-drop-card--${rarity} se-drop-card--${size}${bundle ? ' se-drop-card--bundle' : ''}${owned ? ' is-owned' : ''}`}
      to={`/game/drop/item/${slug}`}
      style={collection ? { ['--se-drop-collection' as string]: collection.accent } : undefined}
      aria-label={`${name}, ${owned ? 'owned' : `${formatNumber(price)} Crowns`}${offer ? `, ${BADGE_LABEL[offer.badge]}` : ''}${flag ? `, ${flag}` : ''}`}
    >
      <div className="se-drop-card__art">
        {item ? <DropArt item={item} size={size === 'large' ? 'lg' : 'md'} /> : bundle ? <BundleArt bundle={bundle} items={items} /> : null}
      </div>
      {flag ? <span className={`se-drop-card__flag${leaving ? ' is-leaving' : ''}`}>{flag}</span> : null}
      {owned ? <span className="se-drop-card__owned" aria-hidden="true">✓</span> : null}
      <div className="se-drop-card__meta">
        <strong className="se-drop-card__name">{name}</strong>
        <span className="se-drop-card__collection">{bundle ? `Bundle · ${bundle.itemKeys.length} items` : `${rarity} · ${collection?.name ?? ''}`}</span>
        <div className="se-drop-card__foot">
          {owned ? <span className="se-drop-card__owned-label">Owned</span> : (
            <span className="se-drop-card__price">
              <Crowns value={price} />
              {offer && offer.basePriceCrowns > offer.priceCrowns ? <Crowns value={offer.basePriceCrowns} strike />
                : bundle && bundle.yourPriceCrowns < bundle.listPriceCrowns ? <Crowns value={bundle.listPriceCrowns} strike /> : null}
            </span>
          )}
          {soon ? <small className="se-drop-card__time">{formatWhen(offer!.startsAt)}</small> : null}
        </div>
      </div>
    </Link>
  );
}

function WalletChip({ wallet }: { wallet: DropWalletDto | null }) {
  const signedIn = useSession((s) => Boolean(s.account));
  if (!signedIn) return <Link className="se-drop-wallet-chip se-drop-wallet-chip--signin" to="/login">Sign in to collect</Link>;
  return (
    <Link className="se-drop-wallet-chip" to="/game/drop/crowns" aria-label={`Your Crown balance: ${formatNumber(wallet?.balance ?? 0)}. Get Crowns`}>
      <Crowns value={wallet?.balance ?? 0} />
      <span className="se-drop-wallet-chip__plus" aria-hidden="true">+</span>
    </Link>
  );
}

function DropSubNav() {
  const links = [
    { to: '/game/drop', label: 'Shop', end: true },
    { to: '/game/drop/wallet', label: 'Wallet' },
    { to: '/game/drop/crowns', label: 'Get Crowns' },
    { to: '/game/drop/pass', label: 'Street Pass skips' },
  ];
  return (
    <nav className="se-drop-subnav" aria-label="The Drop">
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `se-drop-subnav__link${isActive ? ' is-active' : ''}`}>
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

function DropFrame({ wallet, timer, children }: { wallet: DropWalletDto | null; timer?: ReactNode; children: ReactNode }) {
  return (
    <GameLayout>
      <div className="se-drop">
        <header className="se-drop-top">
          <div className="se-drop-top__title">
            <h1>The Drop</h1>
            {timer ? <span className="se-drop-top__timer">{timer}</span> : null}
          </div>
          <WalletChip wallet={wallet} />
          <p className="se-drop-top__note">Cosmetic only. Nothing here changes stats, odds, cash, turns or ranking.</p>
        </header>
        <DropSubNav />
        {children}
      </div>
    </GameLayout>
  );
}

/* ---------- Shop ---------- */

function useStorefront() {
  const [data, setData] = useState<DropStorefrontDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timing, setTiming] = useState({ startedAt: 0, receivedAt: 0 });
  const load = useCallback(async () => {
    const startedAt = Date.now();
    try {
      const next = await dropApi.storefront();
      setTiming({ startedAt, receivedAt: Date.now() });
      setData(next);
      setError(null);
    } catch (caught) {
      setError(errorText(caught));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { data, error, load, timing };
}

function ShopView() {
  const { data, error, load, timing } = useStorefront();
  const [params, setParams] = useSearchParams();
  const chip = (params.get('c') ?? 'featured') as ChipId;
  const ownership = params.get('own') ?? 'all';
  const now = useServerNow(data?.serverTime ?? null, timing.startedAt, timing.receivedAt);
  const reloaded = useRef<string | null>(null);

  // Refetch once when a rotation window passes, so offers switch on the server's clock.
  useEffect(() => {
    if (!data) return;
    const boundary = Math.min(Date.parse(data.daily.resetsAt), Date.parse(data.featured.endsAt));
    const key = `${data.daily.resetsAt}|${data.featured.endsAt}`;
    if (now >= boundary && reloaded.current !== key) {
      reloaded.current = key;
      void load();
    }
  }, [data, now, load]);

  const setFilter = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key); else next.set(key, value);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  if (error && !data) return <DropFrame wallet={null}><Alert>{error}</Alert></DropFrame>;
  if (!data) return <DropFrame wallet={null}><Panel title="The Drop" loading>{null}</Panel></DropFrame>;
  if (!data.enabled) {
    return (
      <DropFrame wallet={data.wallet}>
        <Alert tone="info" title="The Drop is closed for now">The shop is paused. Your Crowns and every item you own are safe.</Alert>
      </DropFrame>
    );
  }

  const collections = new Map(data.collections.map((collection) => [collection.key, collection]));
  const itemByKey = new Map(data.items.map((item) => [item.key, item]));
  const bundleByKey = new Map(data.bundles.map((bundle) => [bundle.key, bundle]));
  const ownedFilter = (owned: boolean) => ownership === 'all' || (ownership === 'owned' ? owned : !owned);
  const offerOwned = (offer: DropOfferDto) => offer.state === 'OWNED';
  const inChip = (offer: DropOfferDto) => {
    if (chip === 'featured') return true;
    if (chip === 'bundles') return offer.kind === 'BUNDLE';
    const item = itemByKey.get(offer.refKey);
    return Boolean(item && CATEGORY_OF[item.category] === chip);
  };
  const visibleOffers = data.offers.filter((offer) => inChip(offer) && ownedFilter(offerOwned(offer)));
  const section = (slot: DropOfferDto['slot'], soon = false) =>
    visibleOffers.filter((offer) => offer.slot === slot && (offer.state === 'COMING_SOON') === soon);
  const onSale = new Set(data.offers.filter((offer) => offer.state !== 'COMING_SOON').map((offer) => offer.refKey));
  const resting = data.items.filter((item) => !onSale.has(item.key)
    && (chip === 'featured' || CATEGORY_OF[item.category] === chip) && ownedFilter(item.owned));
  const collectionOf = (offer: DropOfferDto) => itemByKey.get(offer.refKey)?.collection ?? bundleByKey.get(offer.refKey)?.collection ?? '';
  const card = (offer: DropOfferDto, size: TileSize = 'normal') => (
    <DropCard
      key={offer.id}
      offer={offer}
      item={itemByKey.get(offer.refKey)}
      bundle={bundleByKey.get(offer.refKey)}
      items={data.items}
      collection={collections.get(collectionOf(offer))}
      now={now}
      size={size}
    />
  );
  // Like a set in an item shop: the dearest look headlines big, bundles run wide, the rest follow by price.
  const tiles = (offers: DropOfferDto[], headline: boolean) => {
    const sorted = [...offers].sort((a, b) => Number(b.kind === 'BUNDLE') - Number(a.kind === 'BUNDLE') || b.priceCrowns - a.priceCrowns);
    const lead = headline ? sorted.find((offer) => offer.kind === 'ITEM' && offer.state !== 'OWNED') : undefined;
    const ordered = lead ? [lead, ...sorted.filter((offer) => offer !== lead)] : sorted;
    return ordered.map((offer) => card(offer, offer === lead ? 'large' : offer.kind === 'BUNDLE' ? 'wide' : 'normal'));
  };
  const featured = data.featured.collection;
  const featuredItems = featured ? data.items.filter((item) => item.collection === featured.key && item.preview.type === 'ITEM').slice(0, 3) : [];
  const featuredOffers = section('FEATURED');
  const featuredGroups = [...new Set(featuredOffers.map(collectionOf))].map((key) => ({
    key,
    collection: collections.get(key),
    offers: featuredOffers.filter((offer) => collectionOf(offer) === key),
  }));
  const soonOffers = [...section('FEATURED', true), ...section('DAILY', true), ...section('CATALOG', true)];

  return (
    <DropFrame wallet={data.wallet} timer={<>Shop resets in <b>{countdown(data.daily.resetsAt, now)}</b></>}>
      {featured ? (
        <section className="se-drop-hero" style={{ ['--se-drop-collection' as string]: featured.accent }} aria-labelledby="drop-featured-title">
          <div className="se-drop-hero__copy">
            <span className="se-drop-hero__kicker">Featured set</span>
            <h2 id="drop-featured-title">{featured.name}</h2>
            <p className="se-drop-hero__tagline">{featured.tagline}</p>
            <p className="se-drop-hero__desc">{featured.description}</p>
            <div className="se-drop-hero__actions">
              <span className="se-drop-timer">Ends in <b>{countdown(data.featured.endsAt, now)}</b></span>
              {featuredGroups.some((group) => group.key === featured.key) ? (
                <button type="button" className="se-drop-cta" onClick={() => document.getElementById(`drop-set-${featured.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  Shop the set
                </button>
              ) : null}
            </div>
          </div>
          <div className="se-drop-hero__art" aria-hidden="true">
            {featuredItems.map((item) => <DropArt key={item.key} item={item} size="md" />)}
          </div>
        </section>
      ) : null}

      <div className="se-drop-filters">
        <div className="se-drop-chips" role="group" aria-label="Categories">
          {CATEGORY_CHIPS.map((entry) => (
            <button key={entry.id} type="button" className={`se-drop-chip${chip === entry.id ? ' is-active' : ''}`} aria-pressed={chip === entry.id} onClick={() => setFilter('c', entry.id, 'featured')}>
              {entry.label}
            </button>
          ))}
        </div>
        <label className="se-drop-own">
          <span className="se-sr">Show</span>
          <select value={ownership} onChange={(event) => setFilter('own', event.target.value, 'all')}>
            <option value="all">All items</option>
            <option value="unowned">Not owned</option>
            <option value="owned">Owned</option>
          </select>
        </label>
      </div>

      {data.wallet?.held ? <Alert tone="warning" title="Wallet on hold">{data.wallet.holdReason ?? 'Support is reviewing a payment.'} Spending is paused; your items are safe.</Alert> : null}
      {data.discount?.reason === 'BIRTHDAY' ? (
        <Alert tone="success" title="Happy birthday!">Everything in The Drop and every Street Pass skip is {data.discount.percent}% off until {formatWhen(data.discount.endsAt!)}. Crown packs aren't included.</Alert>
      ) : data.discount ? (
        <Alert tone="success" title="Supporter pricing">Thanks for supporting: every item, bundle and Street Pass skip is {data.discount.percent}% off while your membership is active.</Alert>
      ) : null}

      {featuredGroups.map((group) => (
        <OfferSection
          key={group.key || 'featured'}
          id={`drop-set-${group.key || 'featured'}`}
          title={group.collection?.name ?? 'Featured'}
          subtitle={group.collection?.tagline}
          accent={group.collection?.accent}
          timer={countdown(data.featured.endsAt, now)}
        >
          {tiles(group.offers, true)}
        </OfferSection>
      ))}
      <OfferSection id="drop-daily" title="Daily" subtitle={`New picks at ${formatWhen(data.daily.resetsAt)}.`} timer={countdown(data.daily.resetsAt, now)}>
        {tiles(section('DAILY'), false)}
      </OfferSection>
      <OfferSection id="drop-catalog" title="Always in stock" subtitle="The permanent catalog. These never rotate out.">
        {tiles(section('CATALOG'), false)}
      </OfferSection>
      <OfferSection id="drop-soon" title="Coming soon" subtitle="On the way. You can look, but not buy yet.">
        {soonOffers.map((offer) => card(offer))}
      </OfferSection>
      <OfferSection id="drop-resting" title="In the vault" subtitle="Vaulted or between rotations. Items you own stay yours.">
        {resting.map((item) => (
          <DropCard key={item.key} item={item} items={data.items} collection={collections.get(item.collection)} now={now} />
        ))}
      </OfferSection>
      {!visibleOffers.length && !resting.length ? <p className="se-hint">Nothing matches those filters.</p> : null}
      <p className="se-hint se-drop-fineprint">Every item is original to The Drop. Nothing is random: you always see exactly what you get and what it costs before you buy.</p>
    </DropFrame>
  );
}

function OfferSection({ id, title, subtitle, timer, accent, children }: {
  id: string;
  title: string;
  subtitle?: string;
  timer?: string;
  accent?: string;
  children: ReactNode[];
}) {
  if (!children.length) return null;
  return (
    <section id={id} className="se-drop-section" aria-labelledby={`${id}-title`} style={accent ? { ['--se-drop-collection' as string]: accent } : undefined}>
      <header className="se-drop-section__head">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {timer ? <span className="se-drop-timer">Ends in <b>{timer}</b></span> : null}
      </header>
      <div className="se-drop-grid">{children}</div>
    </section>
  );
}

/* ---------- Item detail ---------- */

function ItemView() {
  const { slug = '' } = useParams();
  const [detail, setDetail] = useState<DropItemDetailDto | null>(null);
  const [wallet, setWallet] = useState<DropWalletDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [timing, setTiming] = useState({ startedAt: 0, receivedAt: 0 });
  const attempt = useRef<Record<string, string>>({});
  const signedIn = useSession((s) => Boolean(s.account));
  const now = useServerNow(detail?.serverTime ?? null, timing.startedAt, timing.receivedAt);

  const load = useCallback(async () => {
    const startedAt = Date.now();
    try {
      const [next, store] = await Promise.all([dropApi.item(slug), signedIn ? dropApi.storefront() : Promise.resolve(null)]);
      setTiming({ startedAt, receivedAt: Date.now() });
      setDetail(next);
      setWallet(store?.wallet ?? null);
      setError(null);
    } catch (caught) {
      setError(errorText(caught));
    }
  }, [slug, signedIn]);
  useEffect(() => { void load(); }, [load]);

  async function buy(offer: DropOfferDto, label: string) {
    const balance = wallet?.balance ?? 0;
    const ok = await confirmAction({
      title: `Buy ${label}?`,
      body: `${formatNumber(offer.priceCrowns)} Crowns. You have ${formatNumber(balance)}; you'll have ${formatNumber(Math.max(0, balance - offer.priceCrowns))} after. It's yours for good, on every round.`,
      confirmLabel: `Buy for ${formatNumber(offer.priceCrowns)} Crowns`,
    });
    if (!ok) return;
    // One id per purchase attempt: a retry or double tap replays it instead of charging twice.
    const actionId = attempt.current[offer.id] ?? (attempt.current[offer.id] = newActionId());
    setBusy(offer.id);
    try {
      const result = await dropApi.purchase(offer.id, actionId);
      delete attempt.current[offer.id];
      setWallet(result.wallet);
      setNotice(result.replayed ? 'That purchase had already gone through. Nothing was charged twice.' : `${result.order.label} is yours. ${detail?.item?.equipHint ?? 'Equip it from Collection or your Profile.'}`);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status < 500) delete attempt.current[offer.id];
      setError(errorText(caught));
    } finally {
      setBusy(null);
    }
  }

  if (error && !detail) return <DropFrame wallet={wallet}><Alert>{error}</Alert><Link to="/game/drop">Back to The Drop</Link></DropFrame>;
  if (!detail) return <DropFrame wallet={wallet}><Panel title="Loading" loading>{null}</Panel></DropFrame>;

  const item = detail.item;
  const bundle = detail.bundle;
  const name = item?.name ?? bundle?.name ?? '';
  const owned = item ? item.owned : Boolean(bundle && bundle.yourPriceCrowns === 0);
  const policy = item?.returnPolicy ?? bundle?.returnPolicy ?? 'MAY_RETURN';
  const vaulted = item?.vaulted ?? bundle?.vaulted ?? false;
  const liveOffers = detail.offers.filter((offer) => offer.state !== 'COMING_SOON');
  const soonOffers = detail.offers.filter((offer) => offer.state === 'COMING_SOON');
  const balance = wallet?.balance ?? 0;

  return (
    <DropFrame wallet={wallet}>
      <p className="se-drop-back"><Link to="/game/drop">← Back to the shop</Link></p>
      {notice ? <Alert tone="success" title="Purchase complete">{notice}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <article className={`se-drop-detail se-drop-detail--${item?.rarity ?? 'legendary'}`} style={detail.collection ? { ['--se-drop-collection' as string]: detail.collection.accent } : undefined}>
        <div className="se-drop-detail__stage">
          {item ? <DropArt item={item} size="lg" /> : null}
          {bundle ? (
            <div className="se-drop-detail__bundle">
              {bundle.items.map((piece) => (
                <Link key={piece.key} to={`/game/drop/item/${piece.slug}`} className={`se-drop-detail__piece se-drop-card--${piece.rarity}${piece.owned ? ' is-owned' : ''}`}>
                  <DropArt item={piece} size="sm" />
                  <span>{piece.name}</span>
                  {piece.owned ? <span className="se-drop-card__owned-label">Owned</span> : <Crowns value={piece.priceCrowns} />}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="se-drop-detail__info">
          <p className="se-drop-detail__kicker">
            <span className={`se-drop-rarity se-drop-rarity--${item?.rarity ?? 'legendary'}`}>{item ? item.rarity : 'Bundle'}</span>
            {detail.collection ? <span>{detail.collection.name} set</span> : null}
          </p>
          <h2>{name}</h2>
          {detail.collection?.tagline ? <p className="se-drop-detail__collection">{detail.collection.tagline}</p> : null}
          <p className="se-drop-detail__desc">{item?.description ?? bundle?.description}</p>
          <div className="se-drop-card__tags">
            <span className="se-drop-badge se-drop-badge--drop_exclusive">Drop Exclusive</span>
            {vaulted ? <span className="se-tag">Vaulted</span> : null}
          </div>

          <div className="se-drop-buy">
            {owned ? <div className="se-drop-buy__owned">✓ Owned{item ? ` · ${item.equipHint}` : ''}</div> : null}
            {liveOffers.filter((offer) => !owned || offer.state !== 'OWNED').map((offer) => (
              <div key={offer.id} className="se-drop-buy__offer">
                <div className="se-drop-buy__price">
                  <Crowns value={offer.priceCrowns} />
                  {offer.basePriceCrowns > offer.priceCrowns ? <Crowns value={offer.basePriceCrowns} strike />
                    : bundle && offer.priceCrowns < bundle.listPriceCrowns ? <Crowns value={bundle.listPriceCrowns} strike /> : null}
                  <small>{BADGE_LABEL[offer.badge]} · {offer.endsAt ? <>Leaves the shop in <b>{countdown(offer.endsAt, now)}</b></> : 'No end date'}</small>
                </div>
                {!signedIn ? <Link className="se-drop-purchase" to="/login">Sign in to buy</Link> : (
                  <Button
                    variant="primary"
                    className="se-drop-purchase"
                    loading={busy === offer.id}
                    disabledReason={offer.state === 'OWNED' ? 'You own this.'
                      : wallet?.held ? 'Your wallet is on hold.'
                        : balance < offer.priceCrowns ? `You need ${formatNumber(offer.priceCrowns - balance)} more Crowns.` : null}
                    onClick={() => void buy(offer, name)}
                  >
                    Purchase
                  </Button>
                )}
              </div>
            ))}
            {!liveOffers.length && !owned ? (
              <p className="se-hint">{soonOffers.length ? `In the shop from ${formatWhen(soonOffers[0]!.startsAt)}.` : vaulted ? 'Vaulted: not for sale right now.' : 'Not in the shop right now. Check the daily and featured rotations.'}</p>
            ) : null}
            {signedIn && liveOffers.some((offer) => offer.state !== 'OWNED') && balance < Math.min(...liveOffers.map((offer) => offer.priceCrowns))
              ? <p className="se-hint">Earn Crowns from daily and weekly contracts, or <Link to="/game/drop/crowns">get a Crown pack</Link>.</p>
              : null}
          </div>

          <dl className="se-drop-facts">
            <div><dt>Origin</dt><dd>Original to The Drop. Never sold as a Street Pass, supporter, login or event reward.</dd></div>
            <div><dt>Returns</dt><dd>{RETURN_LABEL[policy]}</dd></div>
            {item?.dresses ? (
              <div><dt>Shows on</dt><dd>Items you already have in a round. Buying the look never gives you the item itself or the right to buy it.</dd></div>
            ) : null}
            {item ? <div><dt>Equip</dt><dd>{item.equipHint}</dd></div> : null}
            {bundle ? (
              <div><dt>Price</dt><dd>
                {bundle.ownedCount > 0 && bundle.yourPriceCrowns > 0
                  ? `You own ${bundle.ownedCount} of ${bundle.itemKeys.length}, so the bundle price is cut in proportion to what you're missing: ${formatNumber(bundle.yourPriceCrowns)} instead of ${formatNumber(bundle.priceCrowns)}.`
                  : `${formatNumber(bundle.priceCrowns)} for everything, against ${formatNumber(bundle.listPriceCrowns)} bought one by one.`}
              </dd></div>
            ) : null}
            <div><dt>Fair play</dt><dd>Cosmetic only. No stats, cash, turns, odds or ranking.</dd></div>
          </dl>
        </div>
      </article>
    </DropFrame>
  );
}

/* ---------- Wallet ---------- */

function WalletView() {
  const [data, setData] = useState<DropWalletDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  useEffect(() => {
    dropApi.wallet().then(setData).catch((caught) => setError(errorText(caught)));
  }, []);
  const thanks = params.get('crowns') === 'thanks';
  if (error) return <DropFrame wallet={null}><Alert>{error}</Alert></DropFrame>;
  if (!data) return <DropFrame wallet={null}><Panel title="Wallet" loading>{null}</Panel></DropFrame>;
  const { wallet } = data;
  return (
    <DropFrame wallet={wallet}>
      {thanks ? (
        <Alert tone="success" title="Thanks for your purchase">
          Your Crowns land as soon as the payment is confirmed, usually within a minute. They show in the history below.
        </Alert>
      ) : null}
      {wallet.held ? <Alert tone="warning" title="Wallet on hold">{wallet.holdReason} Spending is paused until support resolves it. Your items are safe.</Alert> : null}
      <div className="se-drop-stats">
        <Stat label="Balance" value={<Crowns value={wallet.balance} />} sub="Kept across rounds" />
        <Stat label="Earned this round" value={formatNumber(wallet.earnedThisRound)} sub={`of ${formatNumber(wallet.roundCap)} a round`} meter={{ value: wallet.earnedThisRound, max: wallet.roundCap }} />
        <Stat label="Still earnable" value={formatNumber(wallet.remainingEarnable)} sub="Resets with the next round" />
      </div>
      <div className="se-drop-columns">
        <Panel title="Earn Crowns" subtitle="Bounded and free. You never need to buy anything to earn them.">
          {data.opportunities.length ? (
            <ul className="se-drop-earn">
              {data.opportunities.map((entry) => (
                <li key={entry.key} className={entry.done ? 'is-done' : ''}>
                  <span className="se-drop-earn__crowns"><Crowns value={entry.crowns} /></span>
                  <span><strong>{entry.label}</strong><small>{entry.detail}</small></span>
                  <span className={`se-tag${entry.done ? ' se-tag--good' : ''}`}>{entry.done ? 'Done' : 'Open'}</span>
                </li>
              ))}
            </ul>
          ) : <p className="se-hint">Join the current round to earn Crowns from contracts and check-ins.</p>}
        </Panel>
        <Panel title="History" flush>
          {data.history.length ? (
            <table className="se-table se-drop-history">
              <thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col">Crowns</th><th scope="col">Balance</th></tr></thead>
              <tbody>
                {data.history.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatWhen(entry.createdAt)}</td>
                    <td>{entry.label}</td>
                    <td className={entry.delta > 0 ? 'is-credit' : 'is-debit'}>{entry.delta > 0 ? '+' : ''}{formatNumber(entry.delta)}</td>
                    <td>{formatNumber(entry.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="se-hint se-drop-pad">No Crowns have moved yet.</p>}
        </Panel>
      </div>
      <div className="se-drop-columns">
        <Panel title="Purchases" subtitle="Receipts for everything bought with Crowns.">
          {data.orders.length ? (
            <ul className="se-drop-receipts">
              {data.orders.map((order) => <li key={order.id}><span>{order.label}</span><Crowns value={order.priceCrowns} /><small>{formatWhen(order.createdAt)} · #{order.id.slice(-8)}</small></li>)}
            </ul>
          ) : <p className="se-hint">Nothing bought yet.</p>}
        </Panel>
        <Panel title="Crown packs" subtitle="Real-money orders and their status.">
          {data.packOrders.length ? (
            <ul className="se-drop-receipts">
              {data.packOrders.map((order) => (
                <li key={order.id}>
                  <span>{formatNumber(order.crowns)} Crowns · {(order.amountCents / 100).toLocaleString(undefined, { style: 'currency', currency: order.currency.toUpperCase() })}</span>
                  <span className={`se-tag${order.status === 'credited' ? ' se-tag--good' : order.status === 'pending' ? '' : ' se-tag--warn'}`}>{order.status.replace('_', ' ')}</span>
                  <small>{formatWhen(order.createdAt)} · #{order.id.slice(-8)}</small>
                </li>
              ))}
            </ul>
          ) : <p className="se-hint">No Crown pack orders.</p>}
          <p className="se-hint">Payment questions? Open a ticket from <Link to="/game/status">Status & Support</Link> with the order number.</p>
        </Panel>
      </div>
    </DropFrame>
  );
}

/* ---------- Crown packs ---------- */

function CrownsView() {
  const [packs, setPacks] = useState<CrownPacksDto | null>(null);
  const [wallet, setWallet] = useState<DropWalletDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [params] = useSearchParams();
  const signedIn = useSession((s) => Boolean(s.account));
  const android = isAndroidNativeApp();
  const [playAccount, setPlayAccount] = useState<string | null>(null);
  useEffect(() => {
    dropApi.packs(android ? 'android' : undefined).then(setPacks).catch((caught) => setError(errorText(caught)));
    if (signedIn) dropApi.storefront().then((store) => setWallet(store.wallet)).catch(() => undefined);
    if (android && signedIn) supporterApi.status().then((status) => setPlayAccount(status.playBilling.obfuscatedAccountId)).catch(() => setPlayAccount(null));
  }, [android, signedIn]);

  useEffect(() => {
    if (!android) return;
    const purchased = (event: Event) => {
      const [productId, purchaseToken] = String((event as CustomEvent<string>).detail || '').split('|');
      if (!productId || !purchaseToken) return;
      setBusy(productId);
      void dropApi.verifyGooglePlayPack(productId, purchaseToken).then(() => dropApi.storefront().then((store) => setWallet(store.wallet))).catch((caught) => setError(errorText(caught))).finally(() => setBusy(null));
    };
    window.addEventListener('streets:play-crown-purchase', purchased);
    return () => window.removeEventListener('streets:play-crown-purchase', purchased);
  }, [android]);

  // Once per visit, ask the app for packs that were paid but never finished
  // (the app closed before the server credited them), so they land and get consumed.
  const crownRestoreRequested = useRef(false);
  useEffect(() => {
    if (!android || !signedIn || crownRestoreRequested.current) return;
    crownRestoreRequested.current = true;
    window.location.assign('streetsempire://billing/restore-crowns');
  }, [android, signedIn]);

  async function checkout(packId: string, label: string) {
    const ok = await confirmAction({
      title: `Buy the ${label} pack?`,
      body: 'You will finish payment on Stripe. Crowns are added once the payment is confirmed. Crowns only buy cosmetics in The Drop and Street Pass level skips.',
      confirmLabel: 'Continue to payment',
    });
    if (!ok) return;
    setBusy(packId);
    try {
       const pack = packs?.packs.find((entry) => entry.id === packId);
       if (android) {
         if (!pack?.platformProductId || !playAccount) throw new Error('Google Play Crown packs are not available for this account yet.');
         window.location.assign(`streetsempire://billing/crown-pack?product=${encodeURIComponent(pack.platformProductId)}&account=${encodeURIComponent(playAccount)}`);
       } else {
         const { url } = await dropApi.checkout(packId);
         window.location.assign(url);
       }
    } catch (caught) {
      setError(errorText(caught));
      setBusy(null);
    }
  }

  const money = (cents: number, currency: string) => (cents / 100).toLocaleString(undefined, { style: 'currency', currency: currency.toUpperCase() });

  return (
    <DropFrame wallet={wallet}>
      {params.get('crowns') === 'cancelled' ? <Alert tone="info">Checkout cancelled. You were not charged.</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      {!packs ? <Panel title="Crown packs" loading>{null}</Panel> : (
        <>
          {!packs.available ? <Alert tone="info" title="Not on sale right now">{packs.unavailableReason}</Alert> : null}
          <div className="se-drop-packs">
            {packs.packs.map((pack) => (
              <article key={pack.id} className={`se-drop-pack${pack.featured ? ' is-featured' : ''}`}>
                {pack.featured ? <span className="se-drop-badge se-drop-badge--featured">Featured pack</span> : null}
                <h3>{pack.name}</h3>
                <div className="se-drop-pack__crowns"><Crowns value={pack.crowns} /></div>
                <div className="se-drop-pack__price">{money(pack.priceCents, pack.currency)}</div>
                <small>{(pack.crowns / (pack.priceCents / 100)).toFixed(0)} Crowns per dollar</small>
                {signedIn ? (
                  <Button
                    variant={pack.featured ? 'primary' : 'default'}
                    block
                    loading={busy === pack.id}
                     disabledReason={packs.available ? null : 'Crown packs are not on sale right now.'}
                    onClick={() => void checkout(pack.id, pack.name)}
                  >
                     {android ? 'Buy in Google Play' : `Buy for ${money(pack.priceCents, pack.currency)}`}
                  </Button>
                ) : <Link className="se-btn se-btn--block" to="/login">Sign in to buy</Link>}
              </article>
            ))}
          </div>
          <Panel title="Before you buy">
            <ul className="se-drop-disclosure">
              <li>You pay the price shown, in US dollars; your bank may add currency or card fees. Taxes are shown at checkout where they apply.</li>
              <li>Crowns are credited once Stripe confirms the payment. Nothing is credited from a cancelled or failed checkout.</li>
              <li>Crowns can't be turned back into money, cash, casino chips or anything with a gameplay edge, and can't be traded.</li>
              <li>If a payment is refunded, unspent Crowns from it are taken back. If they were already spent, support will review the account rather than remove unrelated items.</li>
              <li>You can always earn Crowns for free by playing. Buying is optional and gives no competitive advantage.</li>
            </ul>
          </Panel>
        </>
      )}
    </DropFrame>
  );
}

/* ---------- Street Pass level skips ---------- */

export function skipPrice(count: number, single: number, tenPack: number): number {
  if (!Number.isSafeInteger(count) || count <= 0) return 0;
  return Math.floor(count / 10) * tenPack + (count % 10) * single;
}

function PassView() {
  const [quote, setQuote] = useState<StreetPassSkipQuoteDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tiers, setTiers] = useState(1);
  const [busy, setBusy] = useState(false);
  const attempt = useRef<string | null>(null);
  const load = useCallback(() => {
    dropApi.skipQuote().then((next) => { setQuote(next); setError(null); }).catch((caught) => setError(errorText(caught)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const count = quote ? Math.max(1, Math.min(tiers, quote.remaining || 1)) : 1;
  const basePrice = quote ? skipPrice(count, quote.single, quote.tenPack) : 0;
  const price = discountedDropPrice(basePrice, quote?.discount?.percent ?? 0);

  async function skip() {
    if (!quote) return;
    const ok = await confirmAction({
      title: `Skip ${count} Street Pass tier${count === 1 ? '' : 's'}?`,
      body: `${formatNumber(price)} Crowns${price < basePrice ? ` (${quote.discount?.reason === 'BIRTHDAY' ? 'birthday' : 'supporter'} price, was ${formatNumber(basePrice)})` : ''}. You go from tier ${quote.tier} to tier ${quote.tier + count}, then claim each tier's rewards on the Street Pass as usual.`,
      confirmLabel: `Skip for ${formatNumber(price)} Crowns`,
    });
    if (!ok) return;
    attempt.current ??= newActionId();
    setBusy(true);
    try {
      const result = await dropApi.skip(count, attempt.current);
      attempt.current = null;
      setNotice(`You're on tier ${result.result.toTier}. Claim your new tiers on the Street Pass.`);
      setTiers(1);
      load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status < 500) attempt.current = null;
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropFrame wallet={quote ? { balance: quote.balance ?? 0, earnedThisRound: 0, remainingEarnable: 0, roundCap: 0, held: false, holdReason: null } : null}>
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success" title="Tiers skipped">{notice} <Link to="/game/street-pass">Open the Street Pass</Link></Alert> : null}
      {!quote ? (error ? null : <Panel title="Street Pass skips" loading>{null}</Panel>) : (
        <Panel title="Skip Street Pass tiers" subtitle={`${formatNumber(quote.single)} Crowns a tier, or ${formatNumber(quote.tenPack)} for ten.${quote.discount ? ` ${quote.discount.reason === 'BIRTHDAY' ? 'Birthday' : 'Supporter'} price: ${quote.discount.percent}% off.` : ''}`}>
          {!quote.enabled ? <Alert tone="info">Street Pass skips are not available right now.</Alert> : quote.remaining === 0 ? (
            <p>You've reached the last tier. Nothing left to skip.</p>
          ) : (
            <div className="se-drop-skip">
              <div className="se-drop-skip__track" aria-label={`Tier ${quote.tier} of ${quote.tierCount}`}>
                <span style={{ width: `${(quote.tier / quote.tierCount) * 100}%` }} className="se-drop-skip__now" />
                <span style={{ width: `${(count / quote.tierCount) * 100}%` }} className="se-drop-skip__add" />
              </div>
              <p>Tier <strong>{quote.tier}</strong> → <strong>{quote.tier + count}</strong> of {quote.tierCount}</p>
              <div className="se-drop-skip__picker" role="group" aria-label="Tiers to skip">
                {[1, 5, 10].filter((value) => value <= quote.remaining).map((value) => (
                  <button key={value} type="button" className={`se-drop-chip${count === value ? ' is-active' : ''}`} aria-pressed={count === value} onClick={() => setTiers(value)}>
                    {value} tier{value === 1 ? '' : 's'}
                  </button>
                ))}
                <label className="se-drop-skip__custom">
                  <span>Tiers</span>
                  <input type="number" min={1} max={quote.remaining} value={count} onChange={(event) => setTiers(Math.max(1, Math.min(quote.remaining, Number(event.target.value) || 1)))} />
                </label>
              </div>
              <div className="se-drop-buy__offer">
                <div>{price < basePrice ? <Crowns value={basePrice} strike /> : null}<Crowns value={price} /><small>{count >= 10 ? 'Ten-pack price applied.' : `${10 - (count % 10)} more for the ten-pack price.`}</small></div>
                <Button variant="primary" loading={busy} disabledReason={(quote.balance ?? 0) < price ? `You need ${formatNumber(price - (quote.balance ?? 0))} more Crowns.` : null} onClick={() => void skip()}>
                  Skip for {formatNumber(price)}
                </Button>
              </div>
              <p className="se-hint">A skip moves you up the current round's Street Pass. Rewards still have to be claimed there, and skips never pay Crowns.</p>
            </div>
          )}
        </Panel>
      )}
    </DropFrame>
  );
}

/** The Drop: /game/drop and its sub-pages. */
export function DropPage({ view }: { view: DropView }) {
  switch (view) {
    case 'item':
      return <ItemView />;
    case 'wallet':
      return <WalletView />;
    case 'crowns':
      return <CrownsView />;
    case 'pass':
      return <PassView />;
    default:
      return <ShopView />;
  }
}
