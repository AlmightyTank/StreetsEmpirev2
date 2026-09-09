import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { formatCents, formatNumber, type StoreItemDto, type StoreRestockDto, type StoresDto, type StoreTradeInput, type StoreTradeResult, type WeaponUnlockInput, type WeaponUnlockResult } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { storesApi } from '../api/stores.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import { QuantitySteps } from '../components/QuantitySteps.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { formatDuration } from '../utils/time.js';
import { browserSessionStorage, clearPendingAction, loadPendingAction, savePendingAction } from '../utils/pendingAction.js';

type Order = Omit<StoreTradeInput, 'actionId'>;
type StoreCommand = { kind: 'trade'; order: Order } | { kind: 'unlock'; weapon: WeaponUnlockInput['weapon'] };
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

  return (
    <p className={`se-hint${restock.stock === 0 ? ' se-warn' : ''}`}>
      {keeper} has <strong className="se-num">{formatNumber(restock.stock)}</strong> of{' '}
      <strong className="se-num">{formatNumber(restock.cap)}</strong>.{' '}
      {full
        ? `Fully stocked — ${restockDelivery(restock)}.`
        : restock.stock === 0
          ? `Out of ${name} — next delivery in ${formatDuration(msRemaining)}.`
          : `Next delivery in ${formatDuration(msRemaining)}, then ${restockDelivery(restock)}.`}
    </p>
  );
}

function StoreItem({ item, store, keeper, owned, cashCents, crack, bulkHelpers, disabled, onTrade, onUnlock, onRestock }: {
  item: StoreItemDto; store: string; keeper: string; owned: number; cashCents: number;
  crack: number;
  bulkHelpers: number[]; disabled: boolean; onTrade: (order: Order) => Promise<void>;
  onUnlock: (weapon: WeaponUnlockInput['weapon']) => Promise<void>;
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
  const valid = typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= max;
  const total = valid && unitCents !== null ? quantity * unitCents : null;
  const quantityId = `quantity-${item.key}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || purchaseLocked || !valid || typeof quantity !== 'number') return;
    await onTrade({ store, item: item.key, quantity, direction });
  }

  return (
    <Panel title={`${locked ? 'Locked · ' : ''}${item.name}`}>
      <div className="se-store-prices">
        <span>Own <strong className="se-num">{formatNumber(owned)}</strong></span>
        <span>Buy <strong className="se-num">{formatCents(item.buyCents)}</strong></span>
        <span>{item.sellCents === null ? 'No buyback' : <>Sell <strong className="se-num">{formatCents(item.sellCents)}</strong></>}</span>
      </div>
      {item.restock ? (
        <RestockLine restock={item.restock} name={item.name} keeper={keeper} onArrival={onRestock} />
      ) : null}
      {favor ? (
        favor.unlocked ? <p className="se-hint se-good">Purchasing access earned for this round.</p> : (
          <div className="se-store-favor">
            <h3 className="se-store-favor__title">{favor.title}</h3>
            <p className="se-hint">{favor.description}</p>
            <div className="se-rows">
              <Row label="Street-work turns" value={`${formatNumber(favor.workTurns)} / ${formatNumber(favor.workTurnsRequired)}`} />
              <Row label="Thugs needed" value={`${formatNumber(favor.thugs)} / ${formatNumber(favor.thugsRequired)}`} />
              {favor.prerequisiteName ? <Row label={`${favor.prerequisiteName} access`} value={favor.prerequisiteMet ? 'Earned' : 'Required'} /> : null}
            </div>
            <p className="se-hint">Earlier work counts. Any district builds reputation.</p>
            {favor.crackCost > 0 ? <p className="se-hint">Favor: deliver {formatNumber(favor.crackCost)} crack. On hand: {formatNumber(crack)}.</p> : null}
            {favor.cashCostCents > 0 ? <p className="se-hint">Favor: fund {formatCents(favor.cashCostCents)}. On hand: {formatCents(cashCents)}.</p> : null}
            <button type="button" className="se-btn se-btn--block"
              disabled={disabled || !favor.canComplete} onClick={() => void onUnlock(favor.key)}>
              {favor.crackCost > 0 ? `Deliver ${formatNumber(favor.crackCost)} crack` : `Fund ${formatCents(favor.cashCostCents)}`} · Unlock {item.name}
            </button>
            <p className="se-hint">
              {!favor.reputationMet ? 'Meet the reputation and crew requirements to open this favor. ' : !favor.canComplete ? 'Bring the supplies or cash to complete this favor. ' : ''}
              Access lasts for the round. Weapons are purchased separately.
            </p>
          </div>
        )
      ) : null}
      {!locked || owned > 0 ? <form onSubmit={submit}>
        <div className="se-store-order">
          <div>
            <label className="se-label" htmlFor={`direction-${item.key}`}>Trade</label>
            <select id={`direction-${item.key}`} className="se-input" value={direction} disabled={disabled}
              onChange={(e) => setDirection(e.target.value as 'buy' | 'sell')}>
              <option value="buy">Buy</option>
              {item.sellCents !== null ? <option value="sell">Sell</option> : null}
            </select>
          </div>
          <div>
            <label className="se-label" htmlFor={quantityId}>Quantity</label>
            <input id={quantityId} className="se-input" type="number" inputMode="numeric"
              min={1} max={max} step={1} value={quantity} disabled={disabled || purchaseLocked}
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
            disabled={disabled || purchaseLocked}
          />
        </div>
        <p id={`${quantityId}-hint`} className="se-hint">
          {purchaseLocked ? 'Complete the favor above to unlock purchases.' : soldOut ? (
            `Sold out. ${keeper} has none to sell you right now.`
          ) : <>
            {buying ? 'Can buy' : 'Can sell'} {formatNumber(max)}.
            {buying && item.restock && max === item.restock.stock && max > 0
              ? ' That is the whole shelf.' : ''}
            {quantity !== '' && !valid ? ' Enter a whole quantity within that limit.' : ''}
          </>}
        </p>
        <button className="se-btn se-btn--primary se-btn--block" disabled={disabled || purchaseLocked || !valid || total === null}>
          {purchaseLocked ? `Unlock ${item.name} above to buy` : `${buying ? 'Buy' : 'Sell'} ${item.name}${total !== null ? ` · ${formatCents(total)}` : ''}`}
        </button>
      </form> : null}
    </Panel>
  );
}

function StoreView({ slug }: { slug: string }) {
  const me = useSession((s) => s.me);
  const action = useGameAction<StoreTradeResult | WeaponUnlockResult>();
  const [catalog, setCatalog] = useState<StoresDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [retryOrder, setRetryOrder] = useState<PendingStoreCommand | null>(null);
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
      if (active) { setCatalog(data); setLoadError(null); }
    }).catch(() => {
      if (active) setLoadError('Could not load store prices. Try again.');
    });
    return () => { active = false; };
  }, [me?.resources, reload]);

  async function execute(command: StoreCommand, recoveredActionId?: string) {
    await action.run(async (actionId) => {
      try {
        const result = command.kind === 'trade'
          ? await storesApi.trade({ ...command.order, actionId })
          : await storesApi.unlock({ weapon: command.weapon, actionId });
        clearPendingAction(pendingStorage, pendingKey);
        setRetryOrder(null);
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
  const receipt = action.result && 'direction' in action.result.result ? action.result.result : null;
  const unlockReceipt = action.result && 'favorTitle' in action.result.result ? action.result.result : null;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">{store?.name ?? 'Store'}</h1>
          <p className="se-eyebrow">{store?.blurb ?? 'Stock up for the next shift'}</p>
        </div>
      </div>
      {loadError ? <Alert>{loadError} <button className="se-btn se-btn--sm" onClick={() => setReload((n) => n + 1)}>Retry loading</button></Alert> : null}
      {action.error ? <Alert>{action.error}</Alert> : null}
      {retryOrder ? <Alert tone="info">
        The last transaction could not be confirmed. Retry it to check the result safely.
        {' '}<button className="se-btn se-btn--sm" disabled={action.busy} onClick={() => void execute(retryOrder.command, retryOrder.actionId)}>Retry transaction</button>
      </Alert> : null}
      {!catalog && !loadError ? <p className="se-muted" role="status">Loading the shelves...</p> : null}
      {catalog && !store ? <Alert>That store is not open. <Link to="/game/stores/corner">Visit the Corner Store</Link>.</Alert> : null}

      {action.result && receipt ? (
        <div className="se-store-receipt" aria-live="polite">
          <ActionResult title={receipt.direction === 'buy' ? 'Purchase complete' : 'Sale complete'}
            subtitle={receipt.storeName} result={action.result} onDismiss={action.clear}
            lines={[
              { label: receipt.itemName, delta: receipt.quantityChange, remaining: action.result.after.resources[receipt.field] },
              { label: 'Price each', value: formatCents(receipt.unitCents) },
              { label: receipt.direction === 'buy' ? 'Paid' : 'Received', delta: receipt.cashChangeCents, money: true },
              { label: 'Turns used', value: '0' },
            ]} />
        </div>
      ) : null}

      {action.result && unlockReceipt ? (
        <div className="se-store-receipt" aria-live="polite">
          <ActionResult title={`${unlockReceipt.weaponName} unlocked`} subtitle={unlockReceipt.favorTitle}
            result={action.result} onDismiss={action.clear} lines={[
              { label: 'Access', value: 'Purchases unlocked for this round' },
              ...(unlockReceipt.cashSpentCents > 0 ? [{ label: 'Shipment funded', delta: -unlockReceipt.cashSpentCents, money: true, remaining: action.result.after.cashCents }] : []),
              ...(unlockReceipt.crackDelivered > 0 ? [{ label: 'Crack delivered', delta: -unlockReceipt.crackDelivered, remaining: action.result.after.resources.crack }] : []),
              { label: 'Turns used', value: '0' },
            ]} />
        </div>
      ) : null}

      {store && catalog ? (
        <div className="se-grid se-grid--sidebar">
          <div className="se-store-items">
            {store.items.map((item) => <StoreItem key={item.key} item={item} store={store.key} keeper={store.keeper}
              owned={me.resources[item.field]} cashCents={me.resources.cashCents}
              crack={me.resources.crack}
              bulkHelpers={catalog.bulkHelpers} disabled={action.busy || retryOrder !== null || loadError !== null}
              onTrade={(order) => execute({ kind: 'trade', order })}
              onUnlock={(weapon) => execute({ kind: 'unlock', weapon })}
              onRestock={() => setReload((n) => n + 1)} />)}
          </div>
          <aside>
            <Panel title="On hand" flush>
              <div className="se-rows">
                <Row label="Cash" value={formatCents(me.resources.cashCents)} strong />
                <Row label="Net worth" value={formatCents(me.netWorthCents)} />
                <Row label="Whore happiness" value={`${me.happiness.whore}%`} />
                <Row label="Thug happiness" value={`${me.happiness.thug}%`} />
              </div>
            </Panel>
            <p className="se-hint">Shopping costs no turns. Prices are per item; the full total appears before you trade.</p>
            {store.key === 'CORNER' ? <p className="se-hint">Condoms and beer keep street work supplied. Restocking lifts happiness immediately.</p> : null}
            {store.key === 'TOMMY' ? <p className="se-hint">Thugs protect the crew. Keeping a gun and beer for each thug helps their happiness. Combat arrives in a later milestone.</p> : null}
            {store.key === 'TOMMY' ? <p className="se-hint">Everything here comes in on Tommy&rsquo;s schedule. Pistols arrive by the crate because your thugs each need one; muscle and the heavier guns come a few at a time, and the better the gun the longer the wait.</p> : null}
            {store.key === 'TOMMY' ? <p className="se-hint">Pistols and shotguns are open to everyone. Work the streets to earn Tommy’s trust, then complete his favors for Tek-9 and AK-47 access. Earned access stays yours even if cash or crew drops.</p> : null}
            {store.key === 'CHARLIE' ? <p className="se-hint">Each Low-Rider will carry {formatNumber(catalog.lowRiderThugCapacity)} thugs when travel and combat arrive. For now, vehicles add to net worth and can be resold &mdash; at a loss, so a fleet is worth building only if you mean to use it.</p> : null}
            {store.key === 'CHARLIE' ? <p className="se-hint">Charlie builds them one at a time, so a fleet comes together over days rather than in one visit.</p> : null}
          </aside>
        </div>
      ) : null}
    </GameLayout>
  );
}

export function StorePage() {
  const { slug = 'corner' } = useParams();
  return <StoreView key={slug} slug={slug} />;
}
