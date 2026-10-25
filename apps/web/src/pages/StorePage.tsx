import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { rememberedKey, useRememberedState } from '../utils/remembered.js';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { formatCents, formatNumber, type ProductsDto, type StoreCheckoutLineInput, type StoreCheckoutResult, type StoreItemDto, type StoreMarketContextDto, type StoreRestockDto, type StoresDto, type StoreSpecialOrderResult, type StoreTradeInput, type StoreTradeResult } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { onQuestsChanged } from '../quests/questSignals.js';
import { storesApi } from '../api/stores.js';
import { ActionDock, resultChips } from '../components/ActionDock.js';
import { ActionResult, type ResultLine } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Portrait } from '../components/Portrait.js';
import { StoreTabs } from '../components/StoreTabs.js';
import { PlayerBoard } from '../components/PlayerBoard.js';
import { contactRoomHref, storeHasContactRoom } from '../utils/contactRoom.js';
import { Button } from '../components/Button.js';
import { EconomyBatchAction, EconomyPendingNotice, EconomyQuote } from '../components/EconomyExperience.js';
import { Panel } from '../components/Panel.js';
import { ProductCounter } from '../components/ProductCounter.js';
import { ProductAccessTable } from '../components/ProductAccess.js';
import { matchesStoreShelf, type StoreShelfFilter } from '../utils/storeShelfDisplay.js';
import { QuestLockNote } from '../components/QuestLink.js';
import { ShelfArt } from '../components/ItemTile.js';
import { QuantitySteps } from '../components/QuantitySteps.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { useOnboarding } from '../stores/onboarding.js';
import { formatClockTime, formatDuration } from '../utils/time.js';
import { browserSessionStorage, clearPendingAction, loadPendingAction, savePendingAction } from '../utils/pendingAction.js';
import { addStoreBasketLine, basketOverStockReason, capBasketToStock, isStoreBasket, quantityInBasket, removeStoreBasketLine, STORE_BASKET_MAX_AGE_MS, type StoreBasketLine } from '../utils/storeBasket.js';

type Order = Omit<StoreTradeInput, 'actionId'>;
type BasketLine = StoreBasketLine;
type StoreCommand = { kind: 'trade'; order: Order } | { kind: 'checkout'; lines: StoreCheckoutLineInput[] } | { kind: 'specialOrder'; store: string; item: string };
type PendingStoreCommand = { actionId: string; command: StoreCommand };

const STOCK_UP_GUIDE = [
  { id: 'condoms', step: 'buy-condoms', target: 'shop-buy-condoms', slug: 'corner', store: 'CORNER', field: 'condoms', quantity: 1_000 },
  { id: 'beer', step: 'buy-beer', target: 'shop-buy-beer', slug: 'corner', store: 'CORNER', field: 'beer', quantity: 1_000 },
  { id: 'medicine', step: 'buy-medicine', target: 'shop-buy-medicine', slug: 'corner', store: 'CORNER', field: 'medicine', quantity: 15 },
  { id: 'pistols', step: 'buy-pistols', target: 'shop-buy-pistols', slug: 'tommy', store: 'TOMMY', field: 'pistols', quantity: 5 },
  { id: 'ammo-crate', step: 'buy-ammo-crate', target: 'shop-buy-ammo-crate', slug: 'tommy', store: 'TOMMY', item: 'AMMO_CRATE', quantity: 1 },
] as const;

type StockUpGuideItem = (typeof STOCK_UP_GUIDE)[number];

function stockUpItemMatches(item: StoreItemDto, guideItem: StockUpGuideItem): boolean {
  return 'item' in guideItem ? item.key === guideItem.item : item.field === guideItem.field;
}

/** "every 4 hours" - the wait, in the units it was written in. */
function restockCadence(intervalMinutes: number): string {
  if (intervalMinutes % (60 * 24) === 0) {
    const days = intervalMinutes / (60 * 24);
    return days === 1 ? 'day' : `${days} days`;
  }
  if (intervalMinutes % 60 === 0) {
    const hours = intervalMinutes / 60;
    return hours === 1 ? 'hour' : `${hours} hours`;
  }
  return `${intervalMinutes} minutes`;
}

/**
 * "another 2,000 every hour" / "one more every 4 hours".
 *
 * A corner store restocks by the case and a chop shop by the car, so the
 * delivery size has to be part of the sentence rather than assumed to be one.
 */
function restockDelivery(restock: StoreRestockDto): string {
  const cadence = restockCadence(restock.intervalMinutes);
  // A delivery that fills the shelf is a restock, not a top-up - saying
  // "another 2,000" would imply it stacks on what is already there.
  if (restock.perInterval >= restock.cap) return `the shelf restocks in full every ${cadence}`;
  return restock.perInterval === 1
    ? `one more every ${cadence}`
    : `another ${formatNumber(restock.perInterval)} every ${cadence}`;
}

function shipmentStatus(status: NonNullable<StoreRestockDto['shipment']>['status']): string {
  if (status === 'DELAYED') return 'Delayed';
  if (status === 'PARTIAL') return 'Short shipment';
  if (status === 'LARGE') return 'Oversized shipment';
  return 'On schedule';
}

/**
 * What Tommy has, and when the next one lands.
 *
 * The countdown is display only. When it reaches zero the catalog is refetched
 * rather than incremented locally, so the shelf a player sees is always the
 * shelf the server would sell from.
 */
function RestockLine({ restock, name, keeper, onArrival }: {
  restock: StoreRestockDto; name: string; keeper: string; onArrival: () => void;
}) {
  const { msRemaining } = useCountdown(restock.nextAt, onArrival);
  const full = restock.stock >= restock.cap;
  const shipment = restock.shipment;

  return (
    <div className="se-store-shipment">
      <p className={`se-hint${restock.stock === 0 ? ' se-warn' : ''}`}>
        {keeper} has <strong className="se-num">{formatNumber(restock.stock)} {restock.unitLabel ?? name}</strong> of{' '}
        <strong className="se-num">{formatNumber(restock.cap)} {restock.unitLabel ?? name}</strong>.{' '}
        {full
          ? `Fully stocked — ${restockDelivery(restock)}.`
          : restock.stock === 0
            ? `Out of ${name} — next delivery in ${formatDuration(msRemaining)}.`
            : `Next delivery in ${formatDuration(msRemaining)}, then ${restockDelivery(restock)}.`}
      </p>
      {shipment ? (
        <p className={`se-store-shipment__line se-store-shipment__line--${shipment.status.toLowerCase().replaceAll('_', '-')}`}>
          <strong>{shipmentStatus(shipment.status)}</strong>
          <span>{formatNumber(shipment.quantity)}{restock.unitLabel ? ` ${restock.unitLabel}` : ''} incoming</span>
        </p>
      ) : null}
    </div>
  );
}

function trendDetail(context: StoreMarketContextDto): string {
  const delta = context.buy.deltaPercent;
  if (delta === 0) return context.buy.trend;
  return `${context.buy.trend} · ${delta > 0 ? '+' : ''}${formatNumber(delta)}%`;
}

function MarketBadges({ market }: { market: StoreMarketContextDto }) {
  return (
    <div className="se-market-badges" aria-label="Market context">
      <span className={`se-market-badge se-market-badge--${market.buy.label.toLowerCase().replaceAll(' ', '-')}`}>
        {market.buy.label}
      </span>
      <span className="se-market-badge">{trendDetail(market)}</span>
      <span className={`se-market-badge se-market-badge--stock-${market.stock.label.toLowerCase().replaceAll(' ', '-')}`}>
        {market.stock.label}
      </span>
    </div>
  );
}

function relationshipSummary(input: {
  buyDiscountPercent?: number;
  sellBonusPercent?: number;
  relationshipBuyDiscountPercent?: number;
  relationshipSellBonusPercent?: number;
}): string {
  const buyDiscountPercent = input.buyDiscountPercent ?? input.relationshipBuyDiscountPercent;
  const sellBonusPercent = input.sellBonusPercent ?? input.relationshipSellBonusPercent;
  const parts = [
    buyDiscountPercent ? `${formatNumber(buyDiscountPercent)}% buy discount` : null,
    sellBonusPercent ? `${formatNumber(sellBonusPercent)}% better buyback` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function StoreItem({ item, store, storeName, keeper, owned, cashCents, bulkHelpers, blocked, basket, onTrade, onSpecialOrder, onAddToBasket, onRestock, tourTarget, tourQuantity, tourRequirement }: {
  item: StoreItemDto; store: string; storeName: string; keeper: string; owned: number; cashCents: number;
  /** Why the whole shelf is off, or null when it is open for business. */
  bulkHelpers: number[]; blocked: string | null;
  basket: readonly BasketLine[];
  onTrade: (order: Order) => Promise<void>;
  onSpecialOrder: (store: string, item: string) => Promise<void>;
  onAddToBasket: (line: BasketLine) => void;
  onRestock: () => void;
  tourTarget?: string;
  tourQuantity?: number;
  tourRequirement?: number;
}) {
  const [quantity, setQuantity] = useState<number | ''>(tourQuantity ?? 1);
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  useEffect(() => {
    if (tourQuantity !== undefined) setQuantity(tourQuantity);
  }, [tourQuantity]);
  const buying = direction === 'buy';
  const favor = item.unlock;
  // 1.5.0-E2: a job-opened shelf (a weapon rack or one of Charlie's vehicles) says which job.
  const questLock = item.questLock ?? null;
  const locked = (favor !== null && !favor.unlocked) || (questLock !== null && !questLock.unlocked);
  const purchaseLocked = buying && locked;
  const unitCents = buying ? item.buyCents : item.sellCents;
  const unitsPerOrder = item.unitsPerOrder ?? 1;
  const purchaseMax = buying
    ? Math.min(item.maxBuy, item.buyCents > 0 ? Math.floor(cashCents / item.buyCents) : item.maxBuy)
    : Math.floor(owned / unitsPerOrder);
  const max = buying && tourQuantity !== undefined ? Math.min(purchaseMax, tourQuantity) : purchaseMax;
  const shelfOrders = item.restock ? Math.floor(item.restock.stock / unitsPerOrder) : null;
  const soldOut = buying && shelfOrders === 0;
  const specialOrder = unitsPerOrder === 1 ? item.restock?.specialOrder ?? null : null;
  const inBasket = quantityInBasket(basket, `${store}:${item.key}:${direction}`);
  const stockLimit = buying ? shelfOrders : null;
  const valid = typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= max;
  const total = valid && unitCents !== null ? quantity * unitCents : null;
  const quantityId = `quantity-${item.key}`;
  const noneToBuy = soldOut
    ? `${keeper} has no complete ${item.name} pack to sell until the next delivery.`
    : `You cannot afford a single ${item.name} at ${formatCents(item.buyCents)}.`;
  const emptyReason = buying ? noneToBuy : `You have no ${item.name} to sell.`;
  const tradeBlock = blocked
    ?? (purchaseLocked
      ? `Complete the required job before buying ${item.name}.`
      : max < 1
        ? emptyReason
        : !valid || total === null
          ? `Enter a whole number from 1 to ${formatNumber(max)}.`
          : null);
  const basketBlock = basketOverStockReason({
    quantity, inBasket, stock: stockLimit, itemName: item.name, keeper,
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked || purchaseLocked || !valid || typeof quantity !== 'number') return;
    await onTrade({ store, item: item.key, quantity, direction });
  }

  function addToBasket() {
    if (blocked || purchaseLocked || basketBlock || !valid || typeof quantity !== 'number' || unitCents === null) return;
    onAddToBasket({
      key: `${store}:${item.key}:${direction}`,
      store,
      item: item.key,
      direction,
      quantity,
      storeName,
      itemName: item.name,
      unitCents,
      stockLabel,
      stockLimit,
    });
  }

  const stockLabel = item.restock
    ? shelfOrders === 0
      ? 'Sold out'
      : unitsPerOrder > 1
        ? `${formatNumber(shelfOrders ?? 0)} packs in stock`
        : `${formatNumber(item.restock.stock)} / ${formatNumber(item.restock.cap)} in stock`
    : 'Always available';
  const tourUnit = item.inventoryUnitLabel ?? item.name;
  const tourRemaining = tourRequirement === undefined ? 0 : Math.max(0, tourRequirement - owned);
  const tourRequirementLabel = tourRequirement === undefined ? null : `${formatNumber(tourRequirement)} ${tourUnit}`;

  return (
    <Panel
      title={item.name}
      className={`se-store-shelf${locked ? ' se-store-shelf--locked' : ''}${soldOut ? ' se-store-shelf--soldout' : ''}`}
      tourTarget={tourTarget}
      aside={<span className={`se-store-shelf__status${soldOut ? ' se-store-shelf__status--warn' : locked ? ' se-store-shelf__status--locked' : ''}`}>{locked ? `Buy locked · ${stockLabel}` : `Shelf stock · ${stockLabel}`}</span>}
    >
      {tourRequirementLabel ? (
        <div className="se-store-shelf__walkthrough" role="status">
          <strong>Walkthrough target</strong>
          <span>Have {tourRequirementLabel} total. You have {formatNumber(owned)} {tourUnit}. Buy {formatNumber(tourRemaining)} more.</span>
        </div>
      ) : null}
      <div className="se-store-shelf__top">
        <ShelfArt itemKey={item.key} locked={locked} soldOut={soldOut} />
        <div className="se-store-prices">
          <span>{item.inventoryUnitLabel ? `${item.inventoryUnitLabel[0]!.toUpperCase()}${item.inventoryUnitLabel.slice(1)} owned` : 'Own'} <strong className="se-num">{formatNumber(owned)}</strong></span>
          <span>
            Buy <strong className="se-num">{formatCents(item.buyCents)}</strong>
            {item.baseBuyCents ? <span className="se-dim"> · normally {formatCents(item.baseBuyCents)}</span> : null}
          </span>
          <span>{item.sellCents === null ? 'No buyback' : <>Sell <strong className="se-num">{formatCents(item.sellCents)}</strong></>}</span>
        </div>
      </div>
      {locked ? (
        <p className="se-store-shelf__notice">
          Purchases locked · {owned > 0 ? 'You can still sell owned stock.' : 'Complete a job to start buying.'}
        </p>
      ) : null}
      {!locked || owned > 0 ? <form onSubmit={submit}>
        <div className="se-store-order">
          <div>
            <label className="se-label" htmlFor={`direction-${item.key}`}>Trade</label>
            <select id={`direction-${item.key}`} className="se-input" value={direction} disabled={blocked !== null}
              onChange={(e) => setDirection(e.target.value as 'buy' | 'sell')}>
              <option value="buy">Buy</option>
              {item.sellCents !== null ? <option value="sell">Sell</option> : null}
            </select>
          </div>
          <div>
            <label className="se-label" htmlFor={quantityId}>Quantity</label>
            <input id={quantityId} className="se-input" type="number" inputMode="numeric"
              min={1} max={max} step={1} value={quantity} disabled={blocked !== null || purchaseLocked}
              aria-describedby={`${quantityId}-hint`}
              onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))} />
          </div>
        </div>
        <div className="se-spend__row">
          <QuantitySteps
            value={quantity}
            onChange={setQuantity}
            max={max}
            steps={bulkHelpers}
            disabled={blocked !== null || purchaseLocked}
            disabledReason={blocked ?? (purchaseLocked ? `Complete the required job before buying ${item.name}.` : null)}
            emptyReason={emptyReason}
          />
        </div>
        <EconomyQuote
          eyebrow="Trade quote"
          title={quantity === '' ? item.name : `${formatNumber(quantity)} × ${item.name}`}
          status={total === null ? 'Check quantity' : formatCents(total)}
          statusTone={total === null ? 'warn' : 'accent'}
          compact
        >
          <p id={`${quantityId}-hint`} className="se-hint">
            {purchaseLocked ? 'Complete the required quest to unlock purchases.' : soldOut ? (
              `Sold out. ${keeper} has none to sell you right now.`
            ) : <>
              {buying ? 'Can buy' : 'Can sell'} {formatNumber(max)}.
              {buying && item.restock && max === shelfOrders && max > 0
                ? ' That is the whole shelf.' : ''}
              {unitsPerOrder > 1 ? ` Each order adds ${formatNumber(unitsPerOrder)} ${item.inventoryUnitLabel ?? 'units'}.` : ''}
              {stockLimit !== null && inBasket > 0 ? ` Basket has ${formatNumber(inBasket)}.` : ''}
              {quantity !== '' && !valid ? ' Enter a whole quantity within that limit.' : ''}
            </>}
          </p>
        </EconomyQuote>
        <div className="se-store-actions">
          <Button className="se-btn se-btn--primary se-btn--block" disabledReason={tradeBlock}>
            {purchaseLocked ? 'Purchases locked' : `${buying ? 'Buy' : 'Sell'}${total !== null ? ` · ${formatCents(total)}` : ''}`}
          </Button>
          <Button
            type="button"
            className="se-btn se-btn--block"
            disabledReason={tradeBlock ?? basketBlock ?? (unitCents === null ? 'This item cannot be added to the basket.' : null)}
            onClick={addToBasket}
          >
            Add to basket
          </Button>
        </div>
      </form> : null}
      <details className="se-store-shelf__details">
        <summary>Market, restock &amp; access details</summary>
      <MarketBadges market={item.market} />
      {item.favorDiscountPercent ? (
        <p className="se-hint se-good">
          Tommy Voucher armed — {formatNumber(item.favorDiscountPercent)}% off this eligible purchase. It is consumed only if the buy succeeds.
        </p>
      ) : null}
      {item.relationshipBuyDiscountPercent || item.relationshipSellBonusPercent ? (
        <p className="se-hint se-good">
          Relationship perk — {relationshipSummary(item)}.
        </p>
      ) : null}
      {item.factionDiscount ? (
        <p className="se-hint se-good">
          {item.factionDiscount.factionName} perk — {formatNumber(item.factionDiscount.percent)}% off buying.
        </p>
      ) : null}
      {item.restock ? (
        <RestockLine restock={item.restock} name={item.name} keeper={keeper} onArrival={onRestock} />
      ) : null}
      {specialOrder ? (
        <div className="se-store-special-order">
          <div>
            <strong>{specialOrder.label}</strong>
            <span>{formatCents(specialOrder.feeCents)} sourcing fee · about {formatNumber(specialOrder.waitMinutes)} minutes</span>
          </div>
          <Button
            type="button"
            className="se-btn se-btn--sm"
            disabledReason={blocked ?? (cashCents < specialOrder.feeCents ? `You need ${formatCents(specialOrder.feeCents)} to source this.` : null)}
            onClick={() => void onSpecialOrder(store, item.key)}
          >
            Special order
          </Button>
        </div>
      ) : null}
      {favor || questLock ? (
        !locked ? <p className="se-hint se-good">Purchasing access earned for this round.</p> : (
          <div className="se-store-favor">
            <h3 className="se-store-favor__title">Quest locked</h3>
            {questLock ? (
              <QuestLockNote unlockName={questLock.unlockName} quest={questLock.quest} after={owned > 0 ? `You can still use the ${item.name}s you own.` : undefined} />
            ) : (
              <p className="se-hint">
                {keeper} has not opened this to you yet. Access is earned through
                {' '}<Link to="/game/quests">underworld jobs</Link>, not passive reputation.
              </p>
            )}
          </div>
        )
      ) : null}
      </details>
    </Panel>
  );
}

/** Short names for the store tabs; the page title keeps the full one. */

const STORE_DETAILS: Record<string, { label: string; lane: string; note: string }> = {
  CORNER: {
    label: 'Neighborhood supply',
    lane: 'Street essentials',
    note: 'Condoms, beer, medicine, and the basics that keep everyday operations moving.',
  },
  TOMMY: {
    label: 'Weapons & muscle',
    lane: 'Weapon counter',
    note: 'Crew, pistols, and heavier hardware arrive on Tommy’s own restock schedule.',
  },
  CHARLIE: {
    label: 'Cars & mobility',
    lane: 'Vehicle floor',
    note: 'Low-Riders are built one at a time and determine how many shooters a drive-by can carry.',
  },
  PIP: {
    label: 'Product market',
    lane: 'Street exchange',
    note: 'Buy and sell product here. Some harder shelves require job-earned purchase access.',
  },
};

const LAST_STORE_KEY = 'streets.lastStore.v1';

/**
 * The last catalog this player loaded. Switching store tabs remounts the view,
 * and without this every tab would open on "Loading the shelves" before the
 * same prices came back. The fetch still runs and replaces it.
 */
let cachedCatalog: { playerId: string; data: StoresDto } | null = null;

function rememberStore(slug: string): void {
  try {
    window.localStorage.setItem(LAST_STORE_KEY, slug);
  } catch {
    // Stores still open on the Corner Store without it.
  }
}

/** /game/stores: back to the counter you used last. */
export function StoresIndexPage() {
  let slug = 'corner';
  try {
    slug = window.localStorage.getItem(LAST_STORE_KEY) ?? 'corner';
  } catch {
    // Private browsing: the Corner Store it is.
  }
  return <Navigate to={`/game/stores/${encodeURIComponent(slug)}`} replace />;
}

function StoreView({
  slug,
  basket,
  onAddToBasket,
  onRemoveFromBasket,
  onClearBasket,
  onCapBasket,
}: {
  slug: string;
  basket: BasketLine[];
  onAddToBasket: (line: BasketLine) => void;
  onRemoveFromBasket: (key: string) => void;
  onClearBasket: () => void;
  onCapBasket: (limits: Readonly<Record<string, number>>) => void;
}) {
  const me = useSession((s) => s.me);
  const tour = useOnboarding((s) => s.state?.tour ?? null);
  const advanceTour = useOnboarding((s) => s.act);
  const location = useLocation();
  const navigate = useNavigate();
  const action = useGameAction<StoreTradeResult | StoreCheckoutResult | StoreSpecialOrderResult>();
  const [catalog, setCatalog] = useState<StoresDto | null>(() => (cachedCatalog && cachedCatalog.playerId === me?.id ? cachedCatalog.data : null));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [retryOrder, setRetryOrder] = useState<PendingStoreCommand | null>(null);
  const [shelfQuery, setShelfQuery] = useState('');
  const [shelfFilter, setShelfFilter] = useRememberedState<StoreShelfFilter>(
    rememberedKey('store.shelf-filter', me?.id),
    'all',
    { accept: (value): value is StoreShelfFilter => value === 'all' || value === 'available' || value === 'locked' || value === 'sold-out' },
  );
  // 0.4.0-D: Pip deals every product. Other stores never ask.
  const [products, setProducts] = useState<ProductsDto | null>(null);
  const guidedStock = Boolean(tour?.active && !tour.dismissed && !tour.complete && STOCK_UP_GUIDE.some((item) => item.step === tour.step));
  const tourItemId = new URLSearchParams(location.search).get('tourItem');
  const guidedItem = guidedStock
    ? STOCK_UP_GUIDE.find((item) => item.step === tour?.step) ?? STOCK_UP_GUIDE.find((item) => item.id === tourItemId) ?? STOCK_UP_GUIDE[0]
    : null;
  const loadProducts = useCallback(() => {
    if (slug !== 'pip') return;
    api.get<ProductsDto>('/game/products').then(setProducts).catch(() => setProducts(null));
  }, [slug]);
  useEffect(loadProducts, [loadProducts, reload]);
  // Quest Recipe Unlocks D: a claimed job can open a shelf or a recipe; show it without a reload.
  useEffect(() => {
    if (slug !== 'pip') return;
    const visible = () => {
      if (document.visibilityState === 'visible') loadProducts();
    };
    const unsubscribe = onQuestsChanged((detail) => {
      if (detail.scope === 'board') return;
      loadProducts();
    });
    document.addEventListener('visibilitychange', visible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [slug, loadProducts]);
  const pendingStorage = browserSessionStorage();
  const pendingKey = `store:${me?.id ?? 'signed-out'}`;

  useEffect(() => {
    if (!me) return;
    const pending = loadPendingAction<StoreCommand>(pendingStorage, pendingKey);
    if (pending) setRetryOrder({ actionId: pending.actionId, command: pending.payload });
  }, [me?.id]);

  useEffect(() => {
    let active = true;
    storesApi.catalog().then((data) => {
      if (me) cachedCatalog = { playerId: me.id, data };
      if (active) { setCatalog(data); setLoadError(null); }
    }).catch(() => {
      if (active) setLoadError('Could not load store prices. Try again.');
    });
    return () => { active = false; };
  }, [me?.resources, reload]);

  useEffect(() => {
    if (!catalog) return;
    const limits: Record<string, number> = {};
    for (const entry of catalog.stores) {
      for (const item of entry.items) {
        if (item.restock) limits[`${entry.key}:${item.key}:buy`] = Math.floor(item.restock.stock / (item.unitsPerOrder ?? 1));
      }
    }
    for (const product of products?.products ?? []) {
      if (product.pip) limits[`PIP:${product.key}:buy`] = product.pip.stock;
    }
    onCapBasket(limits);
  }, [catalog, products, onCapBasket]);

  async function execute(command: StoreCommand, recoveredActionId?: string) {
    await action.run(async (actionId) => {
      try {
        const accessForLine = (line: { store: string; item: string; direction: 'buy' | 'sell' }) => {
          if (line.direction === 'sell' && me?.city.slug === 'new-york-city') return 'wall-street-fixer';
          const item = catalog?.stores.find((store) => store.key === line.store)?.items.find((row) => row.key === line.item);
          if (line.direction === 'buy' && me?.city.slug === 'chicago' && ['pistols', 'shotguns', 'tek9s', 'ak47s'].includes(item?.field ?? '')) return 'arms-dealer';
          if (line.direction === 'buy' && me?.city.slug === 'detroit' && ['lowRiders', 'sedans', 'vans'].includes(item?.field ?? '')) return 'motor-city-garage';
          return null;
        };
        const lines = command.kind === 'checkout' ? command.lines : command.kind === 'trade' ? [command.order] : [];
        const accessKey = lines.map(accessForLine).find((key) => key !== null);
        const grantStorageKey = accessKey ? `se-territory-grant-${accessKey}` : null;
        const territoryAccessGrantId = grantStorageKey ? sessionStorage.getItem(grantStorageKey) ?? undefined : undefined;
        const result = command.kind === 'checkout'
          ? await storesApi.checkout({ lines: command.lines, actionId, ...(territoryAccessGrantId ? { territoryAccessGrantId } : {}) })
          : command.kind === 'specialOrder'
            ? await storesApi.specialOrder({ store: command.store, item: command.item, actionId })
            : await storesApi.trade({ ...command.order, actionId, ...(territoryAccessGrantId ? { territoryAccessGrantId } : {}) });
        if (territoryAccessGrantId && grantStorageKey) sessionStorage.removeItem(grantStorageKey);
        clearPendingAction(pendingStorage, pendingKey);
        setRetryOrder(null);
        if (command.kind === 'checkout') {
          onClearBasket();
          // A basket can carry Pip's products, whose shelves live on their own page.
          loadProducts();
        }
        if (guidedStock && guidedItem) {
          const purchased = command.kind === 'trade'
            ? command.order.direction === 'buy' && command.order.store === guidedItem.store
              && catalog?.stores.find((entry) => entry.key === command.order.store)?.items.some((item) => item.key === command.order.item && stockUpItemMatches(item, guidedItem))
            : command.kind === 'checkout'
              ? command.lines.some((line) => line.direction === 'buy' && line.store === guidedItem.store
                && catalog?.stores.find((entry) => entry.key === line.store)?.items.some((item) => item.key === line.item && stockUpItemMatches(item, guidedItem)))
              : false;
          if (purchased) {
            const next = STOCK_UP_GUIDE[STOCK_UP_GUIDE.findIndex((item) => item.id === guidedItem.id) + 1];
            // These five prompts share one server-validated supply milestone;
            // advance only the display hint until the final purchase completes it.
            await advanceTour({ action: 'advance-tour', step: next?.step ?? 'grow-crew' });
            if (next) {
              navigate(`/game/stores/${next.slug}?tourItem=${next.id}`, { replace: true, state: { tourTarget: next.target } });
            }
          }
        }
        return result;
      } catch (error) {
        // Network/5xx failures are ambiguous: the server may have committed
        // before the reply disappeared. Keep the exact command + action id.
        if (!(error instanceof ApiError) || error.isUncertain) {
          setRetryOrder({ actionId, command });
        } else {
          clearPendingAction(pendingStorage, pendingKey);
          setRetryOrder(null);
        }
        throw error;
      }
    }, {
      actionId: recoveredActionId,
      onActionId: (actionId) => savePendingAction(
        pendingStorage,
        pendingKey,
        actionId,
        command,
      ),
    });
  }

  if (!me) return <Navigate to="/join" replace />;
  const store = catalog?.stores.find((entry) => entry.slug === slug);
  if (store) rememberStore(store.slug);
  // One reason for every control on the counter, so a dead shelf explains itself.
  const counterBlock = action.busy
    ? 'Your last order is still going through.'
    : retryOrder !== null
      ? 'Settle the unconfirmed transaction above first.'
      : loadError !== null
        ? 'Prices could not be loaded, so nothing can be traded yet.'
        : null;
  const receipt = action.result && 'direction' in action.result.result ? action.result.result : null;
  const checkoutReceipt = action.result && 'lines' in action.result.result ? action.result.result : null;
  const specialOrderReceipt = action.result && 'stockArrivesAt' in action.result.result ? action.result.result : null;
  // Every counter action reports into the dock, so a buy at the top shelf and
  // a basket checkout both answer at the same spot under the thumb.
  const outcome = !action.result ? null : receipt ? {
    title: `${receipt.direction === 'buy' ? 'Bought' : 'Sold'} ${receipt.itemName}`,
    subtitle: receipt.storeName,
    lines: [
      { label: receipt.itemName, delta: receipt.quantityChange, remaining: receipt.field ? action.result.after.resources[receipt.field] : receipt.quantityAfter },
      { label: 'Price each', value: formatCents(receipt.unitCents) },
      { label: receipt.direction === 'buy' ? 'Paid' : 'Received', delta: receipt.cashChangeCents, money: true },
      { label: 'Turns used', value: '0' },
    ] as ResultLine[],
  } : checkoutReceipt ? {
    title: `Checkout · ${formatNumber(checkoutReceipt.itemCount)} items`,
    subtitle: `${formatNumber(checkoutReceipt.itemCount)} items across ${formatNumber(checkoutReceipt.lineCount)} lines`,
    lines: [
      ...checkoutReceipt.lines.map((line) => ({
        label: `${line.direction === 'buy' ? 'Bought' : 'Sold'} ${line.itemName}`,
        detail: line.storeName,
        delta: line.quantityChange,
        remaining: line.field ? action.result!.after.resources[line.field] : line.quantityAfter,
      })),
      { label: checkoutReceipt.cashChangeCents < 0 ? 'Paid' : 'Received', delta: checkoutReceipt.cashChangeCents, money: true },
      { label: 'Turns used', value: '0' },
    ] as ResultLine[],
  } : specialOrderReceipt ? {
    title: `${specialOrderReceipt.itemName} ordered · due ${formatClockTime(specialOrderReceipt.stockArrivesAt)}`,
    subtitle: `Delivery due in about ${formatNumber(specialOrderReceipt.waitMinutes)} minutes`,
    lines: [
      { label: 'Sourcing fee', delta: specialOrderReceipt.cashChangeCents, money: true },
      { label: 'Incoming stock', value: formatClockTime(specialOrderReceipt.stockArrivesAt) },
      { label: 'Turns used', value: '0' },
    ] as ResultLine[],
  } : null;
  const details = store ? STORE_DETAILS[store.key] ?? {
    label: 'Street market',
    lane: 'Open counter',
    note: store.blurb,
  } : null;
  const starterSupplies = store?.key === 'CORNER'
    ? store.items.filter((item) => item.field === 'condoms' || item.field === 'beer')
    : [];
  const unavailableStarterSupplies = starterSupplies.filter((item) => item.restock?.stock === 0);
  const pipProducts = store?.key === 'PIP' && products?.economy
    ? products.products.filter((product) => product.pip)
    : [];
  const totalShelves = (store?.items.length ?? 0) + pipProducts.length;
  const soldOutShelves = (store?.items.filter((item) => item.restock && Math.floor(item.restock.stock / (item.unitsPerOrder ?? 1)) === 0).length ?? 0)
    + pipProducts.filter((product) => product.pip?.stock === 0).length;
  const lockedShelves = (store?.items.filter((item) => item.unlock && !item.unlock.unlocked).length ?? 0)
    + pipProducts.filter((product) => product.pip && !product.pip.purchaseUnlocked).length;
  // Display filters never change the server-side purchase, sell or checkout rules.
  const visibleStoreItems = (store?.items ?? []).filter((item) => matchesStoreShelf({
    name: item.name,
    purchaseUnlocked: item.unlock?.unlocked !== false && item.questLock?.unlocked !== false,
    soldOut: item.restock !== null && item.restock !== undefined
      ? Math.floor(item.restock.stock / (item.unitsPerOrder ?? 1)) === 0
      : false,
  }, shelfQuery, shelfFilter));
  const visiblePipProducts = pipProducts.filter((product) => matchesStoreShelf({
    name: product.name,
    purchaseUnlocked: product.pip?.purchaseUnlocked ?? false,
    soldOut: product.pip?.stock === 0,
  }, shelfQuery, shelfFilter));
  const visibleCount = visibleStoreItems.length + visiblePipProducts.length;
  const basketTotalCents = basket.reduce((sum, line) => {
    const signed = line.direction === 'buy' ? -1 : 1;
    return sum + signed * line.unitCents * line.quantity;
  }, 0);
  const basketDisabled = counterBlock
    ?? (basket.length === 0 ? 'Add at least one item to the basket.' : null);

  return (
    <GameLayout>
      <div className="se-stores">
        <header className={`se-stores-hero se-stores-hero--${store?.key.toLowerCase() ?? 'loading'}`}>
          <div className="se-stores-hero__copy">
            {store ? <Portrait who={store.key} size="lg" label={store.name} /> : null}
            <span className="se-eyebrow">{details?.label ?? 'Street market'} · {me.city.name}</span>
            <h1>{store?.name ?? 'Stores'}</h1>
            <p>{store?.blurb ?? 'Loading the shelves and today’s prices.'}</p>
            {store && storeHasContactRoom(store.key) ? (
              <Link className="se-btn se-stores-hero__visit" to={contactRoomHref(store.key)}>Visit {store.keeper}</Link>
            ) : null}
          </div>

          <div className="se-stores-hero__side">
            {/* Cash is in the top bar and standing and restock are on the clerk card; the hero counts the shelves. */}
            <div className="se-stores-hero__readout">
              <span>
                <small>Shelves</small>
                <strong>{store ? formatNumber(totalShelves) : '—'}</strong>
              </span>
              <span className={soldOutShelves > 0 ? 'se-stores-hero__warn' : undefined}>
                <small>Sold out</small>
                <strong>{store ? formatNumber(soldOutShelves) : '—'}</strong>
              </span>
              <span className={lockedShelves > 0 ? 'se-stores-hero__warn' : undefined}>
                <small>Locked</small>
                <strong>{store ? formatNumber(lockedShelves) : '—'}</strong>
              </span>
            </div>
          </div>
        </header>

        {catalog ? <StoreTabs stores={catalog.stores} slug={slug} board={catalog.playerBoard === true} /> : null}

        {loadError ? (
          <Alert>
            {loadError}{' '}
            <Button
              className="se-btn se-btn--sm"
              disabledReason={action.busy ? 'Your last order is still going through.' : null}
              onClick={() => setReload((n) => n + 1)}
            >
              Retry loading
            </Button>
          </Alert>
        ) : null}
        {action.error ? <Alert>{action.error}</Alert> : null}
        {retryOrder ? (
          <EconomyPendingNotice
            action={(
            <Button
              className="se-btn se-btn--sm"
              disabledReason={action.busy ? 'Checking the last transaction with the server.' : null}
              onClick={() => void execute(retryOrder.command, retryOrder.actionId)}
            >
              Retry transaction
            </Button>
            )}
          >
            The last transaction could not be confirmed. Retry it to check the result safely.
          </EconomyPendingNotice>
        ) : null}
        {!catalog && !loadError ? <div className="se-stores-loading" role="status">Loading the shelves...</div> : null}
        {catalog && !store ? <Alert>That store is not open. <Link to="/game/stores/corner">Visit the Corner Store</Link>.</Alert> : null}

        {store && catalog ? (
          <>
            <section className="se-stores-market">
              <div className="se-stores-market__main">
                <div className="se-stores-sectionhead">
                  <div>
                    <span className="se-eyebrow">{details?.lane ?? 'Inventory'}</span>
                    <h2>Trade &amp; supplies</h2>
                  </div>
                  <p>{details?.note}</p>
                </div>

                {starterSupplies.length > 0 ? (
                  <aside className="se-stores-starter-note" data-tour="starter-supplies-help">
                    <strong>Starter supplies</strong>
                    <span>
                      Buy at least one {starterSupplies.map((item) => item.name.toLowerCase()).join(' and ')} to keep the early jobs moving.
                      {unavailableStarterSupplies.length > 0
                        ? ` ${unavailableStarterSupplies.map((item) => item.name).join(' and ')} ${unavailableStarterSupplies.length === 1 ? 'is' : 'are'} sold out; check the shelf for the next delivery.`
                        : ' The shelf status below each item shows how much is available.'}
                    </span>
                  </aside>
                ) : null}

                <div className="se-stores-toolbar">
                  <div className="se-stores-toolbar__search">
                    <label className="se-label" htmlFor="store-shelf-search">Find an item</label>
                    <input
                      id="store-shelf-search"
                      type="search"
                      className="se-input"
                      placeholder="Search this store..."
                      value={shelfQuery}
                      onChange={(event) => setShelfQuery(event.target.value)}
                    />
                  </div>
                  <div className="se-stores-toolbar__filters" role="group" aria-label="Filter store shelves">
                    {([
                      ['all', 'All'],
                      ['available', 'Available'],
                      ['locked', 'Locked'],
                      ['sold-out', 'Sold out'],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`se-stores-filter${shelfFilter === value ? ' se-stores-filter--active' : ''}`}
                        aria-pressed={shelfFilter === value}
                        onClick={() => setShelfFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="se-stores-toolbar__count" role="status">
                    {formatNumber(visibleCount)} of {formatNumber(totalShelves)} items
                  </span>
                </div>

                {visibleCount === 0 ? (
                  <div className="se-stores-empty">
                    <strong>No items match your filters.</strong>
                    <span>Try another search, or reset the shelf filters.</span>
                    <button type="button" className="se-btn se-btn--sm" onClick={() => { setShelfQuery(''); setShelfFilter('all'); }}>
                      Show all items
                    </button>
                  </div>
                ) : null}
                <div className="se-store-items se-stores-shelves">
                  {visibleStoreItems.map((item) => (
                    <StoreItem
                      key={item.key}
                      // 0.4.0-D: next to the other products, Pip's Product is crack by name.
                      item={store.key === 'PIP' && catalog.productCounter && item.key === 'CRACK' ? { ...item, name: 'Crack' } : item}
                      store={store.key}
                      storeName={store.name}
                      keeper={store.keeper}
                      owned={me.resources[item.field] ?? 0}
                      cashCents={me.resources.cashCents}
                      bulkHelpers={catalog.bulkHelpers}
                      blocked={counterBlock}
                      basket={basket}
                       tourTarget={guidedStock && guidedItem && store.key === guidedItem.store && stockUpItemMatches(item, guidedItem) ? guidedItem.target : undefined}
                        tourQuantity={guidedStock && guidedItem && store.key === guidedItem.store && stockUpItemMatches(item, guidedItem) ? Math.max(1, guidedItem.quantity - item.owned) : undefined}
                        tourRequirement={guidedStock && guidedItem && store.key === guidedItem.store && stockUpItemMatches(item, guidedItem) ? guidedItem.quantity * (item.unitsPerOrder ?? 1) : undefined}
                      onTrade={(order) => execute({ kind: 'trade', order })}
                      onSpecialOrder={(sourceStore, sourceItem) => execute({ kind: 'specialOrder', store: sourceStore, item: sourceItem })}
                      onAddToBasket={onAddToBasket}
                      onRestock={() => setReload((n) => n + 1)}
                    />
                  ))}
                  {visiblePipProducts.map((product) => (
                    <ProductCounter
                      key={product.key}
                      product={product}
                      cashCents={me.resources.cashCents}
                      bulkHelpers={catalog.bulkHelpers}
                      blocked={counterBlock}
                      basket={basket}
                      onDone={loadProducts}
                      storeName={store.name}
                      onAddToBasket={onAddToBasket}
                    />
                  ))}
                </div>
                {store.key === 'PIP' ? (
                  <details className="se-stores-access-details">
                    <summary>Buying &amp; cooking unlocks <span>View all product requirements</span></summary>
                    <ProductAccessTable catalog={products} />
                  </details>
                ) : null}
              </div>

              <aside className="se-stores-market__rail">
                <EconomyBatchAction label="Order basket" className="se-stores-railcard se-store-basket">
                  <div className="se-store-basket__head">
                    <div>
                      <span className="se-eyebrow">Order basket</span>
                      <h2>Checkout · {formatNumber(basket.length)}</h2>
                    </div>
                    {basket.length > 0 ? (
                      <Button
                        type="button"
                        className="se-btn se-btn--ghost se-btn--sm"
                        disabledReason={action.busy ? 'Your last order is still going through.' : null}
                        onClick={onClearBasket}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>
                  {basket.length === 0 ? (
                    <p>Add items from any store to build one checkout here.</p>
                  ) : (
                    <>
                      <div className="se-store-basket__lines">
                        {basket.map((line) => (
                          <div className="se-store-basket__line" key={line.key}>
                            <div>
                              <strong>{line.direction === 'buy' ? 'Buy' : 'Sell'} {line.itemName}</strong>
                              <span>{line.storeName} · {formatNumber(line.quantity)} @ {formatCents(line.unitCents)}</span>
                              <small>{line.stockLabel}</small>
                            </div>
                            <button
                              type="button"
                              className="se-store-basket__remove"
                              title={`Remove ${line.itemName}`}
                              onClick={() => onRemoveFromBasket(line.key)}
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="se-store-basket__total">
                        <span>{basketTotalCents < 0 ? 'Estimated due' : 'Estimated payout'}</span>
                        <strong>{formatCents(Math.abs(basketTotalCents))}</strong>
                      </div>
                    </>
                  )}
                </EconomyBatchAction>

                <div className="se-stores-railcard">
                  <span className="se-eyebrow">Behind the counter</span>
                  <h2>{store.keeper}</h2>
                  <div className="se-stores-railstats">
                    <div>
                      <span>Standing</span>
                      <strong>{store.standing}</strong>
                    </div>
                    <div>
                      <span>Reputation</span>
                      <strong>{formatNumber(store.reputation)}</strong>
                    </div>
                    <div>
                      <span>Restock</span>
                      <strong>{store.restockSpeedup > 0 ? `${formatNumber(store.restockSpeedup)}% sooner` : 'Normal pace'}</strong>
                    </div>
                  </div>
                  {store.relationship ? (
                    <div className="se-stores-perks">
                      {store.relationship.current ? (
                        <div>
                          <span>Current perk</span>
                          <strong>{store.relationship.current.label}</strong>
                          <p>{store.relationship.current.description}</p>
                          <small>{relationshipSummary(store.relationship.current)}</small>
                        </div>
                      ) : null}
                      {store.relationship.next ? (
                        <div>
                          <span>Next perk</span>
                          <strong>{store.relationship.next.label}</strong>
                          <p>{store.relationship.next.description}</p>
                          <small>{formatNumber(store.relationship.next.pointsRemaining)} rep away · {relationshipSummary(store.relationship.next)}</small>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {store.news?.length ? (
                    <div className="se-stores-news">
                      {store.news.map((line) => <p key={line}>{line}</p>)}
                    </div>
                  ) : null}
                </div>

                {catalog.integrations ? (
                  <div className="se-stores-railcard">
                    <span className="se-eyebrow">Connected systems</span>
                    <div className="se-stores-integrations">
                      {catalog.integrations.hideout ? (
                        <div>
                          <strong>Hideout</strong>
                          <span>
                            {catalog.integrations.hideout.nextUpgradeName
                              ? catalog.integrations.hideout.ready
                                ? `${catalog.integrations.hideout.nextUpgradeName} is funded.`
                                : `${catalog.integrations.hideout.nextUpgradeName}: ${formatCents(catalog.integrations.hideout.cashShortCents)} short.`
                              : 'All current rooms are capped.'}
                          </span>
                        </div>
                      ) : null}
                      {catalog.integrations.turf ? (
                        <div>
                          <strong>Turf</strong>
                          <span>
                            {formatNumber(catalog.integrations.turf.blocksHeld)} blocks held
                            {catalog.integrations.turf.specialOrderDiscountPercent > 0
                              ? ` · ${formatNumber(catalog.integrations.turf.specialOrderDiscountPercent)}% source fee cut`
                              : ''}
                          </span>
                        </div>
                      ) : null}
                      {catalog.integrations.travel ? (
                        <div>
                          <strong>Travel</strong>
                          <span>
                            {catalog.integrations.travel.productName} sells {formatNumber(catalog.integrations.travel.deltaPercent)}% higher in {catalog.integrations.travel.cityName}.
                          </span>
                        </div>
                      ) : null}
                      {catalog.integrations.convoy ? (
                        <div>
                          <strong>Convoys</strong>
                          <span>
                            {formatNumber(catalog.integrations.convoy.incomingShipments)} shipments · {formatNumber(catalog.integrations.convoy.activeRuns)} active runs
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="se-stores-railcard">
                  <span className="se-eyebrow">Counter rules</span>
                  <div className="se-stores-rules">
                    <div>
                      <strong>No turns spent</strong>
                      <span>Shopping never burns turns. The button shows the full transaction total before you trade.</span>
                    </div>
                    <div>
                      <strong>Server shelf wins</strong>
                      <span>Restock countdowns are display-only. When a delivery lands, the catalog refetches the real stock.</span>
                    </div>
                    <div>
                      <strong>Jobs unlock access</strong>
                      <span>Permanent purchase access and favors live on the <Link to="/game/quests">Quests page</Link>.</span>
                    </div>
                  </div>
                </div>

                {store.key === 'CORNER' ? (
                  <div className="se-stores-railcard">
                    <span className="se-eyebrow">Street supply</span>
                    <p>Condoms and beer keep street work supplied. Restocking the crew can lift happiness immediately.</p>
                  </div>
                ) : null}

                {store.key === 'TOMMY' ? (
                  <div className="se-stores-railcard">
                    <span className="se-eyebrow">Tommy&rsquo;s rack</span>
                    <p>Thugs protect the crew and fight in raids or drive-bys. Guns and muscle arrive on Tommy&rsquo;s schedule; the heavier the hardware, the longer the wait.</p>
                    <p>Weapon access comes from underworld jobs. Once a rack opens for the round, losing cash, crew, or reputation does not take it back.</p>
                  </div>
                ) : null}

                {store.key === 'CHARLIE' ? (
                  <div className="se-stores-railcard">
                    <span className="se-eyebrow">Vehicle notes</span>
                    <p>Each Low-Rider carries {formatNumber(catalog.lowRiderThugCapacity)} shooters for a drive-by. A car comes home if at least one shooter survives.</p>
                    <p>Charlie builds them one at a time, so fleets grow across multiple deliveries.</p>
                  </div>
                ) : null}

                {store.key === 'PIP' && catalog.productCounter ? (
                  <div className="se-stores-railcard">
                    <span className="se-eyebrow">Pip&rsquo;s market</span>
                    <p>Pip deals every product. Harder shelves can require job-earned purchase access, but selling stock you already own remains part of the normal product economy.</p>
                  </div>
                ) : null}
              </aside>
            </section>
          </>
        ) : null}

        {basket.length > 0 || outcome ? (
          <ActionDock
            label="Checkout"
            onSubmit={(event) => {
              event.preventDefault();
              if (basketDisabled) return;
              void execute({
                kind: 'checkout',
                lines: basket.map(({ store, item, direction, quantity }) => ({ store, item, direction, quantity })),
              });
            }}
            outcome={outcome && action.result ? {
              id: action.result,
              title: outcome.title,
              chips: resultChips(action.result, outcome.lines),
              receipt: (
                <ActionResult
                  title={outcome.title}
                  subtitle={outcome.subtitle}
                  result={action.result}
                  lines={outcome.lines}
                />
              ),
              onDismiss: action.clear,
            } : null}
          >
            <div>
              <span className="se-dock__label">Order basket</span>
              <strong>
                {basket.length === 0
                  ? 'Basket is empty'
                  : `${formatNumber(basket.length)} line${basket.length === 1 ? '' : 's'} · ${basketTotalCents < 0 ? 'due' : 'payout'} ${formatCents(Math.abs(basketTotalCents))}`}
              </strong>
              <span>
                {basket.length === 0
                  ? 'Add items from any store to check out together.'
                  : basket.map((line) => `${line.direction === 'buy' ? '' : 'sell '}${formatNumber(line.quantity)} ${line.itemName}`).join(' · ')}
              </span>
            </div>
            {basket.length > 0 ? (
              <Button
                type="button"
                className="se-btn se-btn--ghost se-btn--sm"
                disabledReason={action.busy ? 'Your last order is still going through.' : null}
                onClick={onClearBasket}
              >
                Clear
              </Button>
            ) : null}
            <Button className="se-btn se-btn--primary" disabledReason={basketDisabled}>
              {action.busy ? 'Ringing it up...' : 'Checkout basket'}
            </Button>
          </ActionDock>
        ) : null}
      </div>
    </GameLayout>
  );
}

export function StorePage() {
  const { slug = 'corner' } = useParams();
  // The store counter itself remounts on each tab so its per-shelf form state
  // starts clean. The basket lives one level higher so it follows the player
  // between Corner, Tommy, Charlie, and Pip until checkout or an explicit clear.
  // It also survives leaving the stores for a day, so a half-built order is still there.
  // Prices on the lines are a guide; checkout charges what the shelf says then.
  const me = useSession((s) => s.me);
  const [basket, setBasket] = useRememberedState<BasketLine[]>(rememberedKey('store.basket', me?.id), [], {
    accept: isStoreBasket,
    maxAgeMs: STORE_BASKET_MAX_AGE_MS,
  });
  function addToBasket(line: BasketLine) {
    setBasket((current) => addStoreBasketLine(current, line));
  }

  const capBasket = useCallback((limits: Readonly<Record<string, number>>) => {
    setBasket((current) => capBasketToStock(current, limits));
  }, []);

  function removeFromBasket(key: string) {
    setBasket((current) => removeStoreBasketLine(current, key));
  }

  if (slug === 'salvage') return <Navigate to="/game/stores" replace />;
  if (slug === 'board') return <PlayerBoard />;

  return (
    <StoreView
      key={slug}
      slug={slug}
      basket={basket}
      onAddToBasket={addToBasket}
      onRemoveFromBasket={removeFromBasket}
      onClearBasket={() => setBasket([])}
      onCapBasket={capBasket}
    />
  );
}
