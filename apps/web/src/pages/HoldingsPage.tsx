import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { holdingsApi, type HoldingCity } from '../api/holdings.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';

function stockText(stock: Array<{ productKey: string; quantity: number }>): string {
  return stock.length ? stock.map((row) => `${row.quantity.toLocaleString()} ${row.productKey}`).join(', ') : 'Empty';
}

export function HoldingCard({ city }: { city: HoldingCity }) {
  return (
    <Panel title={city.cityName}>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))', gap: '0.75rem', overflowWrap: 'anywhere' }}>
        <div><dt>Corners</dt><dd>{city.corners.length ? city.corners.join(', ') : 'None'}</dd></div>
        <div><dt>Business fronts</dt><dd>{city.fronts}</dd></div>
        <div><dt>Storage</dt><dd>{city.warehouses.length} site(s); {city.warehouses.map((site) => `${site.name}: ${stockText(site.stock)}${site.upkeepDue ? ' (upkeep due)' : ''}`).join('; ') || 'none'}</dd></div>
        <div><dt>Safehouse</dt><dd>{city.safehouses.length ? city.safehouses.map((site) => `${site.footholdActive ? 'Foothold active' : 'Foothold inactive'}${site.upkeepDue ? ' — upkeep due' : ''}`).join('; ') : 'None'}</dd></div>
        <div><dt>Dealer crews</dt><dd>{city.crews.length ? city.crews.map((crew) => `${crew.districtKey} (${crew.status}): ${stockText(crew.stock)}`).join('; ') : 'None'}</dd></div>
        <div><dt>Inbound stock</dt><dd>{city.inbound.length ? city.inbound.map((load) => `${load.quantity.toLocaleString()} ${load.productKey} (${load.status})`).join('; ') : 'None'}</dd></div>
        <div><dt>Law pressure</dt><dd>{city.pressure.stage} · {city.pressure.casePoints} case points</dd></div>
      </dl>
      <nav aria-label={`${city.cityName} management`} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <Link to={`/game/turf?city=${encodeURIComponent(city.citySlug)}`}>Manage turf and fronts</Link>
        <Link to="/game/supply">Manage storage</Link>
        <Link to="/game/dealers">Manage crews</Link>
        <Link to="/game#pressure">View case</Link>
      </nav>
    </Panel>
  );
}

export function HoldingsPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof holdingsApi.page>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    holdingsApi.page().then((result) => { if (active) setData(result); }).catch(() => {
      if (active) setError('City holdings are unavailable for this round or could not be loaded.');
    });
    return () => { active = false; };
  }, []);
  return <GameLayout>
    <h1>City holdings</h1>
    <p>Current city footprint. These figures reflect existing ownership and stock; no extra income or stock is created.</p>
    {error ? <Alert>{error}</Alert> : null}
    {!data && !error ? <p role="status">Loading holdings…</p> : null}
    {data?.cities.length === 0 ? <p>No city holdings yet.</p> : null}
    <div style={{ display: 'grid', gap: '1rem', minWidth: 0 }}>
      {data?.cities.map((city) => <HoldingCard key={city.citySlug} city={city} />)}
    </div>
  </GameLayout>;
}
