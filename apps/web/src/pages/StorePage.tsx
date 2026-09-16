import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { formatCents, formatNumber, type QuestCompleteInput, type QuestCompleteResult, type StoreDto, type StoreItemDto, type StoreRestockDto, type StoresDto, type StoreTradeInput, type StoreTradeResult, type WeaponUnlockInput, type WeaponUnlockResult } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { reputationApi } from '../api/reputation.js';
import { storesApi } from '../api/stores.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { QuantitySteps } from '../components/QuantitySteps.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { formatDuration } from '../utils/time.js';
import { browserSessionStorage, clearPendingAction, loadPendingAction, savePendingAction } from '../utils/pendingAction.js';

type Order = Omit<StoreTradeInput, 'actionId'>;
type StoreCommand =
  | { kind: 'trade'; order: Order }
  | { kind: 'unlock'; weapon: WeaponUnlockInput['weapon'] }
  | { kind: 'quest'; trader: QuestCompleteInput['trader'] };
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

/**
 * The favour this trader is asking for.
 *
 * Rendered in the same block Tommy's weapon favours have always used, and
 * offered where the trader is: you square things with Charlie at Charlie's.
 */
function TraderFavour({ store, blocked, onComplete }: {
  store: StoreDto;
  /** Why nothing on this counter can be pressed, or null when it can. */
  blocked: string | null;
  onComplete: (trader: QuestCompleteInput['trader']) => void;
}) {
  const { quest } = store;

  // A favour that is done is not a job any more. It leaves the counter
  // entirely rather than sitting there as a finished to-do; where you stand
  // with everyone is on The Street, and the shorter wait shows on the shelf.
  if (quest.done) return null;

  return (
    <div className="se-store-favor">
      <h3 className="se-store-favor__title">{quest.title}</h3>
      <p className="se-hint">{quest.description}</p>

      <div className="se-rows">
        <Row label="Progress" value={`${formatNumber(quest.have)} / ${formatNumber(quest.need)}`} strong />
        <Row label="Worth" value={`+${formatNumber(quest.reward)} reputation`} />
      </div>
      {quest.blockedBy ? <p className="se-hint se-bad">{quest.blockedBy}</p> : null}
      <Button type="button" className="se-btn se-btn--block"
        disabledReason={blocked ?? (quest.canComplete ? null : quest.blockedBy
          ?? `You have ${formatNumber(quest.have)} of the ${formatNumber(quest.need)} ${store.keeper} asked for.`)}
        onClick={() => onComplete(store.key as QuestCompleteInput['trader'])}>
        Do {store.keeper} the favour
      </Button>
      <p className="se-hint">
        Standing opens the gun rack and gets you served sooner. Every trader
        counts toward the guns, so this one is worth doing whatever you buy here.
      </p>
    </div>
  );
}

function StoreItem({ item, store, keeper, owned, cashCents, crack, bulkHelpers, blocked, onTrade, onUnlock, onRestock }: {
  item: StoreItemDto; store: string; keeper: string; owned: number; cashCents: number;
  crack: number;
  /** Why the whole shelf is off, or null when it is open for business. */
  bulkHelpers: number[]; blocked: string | null; onTrade: (order: Order) => Promise<void>;
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
  const noneToBuy = soldOut
    ? `${keeper} is sold out of ${item.name} until the next delivery.`
    : `You cannot afford a single ${item.name} at ${formatCents(item.buyCents)}.`;
  const emptyReason = buying ? noneToBuy : `You have no ${item.name} to sell.`;
  const tradeBlock = blocked
    ?? (purchaseLocked
      ? `Do ${keeper} the favour above before buying ${item.name}.`
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
              <Row
                label="Reputation"
                value={`${formatNumber(favor.totalRep)} / ${formatNumber(favor.totalRepRequired)}`}
                strong
              />
              {favor.prerequisiteName ? <Row label={`${favor.prerequisiteName} access`} value={favor.prerequisiteMet ? 'Earned' : 'Required'} /> : null}
            </div>
            <p className="se-hint">
              Standing with every trader in the city counts, not just this one.
            </p>
            <Button type="button" className="se-btn se-btn--block"
              disabledReason={blocked ?? (favor.canComplete ? null : !favor.prerequisiteMet
                ? `Earn ${favor.prerequisiteName} access first.`
                : `You need ${formatNumber(favor.totalRepRequired - favor.totalRep)} more reputation across the city's traders.`)}
              onClick={() => void onUnlock(favor.key)}>
              Unlock {item.name}
            </Button>
            <p className="se-hint">
              {!favor.prerequisiteMet
                ? `Earn ${favor.prerequisiteName} access first. `
                : favor.totalRep < favor.totalRepRequired
                  ? 'Do the traders their favours and keep dealing with them. '
                  : ''}
              Access costs nothing but standing, lasts the round, and never lapses.
              Weapons are purchased separately.
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
            disabledReason={blocked ?? (purchaseLocked ? `Do ${keeper} the favour above before buying ${item.name}.` : null)}
            emptyReason={emptyReason}
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
        <Button className="se-btn se-btn--primary se-btn--block" disabledReason={tradeBlock}>
          {purchaseLocked ? `Unlock ${item.name} above to buy` : `${buying ? 'Buy' : 'Sell'} ${item.name}${total !== null ? ` · ${formatCents(total)}` : ''}`}
        </Button>
      </form> : null}
    </Panel>
  );
}

function StoreView({ slug }: { slug: string }) {
  const me = useSession((s) => s.me);
  const action = useGameAction<StoreTradeResult | WeaponUnlockResult | QuestCompleteResult>();
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
        const result =
          command.kind === 'trade'
            ? await storesApi.trade({ ...command.order, actionId })
            : command.kind === 'unlock'
              ? await storesApi.unlock({ weapon: command.weapon, actionId })
              : await reputationApi.completeQuest({ trader: command.trader, actionId });
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
  // One reason for every control on the counter, so a dead shelf explains itself.
  const counterBlock = action.busy
    ? 'Your last order is still going through.'
    : retryOrder !== null
      ? 'Settle the unconfirmed transaction above first.'
      : loadError !== null
        ? 'Prices could not be loaded, so nothing can be traded yet.'
        : null;
  const receipt = action.result && 'direction' in action.result.result ? action.result.result : null;
  const unlockReceipt =
    action.result && 'weaponName' in action.result.result ? action.result.result : null;
  const favourReceipt =
    action.result && 'traderName' in action.result.result ? action.result.result : null;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">{store?.name ?? 'Store'}</h1>
          <p className="se-eyebrow">{store?.blurb ?? 'Stock up for the next shift'}</p>
        </div>
      </div>
      {loadError ? <Alert>{loadError} <Button className="se-btn se-btn--sm" disabledReason={action.busy ? 'Your last order is still going through.' : null} onClick={() => setReload((n) => n + 1)}>Retry loading</Button></Alert> : null}
      {action.error ? <Alert>{action.error}</Alert> : null}
      {retryOrder ? <Alert tone="info">
        The last transaction could not be confirmed. Retry it to check the result safely.
        {' '}<Button className="se-btn se-btn--sm" disabledReason={action.busy ? 'Checking the last transaction with the server.' : null} onClick={() => void execute(retryOrder.command, retryOrder.actionId)}>Retry transaction</Button>
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
          <ActionResult title={`${unlockReceipt.weaponName} unlocked`} subtitle={unlockReceipt.title}
            result={action.result} onDismiss={action.clear} lines={[
              { label: 'Access', value: 'Purchases unlocked for this round' },
              { label: 'Turns used', value: '0' },
            ]} />
        </div>
      ) : null}

      {favourReceipt ? (
        <div className="se-store-receipt" aria-live="polite">
          <ActionResult title={`${favourReceipt.traderName} owes you one`} subtitle={favourReceipt.title}
            result={action.result!} onDismiss={action.clear} lines={[
              { label: 'Reputation', delta: favourReceipt.reputationGained, remaining: favourReceipt.totalRep },
              ...(favourReceipt.crackDelivered > 0
                ? [{ label: 'Crack delivered', delta: -favourReceipt.crackDelivered, remaining: action.result!.after.resources.crack }]
                : []),
              ...(favourReceipt.lowRidersHandedOver > 0
                ? [{ label: 'Low-Riders handed over', delta: -favourReceipt.lowRidersHandedOver, remaining: action.result!.after.resources.lowRiders }]
                : []),
              ...favourReceipt.unlocked.map((weapon) => ({ label: 'Now on the menu', value: weapon })),
            ]} />
        </div>
      ) : null}

      {store && catalog ? (
        <div className="se-grid se-grid--sidebar">
          <div className="se-store-items">
            <TraderFavour store={store}
              blocked={counterBlock}
              onComplete={(trader) => execute({ kind: 'quest', trader })} />
            {store.items.map((item) => <StoreItem key={item.key} item={item} store={store.key} keeper={store.keeper}
              owned={me.resources[item.field]} cashCents={me.resources.cashCents}
              crack={me.resources.crack}
              bulkHelpers={catalog.bulkHelpers} blocked={counterBlock}
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
            <p className="se-hint">
              {store.keeper} counts you as <b className="se-dim">{store.standing}</b>
              {store.restockSpeedup > 0
                ? <> &mdash; they restock for you <b className="se-num">{store.restockSpeedup}%</b> sooner.</>
                : '.'}
            </p>
            <p className="se-hint">Shopping costs no turns. Prices are per item; the full total appears before you trade.</p>
            {store.key === 'CORNER' ? <p className="se-hint">Condoms and beer keep street work supplied. Restocking lifts happiness immediately.</p> : null}
            {store.key === 'TOMMY' ? <p className="se-hint">Thugs protect the crew and fight in raids or drive-bys. Keeping a gun and beer for each thug helps their happiness.</p> : null}
            {store.key === 'TOMMY' ? <p className="se-hint">Everything here comes in on Tommy&rsquo;s schedule. Pistols arrive by the crate because your thugs each need one; muscle and the heavier guns come a few at a time, and the better the gun the longer the wait.</p> : null}
            {store.key === 'TOMMY' ? <p className="se-hint">Pistols and shotguns are open to everyone. Work the streets to earn Tommy’s trust, then complete his favors for Tek-9 and AK-47 access. Earned access stays yours even if cash or crew drops.</p> : null}
            {store.key === 'CHARLIE' ? <p className="se-hint">Each Low-Rider carries {formatNumber(catalog.lowRiderThugCapacity)} shooters for a drive-by. If everybody in a car goes down, the car is lost; if one thug makes it back, the car comes home too.</p> : null}
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
