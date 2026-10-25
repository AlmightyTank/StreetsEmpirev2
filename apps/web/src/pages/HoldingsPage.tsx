import { useEffect, useState } from 'react';
import '../styles/economy-experience.css';
import { Link } from 'react-router-dom';
import { holdingsApi, type HoldingCity } from '../api/holdings.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import type { ProfitIntelligenceDto, ProfitIntelligenceReceiptsPageDto, UpdateProfitIntelligenceGoalsInput } from '@streets/shared';
import { EmptyState, GamePageHeader } from '../components/GameUI.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { QuantityStepper } from '../components/QuantityStepper.js';

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
        <Link to="/game#pressure">View case</Link>
      </nav>
    </Panel>
  );
}

export function HoldingsPage() {
  const [reportDays, setReportDays] = useState(30);
  const [report, setReport] = useState<ProfitIntelligenceDto | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState('all');
  const [receiptSource, setReceiptSource] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<ProfitIntelligenceReceiptsPageDto | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
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
    let active = true;
    if (!report || !receiptSource) {
      setReceipts(null);
      setReceiptError(null);
      return () => { active = false; };
    }
    setReceipts(null);
    setReceiptError(null);
    holdingsApi.receipts({
      days: reportDays,
      ...(cityFilter === 'all' ? {} : { city: cityFilter }),
      source: receiptSource,
    }).then((page) => { if (active) setReceipts(page); }).catch(() => {
      if (active) setReceiptError('Receipts could not be loaded for this filter.');
    });
    return () => { active = false; };
  }, [report?.roundId, reportDays, cityFilter, receiptSource]);
  useEffect(() => {
    if (!report) return;
    setGoalDraft({
      minimumLiquidity: report.goals.settings.minimumLiquidityCents === null ? '' : moneyCents(report.goals.settings.minimumLiquidityCents),
      productKey: report.goals.settings.minimumProductKey ?? '',
      minimumProductUnits: report.goals.settings.minimumProductUnits?.toString() ?? '',
      maximumRoutePurchase: report.goals.settings.maximumRoutePurchaseCents === null ? '' : moneyCents(report.goals.settings.maximumRoutePurchaseCents),
    });
  }, [report?.roundId]);
  const stockUnits = (data?.cities ?? []).filter((city) => cityFilter === 'all' || city.citySlug === cityFilter).reduce((total, city) => total
    + city.warehouses.reduce((sum, warehouse) => sum + warehouse.stock.reduce((stock, item) => stock + item.quantity, 0), 0)
    + city.crews.reduce((sum, crew) => sum + crew.stock.reduce((stock, item) => stock + item.quantity, 0), 0), 0);
  const filteredBuckets = (report?.byDaySourceCity ?? []).filter((row) => cityFilter === 'all'
    || (cityFilter === 'unattributed' ? row.citySlug === null : row.citySlug === cityFilter));
  const sourceTotals = [...filteredBuckets.reduce((map, row) => {
    const total = map.get(row.source) ?? { source: row.source, classification: row.classification, entryCount: 0, inflow: 0n, outflow: 0n, net: 0n };
    total.entryCount += row.entryCount;
    total.inflow += BigInt(row.inflowCents);
    total.outflow += BigInt(row.outflowCents);
    total.net += BigInt(row.netCents);
    map.set(row.source, total);
    return map;
  }, new Map<string, { source: string; classification: string; entryCount: number; inflow: bigint; outflow: bigint; net: bigint }>()).values()]
    .sort((a, b) => { const aFlow = a.inflow + a.outflow; const bFlow = b.inflow + b.outflow; return aFlow > bFlow ? -1 : aFlow < bFlow ? 1 : a.source.localeCompare(b.source); });
  const filteredTotals = filteredBuckets.reduce((total, row) => ({
    inflow: total.inflow + BigInt(row.inflowCents), outflow: total.outflow + BigInt(row.outflowCents), net: total.net + BigInt(row.netCents),
  }), { inflow: 0n, outflow: 0n, net: 0n });
  const filteredEstimate = filteredBuckets.reduce((total, row) => ({
    income: total.income + (row.classification === 'OPERATING_INCOME' || row.classification === 'INVENTORY_PROCEEDS' ? BigInt(row.netCents) : 0n),
    costs: total.costs + (row.classification === 'OPERATING_COST' || row.classification === 'FINES_AND_FEES' ? BigInt(row.outflowCents) - BigInt(row.inflowCents) : 0n),
  }), { income: 0n, costs: 0n });
  const dealerNetSales = sourceTotals.find((row) => row.source === 'DEALER_SALES')?.net ?? 0n;
  const dealerWages = sourceTotals.find((row) => row.source === 'DEALER_WAGES')?.outflow ?? 0n;
  const dealerSalesToWages = dealerWages > 0n ? (() => {
    const hundredths = (dealerNetSales * 100n + dealerWages / 2n) / dealerWages;
    return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')}`;
  })() : null;
  const dailyRows = [...filteredBuckets.reduce((map, row) => {
    const total = map.get(row.day) ?? { day: row.day, inflow: 0n, outflow: 0n, net: 0n };
    total.inflow += BigInt(row.inflowCents); total.outflow += BigInt(row.outflowCents); total.net += BigInt(row.netCents);
    map.set(row.day, total); return map;
  }, new Map<string, { day: string; inflow: bigint; outflow: bigint; net: bigint }>()).values()].sort((a, b) => a.day.localeCompare(b.day));
  const maxDailyFlow = dailyRows.reduce((max, row) => [row.inflow, row.outflow].reduce((inner, amount) => amount > inner ? amount : inner, max), 0n);
  const cityOptions = [...new Map((report?.byCity ?? []).map((city) => [city.citySlug ?? 'unattributed', city.cityName ?? 'Unattributed'])).entries()];
  const loadMoreReceipts = async () => {
    if (!receipts?.nextCursor || !receiptSource) return;
    setReceiptBusy(true); setReceiptError(null);
    try {
      const next = await holdingsApi.receipts({ days: reportDays, ...(cityFilter === 'all' ? {} : { city: cityFilter }), source: receiptSource, cursor: receipts.nextCursor });
      setReceipts((current) => current ? { ...next, receipts: [...current.receipts, ...next.receipts] } : next);
    } catch { setReceiptError('More receipts could not be loaded.'); }
    finally { setReceiptBusy(false); }
  };
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
      {report ? <div className="se-field"><label htmlFor="profit-city-filter">City filter</label><select id="profit-city-filter" className="se-input" value={cityFilter} onChange={(event) => { setCityFilter(event.target.value); setReceiptSource(null); }}>
        <option value="all">All cities</option>{cityOptions.map(([slug, name]) => <option key={slug} value={slug}>{name ?? 'Unattributed'}</option>)}
      </select></div> : null}
      {reportError ? <Alert>{reportError}</Alert> : null}
      {!report && !reportError ? <div role="status">Loading profit report…</div> : null}
      {report ? <>
        <Row label="Recorded inflows" value={moneyCents(filteredTotals.inflow.toString())} />
        <Row label="Recorded outflows" value={moneyCents(filteredTotals.outflow.toString())} />
        <Row label="Known cash margin estimate" value={moneyCents((filteredEstimate.income - filteredEstimate.costs).toString())} tooltip="Recognized operating cash inflows and costs only; inventory cost basis and other missing costs are excluded." />
        <Row label="Dealer net sales / wages" value={dealerSalesToWages === null ? 'No wage entries in this city and period' : `${dealerSalesToWages}:1`} tooltip="Net dealer sales after crew cut compared with recorded dealer wages. This is not dealer profit because inventory cost is not matched." />
        <Row label="Inventory on hand" value={`${stockUnits.toLocaleString()} units`} tooltip="Current warehouse and dealer crew quantities. No dollar value is shown because inventory acquisition costs cannot yet be reliably matched." />
        <Row label="Net recorded cash movement" value={moneyCents(filteredTotals.net.toString())} />
        <h3>Daily cash movement</h3>
        {dailyRows.length ? <div className="se-profit-trend" role="group" aria-label="Daily recorded inflows and outflows">
          {dailyRows.map((day) => {
            const inflowWidth = maxDailyFlow > 0n ? Number(day.inflow * 100n / maxDailyFlow) : 0;
            const outflowWidth = maxDailyFlow > 0n ? Number(day.outflow * 100n / maxDailyFlow) : 0;
            return <div className="se-profit-trend__row" key={day.day}>
              <time dateTime={day.day}>{new Date(`${day.day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })}</time>
              <div className="se-profit-trend__bars" aria-hidden="true"><span className="se-profit-trend__in" style={{ width: `${inflowWidth}%` }} /><span className="se-profit-trend__out" style={{ width: `${outflowWidth}%` }} /></div>
              <span>In {moneyCents(day.inflow.toString())} · Out {moneyCents(day.outflow.toString())}</span>
              <strong>Net {moneyCents(day.net.toString())}</strong>
            </div>;
          })}
        </div> : <p className="se-muted">No ledger activity in this city and reporting window.</p>}
        <h3>Recorded sources</h3>
        {sourceTotals.length ? <ul className="se-profit-sources">{sourceTotals.map((source) => <li key={source.source}>
          <span><strong>{source.source.replaceAll('_', ' ')}</strong><small>{source.entryCount.toLocaleString()} receipt(s) · net {moneyCents(source.net.toString())}</small></span>
          <button className="se-btn se-btn--ghost se-btn--sm" type="button" aria-expanded={receiptSource === source.source} onClick={() => setReceiptSource((current) => current === source.source ? null : source.source)}>{receiptSource === source.source ? 'Hide receipts' : 'View receipts'}</button>
        </li>)}</ul> : <p className="se-muted">No report rows for this city.</p>}
        {receiptSource ? <section className="se-profit-receipts" aria-label={`${receiptSource} receipts`}>
          <h3>{receiptSource.replaceAll('_', ' ')} receipts</h3>
          {receiptError ? <Alert>{receiptError}</Alert> : null}
          {!receipts && !receiptError ? <p role="status">Loading receipts…</p> : null}
          {receipts?.receipts.length ? <ol>{receipts.receipts.map((receipt) => <li key={receipt.id}>
            <time dateTime={receipt.at}>{new Date(receipt.at).toLocaleString()}</time>
            <strong>{receipt.label}</strong><span>{receipt.citySlug ? cityOptions.find(([slug]) => slug === receipt.citySlug)?.[1] ?? receipt.citySlug : 'Unattributed'}</span>
            <span>{moneyCents(receipt.amountCents)}</span><small>Receipt {receipt.id}</small>
          </li>)}</ol> : receipts ? <p className="se-muted">No matching receipts.</p> : null}
          {receipts?.nextCursor ? <button className="se-btn" type="button" disabled={receiptBusy} onClick={() => void loadMoreReceipts()}>{receiptBusy ? 'Loading…' : 'Load more receipts'}</button> : null}
        </section> : null}
        <p className="se-muted">This estimate is incomplete, not realized profit. Costs and proceeds are shown only where the ledger supports them. The report excludes uncollected registers, inventory cost basis, assets, financing, transfers, rewards, mixed events, and unknown sources.</p>
        <details>
          <summary>Estimate assumptions</summary>
          <ul>{report.profitEstimate.notes.map((note) => <li key={note}>{note}</li>)}</ul>
          <p className="se-muted">{report.efficiency.turnEfficiencyAvailable ? 'Turn efficiency is available.' : report.efficiency.turnEfficiencyReason}</p>
          <p className="se-muted">City law pressure appears on each holding card below. Route-risk scoring is not included yet.</p>
          <p className="se-muted">Whole-report ledger reconciliation: {report.reconciliation.matches ? 'matched' : 'variance detected'} · {report.reconciliation.projectedEntryCount.toLocaleString()} of {report.reconciliation.ledgerEntryCount.toLocaleString()} entries.</p>
        </details>
      </> : null}
    </Panel>
    {report ? <Panel title="City & route comparison" subtitle="Recorded trips, current balances, and last observed market data" aside="Actuals">
      <h3>Routes · {report.comparison.routes.filter((route) => cityFilter === 'all' || (cityFilter !== 'unattributed' && route.route.includes(cityFilter))).length} completed route group(s)</h3>
      {report.comparison.routes.filter((route) => cityFilter === 'all' || (cityFilter !== 'unattributed' && route.route.includes(cityFilter))).length ? <ul>{report.comparison.routes.filter((route) => cityFilter === 'all' || (cityFilter !== 'unattributed' && route.route.includes(cityFilter))).map((route) => <li key={route.route.join('→')}>
        {route.route.join(' → ')} · {route.tripCount} trip(s) · buys {moneyCents(route.buyCents)} · sales {moneyCents(route.sellCents)} · trade delta {moneyCents(route.tradeDeltaCents)}
      </li>)}</ul> : <p className="se-muted">No returned trips in this reporting window.</p>}
      <h3>Trade results by city</h3>
      {report.comparison.tradeCities.filter((city) => cityFilter === 'all' || city.citySlug === cityFilter).length ? <ul>{report.comparison.tradeCities.filter((city) => cityFilter === 'all' || city.citySlug === cityFilter).map((city) => <li key={city.citySlug}>{city.cityName}: buys {moneyCents(city.buyCents)} · sales {moneyCents(city.sellCents)} · trade delta {moneyCents(city.tradeDeltaCents)}</li>)}</ul> : <p className="se-muted">No recorded trades in returned trips for this window.</p>}
      <h3>Cash tied up now</h3>
      <p className="se-muted">Away wallets are empire-wide because they are not attributed to one city.</p>
      <Row label="Active run wallets" value={moneyCents(report.comparison.cashAway.activeRunCents)} />
      <Row label="Active boss trip bankrolls" value={moneyCents(report.comparison.cashAway.activeBossTripCents)} />
      <Row label="Current business registers" value={moneyCents(report.comparison.currentRegisters.filter((city) => cityFilter === 'all' || city.citySlug === cityFilter).reduce((sum, city) => sum + BigInt(city.registerCents), 0n).toString())} />
      {report.comparison.currentRegisters.filter((city) => cityFilter === 'all' || city.citySlug === cityFilter).length ? <ul>{report.comparison.currentRegisters.filter((city) => cityFilter === 'all' || city.citySlug === cityFilter).map((city) => <li key={city.citySlug}>{city.cityName}: {moneyCents(city.registerCents)} waiting in registers</li>)}</ul> : <p className="se-muted">No current business registers.</p>}
      <h3>Last observed market</h3>
      {report.comparison.observedMarkets.filter((market) => cityFilter === 'all' || market.citySlug === cityFilter).length ? <ul>{report.comparison.observedMarkets.filter((market) => cityFilter === 'all' || market.citySlug === cityFilter).map((market) => <li key={market.citySlug}>
        {market.cityName} · observed {new Date(market.seenAt).toLocaleString()}{market.products.length ? ` · ${market.products.map((item) => `${item.productKey}: buy ${moneyCents(String(item.buyCents))}, sell ${moneyCents(String(item.sellCents))}`).join('; ')}` : ' · no price details recorded'}
      </li>)}</ul> : <p className="se-muted">No market observations recorded yet.</p>}
      <details><summary>Comparison assumptions</summary><ul>{report.comparison.caveats.map((note) => <li key={note}>{note}</li>)}</ul></details>
    </Panel> : null}
    {report ? <Panel title="Financial goals" subtitle="Set warning thresholds for total cash across your wallet, trip funds, and business registers, on-hand supply, and route purchases" aside="Optional">
      <p className="se-muted">These goals are empire-wide. They only show reminders; they never buy, sell, or move anything for you.</p>
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
        </div><QuantityStepper value={Number(goalDraft.minimumProductUnits) || 1} onChange={(value) => setGoalDraft((draft) => ({ ...draft, minimumProductUnits: String(value) }))} min={1} max={2000000000} unitLabel="units" /><small>Counts stock in your warehouses and dealer crews; excludes inbound shipments.</small></div>
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
