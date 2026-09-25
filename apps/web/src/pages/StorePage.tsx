import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, NavLink, useParams } from 'react-router-dom';
import { formatCents, formatNumber, type ProductsDto, type StoreCheckoutLineInput, type StoreCheckoutResult, type StoreDto, type StoreItemDto, type StoreMarketContextDto, type StoreRestockDto, type StoresDto, type StoreSpecialOrderResult, type StoreTradeInput, type StoreTradeResult } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { storesApi } from '../api/stores.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { ProductCounter } from '../components/ProductCounter.js';
import { QuantitySteps } from '../components/QuantitySteps.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { formatDuration } from '../utils/time.js';
import { browserSessionStorage, clearPendingAction, loadPendingAction, savePendingAction } from '../utils/pendingAction.js';

type Order = Omit<StoreTradeInput, 'actionId'>;
type BasketLine = StoreCheckoutLineInput & { key: string; storeName: string; itemName: string; unitCents: number; stockLabel: string };
type StoreCommand = { kind: 'trade'; order: Order } | { kind: 'checkout'; lines: StoreCheckoutLineInput[] } | { kind: 'specialOrder'; store: string; item: string };
type PendingStoreCommand = { actionId: string; command: StoreCommand };

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
        {keeper} has <strong className="se-num">{formatNumber(restock.stock)}</strong> of{' '}
        <strong className="se-num">{formatNumber(restock.cap)}</strong>.{' '}
        {full
          ? `Fully stocked — ${restockDelivery(restock)}.`
          : restock.stock === 0
            ? `Out of ${name} — next delivery in ${formatDuration(msRemaining)}.`
            : `Next delivery in ${formatDuration(msRemaining)}, then ${restockDelivery(restock)}.`}
      </p>
      {shipment ? (
        <p className={`se-store-shipment__line se-store-shipment__line--${shipment.status.toLowerCase().replaceAll('_', '-')}`}>
          <strong>{shipmentStatus(shipment.status)}</strong>
          <span>{formatNumber(shipment.quantity)} incoming</span>
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

function StoreItem({ item, store, storeName, keeper, owned, cashCents, bulkHelpers, blocked, onTrade, onSpecialOrder, onAddToBasket, onRestock }: {
  item: StoreItemDto; store: string; storeName: string; keeper: string; owned: number; cashCents: number;
  /** Why the whole shelf is off, or null when it is open for business. */
  bulkHelpers: number[]; blocked: string | null; onTrade: (order: Order) => Promise<void>;
  onSpecialOrder: (store: string, item: string) => Promise<void>;
  onAddToBasket: (line: BasketLine) => void;
  onRestock: () => void;
}) {
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const buying = direction === 'buy';
  const favor = item.unlock;
  const locked = favor !== null && !favor.unlocked;
  const purchaseLocked = buying && locked;
  const unitCents = buying ? item.buyCents : item.sellCents;
  const max = buying
    ? Math.min(item.maxBuy, item.buyCents > 0 ? Math.floor(cashCents / item.buyCents) : item.maxBuy)
    : owned;
  const soldOut = buying && item.restock !== null && item.restock.stock === 0;
  const specialOrder = item.restock?.specialOrder ?? null;
  const valid = typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= max;
  const total = valid && unitCents !== null ? quantity * unitCents : null;
  const quantityId = `quantity-${item.key}`;
  const noneToBuy = soldOut
    ? `${keeper} is sold out of ${item.name} until the next delivery.`
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked || purchaseLocked || !valid || typeof quantity !== 'number') return;
    await onTrade({ store, item: item.key, quantity, direction });
  }

  function addToBasket() {
    if (blocked || purchaseLocked || !valid || typeof quantity !== 'number' || unitCents === null) return;
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
    });
  }

  const stockLabel = item.restock
    ? item.restock.stock === 0
      ? 'Sold out'
      : `${formatNumber(item.restock.stock)} / ${formatNumber(item.restock.cap)} in stock`
    : 'Always available';

  return (
    <Panel
      title={`${locked ? 'Locked · ' : ''}${item.name}`}
      className={`se-store-shelf${locked ? ' se-store-shelf--locked' : ''}${soldOut ? ' se-store-shelf--soldout' : ''}`}
      aside={<span className={`se-store-shelf__status${soldOut ? ' se-store-shelf__status--warn' : locked ? ' se-store-shelf__status--locked' : ''}`}>{stockLabel}</span>}
    >
      <div className="se-store-prices">
        <span>Own <strong className="se-num">{formatNumber(owned)}</strong></span>
        <span>
          Buy <strong className="se-num">{formatCents(item.buyCents)}</strong>
          {item.baseBuyCents ? <span className="se-dim"> · normally {formatCents(item.baseBuyCents)}</span> : null}
        </span>
        <span>{item.sellCents === null ? 'No buyback' : <>Sell <strong className="se-num">{formatCents(item.sellCents)}</strong></>}</span>
      </div>
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
      {favor ? (
        favor.unlocked ? <p className="se-hint se-good">Purchasing access earned for this round.</p> : (
          <div className="se-store-favor">
            <h3 className="se-store-favor__title">Quest locked</h3>
            <p className="se-hint">
              Tommy has not opened this part of the rack to you yet. Weapon access is earned through
              {' '}<Link to="/game/quests">underworld jobs</Link>, not passive reputation.
            </p>
          </div>
        )
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
        <p id={`${quantityId}-hint`} className="se-hint">
          {purchaseLocked ? 'Complete the required quest to unlock purchases.' : soldOut ? (
            `Sold out. ${keeper} has none to sell you right now.`
          ) : <>
            {buying ? 'Can buy' : 'Can sell'} {formatNumber(max)}.
            {buying && item.restock && max === item.restock.stock && max > 0
              ? ' That is the whole shelf.' : ''}
            {quantity !== '' && !valid ? ' Enter a whole quantity within that limit.' : ''}
          </>}
        </p>
        <div className="se-store-actions">
          <Button className="se-btn se-btn--primary se-btn--block" disabledReason={tradeBlock}>
            {purchaseLocked ? `Unlock ${item.name} above to buy` : `${buying ? 'Buy' : 'Sell'} ${item.name}${total !== null ? ` · ${formatCents(total)}` : ''}`}
          </Button>
          <Button
            type="button"
            className="se-btn se-btn--block"
            disabledReason={tradeBlock ?? (unitCents === null ? 'This item cannot be added to the basket.' : null)}
            onClick={addToBasket}
          >
            Add to basket
          </Button>
        </div>
      </form> : null}
    </Panel>
  );
}

/** Short names for the store tabs; the page title keeps the full one. */
const TAB_NAMES: Record<string, string> = { CORNER: 'Corner', TOMMY: 'Tommy’s', CHARLIE: 'Charlie’s', PIP: 'Pip’s' };

const STORE_DETAILS: Record<string, { label: string; lane: string; note: string }> = {
  CORNER: {
    label: 'Neighborhood supply',
    lane: 'Street essentials',
    note: 'Condoms, beer, medicine, and the basics that keep everyday operations moving.',
  },
  TOMMY: {
    label: 'Weapons & muscle',
    lane: 'Armory counter',
    note: 'Crew, pistols, and heavier hardware arrive on Tommy’s own restock schedule.',
  },
  CHARLIE: {
    label: 'Cars & mobility',
    lane: 'Garage floor',
    note: 'Low-Riders are built one at a time and determine how many shooters a drive-by can carry.',
  },
  PIP: {
    label: 'Product market',
    lane: 'Street exchange',
    note: 'Buy and sell product here. Some harder shelves require job-earned purchase access.',
  },
};

function StoreMetric({ label, value, detail, tone }: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'warn' | 'accent';
}) {
  return (
    <div className={`se-stores-metric${tone ? ` se-stores-metric--${tone}` : ''}`}>
      <span className="se-stores-metric__label">{label}</span>
      <strong className="se-stores-metric__value">{value}</strong>
      {detail ? <span className="se-stores-metric__detail">{detail}</span> : null}
    </div>
  );
}

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

function StoreTabs({ stores, slug }: { stores: StoreDto[]; slug: string }) {
  return (
    <nav className="se-storetabs" aria-label="Stores">
      {stores.map((store) => (
        <NavLink key={store.slug} to={`/game/stores/${store.slug}`} replace
          className={`se-storetabs__tab${store.slug === slug ? ' se-storetabs__tab--active' : ''}`}>
          {TAB_NAMES[store.key] ?? store.name}
        </NavLink>
      ))}
    </nav>
  );
}

function StoreView({
  slug,
  basket,
  onAddToBasket,
  onRemoveFromBasket,
  onClearBasket,
}: {
  slug: string;
  basket: BasketLine[];
  onAddToBasket: (line: BasketLine) => void;
  onRemoveFromBasket: (key: string) => void;
  onClearBasket: () => void;
}) {
  const me = useSession((s) => s.me);
  const action = useGameAction<StoreTradeResult | StoreCheckoutResult | StoreSpecialOrderResult>();
  const [catalog, setCatalog] = useState<StoresDto | null>(() => (cachedCatalog && cachedCatalog.playerId === me?.id ? cachedCatalog.data : null));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [retryOrder, setRetryOrder] = useState<PendingStoreCommand | null>(null);
  // 0.4.0-D: Pip deals every product. Other stores never ask.
  const [products, setProducts] = useState<ProductsDto | null>(null);
  const loadProducts = useCallback(() => {
    if (slug !== 'pip') return;
    api.get<ProductsDto>('/game/products').then(setProducts).catch(() => setProducts(null));
  }, [slug]);
  useEffect(loadProducts, [loadProducts, reload]);
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

  async function execute(command: StoreCommand, recoveredActionId?: string) {
    await action.run(async (actionId) => {
      try {
        const result = command.kind === 'checkout'
          ? await storesApi.checkout({ lines: command.lines, actionId })
          : command.kind === 'specialOrder'
            ? await storesApi.specialOrder({ store: command.store, item: command.item, actionId })
            : await storesApi.trade({ ...command.order, actionId });
        clearPendingAction(pendingStorage, pendingKey);
        setRetryOrder(null);
        if (command.kind === 'checkout') onClearBasket();
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
  const details = store ? STORE_DETAILS[store.key] ?? {
    label: 'Street market',
    lane: 'Open counter',
    note: store.blurb,
  } : null;
  const pipProducts = store?.key === 'PIP' && products?.economy
    ? products.products.filter((product) => product.pip)
    : [];
  const totalShelves = (store?.items.length ?? 0) + pipProducts.length;
  const soldOutShelves = (store?.items.filter((item) => item.restock?.stock === 0).length ?? 0)
    + pipProducts.filter((product) => product.pip?.stock === 0).length;
  const lockedShelves = (store?.items.filter((item) => item.unlock && !item.unlock.unlocked).length ?? 0)
    + pipProducts.filter((product) => product.pip && !product.pip.purchaseUnlocked).length;
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
            <span className="se-eyebrow">{details?.label ?? 'Street market'} · {me.city.name}</span>
            <h1>{store?.name ?? 'Stores'}</h1>
            <p>{store?.blurb ?? 'Loading the shelves and today’s prices.'}</p>
          </div>

          <div className="se-stores-hero__side">
            <div className="se-stores-hero__readout">
              <span>
                <small>Cash</small>
                <strong>{formatCents(me.resources.cashCents)}</strong>
              </span>
              <span>
                <small>Standing</small>
                <strong>{store?.standing ?? '—'}</strong>
              </span>
              <span>
                <small>Shelves</small>
                <strong>{store ? formatNumber(totalShelves) : '—'}</strong>
              </span>
              <span>
                <small>Restock boost</small>
                <strong>{store ? `${formatNumber(store.restockSpeedup)}%` : '—'}</strong>
              </span>
            </div>
          </div>
        </header>

        {catalog ? <StoreTabs stores={catalog.stores} slug={slug} /> : null}

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
          <Alert tone="info">
            The last transaction could not be confirmed. Retry it to check the result safely.{' '}
            <Button
              className="se-btn se-btn--sm"
              disabledReason={action.busy ? 'Checking the last transaction with the server.' : null}
              onClick={() => void execute(retryOrder.command, retryOrder.actionId)}
            >
              Retry transaction
            </Button>
          </Alert>
        ) : null}
        {!catalog && !loadError ? <div className="se-stores-loading" role="status">Loading the shelves...</div> : null}
        {catalog && !store ? <Alert>That store is not open. <Link to="/game/stores/corner">Visit the Corner Store</Link>.</Alert> : null}

        {action.result && receipt ? (
          <section className="se-stores-receipt" aria-live="polite">
            <div className="se-stores-sectionhead">
              <div>
                <span className="se-eyebrow">Transaction complete</span>
                <h2>{receipt.direction === 'buy' ? 'Purchase receipt' : 'Sale receipt'}</h2>
              </div>
              <span className="se-stores-sectionhead__meta">{receipt.storeName}</span>
            </div>
            <ActionResult
              title={receipt.direction === 'buy' ? 'Purchase complete' : 'Sale complete'}
              subtitle={receipt.storeName}
              result={action.result}
              onDismiss={action.clear}
              lines={[
                { label: receipt.itemName, delta: receipt.quantityChange, remaining: action.result.after.resources[receipt.field] },
                { label: 'Price each', value: formatCents(receipt.unitCents) },
                { label: receipt.direction === 'buy' ? 'Paid' : 'Received', delta: receipt.cashChangeCents, money: true },
                { label: 'Turns used', value: '0' },
              ]}
            />
          </section>
        ) : null}

        {action.result && checkoutReceipt ? (
          <section className="se-stores-receipt" aria-live="polite">
            <div className="se-stores-sectionhead">
              <div>
                <span className="se-eyebrow">Checkout complete</span>
                <h2>Basket receipt</h2>
              </div>
              <span className="se-stores-sectionhead__meta">{formatNumber(checkoutReceipt.lineCount)} lines</span>
            </div>
            <ActionResult
              title="Checkout complete"
              subtitle={`${formatNumber(checkoutReceipt.itemCount)} items across ${formatNumber(checkoutReceipt.lineCount)} lines`}
              result={action.result}
              onDismiss={action.clear}
              lines={[
                ...checkoutReceipt.lines.map((line) => ({
                  label: `${line.direction === 'buy' ? 'Bought' : 'Sold'} ${line.itemName}`,
                  detail: line.storeName,
                  delta: line.quantityChange,
                  remaining: action.result!.after.resources[line.field],
                })),
                { label: checkoutReceipt.cashChangeCents < 0 ? 'Paid' : 'Received', delta: checkoutReceipt.cashChangeCents, money: true },
                { label: 'Turns used', value: '0' },
              ]}
            />
          </section>
        ) : null}

        {action.result && specialOrderReceipt ? (
          <section className="se-stores-receipt" aria-live="polite">
            <div className="se-stores-sectionhead">
              <div>
                <span className="se-eyebrow">Special order placed</span>
                <h2>{specialOrderReceipt.itemName} sourced</h2>
              </div>
              <span className="se-stores-sectionhead__meta">{specialOrderReceipt.storeName}</span>
            </div>
            <ActionResult
              title="Special order placed"
              subtitle={`Delivery due in about ${formatNumber(specialOrderReceipt.waitMinutes)} minutes`}
              result={action.result}
              onDismiss={action.clear}
              lines={[
                { label: 'Sourcing fee', delta: specialOrderReceipt.cashChangeCents, money: true },
                { label: 'Incoming stock', value: new Date(specialOrderReceipt.stockArrivesAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) },
                { label: 'Turns used', value: '0' },
              ]}
            />
          </section>
        ) : null}

        {store && catalog ? (
          <>
            <section className="se-stores-overview">
              <div className="se-stores-sectionhead">
                <div>
                  <span className="se-eyebrow">{details?.lane}</span>
                  <h2>Today&rsquo;s counter</h2>
                </div>
                <p>{details?.note}</p>
              </div>

              <div className="se-stores-summary">
                <StoreMetric label="Wallet" value={formatCents(me.resources.cashCents)} detail="available cash" tone="accent" />
                <StoreMetric label="Net worth" value={formatCents(me.netWorthCents)} detail="whole operation" />
                <StoreMetric
                  label="Sold out"
                  value={formatNumber(soldOutShelves)}
                  detail={soldOutShelves === 1 ? 'shelf waiting' : 'shelves waiting'}
                  tone={soldOutShelves > 0 ? 'warn' : 'good'}
                />
                <StoreMetric
                  label="Locked"
                  value={formatNumber(lockedShelves)}
                  detail={lockedShelves === 1 ? 'purchase gate' : 'purchase gates'}
                  tone={lockedShelves > 0 ? 'warn' : 'good'}
                />
              </div>
            </section>

            <section className="se-stores-market">
              <div className="se-stores-market__main">
                <div className="se-stores-sectionhead">
                  <div>
                    <span className="se-eyebrow">Inventory</span>
                    <h2>Shop the shelves</h2>
                  </div>
                  <span className="se-stores-sectionhead__meta">{formatNumber(totalShelves)} listings</span>
                </div>

                <div className={`se-store-items se-stores-shelves${store.key === 'PIP' && catalog.productCounter ? ' se-store-items--pair' : ''}`}>
                  {store.items.map((item) => (
                    <StoreItem
                      key={item.key}
                      // 0.4.0-D: next to the other products, Pip's Product is crack by name.
                      item={store.key === 'PIP' && catalog.productCounter && item.key === 'CRACK' ? { ...item, name: 'Crack' } : item}
                      store={store.key}
                      storeName={store.name}
                      keeper={store.keeper}
                      owned={me.resources[item.field]}
                      cashCents={me.resources.cashCents}
                      bulkHelpers={catalog.bulkHelpers}
                      blocked={counterBlock}
                      onTrade={(order) => execute({ kind: 'trade', order })}
                      onSpecialOrder={(sourceStore, sourceItem) => execute({ kind: 'specialOrder', store: sourceStore, item: sourceItem })}
                      onAddToBasket={onAddToBasket}
                      onRestock={() => setReload((n) => n + 1)}
                    />
                  ))}
                  {pipProducts.map((product) => (
                    <ProductCounter
                      key={product.key}
                      product={product}
                      cashCents={me.resources.cashCents}
                      bulkHelpers={catalog.bulkHelpers}
                      blocked={counterBlock}
                      onDone={loadProducts}
                    />
                  ))}
                </div>
              </div>

              <aside className="se-stores-market__rail">
                <div className="se-stores-railcard se-store-basket">
                  <div className="se-store-basket__head">
                    <div>
                      <span className="se-eyebrow">Order basket</span>
                      <h2>Checkout</h2>
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
                      <Button
                        type="button"
                        className="se-btn se-btn--primary se-btn--block"
                        disabledReason={basketDisabled}
                        onClick={() => void execute({
                          kind: 'checkout',
                          lines: basket.map(({ store, item, direction, quantity }) => ({ store, item, direction, quantity })),
                        })}
                      >
                        Checkout basket
                      </Button>
                    </>
                  )}
                </div>

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
                    <span className="se-eyebrow">Garage notes</span>
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
      </div>
    </GameLayout>
  );
}

export function StorePage() {
  const { slug = 'corner' } = useParams();
  // The store counter itself remounts on each tab so its per-shelf form state
  // starts clean. The basket lives one level higher so it follows the player
  // between Corner, Tommy, Charlie, and Pip until checkout or an explicit clear.
  const [basket, setBasket] = useState<BasketLine[]>([]);

  function addToBasket(line: BasketLine) {
    setBasket((current) => {
      const existing = current.find((entry) => entry.key === line.key);
      if (!existing) return [...current, line];
      return current.map((entry) => entry.key === line.key
        ? { ...entry, quantity: entry.quantity + line.quantity }
        : entry);
    });
  }

  function removeFromBasket(key: string) {
    setBasket((current) => current.filter((line) => line.key !== key));
  }

  return (
    <StoreView
      key={slug}
      slug={slug}
      basket={basket}
      onAddToBasket={addToBasket}
      onRemoveFromBasket={removeFromBasket}
      onClearBasket={() => setBasket([])}
    />
  );
}
