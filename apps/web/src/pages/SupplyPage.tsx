import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupplyOrderPlacementResult } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { supplyApi } from '../api/supply.js';
import { ApiError } from '../api/client.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { PickupList, PickupPlanner, PropertiesPanel, StoragePanel } from '../components/SupplyPickupPanels.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import '../styles/supply.css';

const PENDING_ORDER_KEY = 'streets.supply.pending-order.v1';

interface PendingOrderIntent {
  requestKey: string;
  actionId: string | null;
  supplierKey: string;
  productKey: string;
  quantity: number;
}

function readPendingOrder(): PendingOrderIntent | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_ORDER_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const intent = value as Partial<PendingOrderIntent>;
    if (typeof intent.requestKey !== 'string' || typeof intent.supplierKey !== 'string'
      || typeof intent.productKey !== 'string' || !Number.isSafeInteger(intent.quantity)) return null;
    return {
      requestKey: intent.requestKey,
      actionId: typeof intent.actionId === 'string' ? intent.actionId : null,
      supplierKey: intent.supplierKey,
      productKey: intent.productKey,
      quantity: intent.quantity as number,
    };
  } catch {
    return null;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'OPEN': return 'Awaiting pickup';
    case 'PARTIALLY_COLLECTED': return 'Partially collected';
    case 'FULFILLED': return 'Collected';
    case 'CANCELLED': return 'Cancelled';
    default: return status;
  }
}

export function SupplyPage() {
  const [restoredIntent] = useState(readPendingOrder);
  const restoredIntentRef = useRef<PendingOrderIntent | null>(restoredIntent);
  const me = useSession((state) => state.me);
  const action = useGameAction<SupplyOrderPlacementResult>();
  const [data, setData] = useState<Awaited<ReturnType<typeof supplyApi.page>> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [supplierKey, setSupplierKey] = useState(restoredIntentRef.current?.supplierKey ?? '');
  const [productKey, setProductKey] = useState(restoredIntentRef.current?.productKey ?? '');
  const [quantityText, setQuantityText] = useState(String(restoredIntentRef.current?.quantity ?? 100));
  const [uncertainIntent, setUncertainIntent] = useState(Boolean(restoredIntentRef.current));
  const pendingIntent = useRef<PendingOrderIntent | null>(restoredIntentRef.current);

  const load = useCallback(() => {
    let active = true;
    supplyApi.page()
      .then((next) => {
        if (!active) return;
        setData(next);
        setLoadError(null);
        setSupplierKey((current) => next.suppliers.some((supplier) => supplier.key === current) ? current : next.suppliers[0]?.key ?? '');
      })
      .catch((caught: unknown) => {
        if (active) setLoadError(caught instanceof ApiError ? caught.message : 'Could not load supplier offers. Try again.');
      });
    return () => { active = false; };
  }, []);

  useEffect(load, [load, reload, me?.id]);

  const supplier = data?.suppliers.find((row) => row.key === supplierKey) ?? data?.suppliers[0];
  const offer = supplier?.offers.find((row) => row.productKey === productKey) ?? supplier?.offers[0];
  const quantity = Number(quantityText);
  const quoteCents = offer && Number.isSafeInteger(quantity) && quantity > 0 ? quantity * offer.unitCostCents : 0;
  const quantityValid = Boolean(offer && Number.isSafeInteger(quantity) && quantity >= offer.minOrderQuantity && quantity <= offer.maxOrderQuantity && quantity <= offer.availableQuantity);
  const enoughCash = Boolean(me && quoteCents <= me.resources.cashCents);
  const limitReached = Boolean(data && data.openOrderCount >= data.maxOpenOrders);
  const openOrders = data?.orders.filter((order) => order.status === 'OPEN' || order.status === 'PARTIALLY_COLLECTED') ?? [];

  useEffect(() => {
    if (!data || !supplier) return;
    if (!supplier.offers.some((row) => row.productKey === productKey)) setProductKey(supplier.offers[0]?.productKey ?? '');
  }, [data, supplier, productKey]);

  useEffect(() => {
    if (!action.result) return;
    pendingIntent.current = null;
    window.sessionStorage.removeItem(PENDING_ORDER_KEY);
    setUncertainIntent(false);
    setReload((value) => value + 1);
  }, [action.result]);

  function changedOrderForm(update: () => void) {
    if (uncertainIntent || action.busy) return;
    pendingIntent.current = null;
    window.sessionStorage.removeItem(PENDING_ORDER_KEY);
    action.clear();
    update();
  }

  async function placeOrder() {
    if (!supplier || !offer || (!uncertainIntent && (!quantityValid || !enoughCash || limitReached))) return;
    const saved = pendingIntent.current;
    const intent: PendingOrderIntent = saved && saved.supplierKey === supplier.key && saved.productKey === offer.productKey && saved.quantity === quantity
      ? saved
      : { requestKey: newActionId(), actionId: null, supplierKey: supplier.key, productKey: offer.productKey, quantity };
    pendingIntent.current = intent;
    window.sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(intent));
    await action.run(async (actionId) => {
      intent.actionId = actionId;
      window.sessionStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(intent));
      try {
        return await supplyApi.placeOrder({ supplierKey: supplier.key, productKey: offer.productKey, quantity, requestKey: intent.requestKey, actionId });
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.isUncertain) setUncertainIntent(true);
        else {
          pendingIntent.current = null;
          window.sessionStorage.removeItem(PENDING_ORDER_KEY);
          setUncertainIntent(false);
        }
        throw caught;
      }
    }, { actionId: intent.actionId ?? undefined });
  }

  const submitReason = uncertainIntent
    ? null
    : limitReached
    ? `You already have ${data?.maxOpenOrders ?? 0} paid orders waiting for pickup.`
    : !offer || !quantityValid
      ? 'Enter a quantity within the supplier’s order range and available stock.'
      : !enoughCash
        ? 'You do not have enough cash for this prepaid order.'
        : null;
  const recentOrders = useMemo(() => data?.orders ?? [], [data]);

  return (
    <GameLayout>
      <div className="se-supply">
        <header className="se-supply__hero">
          <span className="se-eyebrow">Supply network</span>
          <h1>Bulk Orders</h1>
          <p>{data?.pickups
            ? 'Pay the full quoted price now, then collect the order in vehicle loads. Each pickup is a run to the supplier and back; what makes it home goes into your stash.'
            : 'Pay the full quoted price now. Your order stays at its supplier until you collect it.'}</p>
        </header>

        {loadError ? <Alert>{loadError}</Alert> : null}
        {action.error ? <Alert>{action.error}</Alert> : null}
        {uncertainIntent ? <Alert tone="warning">We could not confirm the result. Retry this same order to check it safely; the form is locked until the result is known.</Alert> : null}
        {data && !data.enabled ? <Alert tone="info">Bulk suppliers are not available in this season.</Alert> : null}

        {action.result ? (
          <ActionResult
            title={action.result.result.replayed ? 'Order already placed' : 'Order placed'}
            subtitle={`${action.result.result.order.productName} · ${action.result.result.order.supplierName} · waiting at ${action.result.result.order.supplierCityName}`}
            result={action.result}
            onDismiss={action.clear}
            lines={[
              { label: 'Paid up front', delta: -action.result.result.chargedCents, money: true, invert: true },
              { label: 'Waiting for pickup', value: formatNumber(action.result.result.order.quantityRemaining) },
            ]}
          />
        ) : null}

        {data?.enabled ? (
          <div className="se-supply__grid">
            <Panel title="Supplier offers" aside={`${formatNumber(data.openOrderCount)} / ${formatNumber(data.maxOpenOrders)} open orders`}>
              {data.suppliers.length === 0 ? <p className="se-muted">No suppliers are open this season.</p> : (
                <div className="se-supply__form">
                  <div className="se-field">
                    <label htmlFor="supply-supplier">Supplier</label>
                    <select id="supply-supplier" className="se-input" value={supplier?.key ?? ''} disabled={uncertainIntent || action.busy} onChange={(event) => changedOrderForm(() => setSupplierKey(event.target.value))}>
                      {data.suppliers.map((row) => <option key={row.key} value={row.key}>{row.name} · {row.cityName}</option>)}
                    </select>
                  </div>
                  <div className="se-field">
                    <label htmlFor="supply-product">Product</label>
                    <select id="supply-product" className="se-input" value={offer?.productKey ?? ''} disabled={uncertainIntent || action.busy || !supplier?.offers.length} onChange={(event) => changedOrderForm(() => setProductKey(event.target.value))}>
                      {supplier?.offers.map((row) => <option key={row.productKey} value={row.productKey}>{row.productName}</option>)}
                    </select>
                  </div>
                  <div className="se-field">
                    <label htmlFor="supply-quantity">Order quantity</label>
                    <input id="supply-quantity" className="se-input" type="number" min={offer?.minOrderQuantity ?? 1} max={Math.min(offer?.maxOrderQuantity ?? 1, offer?.availableQuantity ?? 0)} step={1} value={quantityText} disabled={uncertainIntent || action.busy} onChange={(event) => changedOrderForm(() => setQuantityText(event.target.value))} />
                    <small className="se-muted">{offer ? `${formatNumber(offer.minOrderQuantity)}–${formatNumber(offer.maxOrderQuantity)} per order · ${formatNumber(offer.availableQuantity)} available this round` : 'No offer selected.'}</small>
                  </div>

                  {supplier ? <p className="se-supply__description">{supplier.description}</p> : null}
                  {offer ? (
                    <div className="se-supply__quote">
                      <Row label="Unit price" value={formatCents(offer.unitCostCents)} />
                      <Row label="Full order total" value={formatCents(quoteCents)} strong />
                      <Row label="Cash after order" value={formatCents((me?.resources.cashCents ?? 0) - quoteCents)} />
                      <p>{data.pickups
                        ? 'Payment is final. The product waits at the supplier until you send pickups for it, and lands in your stash, not your carried stock.'
                        : 'Payment is final. The product remains at the supplier and is not added to your carried stock until a later pickup.'}</p>
                    </div>
                  ) : null}
                  <Button className="se-btn se-btn--primary se-btn--block" onClick={() => void placeOrder()} disabled={action.busy || !offer} disabledReason={submitReason}>
                    {action.busy ? 'Placing order…' : uncertainIntent ? 'Retry order check' : 'Pay and place order'}
                  </Button>
                </div>
              )}
            </Panel>

            <Panel title="Orders waiting at suppliers" aside={`${openOrders.length} active`}>
              {openOrders.length === 0 ? <p className="se-muted">No paid orders are waiting for pickup.</p> : (
                <div className="se-supply__orders">
                  {openOrders.map((order) => (
                    <article className="se-supply__order" key={order.id}>
                      <div className="se-supply__order-head">
                        <div><strong>{order.productName}</strong><span>{order.supplierName} · {order.supplierCityName}</span></div>
                        <span className="se-supply__status">{statusLabel(order.status)}</span>
                      </div>
                      <Row label="Ordered" value={formatNumber(order.quantityOrdered)} />
                      {order.quantityCollected > 0 ? <Row label="Collected" value={formatNumber(order.quantityCollected)} /> : null}
                      <Row label="Remaining to collect" value={formatNumber(order.quantityRemaining)} strong />
                      <Row label="Paid" value={formatCents(order.totalPaidCents)} />
                      <small className="se-muted">Placed {new Date(order.createdAt).toLocaleString()}</small>
                    </article>
                  ))}
                </div>
              )}
            </Panel>

            {data.pickups ? (
              <>
                <PickupPlanner plan={data.pickups} orders={data.orders} onDone={() => setReload((value) => value + 1)} />
                <div className="se-supply__stack">
                  <StoragePanel plan={data.pickups} />
                  <PickupList pickups={data.pickups.pickups} />
                </div>
                <PropertiesPanel plan={data.pickups} onDone={() => setReload((value) => value + 1)} />
              </>
            ) : null}

            <Panel title="Recent order history" className="se-supply__history-panel">
              {recentOrders.length === 0 ? <p className="se-muted">Orders you place will appear here.</p> : (
                <div className="se-supply__history">
                  {recentOrders.map((order) => (
                    <div className="se-supply__history-row" key={order.id}>
                      <div><strong>{order.productName} · {formatNumber(order.quantityOrdered)}</strong><span>{order.supplierName} · {order.supplierCityName} · {statusLabel(order.status)}</span></div>
                      <strong>{formatCents(order.totalPaidCents)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        ) : null}
      </div>
    </GameLayout>
  );
}
