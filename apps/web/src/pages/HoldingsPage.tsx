import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { holdingsApi, type HoldingCity } from '../api/holdings.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import type { ProfitIntelligenceDto, UpdateProfitIntelligenceGoalsInput } from '@streets/shared';
import { EmptyState, GamePageHeader } from '../components/GameUI.js';
import { GameLayout } from '../layouts/GameLayout.js';

function moneyCents(value: string): string {
  const cents = BigInt(value);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? '−' : ''}${(absolute / 100n).toLocaleString('en-US')}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

function dollarsToCents(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,16})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) throw new Error('Enter a non-negative dollar amount with up to two decimal places.');
  return (BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')).toString();
}

function stockText(stock: Array<{ productKey: string; quantity: number }>): string {
  return stock.length ? stock.map((row) => `${row.quantity.toLocaleString()} ${row.productKey}`).join(', ') : 'Empty';
}

export function HoldingCard({ city }: { city: HoldingCity }) {
  return (
    <Panel title={city.cityName}>
      <dl className="se-holdings__facts">
        <div><dt>Corners</dt><dd>{city.corners.length ? city.corners.join(', ') : 'None'}</dd></div>
        <div><dt>Business fronts</dt><dd>{city.fronts}</dd></div>
        <div><dt>Storage</dt><dd>{city.warehouses.length} site(s); {city.warehouses.map((site) => `${site.name}: ${stockText(site.stock)}${site.upkeepDue ? ' (upkeep due)' : ''}`).join('; ') || 'none'}</dd></div>
        <div><dt>Safehouse</dt><dd>{city.safehouses.length ? city.safehouses.map((site) => `${site.footholdActive ? 'Foothold active' : 'Foothold inactive'}${site.upkeepDue ? ' — upkeep due' : ''}`).join('; ') : 'None'}</dd></div>
        <div><dt>Dealer crews</dt><dd>{city.crews.length ? city.crews.map((crew) => `${crew.districtKey} (${crew.status}): ${stockText(crew.stock)}`).join('; ') : 'None'}</dd></div>
        <div><dt>Inbound stock</dt><dd>{city.inbound.length ? city.inbound.map((load) => `${load.quantity.toLocaleString()} ${load.productKey} (${load.status})`).join('; ') : 'None'}</dd></div>
        <div><dt>Law pressure</dt><dd>{city.pressure.stage} · {city.pressure.casePoints} case points</dd></div>
      </dl>
      <nav className="se-holdings__actions" aria-label={`${city.cityName} management`}>
        <Link to={`/game/turf?city=${encodeURIComponent(city.citySlug)}`}>Manage turf and fronts</Link>
        <Link to="/game/supply">Manage storage</Link>
        <Link to="/game/dealers">Manage crews</Link>
        <Link to="/game#pressure">View case</Link>
      </nav>
    </Panel>
  );
}

export function HoldingsPage() {
  const [reportDays, setReportDays] = useState(30);
  const [report, setReport] = useState<ProfitIntelligenceDto | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [goalDraft, setGoalDraft] = useState({ minimumLiquidity: '', productKey: '', minimumProductUnits: '', maximumRoutePurchase: '' });
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalMessage, setGoalMessage] = useState<string | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof holdingsApi.page>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    holdingsApi.page().then((result) => { if (active) setData(result); }).catch(() => {
      if (active) setError('City holdings are unavailable for this round or could not be loaded.');
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setReport(null);
    setReportError(null);
    holdingsApi.profit(reportDays).then((result) => { if (active) setReport(result); }).catch(() => {
      if (active) setReportError('Profit reporting is unavailable right now.');
    });
    return () => { active = false; };
  }, [reportDays]);
  useEffect(() => {
    if (!report) return;
    setGoalDraft({
      minimumLiquidity: report.goals.settings.minimumLiquidityCents === null ? '' : moneyCents(report.goals.settings.minimumLiquidityCents),
      productKey: report.goals.settings.minimumProductKey ?? '',
      minimumProductUnits: report.goals.settings.minimumProductUnits?.toString() ?? '',
      maximumRoutePurchase: report.goals.settings.maximumRoutePurchaseCents === null ? '' : moneyCents(report.goals.settings.maximumRoutePurchaseCents),
    });
  }, [report?.roundId]);
  const stockUnits = (data?.cities ?? []).reduce((total, city) => total
    + city.warehouses.reduce((sum, warehouse) => sum + warehouse.stock.reduce((stock, item) => stock + item.quantity, 0), 0)
    + city.crews.reduce((sum, crew) => sum + crew.stock.reduce((stock, item) => stock + item.quantity, 0), 0), 0);
  return <GameLayout>
    <div className="se-holdings">
    <GamePageHeader eyebrow="Empire overview" title="City holdings" description="Current city footprint. These figures reflect existing ownership and stock; no extra income or stock is created." />
    {error ? <Alert>{error}</Alert> : null}
    {!data && !error ? <Panel title="City holdings" loading>Loading holdings…</Panel> : null}
    <Panel title="Profit & efficiency" subtitle={report ? `Recorded ledger activity · ${new Date(report.period.from).toLocaleDateString()}–${new Date(report.period.to).toLocaleDateString()}` : 'Reconciled cash activity with clearly marked estimates.'} aside="Estimate">
      <div className="se-field">
        <label htmlFor="profit-window">Reporting window</label>
        <select id="profit-window" className="se-input" value={reportDays} onChange={(event) => setReportDays(Number(event.target.value))}>
          <option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </div>
      {reportError ? <Alert>{reportError}</Alert> : null}
      {!report && !reportError ? <div role="status">Loading profit report…</div> : null}
      {report ? <>
        <Row label="Recorded inflows" value={moneyCents(report.totals.inflowCents)} />
        <Row label="Recorded outflows" value={moneyCents(report.totals.outflowCents)} />
        <Row label="Known cash margin estimate" value={moneyCents(report.profitEstimate.estimatedNetCents)} tooltip="Recognized operating cash inflows and costs only; inventory cost basis and other missing costs are excluded." />
        <Row label="Dealer net sales / wages" value={report.efficiency.salesToWagesRatio === null ? 'No wage entries in this period' : `${report.efficiency.salesToWagesRatio}:1`} tooltip="Net dealer sales after crew cut compared with recorded dealer wages. This is not dealer profit because inventory cost is not matched." />
        <Row label="Inventory on hand" value={`${stockUnits.toLocaleString()} units`} tooltip="Current warehouse and dealer crew quantities. No dollar value is shown because inventory acquisition costs cannot yet be reliably matched." />
        <p className="se-muted">This estimate is incomplete, not realized profit. Costs and proceeds are shown only where the ledger supports them. The report excludes uncollected registers, inventory cost basis, assets, financing, transfers, rewards, mixed events, and unknown sources.</p>
        <details>
          <summary>Estimate assumptions</summary>
          <ul>{report.profitEstimate.notes.map((note) => <li key={note}>{note}</li>)}</ul>
          <p className="se-muted">{report.efficiency.turnEfficiencyAvailable ? 'Turn efficiency is available.' : report.efficiency.turnEfficiencyReason}</p>
          <p className="se-muted">City law pressure appears on each holding card below. Route-risk scoring is not included yet.</p>
          <p className="se-muted">Ledger reconciliation: {report.reconciliation.matches ? 'matched' : 'variance detected'} · {report.reconciliation.projectedEntryCount.toLocaleString()} of {report.reconciliation.ledgerEntryCount.toLocaleString()} entries.</p>
        </details>
      </> : null}
    </Panel>
    {report ? <Panel title="City & route comparison" subtitle="Recorded trips, current balances, and last observed market data" aside="Actuals">
      <h3>Routes · {report.comparison.routes.length} completed route group(s)</h3>
      {report.comparison.routes.length ? <ul>{report.comparison.routes.map((route) => <li key={route.route.join('→')}>
        {route.route.join(' → ')} · {route.tripCount} trip(s) · buys {moneyCents(route.buyCents)} · sales {moneyCents(route.sellCents)} · trade delta {moneyCents(route.tradeDeltaCents)}
      </li>)}</ul> : <p className="se-muted">No returned trips in this reporting window.</p>}
      <h3>Trade results by city</h3>
      {report.comparison.tradeCities.length ? <ul>{report.comparison.tradeCities.map((city) => <li key={city.citySlug}>{city.cityName}: buys {moneyCents(city.buyCents)} · sales {moneyCents(city.sellCents)} · trade delta {moneyCents(city.tradeDeltaCents)}</li>)}</ul> : <p className="se-muted">No recorded trades in returned trips for this window.</p>}
      <h3>Cash tied up now</h3>
      <Row label="Active run wallets" value={moneyCents(report.comparison.cashAway.activeRunCents)} />
      <Row label="Active boss trip bankrolls" value={moneyCents(report.comparison.cashAway.activeBossTripCents)} />
      <Row label="Current business registers" value={moneyCents(report.comparison.currentRegisters.reduce((sum, city) => sum + BigInt(city.registerCents), 0n).toString())} />
      {report.comparison.currentRegisters.length ? <ul>{report.comparison.currentRegisters.map((city) => <li key={city.citySlug}>{city.cityName}: {moneyCents(city.registerCents)} waiting in registers</li>)}</ul> : <p className="se-muted">No current business registers.</p>}
      <h3>Last observed market</h3>
      {report.comparison.observedMarkets.length ? <ul>{report.comparison.observedMarkets.map((market) => <li key={market.citySlug}>
        {market.cityName} · observed {new Date(market.seenAt).toLocaleString()}{market.products.length ? ` · ${market.products.map((item) => `${item.productKey}: buy ${moneyCents(String(item.buyCents))}, sell ${moneyCents(String(item.sellCents))}`).join('; ')}` : ' · no price details recorded'}
      </li>)}</ul> : <p className="se-muted">No market observations recorded yet.</p>}
      <details><summary>Comparison assumptions</summary><ul>{report.comparison.caveats.map((note) => <li key={note}>{note}</li>)}</ul></details>
    </Panel> : null}
    {report ? <Panel title="Financial goals" subtitle="Set warning thresholds for total cash across your wallet, trip funds, and business registers, on-hand supply, and route purchases" aside="Optional">
      <p className="se-muted">These targets only show reminders. They never buy, sell, or move anything for you.</p>
      {goalError ? <Alert>{goalError}</Alert> : null}
      {goalMessage ? <p role="status" className="se-muted">{goalMessage}</p> : null}
      <form className="se-form" onSubmit={async (event) => {
        event.preventDefault();
        setGoalBusy(true); setGoalError(null); setGoalMessage(null);
        try {
          const minimumProductUnits = goalDraft.minimumProductUnits.trim() ? Number(goalDraft.minimumProductUnits) : null;
          if (minimumProductUnits !== null && (!Number.isSafeInteger(minimumProductUnits) || minimumProductUnits < 1 || minimumProductUnits > 2_000_000_000)) throw new Error('Enter a valid minimum stock amount.');
          const input: UpdateProfitIntelligenceGoalsInput = {
            minimumLiquidityCents: dollarsToCents(goalDraft.minimumLiquidity),
            minimumProductKey: goalDraft.productKey || null,
            minimumProductUnits,
            maximumRoutePurchaseCents: dollarsToCents(goalDraft.maximumRoutePurchase),
          };
          if ((input.minimumProductKey === null) !== (input.minimumProductUnits === null)) throw new Error('Choose both a product and minimum units, or clear both.');
          await holdingsApi.saveProfitGoals(input);
          const refreshed = await holdingsApi.profit(reportDays);
          setReport(refreshed);
          setGoalMessage('Financial goal thresholds saved.');
        } catch (error) {
          setGoalError(error instanceof Error ? error.message : 'Could not save financial goals.');
        } finally { setGoalBusy(false); }
      }}>
        <div className="se-field"><label htmlFor="goal-liquidity">Minimum liquidity ($)</label><input id="goal-liquidity" className="se-input" inputMode="decimal" value={goalDraft.minimumLiquidity} onChange={(event) => setGoalDraft((draft) => ({ ...draft, minimumLiquidity: event.target.value }))} placeholder="Off" /></div>
        <div className="se-field"><label htmlFor="goal-product">Minimum on-hand supply</label><div className="se-form__row">
          <select id="goal-product" className="se-input" value={goalDraft.productKey} onChange={(event) => setGoalDraft((draft) => ({ ...draft, productKey: event.target.value }))}>
            <option value="">Off</option>{report.goals.availableProductKeys.map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
          <input aria-label="Minimum units" className="se-input" type="number" min="1" max="2000000000" step="1" value={goalDraft.minimumProductUnits} onChange={(event) => setGoalDraft((draft) => ({ ...draft, minimumProductUnits: event.target.value }))} placeholder="Units" />
        </div><small>Counts stock in your warehouses and dealer crews; excludes inbound shipments.</small></div>
        <div className="se-field"><label htmlFor="goal-route-cost">Maximum route purchases ($)</label><input id="goal-route-cost" className="se-input" inputMode="decimal" value={goalDraft.maximumRoutePurchase} onChange={(event) => setGoalDraft((draft) => ({ ...draft, maximumRoutePurchase: event.target.value }))} placeholder="Off" /><small>Warns when purchases on a recorded route exceed this amount in the selected window.</small></div>
        <button className="se-btn se-btn--primary" type="submit" disabled={goalBusy}>{goalBusy ? 'Saving…' : 'Save goals'}</button>
      </form>
      <h3>Current warnings</h3>
      {report.goals.warnings.length ? <ul>{report.goals.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="se-muted">No configured goal is currently below its threshold.</p>}
    </Panel> : null}
    {data?.cities.length === 0 ? <EmptyState title="No city holdings yet" description="Secure turf, storage, or a business front and it will appear here." /> : null}
    <div className="se-holdings__list">
      {data?.cities.map((city) => <HoldingCard key={city.citySlug} city={city} />)}
    </div>
    </div>
  </GameLayout>;
}
