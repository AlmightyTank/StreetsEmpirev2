import { Link } from 'react-router-dom';
import type { CitiesDto, CityCharacterDto, SupplyLevelDto } from '@streets/shared';
import { formatCentsExact, formatNumber } from '@streets/shared';
import { Panel, Row } from './Panel.js';

/** Where each city sits on the map, roughly where it is on the real one. */
const MAP: Record<string, { x: number; y: number; label: 'left' | 'right' | 'above' | 'below' }> = {
  'seattle': { x: 52, y: 36, label: 'right' },
  'los-angeles': { x: 64, y: 150, label: 'right' },
  'beverly-hills': { x: 36, y: 184, label: 'below' },
  'las-vegas': { x: 118, y: 124, label: 'right' },
  'detroit': { x: 272, y: 60, label: 'above' },
  'new-york-city': { x: 352, y: 50, label: 'above' },
  'atlanta': { x: 290, y: 152, label: 'left' },
  'miami-beach': { x: 336, y: 206, label: 'left' },
};

export const SHORT_CITY: Record<string, string> = {
  'new-york-city': 'New York',
  'miami-beach': 'Miami',
  'beverly-hills': 'Bev. Hills',
  'las-vegas': 'Las Vegas',
  'los-angeles': 'LA',
};

export const SUPPLY_WORD: Record<SupplyLevelDto, string> = { PLENTIFUL: 'Plenty', NORMAL: 'In stock', LOW: 'Low', OUT: 'Out' };

/** "$10", or "$2.40" where the cents matter. */
export const unitPrice = (cents: number) => (cents % 100 === 0 ? `$${(cents / 100).toLocaleString('en-US')}` : formatCentsExact(cents));

export function hoursText(hours: number): string {
  return hours === 1 ? '1 hour' : hours < 1 ? `${Math.round(hours * 60)} minutes` : `${hours} hours`;
}

export function minutesText(minutes: number): string {
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** "5 minutes ago", "3 hours ago", "2 days ago". */
export function agoText(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function RoadMap({ data, selected, onSelect, runAt }: {
  data: CitiesDto;
  selected: string;
  onSelect: (slug: string) => void;
  /** Where a run is, to draw it on the road. */
  runAt?: { from: string; to: string; progress: number } | { city: string } | null;
}) {
  const seen = new Set<string>();
  const roads = data.cities.flatMap((city) => city.roads.filter((road) => {
    const key = [city.slug, road.to].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((road) => ({ ...road, from: city.slug })));
  const marker = !runAt ? null
    : 'city' in runAt ? MAP[runAt.city] ?? null
      : MAP[runAt.from] && MAP[runAt.to]
        ? { x: MAP[runAt.from]!.x + (MAP[runAt.to]!.x - MAP[runAt.from]!.x) * runAt.progress, y: MAP[runAt.from]!.y + (MAP[runAt.to]!.y - MAP[runAt.from]!.y) * runAt.progress }
        : null;

  return (
    <svg className="se-citymap" viewBox="0 0 400 230" role="group" aria-label="The road map">
      {roads.map((road) => {
        const a = MAP[road.from];
        const b = MAP[road.to];
        if (!a || !b) return null;
        const touches = road.from === selected || road.to === selected;
        return (
          <line key={`${road.from}-${road.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            className={`se-citymap__road${road.police >= 1.5 ? ' se-citymap__road--police' : ''}${touches ? ' se-citymap__road--on' : ''}`}>
            <title>{`${road.name}: ${data.cities.find((city) => city.slug === road.from)?.name} to ${road.toName}, ${hoursText(road.driveHours)}`}</title>
          </line>
        );
      })}
      {data.cities.map((city) => {
        const at = MAP[city.slug];
        if (!at) return null;
        const on = city.slug === selected;
        const label = SHORT_CITY[city.slug] ?? city.name;
        const text = at.label === 'left' ? { x: at.x - 9, y: at.y + 4, anchor: 'end' as const }
          : at.label === 'right' ? { x: at.x + 9, y: at.y + 4, anchor: 'start' as const }
            : at.label === 'above' ? { x: at.x, y: at.y - 10, anchor: 'middle' as const }
              : { x: at.x, y: at.y + 18, anchor: 'middle' as const };
        return (
          <g key={city.slug} className={`se-citymap__city${on ? ' se-citymap__city--on' : ''}${city.isHome ? ' se-citymap__city--home' : ''}`}
            role="button" tabIndex={0} aria-pressed={on} aria-label={`${city.name}${city.isHome ? ', home' : ''}`}
            onClick={() => onSelect(city.slug)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(city.slug); } }}>
            <circle cx={at.x} cy={at.y} r={14} className="se-citymap__hit" />
            {city.isHome ? <circle cx={at.x} cy={at.y} r={9} className="se-citymap__ring" /> : null}
            <circle cx={at.x} cy={at.y} r={5.5} className="se-citymap__dot" />
            <text x={text.x} y={text.y} textAnchor={text.anchor} className="se-citymap__label">{label}</text>
          </g>
        );
      })}
      {marker ? (
        <g className="se-citymap__run" aria-label="Your run">
          <circle cx={marker.x} cy={marker.y} r={7} className="se-citymap__run-glow" />
          <circle cx={marker.x} cy={marker.y} r={3.5} className="se-citymap__run-dot" />
        </g>
      ) : null}
    </svg>
  );
}

/** Pip's counter where the player knows it: home, and cities their runs have seen. */
function Counter({ counter, products }: { counter: NonNullable<CityCharacterDto['counter']>; products: CitiesDto['products'] }) {
  const nameOf = (key: string) => products.find((product) => product.key === key)?.name ?? key;
  return (
    <div className="se-rows">
      {counter.products.map((product) => (
        <div className="se-row" key={product.key}>
          <span className="se-row__label">{nameOf(product.key)}</span>
          <span className="se-row__value">
            {product.supply === null
              ? <span className="se-muted">Not carried</span>
              : <>
                  <span className={`se-city__supply se-city__supply--${product.supply.toLowerCase()}`}>{SUPPLY_WORD[product.supply]}</span>
                  {product.stock !== null ? <span className="se-muted se-num"> ({formatNumber(product.stock)})</span> : null}
                  {' '}<span className="se-num">{unitPrice(product.buyCents!)}</span>
                  <span className="se-muted se-num"> / {unitPrice(product.sellCents!)}</span>
                </>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 0.5.0-C. The high market as the crew last saw it: the next unit each way. */
function MarketSeen({ counter, products }: { counter: NonNullable<CityCharacterDto['counter']>; products: CitiesDto['products'] }) {
  const nameOf = (key: string) => products.find((product) => product.key === key)?.name ?? key;
  const priced = counter.products.filter((product) => product.market);
  if (!priced.length) return null;
  return (
    <>
      <h3 className="se-city__heading">High market{counter.seenAt ? <span className="se-city__seen"> · seen {agoText(counter.seenAt)}</span> : null}</h3>
      <div className="se-rows">
        {priced.map((product) => (
          <div className="se-row" key={product.key}>
            <span className="se-row__label">{nameOf(product.key)}</span>
            <span className="se-row__value">
              <span className="se-num">{unitPrice(product.market!.buyCents)}</span>
              <span className="se-muted se-num"> / {unitPrice(product.market!.sellCents)}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="se-hint">What the next unit cost and paid when your crew was here. Everyone trades this market, so it has likely moved.</p>
    </>
  );
}

export function CityDetail({ city, products, home }: { city: CityCharacterDto; products: CitiesDto['products']; home: string }) {
  return (
    <Panel title={city.name} aside={city.isHome ? 'Home' : city.gameMinutes !== null ? `${minutesText(city.gameMinutes)} from ${home}` : undefined}>
      <p className="se-city__trait">{city.trait}</p>
      <p className="se-dim">{city.blurb}</p>

      <h3 className="se-city__heading">Street talk</h3>
      <ul className="se-city__talk">
        {city.talk.map((line) => <li key={line}>{line}</li>)}
      </ul>

      <div className="se-rows se-mt">
        {city.isHome || city.gameMinutes === null ? null : (
          <Row label="Drive from home" value={minutesText(city.gameMinutes)}
            tooltip={`${hoursText(city.driveHours ?? 0)} of real road on the shortest route, sped up.`} />
        )}
        <Row label="Police" value={city.police} tooltip="How fast selling here draws Heat once the police notice runs." />
        {city.heat ? (
          <>
            <Row label="Take cut from" value={`${city.heat.dragStartsAt} Heat`}
              tooltip="Your Heat is one number wherever you are. Each city decides where it starts to cost you." />
            <Row label="Busts from" value={`${city.heat.bustStartsAt} Heat`} />
          </>
        ) : (
          <Row label="Busts" value={city.busts === 'the same' ? 'Same as home' : `${city.busts.charAt(0).toUpperCase()}${city.busts.slice(1)} than at home`}
            tooltip="Your Heat is one number wherever you are. Each city decides where it starts to cost you." />
        )}
      </div>

      <h3 className="se-city__heading">Pip&rsquo;s counter{city.counter?.seenAt ? <span className="se-city__seen"> · seen {agoText(city.counter.seenAt)}</span> : null}</h3>
      {city.counter ? (
        <>
          <Counter counter={city.counter} products={products} />
          <p className="se-hint">
            {city.isHome
              ? <>What he sells for, then what he pays you. You trade here at <Link to="/game/stores/pip">Pip&rsquo;s</Link>.</>
              : 'What was on your shelf, what he sold for and what he paid, when your crew was last here. It may have moved since.'}
          </p>
        </>
      ) : (
        <p className="se-hint">
          Nobody in your crew has been. The talk tells you what is worth the drive; what Pip
          charges, and how much he has, you find out when a run gets there.
        </p>
      )}

      {city.counter && !city.isHome ? <MarketSeen counter={city.counter} products={products} /> : null}

      <h3 className="se-city__heading">Roads out</h3>
      <ul className="se-city__roads">
        {city.roads.map((road) => (
          <li key={road.to}>
            <span><strong>{road.name}</strong> to {road.toName}</span>
            <span className="se-num se-muted">{hoursText(road.driveHours)}{road.police >= 1.5 ? ' · heavy police' : road.police >= 1.2 ? ' · watched' : ''}</span>
            {road.note ? <span className="se-hint">{road.note}</span> : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
