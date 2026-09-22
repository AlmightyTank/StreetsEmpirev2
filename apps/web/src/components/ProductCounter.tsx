import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { GameActionResult, ProductStockDto, ProductTradeResult } from '@streets/shared';
import { formatCents, formatCentsExact, formatNumber } from '@streets/shared';
import { api } from '../api/client.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { formatDuration } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';
import { QuantitySteps } from './QuantitySteps.js';

/** "30 minutes", "hour", "2 hours". */
function waitText(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? 'hour' : `${hours} hours`;
}

/** $10 like every other shelf, $2.40 only where the cents matter. */
const price = (cents: number) => (cents % 100 === 0 ? formatCents(cents) : formatCentsExact(cents));

function ShelfLine({ pip, name, onArrival }: { pip: NonNullable<ProductStockDto['pip']>; name: string; onArrival: () => void }) {
  const { msRemaining } = useCountdown(pip.nextAt, onArrival);
  const cadence = waitText(pip.intervalMinutes);
  const delivery = pip.perInterval >= pip.cap
    ? `the shelf restocks in full every ${cadence}`
    : pip.perInterval === 1
      ? `one more every ${cadence}`
      : `another ${formatNumber(pip.perInterval)} every ${cadence}`;
  return (
    <p className={`se-hint${pip.stock === 0 ? ' se-warn' : ''}`}>
      Pip has <strong className="se-num">{formatNumber(pip.stock)}</strong> of <strong className="se-num">{formatNumber(pip.cap)}</strong>.{' '}
      {pip.stock >= pip.cap
        ? `Fully stocked — ${delivery}.`
        : pip.stock === 0
          ? `Out of ${name} — next delivery in ${formatDuration(msRemaining)}.`
          : `Next delivery in ${formatDuration(msRemaining)}, then ${delivery}.`}
    </p>
  );
}

/**
 * 0.4.0-D. One product at Pip's counter, laid out like every other shelf item:
 * what you own and his prices, his shelf, then a buy or sell order.
 */
export function ProductCounter({ product, cashCents, bulkHelpers, blocked, onDone }: {
  product: ProductStockDto; cashCents: number; bulkHelpers: number[];
  /** Why the whole counter is off, or null when it is open. */
  blocked: string | null;
  onDone: () => void;
}) {
  const trade = useGameAction<ProductTradeResult>();
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState<number | ''>(1);
  const pip = product.pip!;
  const buying = direction === 'buy';
  const purchaseLocked = buying && !pip.purchaseUnlocked;
  const unit = buying ? pip.buyCents : pip.sellCents;
  const max = buying
    ? purchaseLocked ? 0 : Math.min(pip.maxBuy, Math.floor(cashCents / Math.max(1, pip.buyCents)))
    : product.quantity;
  const valid = typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= max;
  const emptyReason = buying
    ? pip.stock === 0 ? `Pip is out of ${product.name} until the next delivery.` : `You cannot afford a single ${product.name} at ${price(pip.buyCents)}.`
    : `You have no ${product.name} to sell.`;
  const block = blocked
    ?? (trade.busy
      ? 'Pip is counting it out.'
      : purchaseLocked
        ? `Complete the required job to unlock ${pip.unlockName ?? product.name} purchases.`
        : max < 1
          ? emptyReason
          : !valid
            ? `Enter a whole number from 1 to ${formatNumber(max)}.`
            : null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (block || purchaseLocked || typeof quantity !== 'number') return;
    await trade.run((actionId): Promise<GameActionResult<ProductTradeResult>> => api.post('/game/products/trade', { product: product.key, direction, quantity, actionId }));
    onDone();
  }

  const id = `product-${product.key}`;
  return (
    <Panel title={product.name}>
      {pip.favorDiscountPercent ? (
        <p className="se-hint"><strong>Pip's Connection:</strong> {formatNumber(pip.favorDiscountPercent)}% buy discount active.</p>
      ) : null}
      <div className="se-store-prices">
        <span>Own <strong className="se-num">{formatNumber(product.quantity)}</strong></span>
        <span>Buy <strong className="se-num">{price(pip.buyCents)}</strong></span>
        <span>Sell <strong className="se-num">{price(pip.sellCents)}</strong></span>
      </div>
      <p className="se-hint">{product.blurb}</p>
      {!pip.purchaseUnlocked ? (
        <div className="se-store-favor">
          <h3 className="se-store-favor__title">Purchase access locked</h3>
          <p className="se-hint">
            {pip.unlockDescription ?? `Pip has not opened ${product.name} purchases to you yet.`}
            {' '}Earn it through <Link to="/game/quests">underworld jobs</Link>. You can still sell stock you already own.
          </p>
        </div>
      ) : null}
      <ShelfLine pip={pip} name={product.name} onArrival={onDone} />
      <form onSubmit={submit}>
        <div className="se-store-order">
          <div>
            <label className="se-label" htmlFor={`${id}-direction`}>Trade</label>
            <select id={`${id}-direction`} className="se-input" value={direction} disabled={blocked !== null}
              onChange={(event) => setDirection(event.target.value as 'buy' | 'sell')}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div>
            <label className="se-label" htmlFor={`${id}-quantity`}>Quantity</label>
            <input id={`${id}-quantity`} className="se-input" type="number" inputMode="numeric" min={1} max={Math.max(1, max)} step={1} value={quantity}
              disabled={blocked !== null || purchaseLocked}
              onChange={(event) => setQuantity(event.target.value === '' ? '' : Number(event.target.value))} />
          </div>
        </div>
        <div className="se-spend__row">
          <QuantitySteps value={quantity} onChange={setQuantity} max={max} steps={bulkHelpers}
            disabled={blocked !== null || purchaseLocked} disabledReason={block} emptyReason={emptyReason} />
        </div>
        <p className="se-hint">
          {purchaseLocked ? 'Purchases are locked until the required job is complete.' : `${buying ? 'Can buy' : 'Can sell'} ${formatNumber(max)}.`}
        </p>
        <Button className="se-btn se-btn--primary se-btn--block" disabledReason={block}>
          {buying ? 'Buy' : 'Sell'} {product.name}{valid && typeof quantity === 'number' ? ` · ${price(quantity * unit)}` : ''}
        </Button>
      </form>
      {trade.error ? <Alert>{trade.error}</Alert> : null}
      {trade.result ? (
        <p className="se-hint se-good">
          {trade.result.result.direction === 'buy' ? 'Bought' : 'Sold'} {formatNumber(trade.result.result.quantity)} {trade.result.result.productName} for{' '}
          {price(trade.result.result.totalCents)}. You hold {formatNumber(trade.result.result.quantityAfter)}.
        </p>
      ) : null}
    </Panel>
  );
}
