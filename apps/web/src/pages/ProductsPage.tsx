import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { GameActionResult, ProductStockDto, ProductsDto, ProductTradeResult } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { QuantitySteps } from '../components/QuantitySteps.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { formatDuration } from '../utils/time.js';

const STEPS = [1, 10, 100, 1000] as const;

function ShelfLine({ pip, name, onArrival }: { pip: NonNullable<ProductStockDto['pip']>; name: string; onArrival: () => void }) {
  const { msRemaining } = useCountdown(pip.nextAt, onArrival);
  const delivery = `${formatNumber(pip.perInterval)} every ${pip.intervalMinutes >= 60 ? `${pip.intervalMinutes / 60} hours` : `${pip.intervalMinutes} minutes`}`;
  return (
    <p className={`se-hint${pip.stock === 0 ? ' se-warn' : ''}`}>
      Pip has <strong className="se-num">{formatNumber(pip.stock)}</strong> of <strong className="se-num">{formatNumber(pip.cap)}</strong>.{' '}
      {pip.stock >= pip.cap
        ? `Fully stocked, ${delivery}.`
        : pip.stock === 0
          ? `Out of ${name}, next delivery in ${formatDuration(msRemaining)}.`
          : `Next delivery in ${formatDuration(msRemaining)}, then ${delivery}.`}
    </p>
  );
}

/** 0.4.0-D. One product at Pip's counter: price, shelf, and a buy or sell order. */
function ProductCounter({ product, cashCents, onDone }: { product: ProductStockDto; cashCents: number; onDone: () => void }) {
  const trade = useGameAction<ProductTradeResult>();
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState<number | ''>(10);
  const pip = product.pip!;
  const buying = direction === 'buy';
  const unit = buying ? pip.buyCents : pip.sellCents;
  const max = buying ? Math.min(pip.maxBuy, Math.floor(cashCents / Math.max(1, pip.buyCents))) : product.quantity;
  const valid = typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= max;
  const block = trade.busy
    ? 'Pip is counting it out.'
    : max < 1
      ? buying ? (pip.stock === 0 ? `Pip is out of ${product.name}.` : `You cannot afford ${product.name} at ${formatCents(pip.buyCents)}.`) : `You have no ${product.name} to sell.`
      : !valid ? `Enter a whole number from 1 to ${formatNumber(max)}.` : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (block || typeof quantity !== 'number') return;
    await trade.run((actionId): Promise<GameActionResult<ProductTradeResult>> => api.post('/game/products/trade', { product: product.key, direction, quantity, actionId }));
    onDone();
  }

  const id = `product-${product.key}`;
  return (
    <form onSubmit={submit} className="se-mt">
      <ShelfLine pip={pip} name={product.name} onArrival={onDone} />
      <div className="se-store-order">
        <div>
          <label className="se-label" htmlFor={`${id}-direction`}>Trade</label>
          <select id={`${id}-direction`} className="se-input" value={direction} onChange={(event) => setDirection(event.target.value as 'buy' | 'sell')}>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>
        <div>
          <label className="se-label" htmlFor={`${id}-quantity`}>Quantity</label>
          <input id={`${id}-quantity`} className="se-input" type="number" inputMode="numeric" min={1} max={max} step={1} value={quantity}
            onChange={(event) => setQuantity(event.target.value === '' ? '' : Number(event.target.value))} />
        </div>
      </div>
      <div className="se-spend__row">
        <QuantitySteps value={quantity} onChange={setQuantity} max={max} steps={STEPS} disabledReason={trade.busy ? 'Pip is counting it out.' : null}
          emptyReason={buying ? `Nothing you can buy right now.` : `You have no ${product.name} to sell.`} />
      </div>
      <Button className="se-btn se-btn--primary se-btn--block" disabledReason={block}>
        {buying ? 'Buy' : 'Sell'} {product.name}{valid && typeof quantity === 'number' ? ` · ${formatCents(quantity * unit)}` : ''}
      </Button>
      {trade.error ? <Alert>{trade.error}</Alert> : null}
      {trade.result ? (
        <p className="se-hint se-good">
          {trade.result.result.direction === 'buy' ? 'Bought' : 'Sold'} {formatNumber(trade.result.result.quantity)} {trade.result.result.productName} for{' '}
          {formatCents(trade.result.result.totalCents)}. You hold {formatNumber(trade.result.result.quantityAfter)}.
        </p>
      ) : null}
    </form>
  );
}

/**
 * 0.4.0-A lists the stash. 0.4.0-D makes it Pip's counter for every product but
 * crack, with what each is worth and what Produce Product can cook.
 */
export function ProductsPage() {
  const me = useSession((s) => s.me);
  const [data, setData] = useState<ProductsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<ProductsDto>('/game/products').then(setData).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load your products.');
    });
  }, []);
  useEffect(load, [load, me?.resources.crack]);

  const cashCents = me?.resources.cashCents ?? 0;
  const stashCents = data?.products.reduce((sum, product) => sum + product.quantity * (product.netWorthCents ?? 0), 0) ?? 0;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Products</h1>
          <p className="se-eyebrow">{data?.economy ? 'What you hold, what it is worth, and Pip’s counter' : 'What you are holding'}</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {!data && !error ? <Panel title="Loading"><p className="se-muted">Counting the stash...</p></Panel> : null}

      {data && !data.enabled ? (
        <Panel title="One product this round">
          <p className="se-muted">This round runs on a single Product. Separate products arrive with the 0.4.0 rulesets.</p>
        </Panel>
      ) : null}

      {data?.enabled && !data.economy ? (
        <Alert tone="info">
          Pip only deals Product this round, and Produce Product only cooks it. Other products come from admin grants; set what
          each job burns on Scout and Produce.
        </Alert>
      ) : null}

      {data?.economy ? (
        <Alert tone="info">
          Your stash is worth {formatCents(stashCents)} toward net worth. Crack is still Pip&rsquo;s Product at{' '}
          <Link to="/game/stores/pip">his store</Link>. Raids and drug runs take a share of everything you hold, so a big stash is a target.
        </Alert>
      ) : null}

      {data?.enabled ? (
        <div className="se-grid se-grid--2">
          {data.products.map((product) => (
            <Panel key={product.key} title={product.name} aside={`${formatNumber(product.quantity)} held`}>
              <p className="se-dim">{product.blurb}</p>
              {data.economy ? (
                <div className="se-store-prices">
                  <span>Worth <strong className="se-num">{formatCents(product.netWorthCents ?? 0)}</strong></span>
                  {product.pip ? <span>Buy <strong className="se-num">{formatCents(product.pip.buyCents)}</strong></span> : null}
                  {product.pip ? <span>Sell <strong className="se-num">{formatCents(product.pip.sellCents)}</strong></span> : null}
                </div>
              ) : null}
              {product.recipe ? (
                <p className="se-hint">
                  Cookable: {product.recipe.perThugPerTurn} a thug a turn for {formatCents(product.recipe.ingredientCentsPerUnit)} in ingredients each
                  {product.recipe.heatPerUnit > 0 ? `, and it draws Heat` : ''}. <Link to="/game/produce">Produce Product</Link>
                </p>
              ) : data.economy && product.key !== 'CRACK' ? <p className="se-hint">Cannot be cooked. Buy it or take it.</p> : null}
              {product.pip ? <ProductCounter product={product} cashCents={cashCents} onDone={load} /> : null}
            </Panel>
          ))}
        </div>
      ) : null}
    </GameLayout>
  );
}
