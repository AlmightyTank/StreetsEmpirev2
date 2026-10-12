import { useEffect, useState, type FormEvent } from 'react';
import type { AdminSupplyDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AdminRoundPicker, useAdminRound } from '../components/AdminRoundPicker.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

const kindLabel = { PICKUP: 'Pickup', SHIPMENT: 'Shipment', LANE: 'Lane load' } as const;

/**
 * 1.6.0-A. Operator view of the supply lifecycle and its journals. 1.6.0-I adds the
 * reconciliation check, shipments by state, stock by city, crew economics and an audited
 * stock correction.
 */
export function AdminSupplyPage() {
  const { rounds, roundId, setRoundId, error: roundsError } = useAdminRound();
  const [report, setReport] = useState<AdminSupplyDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [place, setPlace] = useState('');
  const [productKey, setProductKey] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setPlace('');
    setNotice(null);
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    let active = true;
    setError(null);
    adminApi.supply(roundId)
      .then((next) => { if (active) setReport(next); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load supply operations.'); });
    return () => { active = false; };
  }, [roundId, version]);

  const emptyRow = (columns: number, label: string) => <tr><td className="se-muted" colSpan={columns}>{label}</td></tr>;

  /** Every warehouse and crew, keyed `WAREHOUSE:id` / `CREW:id`, with what it holds now. */
  const places = report ? [
    ...report.warehouses.map((row) => ({ value: `WAREHOUSE:${row.id}`, label: `${row.player.displayName} · ${row.name} (${row.city})`, playerId: row.player.id, stock: row.stock, locked: null as string | null })),
    ...report.dealerCrews.map((row) => ({ value: `CREW:${row.id}`, label: `${row.player.displayName} · crew in ${row.city}, ${row.district}`, playerId: row.player.id, stock: row.stock, locked: row.productKey })),
  ] : [];
  const chosen = places.find((row) => row.value === place);
  const heldNow = chosen?.stock.find((item) => item.productKey === productKey)?.quantity ?? 0;
  const correctionReady = Boolean(chosen && productKey) && quantity.trim() !== '' && Number.isInteger(Number(quantity)) && Number(quantity) >= 0
    && reason.trim().length >= 3 && Number(quantity) !== heldNow;

  /** Load a place's current count into the form, so a correction starts from what it holds. */
  function pick(nextPlace: string, nextProduct = productKey) {
    const row = places.find((entry) => entry.value === nextPlace);
    const product = row?.locked ?? (nextProduct || row?.stock[0]?.productKey || report?.products[0]?.key || '');
    setPlace(nextPlace);
    setProductKey(product);
    setQuantity(row ? String(row.stock.find((item) => item.productKey === product)?.quantity ?? 0) : '');
  }

  async function correct(event: FormEvent) {
    event.preventDefault();
    if (!chosen) return;
    setFields({});
    setError(null);
    setNotice(null);
    const counted = Number(quantity);
    if (!Number.isInteger(counted) || counted < 0) {
      setFields({ quantity: 'Use a whole number of zero or more.' });
      return;
    }
    const [target, targetId] = chosen.value.split(':') as ['WAREHOUSE' | 'CREW', string];
    setBusy(true);
    try {
      const result = await adminApi.adjustPlayerSupply(chosen.playerId, { target, targetId, productKey, quantity: counted, reason: reason.trim() });
      setReason('');
      const open = result.problems.length;
      setNotice(`Stock set from ${formatNumber(result.before)} to ${formatNumber(result.after)} and saved to the audit log. ${open ? `${open} problem${open === 1 ? '' : 's'} still open for this player.` : 'This player now reconciles.'}`);
      setVersion((value) => value + 1);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields(caught.fields ?? {});
        setError(caught.message);
      } else {
        setError('That stock correction did not go through.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Supply Operations</h1>
          <p className="se-eyebrow">Admin · orders, stock, dealer careers and movement history</p>
        </div>
        <AdminRoundPicker rounds={rounds} roundId={roundId} onChange={setRoundId} />
      </div>
      {roundsError || error ? <Alert>{roundsError ?? error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}
      {report && !report.enabled ? <Alert tone="info">Supply networks are not enabled in this round’s pinned ruleset.</Alert> : null}

      {report ? (
        <>
          <div className="se-stats se-mb">
            <Stat label="Orders" value={formatNumber(report.totals.orders)} />
            <Stat label="Open orders" value={formatNumber(report.totals.openOrders)} />
            <Stat label="Supplier units" value={formatNumber(report.totals.supplierUnitsAvailable)} />
            <Stat label="Warehouse units" value={formatNumber(report.totals.warehouseUnits)} />
            <Stat label="Assigned dealers" value={formatNumber(report.totals.assignedDealers)} />
            <Stat label="Dealer stock" value={formatNumber(report.totals.dealerStockUnits)} />
            <Stat label="Sales gross" value={formatCents(report.totals.salesGrossCents)} />
            <Stat label="Supply cash delta" value={formatCents(report.totals.cashLedgerDeltaCents)} />
            <Stat label="Movement rows" value={formatNumber(report.totals.supplyMovements)} />
          </div>

          <Panel title="Reconciliation" aside={report.problems.length ? `${report.problems.length} problem${report.problems.length === 1 ? '' : 's'}` : 'Clean'} className="se-mb">
            <p className="se-admin-pad se-hint">Every order, pickup, warehouse, crew, sale and supplier, checked against the movement ledger and the cash ledger.</p>
            {report.problems.length ? <ul className="se-admin-list se-admin-pad">{report.problems.map((row, index) => (
              <li key={`${row.code}:${row.subject}:${index}`}>
                <strong className={row.severity === 'ERROR' ? 'se-text-bad' : undefined}>{row.code.toLowerCase().replaceAll('_', ' ')}</strong>
                {' · '}{row.player ?? 'Round'} · {row.subject}: {row.detail}
              </li>
            ))}</ul> : <p className="se-admin-pad se-muted">Everything adds up.</p>}
          </Panel>

          <Panel title="Pickups, shipments and lane loads" aside={report.shipmentStates.map((row) => `${kindLabel[row.kind]} ${row.status.toLowerCase().replaceAll('_', ' ')}: ${formatNumber(row.count)}`).join(' · ') || 'None yet'} flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Player</th><th>Kind</th><th>From → to</th><th>Product</th><th>State</th><th className="se-table__number">Delivered / units</th><th>Due</th></tr></thead>
                <tbody>{report.shipments.length ? report.shipments.map((row) => (
                  <tr key={row.id}>
                    <td className="se-td--title">{row.player.displayName}</td>
                    <td data-label="Kind">{kindLabel[row.kind]} · {row.route}</td>
                    <td data-label="Route">{row.from} → {row.to}</td>
                    <td data-label="Product">{row.product}</td>
                    <td data-label="State">{row.status.toLowerCase().replaceAll('_', ' ')}</td>
                    <td className="se-table__number se-num" data-label="Delivered">{formatNumber(row.delivered)} / {formatNumber(row.quantity)}</td>
                    <td data-label="Due">{row.dueAt ? adminWhen(row.dueAt) : '—'}</td>
                  </tr>
                )) : emptyRow(7, 'Nothing has been picked up, shipped or flown in.')}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Stock by city" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>City</th><th>Product</th><th className="se-table__number">Stored</th><th className="se-table__number">With crews</th><th className="se-table__number">Inbound</th></tr></thead>
                <tbody>{report.stockByCity.length ? report.stockByCity.map((row) => (
                  <tr key={`${row.city}:${row.product}`}>
                    <td className="se-td--title">{row.city}</td>
                    <td data-label="Product">{row.product}</td>
                    <td className="se-table__number se-num" data-label="Stored">{formatNumber(row.stored)}</td>
                    <td className="se-table__number se-num" data-label="With crews">{formatNumber(row.withCrews)}</td>
                    <td className="se-table__number se-num" data-label="Inbound">{formatNumber(row.inbound)}</td>
                  </tr>
                )) : emptyRow(5, 'No stock stored, with crews or on the way.')}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Crew economics" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Player</th><th>Crew</th><th className="se-table__number">Dealers</th><th className="se-table__number">Sold</th><th className="se-table__number">Gross</th><th className="se-table__number">Crew cut</th><th className="se-table__number">Net</th><th className="se-table__number">Wages</th></tr></thead>
                <tbody>{report.dealerEconomics.length ? report.dealerEconomics.map((row) => (
                  <tr key={row.crewId}>
                    <td className="se-td--title">{row.player.displayName}</td>
                    <td data-label="Crew">{row.city} · {row.district} · {row.status.toLowerCase()}</td>
                    <td className="se-table__number se-num" data-label="Dealers">{formatNumber(row.dealers)}</td>
                    <td className="se-table__number se-num" data-label="Sold">{formatNumber(row.unitsSold)}</td>
                    <td className="se-table__number se-num" data-label="Gross">{formatCents(row.grossCents)}</td>
                    <td className="se-table__number se-num" data-label="Crew cut">{formatCents(row.cutCents)}</td>
                    <td className="se-table__number se-num" data-label="Net">{formatCents(row.netCents)}</td>
                    <td className="se-table__number se-num" data-label="Wages">{formatCents(row.wagesCents)}</td>
                  </tr>
                )) : emptyRow(8, 'No dealer crews recorded.')}</tbody>
              </table>
            </div>
          </Panel>

          {places.length ? (
            <Panel title="Correct stock" className="se-mb">
              <p className="se-hint se-mb">Set what a warehouse or crew actually holds. The movement ledger is corrected to match, so the place reconciles afterwards, and both figures go to the audit log. Finished rounds are frozen, and nobody corrects their own player.</p>
              <form onSubmit={correct} noValidate>
                <div className="se-grid se-grid--2">
                  <div className="se-field">
                    <label className="se-label" htmlFor="admin-supply-place">Warehouse or crew</label>
                    <select id="admin-supply-place" className="se-input" value={place} onChange={(event) => pick(event.target.value)}>
                      <option value="">Pick one…</option>
                      {places.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}
                    </select>
                  </div>
                  <div className="se-field">
                    <label className="se-label" htmlFor="admin-supply-product">Product</label>
                    <select id="admin-supply-product" className="se-input" value={productKey} disabled={!chosen || Boolean(chosen.locked)} onChange={(event) => pick(place, event.target.value)}>
                      {report.products.map((row) => <option key={row.key} value={row.key}>{row.name}</option>)}
                    </select>
                    {chosen ? <p className="se-hint">Holds {formatNumber(heldNow)} now.{chosen.locked ? ' A crew holds only what it sells.' : ''}</p> : null}
                  </div>
                  <Field
                    id="admin-supply-quantity"
                    label="Counted units"
                    type="number"
                    min={0}
                    step={1}
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    error={fields.quantity}
                  />
                </div>
                <div className="se-field">
                  <label className="se-label" htmlFor="admin-supply-reason">Reason</label>
                  <textarea id="admin-supply-reason" className="se-input se-admin-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
                  {fields.reason ? <p className="se-error" role="alert">{fields.reason}</p> : <p className="se-hint">Saved to the audit log and the movement ledger. At least 3 characters.</p>}
                </div>
                <Button
                  className="se-btn se-btn--primary"
                  disabledReason={busy ? 'Working…' : !correctionReady ? 'Pick a place and product, change the count, and give a reason of at least 3 characters.' : null}
                >
                  Correct stock
                </Button>
              </form>
            </Panel>
          ) : null}

          <Panel title="Prepaid orders" aside={`${report.totals.orders} total`} flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Player</th><th>Supplier / city</th><th>Product</th><th>State</th><th className="se-table__number">Ordered</th><th className="se-table__number">Collected</th><th className="se-table__number">Paid</th><th>Placed</th></tr></thead>
                <tbody>{report.orders.length ? report.orders.map((row) => (
                  <tr key={row.id}>
                    <td className="se-td--title">{row.player.displayName} <span className="se-muted">#{row.player.publicPimpId}</span></td>
                    <td data-label="Supplier">{row.supplier} · {row.city}</td>
                    <td data-label="Product">{row.product}</td>
                    <td data-label="State">{row.status.toLowerCase().replaceAll('_', ' ')}</td>
                    <td className="se-table__number se-num" data-label="Ordered">{formatNumber(row.quantityOrdered)}</td>
                    <td className="se-table__number se-num" data-label="Collected">{formatNumber(row.quantityCollected)} / {formatNumber(row.quantityRemaining)} remaining</td>
                    <td className="se-table__number se-num" data-label="Paid">{formatCents(row.totalPaidCents)}</td>
                    <td data-label="Placed">{adminWhen(row.placedAt)}</td>
                  </tr>
                )) : emptyRow(8, 'No supply orders in this round.')}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Round supplier stock" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Supplier</th><th>City</th><th>Product</th><th className="se-table__number">Available</th></tr></thead>
                <tbody>{report.supplierStock.length ? report.supplierStock.map((row) => <tr key={`${row.supplier}:${row.product}`}><td>{row.supplier}</td><td data-label="City">{row.city}</td><td data-label="Product">{row.product}</td><td className="se-table__number se-num" data-label="Available">{formatNumber(row.available)}</td></tr>) : emptyRow(4, 'No supplier stock has been reserved yet.')}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Warehouses" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Player</th><th>Warehouse</th><th>City</th><th className="se-table__number">Stock / capacity</th><th>Stock by product</th></tr></thead>
                <tbody>{report.warehouses.length ? report.warehouses.map((row) => <tr key={row.id}><td className="se-td--title">{row.player.displayName}</td><td data-label="Warehouse">{row.name}</td><td data-label="City">{row.city}</td><td className="se-table__number se-num" data-label="Stock / capacity">{formatNumber(row.stockUnits)} / {formatNumber(row.capacity)}</td><td data-label="Products">{row.stock.map((item) => `${item.product}: ${formatNumber(item.quantity)}`).join(' · ') || 'Empty'}</td></tr>) : emptyRow(5, 'No warehouses created.')}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Dealer crews and careers" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Player</th><th>City / district</th><th>Status</th><th>Dealer careers</th><th>Stock</th><th>Sales</th><th className="se-table__number">Gross</th></tr></thead>
                <tbody>{report.dealerCrews.length ? report.dealerCrews.map((row) => <tr key={row.id}><td className="se-td--title">{row.player.displayName}</td><td data-label="Location">{row.city} · {row.district}</td><td data-label="Status">{row.status.toLowerCase()}</td><td data-label="Careers">{row.staff.map((staff) => `${staff.id.slice(0, 8)}: ${formatNumber(staff.experiencePoints)} XP${staff.active ? '' : ' (released)'}`).join(' · ') || 'No staff'}</td><td data-label="Stock">{row.stock.map((item) => `${item.product}: ${formatNumber(item.quantity)}`).join(' · ') || 'Empty'}</td><td data-label="Sales">{formatNumber(row.salesCount)}</td><td className="se-table__number se-num" data-label="Gross">{formatCents(row.grossCents)}</td></tr>) : emptyRow(7, 'No dealer crews recorded.')}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Supply cash ledger" aside={`${report.totals.cashLedgerEntries} entries`} flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Player</th><th>Source</th><th>Details</th><th className="se-table__number">Amount</th><th>When</th></tr></thead>
                <tbody>{report.ledger.length ? report.ledger.map((row) => <tr key={row.id}><td className="se-td--title">{row.player.displayName}</td><td data-label="Source">{row.source}</td><td data-label="Details">{row.label}</td><td className={`se-table__number se-num${row.amountCents < 0 ? ' se-text-bad' : ''}`} data-label="Amount">{formatCents(row.amountCents)}</td><td data-label="When">{adminWhen(row.at)}</td></tr>) : emptyRow(5, 'No supply or dealer ledger entries recorded.')}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Recent supply movements" aside="Newest first" flush>
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Player</th><th>Movement</th><th>Product</th><th className="se-table__number">Units</th><th>From → to</th><th>When</th></tr></thead>
                <tbody>{report.recentMovements.length ? report.recentMovements.map((row) => <tr key={row.id}><td className="se-td--title">{row.player.displayName}</td><td data-label="Movement">{row.kind.toLowerCase().replaceAll('_', ' ')}</td><td data-label="Product">{row.product}</td><td className="se-table__number se-num" data-label="Units">{row.quantityDelta > 0 ? '+' : ''}{formatNumber(row.quantityDelta)}</td><td data-label="Route">{row.fromLocation ?? '—'} → {row.toLocation ?? '—'}</td><td data-label="When">{adminWhen(row.at)}</td></tr>) : emptyRow(6, 'No stock movements recorded.')}</tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : !error && !roundsError ? <Panel title="Supply Operations"><p className="se-muted se-admin-pad">Loading supply records…</p></Panel> : null}
    </GameLayout>
  );
}
