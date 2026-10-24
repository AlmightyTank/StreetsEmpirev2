import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { holdingsApi, type HoldingCity } from '../api/holdings.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import type { ProfitIntelligenceDto } from '@streets/shared';
import { EmptyState, GamePageHeader } from '../components/GameUI.js';
import { GameLayout } from '../layouts/GameLayout.js';

function moneyCents(value: string): string {
  const cents = BigInt(value);
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? '−' : ''}${(absolute / 100n).toLocaleString('en-US')}.${(absolute % 100n).toString().padStart(2, '0')}`;
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
    {data?.cities.length === 0 ? <EmptyState title="No city holdings yet" description="Secure turf, storage, or a business front and it will appear here." /> : null}
    <div className="se-holdings__list">
      {data?.cities.map((city) => <HoldingCard key={city.citySlug} city={city} />)}
    </div>
    </div>
  </GameLayout>;
}
