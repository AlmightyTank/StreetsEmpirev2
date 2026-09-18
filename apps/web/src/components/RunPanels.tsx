import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { GameActionResult, RunDto, RunLaunchResult, RunMoveResult, RunReceiptDto, RunTradeResult, TravelDto, TravelRoutesDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { formatDuration } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel, Row } from './Panel.js';
import { SUPPLY_WORD, minutesText, unitPrice } from './CityMap.js';

type Products = TravelDto['products'];
const nameOf = (products: Products, key: string) => products.find((product) => product.key === key)?.name ?? key;
const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Whole numbers only; an empty box is null so the field can be cleared while typing. */
function whole(value: string): number | '' {
  if (value === '') return '';
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : '';
}

/** The ways to a city, fetched as the player picks it. */
function useRoutes(to: string, reloadKey: unknown): { routes: TravelRoutesDto | null; error: string | null } {
  const [routes, setRoutes] = useState<TravelRoutesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!to) { setRoutes(null); return; }
    let active = true;
    api.get<TravelRoutesDto>(`/game/travel/routes?to=${encodeURIComponent(to)}`)
      .then((next) => { if (active) { setRoutes(next); setError(null); } })
      .catch((caught: unknown) => { if (active) { setRoutes(null); setError(caught instanceof ApiError ? caught.message : 'Could not plan that drive.'); } });
    return () => { active = false; };
  }, [to, reloadKey]);
  return { routes, error };
}

function RoutePicker({ routes, value, onChange, name, costLabel }: {
  routes: TravelRoutesDto;
  value: number;
  onChange: (index: number) => void;
  name: string;
  costLabel: (turns: number) => string;
}) {
  return (
    <div className="se-routes" role="radiogroup" aria-label="Route">
      {routes.routes.map((route) => (
        <label key={route.index} className={`se-routes__route${route.index === value ? ' se-routes__route--on' : ''}`}>
          <input type="radio" name={name} checked={route.index === value} onChange={() => onChange(route.index)} />
          <span className="se-routes__way">
            {route.passesThrough.length
              ? <>Through {route.cities.slice(1, -1).map((city) => city.name).join(', ')}</>
              : 'Direct'}
          </span>
          <span className="se-routes__meta se-num">
            {minutesText(route.gameMinutes)} · {costLabel(route.turns)}
            {route.police >= 1.5 ? ' · heavy police' : route.police >= 1.2 ? ' · watched' : ''}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Load a run up at home: cars, escorts, cash and cargo, and where it goes. */
export function LaunchPanel({ data, to, onPick, onDone }: {
  data: TravelDto;
  /** The destination, shared with the map. */
  to: string;
  onPick: (slug: string) => void;
  onDone: () => void;
}) {
  const launch = useGameAction<RunLaunchResult>();
  const { home, rules } = data;
  const [route, setRoute] = useState(0);
  const [lowRiders, setLowRiders] = useState<number | ''>(Math.min(1, home.lowRiders));
  const [escorts, setEscorts] = useState<number | ''>(0);
  const [cash, setCash] = useState<number | ''>(0);
  const [cargo, setCargo] = useState<Record<string, number | ''>>({});
  const destination = data.cities.find((city) => city.slug === to && !city.isHome) ?? null;
  const { routes, error: routeError } = useRoutes(destination ? to : '', data.home.turns);
  useEffect(() => { setRoute(0); }, [to]);

  if (home.lowRiders === 0) {
    return (
      <Panel title="Load up a run">
        <p className="se-dim">A run needs at least one Low-Rider, and you have none at home.</p>
        <p className="se-hint">Each one carries {formatNumber(rules.cargoPerLowRider)} units of product and seats {rules.thugsPerLowRider} thugs. <Link className="se-golink" to="/game/stores/charlie">Charlie&rsquo;s</Link></p>
      </Panel>
    );
  }

  const cars = typeof lowRiders === 'number' ? lowRiders : 0;
  const capacity = cars * rules.cargoPerLowRider;
  const seats = cars * rules.thugsPerLowRider;
  const loaded = Object.values(cargo).reduce<number>((sum, units) => sum + (typeof units === 'number' ? units : 0), 0);
  const held = home.products;
  const hasProduct = held.some((product) => product.quantity > 0);
  const chosen = routes?.routes[route] ?? null;
  const cashCents = (typeof cash === 'number' ? cash : 0) * 100;

  const block = launch.busy ? 'The crew is loading up.'
    : !destination ? 'Pick a city on the map or in the list.'
      : !chosen ? (routeError ?? 'Planning the drive...')
        : cars < 1 || cars > home.lowRiders ? `Send between 1 and ${home.lowRiders} Low-Riders.`
          : (typeof escorts === 'number' ? escorts : 0) > Math.min(home.fitThugs, seats) ? `Send at most ${Math.min(home.fitThugs, seats)} escorts: ${seats} seats, ${home.fitThugs} fit thugs at home.`
            : cashCents > home.cashCents ? `You have ${formatCents(home.cashCents)} at home.`
              : loaded > capacity ? `${cars} Low-Rider${cars === 1 ? '' : 's'} carry ${formatNumber(capacity)} units, and that is ${formatNumber(loaded)}.`
                : held.some((product) => (typeof cargo[product.key] === 'number' ? cargo[product.key] as number : 0) > product.quantity) ? 'You cannot load more than you have.'
                  : chosen.turns > home.turns ? `The drive costs ${chosen.turns} turns and you have ${home.turns}.`
                    : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (block || !chosen) return;
    const load = Object.fromEntries(Object.entries(cargo).filter(([, units]) => typeof units === 'number' && units > 0)) as Record<string, number>;
    await launch.run((actionId): Promise<GameActionResult<RunLaunchResult>> => api.post('/game/travel/launch', {
      to, route, lowRiders: cars, escortThugs: typeof escorts === 'number' ? escorts : 0, cashCents, cargo: load, actionId,
    }));
    onDone();
  }

  return (
    <Panel title="Load up a run" aside={`${home.turns} turns`}>
      <form onSubmit={submit} className="se-launch">
        <div className="se-field">
          <label className="se-label" htmlFor="run-to">Where to</label>
          <select id="run-to" className="se-input" value={destination ? to : ''} onChange={(event) => onPick(event.target.value)}>
            <option value="" disabled>Pick a city</option>
            {data.cities.filter((city) => !city.isHome).map((city) => (
              <option key={city.slug} value={city.slug}>{city.name}{city.gameMinutes !== null ? ` · ${minutesText(city.gameMinutes)}` : ''}</option>
            ))}
          </select>
        </div>
        {destination && routes ? (
          <RoutePicker routes={routes} value={route} onChange={setRoute} name="launch-route" costLabel={(turns) => `${turns} turns there and back`} />
        ) : null}

        <div className="se-launch__grid">
          <div className="se-field">
            <label className="se-label" htmlFor="run-cars">Low-Riders <span className="se-muted">of {home.lowRiders}</span></label>
            <input id="run-cars" className="se-input" type="number" inputMode="numeric" min={1} max={home.lowRiders} value={lowRiders}
              onChange={(event) => setLowRiders(whole(event.target.value))} />
          </div>
          <div className="se-field">
            <label className="se-label" htmlFor="run-escorts">Escorts <span className="se-muted">of {Math.min(home.fitThugs, seats)}</span></label>
            <input id="run-escorts" className="se-input" type="number" inputMode="numeric" min={0} max={Math.min(home.fitThugs, seats)} value={escorts}
              onChange={(event) => setEscorts(whole(event.target.value))} />
          </div>
          <div className="se-field se-launch__cash">
            <label className="se-label" htmlFor="run-cash">Cash <span className="se-muted">of {formatCents(home.cashCents)}</span></label>
            <div className="se-launch__with-all">
              <input id="run-cash" className="se-input" type="number" inputMode="numeric" min={0} step={1} value={cash}
                onChange={(event) => setCash(whole(event.target.value))} />
              <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setCash(Math.floor(home.cashCents / 100))}>All</button>
            </div>
          </div>
        </div>
        <p className="se-hint">The run spends only the cash it carries. Escorts are away from home while it is out: they don&rsquo;t defend, cover the street or cook.</p>

        <h3 className="se-city__heading">In the trunk <span className="se-num">{formatNumber(loaded)} / {formatNumber(capacity)}</span></h3>
        <div className="se-meter se-launch__meter" aria-hidden="true">
          <div className={`se-meter__fill${loaded > capacity ? ' se-meter__fill--bad' : ''}`} style={{ width: `${capacity ? Math.min(100, (loaded / capacity) * 100) : 0}%` }} />
        </div>
        <div className="se-launch__cargo">
          {held.map((product) => (
            <div className="se-field" key={product.key}>
              <label className="se-label" htmlFor={`run-cargo-${product.key}`}>{nameOf(data.products, product.key)} <span className="se-muted">of {formatNumber(product.quantity)}</span></label>
              <input id={`run-cargo-${product.key}`} className="se-input" type="number" inputMode="numeric" min={0} max={product.quantity}
                value={cargo[product.key] ?? ''} placeholder="0" disabled={product.quantity === 0}
                onChange={(event) => setCargo({ ...cargo, [product.key]: whole(event.target.value) })} />
            </div>
          ))}
        </div>
        {!hasProduct ? <p className="se-hint">Nothing at home to load. A run can still go with cash and come back with product.</p> : null}

        <Button className="se-btn se-btn--primary se-btn--block se-mt" disabledReason={block}>
          {launch.busy ? 'Loading up...' : destination ? `Send the run to ${destination.name}${chosen ? ` · ${chosen.turns} turns` : ''}` : 'Send the run'}
        </Button>
        {destination && chosen ? (
          <p className="se-hint">
            Gets there around {clock(chosen.arriveAt)}. It trades for {minutesText(rules.townWindowMinutes)} in town, then heads home on its own unless you move it on.
          </p>
        ) : null}
      </form>
      {launch.error ? <Alert>{launch.error}</Alert> : null}
    </Panel>
  );
}

/** Trade at Pip's in the town the run is in. */
function TownCounter({ run, products, onDone }: { run: RunDto; products: Products; onDone: () => void }) {
  const trade = useGameAction<RunTradeResult>();
  const counter = run.counter!;
  const carried = counter.products.filter((product) => product.supply !== null);
  const [product, setProduct] = useState(carried[0]?.key ?? '');
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState<number | ''>('');
  const row = counter.products.find((entry) => entry.key === product) ?? null;
  const inTrunk = run.cargo.find((entry) => entry.key === product)?.quantity ?? 0;
  const trunk = run.cargo.reduce((sum, entry) => sum + entry.quantity, 0);
  const buying = direction === 'buy';
  const unit = row ? (buying ? row.buyCents ?? 0 : row.sellCents ?? 0) : 0;
  const max = !row || row.supply === null ? 0
    : buying ? Math.max(0, Math.min(row.stock, run.capacity - trunk, unit > 0 ? Math.floor(run.cashCents / unit) : 0))
      : inTrunk;
  const qty = typeof quantity === 'number' ? quantity : 0;
  const block = trade.busy ? 'Counting it out.'
    : !row || row.supply === null ? 'Pick something Pip carries here.'
      : max < 1 ? (buying ? (row.stock === 0 ? 'Pip has none left here.' : run.capacity - trunk <= 0 ? 'The trunk is full.' : 'The run cannot afford one.') : 'There is none in the trunk.')
        : qty < 1 || qty > max ? `Enter a whole number from 1 to ${formatNumber(max)}.`
          : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (block) return;
    await trade.run((actionId): Promise<GameActionResult<RunTradeResult>> => api.post('/game/travel/trade', { product, direction, quantity: qty, actionId }));
    setQuantity('');
    onDone();
  }

  return (
    <div className="se-towncounter">
      <h3 className="se-city__heading">Pip&rsquo;s in {run.position.cityName}</h3>
      <div className="se-rows">
        {counter.products.map((entry) => (
          <button type="button" key={entry.key} disabled={entry.supply === null}
            className={`se-row se-towncounter__row${entry.key === product ? ' se-towncounter__row--on' : ''}`}
            onClick={() => setProduct(entry.key)}>
            <span className="se-row__label">{nameOf(products, entry.key)}</span>
            <span className="se-row__value">
              {entry.supply === null ? <span className="se-muted">Not carried</span> : (
                <>
                  <span className={`se-city__supply se-city__supply--${entry.supply.toLowerCase()}`}>{SUPPLY_WORD[entry.supply]}</span>
                  <span className="se-muted se-num"> ({formatNumber(entry.stock)})</span>
                  {' '}<span className="se-num">{unitPrice(entry.buyCents!)}</span>
                  <span className="se-muted se-num"> / {unitPrice(entry.sellCents!)}</span>
                </>
              )}
            </span>
          </button>
        ))}
      </div>
      <form className="se-towncounter__form" onSubmit={submit}>
        <div className="se-seg" role="group" aria-label="Buy or sell">
          <button type="button" className={`se-seg__btn${buying ? ' se-seg__btn--on' : ''}`} aria-pressed={buying} onClick={() => setDirection('buy')}>Buy</button>
          <button type="button" className={`se-seg__btn${!buying ? ' se-seg__btn--on' : ''}`} aria-pressed={!buying} onClick={() => setDirection('sell')}>Sell</button>
        </div>
        <div className="se-launch__with-all">
          <input className="se-input" type="number" inputMode="numeric" min={1} max={max} value={quantity} placeholder="How many"
            aria-label="Quantity" onChange={(event) => setQuantity(whole(event.target.value))} />
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={max < 1} onClick={() => setQuantity(max)}>Max</button>
        </div>
        <Button className="se-btn se-btn--primary se-btn--block" disabledReason={block}>
          {buying ? 'Buy' : 'Sell'} {row ? nameOf(products, row.key) : ''}{!block ? ` · ${formatCents(qty * unit)}` : ''}
        </Button>
      </form>
      {trade.error ? <Alert>{trade.error}</Alert> : null}
      {trade.result ? (
        <p className="se-hint se-good">
          {trade.result.result.direction === 'buy' ? 'Bought' : 'Sold'} {formatNumber(trade.result.result.quantity)} {trade.result.result.productName} for {formatCents(trade.result.result.totalCents)}.
          The run carries {formatCents(trade.result.result.runCashCents)}.
        </p>
      ) : null}
    </div>
  );
}

/** Leave town: for another city, or home. */
function MoveOn({ run, data, onDone }: { run: RunDto; data: TravelDto; onDone: () => void }) {
  const move = useGameAction<RunMoveResult>();
  const [to, setTo] = useState('');
  const [route, setRoute] = useState(0);
  const { routes, error } = useRoutes(to, run.position.city);
  useEffect(() => { setRoute(0); }, [to]);
  const chosen = routes?.routes[route] ?? null;
  const block = move.busy ? 'On the move.' : !to ? 'Pick a city.' : !chosen ? (error ?? 'Planning the drive...') : chosen.turns > data.home.turns ? `That costs ${chosen.turns} more turns and you have ${data.home.turns}.` : null;

  return (
    <div className="se-moveon">
      <h3 className="se-city__heading">Move on</h3>
      <div className="se-field">
        <label className="se-label" htmlFor="run-next">Drive on to</label>
        <select id="run-next" className="se-input" value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">Pick a city</option>
          {data.cities.filter((city) => !city.isHome && city.slug !== run.position.city).map((city) => <option key={city.slug} value={city.slug}>{city.name}</option>)}
        </select>
      </div>
      {to && routes ? <RoutePicker routes={routes} value={route} onChange={setRoute} name="next-route" costLabel={(turns) => (turns ? `${turns} more turns` : 'no extra turns')} /> : null}
      <div className="se-actions-row">
        <Button type="button" className="se-btn se-btn--primary" disabledReason={block}
          onClick={async () => {
            await move.run((actionId): Promise<GameActionResult<RunMoveResult>> => api.post('/game/travel/drive-on', { to, route, actionId }));
            onDone();
          }}>
          Drive on
        </Button>
        <Button type="button" className="se-btn" disabledReason={move.busy ? 'On the move.' : null}
          onClick={async () => {
            await move.run((actionId): Promise<GameActionResult<RunMoveResult>> => api.post('/game/travel/head-home', { actionId }));
            onDone();
          }}>
          Head home now
        </Button>
      </div>
      {move.error ? <Alert>{move.error}</Alert> : null}
    </div>
  );
}

/** The whole trip as a line of stops, the run's place on it, and what it carries. */
export function RunPanel({ run, data, onDone }: { run: RunDto; data: TravelDto; onDone: () => void }) {
  const { msRemaining } = useCountdown(run.position.until, onDone);
  const inTown = run.position.phase === 'town';
  const stop = run.stops[run.position.stopIndex]!;
  const trunk = run.cargo.reduce((sum, entry) => sum + entry.quantity, 0);
  const headline = inTown
    ? `In ${run.position.cityName}: ${formatDuration(msRemaining)} left to trade`
    : stop.isHome
      ? `Heading home: back in ${formatDuration(msRemaining)}`
      : `On the road to ${run.position.cityName}: there in ${formatDuration(msRemaining)}`;

  return (
    <Panel title="Your run" aside={`${run.lowRiders} Low-Rider${run.lowRiders === 1 ? '' : 's'}${run.escortThugs ? ` · ${run.escortThugs} escorts` : ''}`}>
      <p className={`se-run__headline${inTown ? ' se-run__headline--town' : ''}`}>{headline}</p>
      <ol className="se-run__trip">
        {tripNodes(run).map((node, index) => {
          const here = inTown && node.stop === stop;
          return (
            <li key={`${node.slug}-${index}`} className={`se-run__node${node.stop ? ' se-run__node--stop' : ' se-run__node--pass'}${here ? ' se-run__node--here' : ''}`}
              title={node.stop ? undefined : 'Driving through'}>
              {SHORT_NAME(node.name)}
            </li>
          );
        })}
      </ol>
      {!inTown ? (
        <div className="se-run__leg">
          <span className="se-num">{run.position.road ? `${cityLabel(data, run.position.road.from)} → ${cityLabel(data, run.position.road.to)}` : ''}</span>
          <div className="se-meter" aria-label={`${Math.round(run.position.progress * 100)}% of the way`}>
            <div className="se-meter__fill" style={{ width: `${Math.round(run.position.progress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      <div className="se-rows se-mt">
        <Row label="Cash in the car" value={formatCents(run.cashCents)} strong tooltip="What the run can spend. Home cash never reaches it." />
        <Row label="Trunk" value={`${formatNumber(trunk)} / ${formatNumber(run.capacity)}`} />
        {run.cargo.filter((entry) => entry.quantity > 0).map((entry) => (
          <Row key={entry.key} label={nameOf(data.products, entry.key)} value={formatNumber(entry.quantity)} />
        ))}
        <Row label="Back home" value={clock(run.stops[run.stops.length - 1]!.arriveAt)} />
      </div>

      {inTown ? (
        <>
          <TownCounter run={run} products={data.products} onDone={onDone} />
          <MoveOn run={run} data={data} onDone={onDone} />
        </>
      ) : (
        <p className="se-hint">You can trade once it gets there. A run left alone trades nothing: it waits out its window and comes home with what it has.</p>
      )}

      {run.trades.length ? (
        <>
          <h3 className="se-city__heading">Trades so far</h3>
          <TradeList trades={run.trades} products={data.products} />
        </>
      ) : null}
    </Panel>
  );
}

/** Every city on the trip in order: stops, and towns it only drives through. */
function tripNodes(run: RunDto): Array<{ slug: string; name: string; stop: RunDto['stops'][number] | null }> {
  const first = run.stops[0]!.route[0]!;
  return [
    { slug: first.slug, name: first.name, stop: null },
    ...run.stops.flatMap((entry) => entry.route.slice(1).map((city, index, list) => ({ slug: city.slug, name: city.name, stop: index === list.length - 1 ? entry : null }))),
  ];
}

const SHORT_NAME = (name: string) => name.replace('New York City', 'New York').replace('Beverly Hills', 'Bev. Hills').replace('Los Angeles', 'LA');
const cityLabel = (data: TravelDto, slug: string) => SHORT_NAME(data.cities.find((city) => city.slug === slug)?.name ?? slug);

function TradeList({ trades, products }: { trades: RunDto['trades']; products: Products }) {
  return (
    <ul className="se-run__trades">
      {trades.map((trade, index) => (
        <li key={index}>
          <span>{trade.direction === 'buy' ? 'Bought' : 'Sold'} {formatNumber(trade.quantity)} {nameOf(products, trade.product)} in {SHORT_NAME(trade.cityName)}</span>
          <span className={`se-num ${trade.direction === 'buy' ? 'se-bad' : 'se-good'}`}>{trade.direction === 'buy' ? '-' : '+'}{formatCents(trade.totalCents)}</span>
        </li>
      ))}
    </ul>
  );
}

/** What the last run brought home. */
export function ReceiptPanel({ receipt, products }: { receipt: RunReceiptDto; products: Products }) {
  const cashChange = receipt.cashCents - receipt.startCashCents;
  const moved = receipt.cargo.filter((entry) => entry.quantity !== entry.startQuantity || entry.quantity > 0);
  return (
    <Panel title="Last run" aside={`Back ${new Date(receipt.returnedAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`}>
      <div className="se-rows">
        <Row label="Went to" value={receipt.cities.map((city) => city.name).join(', ') || 'Nowhere'} />
        <Row label="Cash" value={<span className="se-num">{formatCents(receipt.startCashCents)} → {formatCents(receipt.cashCents)} <span className={cashChange >= 0 ? 'se-good' : 'se-bad'}>({cashChange >= 0 ? '+' : ''}{formatCents(cashChange)})</span></span>} strong />
        {moved.map((entry) => (
          <Row key={entry.key} label={nameOf(products, entry.key)} value={<span className="se-num">{formatNumber(entry.startQuantity)} → {formatNumber(entry.quantity)}</span>} />
        ))}
        <Row label="Turns" value={formatNumber(receipt.turnsSpent)} />
      </div>
      {receipt.trades.length ? <TradeList trades={receipt.trades} products={products} /> : <p className="se-hint">No trades: the crew only looked.</p>}
    </Panel>
  );
}
