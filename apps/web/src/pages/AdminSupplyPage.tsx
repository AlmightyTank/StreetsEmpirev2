import { useEffect, useState } from 'react';
import type { AdminSupplyDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AdminRoundPicker, useAdminRound } from '../components/AdminRoundPicker.js';
import { Alert } from '../components/Alert.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

/** 1.6.0-A. Read-only operator view of the supply lifecycle and its journals. */
export function AdminSupplyPage() {
  const { rounds, roundId, setRoundId, error: roundsError } = useAdminRound();
  const [report, setReport] = useState<AdminSupplyDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) return;
    let active = true;
    setReport(null);
    setError(null);
    adminApi.supply(roundId)
      .then((next) => { if (active) setReport(next); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load supply operations.'); });
    return () => { active = false; };
  }, [roundId]);

  const emptyRow = (columns: number, label: string) => <tr><td className="se-muted" colSpan={columns}>{label}</td></tr>;

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
