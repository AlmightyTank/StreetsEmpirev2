import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { formatCents, formatNumber, type StoreItemDto, type StoresDto, type StoreTradeInput, type StoreTradeResult, type WeaponUnlockInput, type WeaponUnlockResult } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { storesApi } from '../api/stores.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

type Order = Omit<StoreTradeInput, 'actionId'>;
type StoreCommand = { kind: 'trade'; order: Order } | { kind: 'unlock'; weapon: WeaponUnlockInput['weapon'] };

function StoreItem({ item, store, owned, cashCents, crack, bulkHelpers, disabled, onTrade, onUnlock }: {
  item: StoreItemDto; store: string; owned: number; cashCents: number;
  crack: number;
  bulkHelpers: number[]; disabled: boolean; onTrade: (order: Order) => Promise<void>;
  onUnlock: (weapon: WeaponUnlockInput['weapon']) => Promise<void>;
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
      <form onSubmit={submit}>
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
          {bulkHelpers.map((amount) => (
            <button key={amount} type="button" className="se-btn se-btn--sm" disabled={disabled || amount > max}
              onClick={() => setQuantity(amount)}>{formatNumber(amount)}</button>
          ))}
          <button type="button" className="se-btn se-btn--sm" disabled={disabled || max < 1}
            onClick={() => setQuantity(max)}>Max</button>
        </div>
        <p id={`${quantityId}-hint`} className="se-hint">
          {purchaseLocked ? 'Complete the favor above to unlock purchases.' : <>
            {buying ? 'Can buy' : 'Can sell'} {formatNumber(max)}.
            {quantity !== '' && !valid ? ' Enter a whole quantity within that limit.' : ''}
          </>}
        </p>
        <button className="se-btn se-btn--primary se-btn--block" disabled={disabled || purchaseLocked || !valid || total === null}>
          {purchaseLocked ? `Unlock ${item.name} above to buy` : `${buying ? 'Buy' : 'Sell'} ${item.name}${total !== null ? ` · ${formatCents(total)}` : ''}`}
        </button>
      </form>
    </Panel>
  );
}

function StoreView({ slug }: { slug: string }) {
  const me = useSession((s) => s.me);
  const action = useGameAction<StoreTradeResult | WeaponUnlockResult>();
  const [catalog, setCatalog] = useState<StoresDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [retryOrder, setRetryOrder] = useState<StoreCommand | null>(null);

  useEffect(() => {
    let active = true;
    storesApi.catalog().then((data) => {
      if (active) { setCatalog(data); setLoadError(null); }
    }).catch(() => {
      if (active) setLoadError('Could not load store prices. Try again.');
    });
    return () => { active = false; };
  }, [me?.resources, reload]);

  async function execute(command: StoreCommand) {
    await action.run(async (actionId) => {
      try {
        const result = command.kind === 'trade'
          ? await storesApi.trade({ ...command.order, actionId })
          : await storesApi.unlock({ weapon: command.weapon, actionId });
        setRetryOrder(null);
        return result;
      } catch (error) {
        // An uncertain response must retry the same order with the same id.
        setRetryOrder(error instanceof ApiError && error.status > 0 && error.status < 500 ? null : command);
        throw error;
      }
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
        {' '}<button className="se-btn se-btn--sm" disabled={action.busy} onClick={() => void execute(retryOrder)}>Retry transaction</button>
      </Alert> : null}
      {!catalog && !loadError ? <p className="se-muted" role="status">Loading the shelves...</p> : null}
      {catalog && !store ? <Alert>That store is not open. <Link to="/game/stores/corner">Visit the Corner Store</Link>.</Alert> : null}

      {action.result && receipt ? (
        <div className="se-store-receipt" aria-live="polite">
          <ActionResult title={receipt.direction === 'buy' ? 'Purchase complete' : 'Sale complete'}
            subtitle={receipt.storeName} result={action.result} onDismiss={action.clear}
            lines={[
              { label: receipt.itemName, delta: receipt.quantityChange },
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
              ...(unlockReceipt.cashSpentCents > 0 ? [{ label: 'Shipment funded', delta: -unlockReceipt.cashSpentCents, money: true }] : []),
              ...(unlockReceipt.crackDelivered > 0 ? [{ label: 'Crack delivered', delta: -unlockReceipt.crackDelivered }] : []),
              { label: 'Turns used', value: '0' },
            ]} />
        </div>
      ) : null}

      {store && catalog ? (
        <div className="se-grid se-grid--sidebar">
          <div className="se-store-items">
            {store.items.map((item) => <StoreItem key={item.key} item={item} store={store.key}
              owned={me.resources[item.field]} cashCents={me.resources.cashCents}
              crack={me.resources.crack}
              bulkHelpers={catalog.bulkHelpers} disabled={action.busy || retryOrder !== null || loadError !== null}
              onTrade={(order) => execute({ kind: 'trade', order })}
              onUnlock={(weapon) => execute({ kind: 'unlock', weapon })} />)}
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
            {store.key === 'CORNER' ? <p className="se-hint">Condoms and beer keep street work supplied. Restocking improves supply happiness; existing wear still needs rest or a well-supplied, well-paid shift.</p> : null}
            {store.key === 'TOMMY' ? <p className="se-hint">Thugs protect the crew. Keeping a gun and beer for each thug helps their happiness. Combat arrives in a later milestone.</p> : null}
            {store.key === 'TOMMY' ? <p className="se-hint">Pistols and shotguns are open to everyone. Work the streets to earn Tommy’s trust, then complete his favors for Tek-9 and AK-47 access. Earned access stays yours even if cash or crew drops.</p> : null}
            {store.key === 'CHARLIE' ? <p className="se-hint">Each Low-Rider will carry {formatNumber(catalog.lowRiderThugCapacity)} thugs when travel and combat arrive. For now, vehicles add to net worth and can be resold.</p> : null}
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
