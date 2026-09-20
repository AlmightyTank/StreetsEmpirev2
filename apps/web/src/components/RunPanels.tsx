import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { GameActionResult, MarketPriceDto, RunDto, RunIncidentDto, RunLaunchResult, RunMoveResult, RunOutpostEstablishResult, RunOutpostTransferResult, RunReceiptDto, RunTradeResult, TravelDto, TravelRoutesDto } from '@streets/shared';
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
function useRoutes(to: string, reloadKey: unknown, runId?: string): { routes: TravelRoutesDto | null; error: string | null } {
  const [routes, setRoutes] = useState<TravelRoutesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!to) { setRoutes(null); return; }
    let active = true;
    api.get<TravelRoutesDto>(`/game/travel/routes?to=${encodeURIComponent(to)}${runId ? `&runId=${encodeURIComponent(runId)}` : ''}`)
      .then((next) => { if (active) { setRoutes(next); setError(null); } })
      .catch((caught: unknown) => { if (active) { setRoutes(null); setError(caught instanceof ApiError ? caught.message : 'Could not plan that drive.'); } });
    return () => { active = false; };
  }, [to, reloadKey, runId]);
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
  const [beer, setBeer] = useState<number | ''>(0);
  const [cargo, setCargo] = useState<Record<string, number | ''>>({});
  const [buy, setBuy] = useState<Record<string, number | ''>>({});
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
  const units = (from: Record<string, number | ''>) => Object.values(from).reduce<number>((sum, count) => sum + (typeof count === 'number' ? count : 0), 0);
  const held = home.products;
  const hasProduct = held.some((product) => product.quantity > 0);
  const chosen = routes?.routes[route] ?? null;
  const cashCents = (typeof cash === 'number' ? cash : 0) * 100;
  // 0.5.0-F: the home market, wholesale, as the crew loads up.
  const homeCity = data.cities.find((city) => city.isHome) ?? null;
  const wholesale = rules.homeMarketAtLaunch
    ? (homeCity?.counter?.products ?? []).flatMap((entry) => (entry.market ? [{ key: entry.key, market: entry.market }] : []))
    : [];
  const bought = Object.fromEntries(Object.entries(buy).filter(([, count]) => typeof count === 'number' && count > 0)) as Record<string, number>;
  const marketCents = wholesale.reduce((sum, entry) => sum + marketEstimate(entry.market, true, bought[entry.key] ?? 0), 0);
  const beerUnits = typeof beer === 'number' ? beer : 0;
  const loaded = units(cargo) + units(buy) + beerUnits;

  const block = launch.busy ? 'The crew is loading up.'
    : !destination ? 'Pick a city on the map or in the list.'
      : !chosen ? (routeError ?? 'Planning the drive...')
        : cars < 1 || cars > home.lowRiders ? `Send between 1 and ${home.lowRiders} Low-Riders.`
          : (typeof escorts === 'number' ? escorts : 0) > Math.min(home.fitThugs, seats) ? `Send at most ${Math.min(home.fitThugs, seats)} escorts: ${seats} seats, ${home.fitThugs} fit thugs at home.`
            : cashCents + marketCents > home.cashCents ? `You have ${formatCents(home.cashCents)} at home, and that is ${formatCents(cashCents + marketCents)} with what the market comes to.`
              : beerUnits > home.beer ? `You only have ${formatNumber(home.beer)} beer at home.`
              : loaded > capacity ? `${cars} Low-Rider${cars === 1 ? '' : 's'} carry ${formatNumber(capacity)} units, and that is ${formatNumber(loaded)}.`
                : held.some((product) => (typeof cargo[product.key] === 'number' ? cargo[product.key] as number : 0) > product.quantity) ? 'You cannot load more than you have.'
                  : chosen.turns > home.turns ? `The drive costs ${chosen.turns} turns and you have ${home.turns}.`
                    : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (block || !chosen) return;
    const load = Object.fromEntries(Object.entries(cargo).filter(([, count]) => typeof count === 'number' && count > 0)) as Record<string, number>;
    const quotes = Object.fromEntries(wholesale.filter((entry) => bought[entry.key]).map((entry) => [entry.key, entry.market.buyCents]));
    await launch.run((actionId): Promise<GameActionResult<RunLaunchResult>> => api.post('/game/travel/launch', {
      to, route, lowRiders: cars, escortThugs: typeof escorts === 'number' ? escorts : 0, cashCents, beer: beerUnits, cargo: load, market: bought, marketQuotes: quotes, actionId,
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
          <div className="se-field">
            <label className="se-label" htmlFor="run-beer">Beer <span className="se-muted">of {formatNumber(home.beer)}</span></label>
            <input id="run-beer" className="se-input" type="number" inputMode="numeric" min={0} max={home.beer} value={beer}
              onChange={(event) => setBeer(whole(event.target.value))} />
          </div>
        </div>
        <p className="se-hint">The run spends only the cash it carries. Beer takes trunk space too, so an outpost has to be supplied by a real load. Escorts ride armed with the best guns from home, one each, and are away while it is out: they don&rsquo;t defend, cover the street or cook. A bust or an arrest takes their guns.</p>

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
        {!hasProduct && !wholesale.length ? <p className="se-hint">Nothing at home to load. A run can still go with cash and come back with product.</p> : null}

        {wholesale.length ? (
          <>
            <h3 className="se-city__heading">Buy on the {homeCity?.name} market {marketCents > 0 ? <span className="se-num">{formatCents(marketCents)}</span> : null}</h3>
            <div className="se-launch__cargo">
              {wholesale.map((entry) => (
                <div className="se-field" key={entry.key}>
                  <label className="se-label" htmlFor={`run-buy-${entry.key}`}>
                    {nameOf(data.products, entry.key)} <span className="se-muted se-num">{unitPrice(entry.market.buyCents)}</span>
                  </label>
                  <input id={`run-buy-${entry.key}`} className="se-input" type="number" inputMode="numeric" min={0}
                    max={marketMaxBuy(entry.market, home.cashCents - cashCents, Math.max(0, capacity - units(cargo)))}
                    value={buy[entry.key] ?? ''} placeholder="0"
                    onChange={(event) => setBuy({ ...buy, [entry.key]: whole(event.target.value) })} />
                </div>
              ))}
            </div>
            <p className="se-hint">Wholesale, out of home cash and straight into the trunk. Every unit you buy moves the price, and you cannot sell here: the market at home is for loading up.</p>
          </>
        ) : null}

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

/**
 * Roughly what `quantity` units come to on the high market from its next unit: every
 * unit moves the price 1% per `depth` units, against the trader. The server prices it
 * exactly; this is the estimate on the button.
 */
function marketEstimate(market: MarketPriceDto, buying: boolean, quantity: number): number {
  if (quantity < 1) return 0;
  const drift = (quantity - 1) / (2 * market.depth * 100);
  return Math.round(quantity * (buying ? market.buyCents * (1 + drift) : market.sellCents * Math.max(0.1, 1 - drift)));
}

/** The most units a run can buy on the high market with its cash, by the estimate. */
function marketMaxBuy(market: MarketPriceDto, cashCents: number, room: number): number {
  let low = 0;
  let high = Math.max(0, room);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (marketEstimate(market, true, mid) <= cashCents) low = mid; else high = mid - 1;
  }
  return low;
}

const EVENT_WORDS: Record<'GLUT' | 'DROUGHT', (product: string) => string> = {
  GLUT: (product) => `A shipment of ${product} just landed: it is cheap here, at Pip's and on the market.`,
  DROUGHT: (product) => `The ${product} suppliers got hit: Pip is dry and the market is paying through the nose.`,
};

/** Trade in the town the run is in: at Pip's counter, or (0.5.0-C) on the high market. */
function TownCounter({ run, data, onDone }: { run: RunDto; data: TravelDto; onDone: () => void }) {
  const products = data.products;
  const trade = useGameAction<RunTradeResult>();
  const counter = run.counter!;
  const hasMarket = Boolean(data.rules.market) && counter.products.some((entry) => entry.market);
  const [venue, setVenue] = useState<'pip' | 'market'>('pip');
  const tradable = counter.products.filter((entry) => (venue === 'pip' ? entry.supply !== null : entry.market !== null));
  const [product, setProduct] = useState(tradable[0]?.key ?? '');
  const [direction, setDirection] = useState<'buy' | 'sell'>('buy');
  const [quantity, setQuantity] = useState<number | ''>('');
  const row = counter.products.find((entry) => entry.key === product) ?? null;
  const inTrunk = run.cargo.find((entry) => entry.key === product)?.quantity ?? 0;
  const trunk = run.cargo.reduce((sum, entry) => sum + entry.quantity, 0);
  const room = Math.max(0, run.capacity - trunk);
  const buying = direction === 'buy';
  const onMarket = venue === 'market';
  const market = row?.market ?? null;
  const unit = !row ? 0 : onMarket ? (market ? (buying ? market.buyCents : market.sellCents) : 0) : (buying ? row.buyCents ?? 0 : row.sellCents ?? 0);
  const open = !row ? false : onMarket ? market !== null : row.supply !== null;
  const max = !open ? 0
    : !buying ? inTrunk
      : onMarket ? marketMaxBuy(market!, run.cashCents, room)
        : Math.max(0, Math.min(row!.stock, room, unit > 0 ? Math.floor(run.cashCents / unit) : 0));
  const qty = typeof quantity === 'number' ? quantity : 0;
  const total = onMarket && market ? marketEstimate(market, buying, qty) : qty * unit;
  const block = trade.busy ? 'Counting it out.'
    : !open ? (onMarket ? 'Nobody here trades that in bulk.' : 'Pick something Pip carries here.')
      : max < 1 ? (buying ? (!onMarket && row!.stock === 0 ? 'Pip has none left here.' : room <= 0 ? 'The trunk is full.' : 'The run cannot afford one.') : 'There is none in the trunk.')
        : qty < 1 || qty > max ? `Enter a whole number from 1 to ${formatNumber(max)}.`
          : null;
  const eventProduct = counter.event ? nameOf(products, counter.event.product).toLowerCase() : '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (block) return;
    await trade.run((actionId): Promise<GameActionResult<RunTradeResult>> => api.post('/game/travel/trade', {
      runId: run.id, product, direction, venue, quantity: qty, actionId, ...(onMarket ? { quoteCents: unit } : {}),
    }));
    setQuantity('');
    onDone();
  }

  const result = trade.result?.result;
  return (
    <div className="se-towncounter">
      <h3 className="se-city__heading">Trading in {run.position.cityName}</h3>
      {counter.event ? (
        <p className={`se-hint se-towncounter__event se-${counter.event.kind === 'GLUT' ? 'good' : 'warn'}`}>
          {EVENT_WORDS[counter.event.kind](eventProduct)} Until {clock(counter.event.endsAt)}.
        </p>
      ) : null}
      {hasMarket ? (
        <div className="se-seg se-towncounter__venue" role="group" aria-label="Where to trade">
          <button type="button" className={`se-seg__btn${!onMarket ? ' se-seg__btn--on' : ''}`} aria-pressed={!onMarket} onClick={() => setVenue('pip')}>Pip&rsquo;s counter</button>
          <button type="button" className={`se-seg__btn${onMarket ? ' se-seg__btn--on' : ''}`} aria-pressed={onMarket} onClick={() => setVenue('market')}>High market</button>
        </div>
      ) : null}
      <p className="se-hint">
        {onMarket
          ? 'Everyone in the round trades here. Every unit moves the price against you, and it drifts back over the next few hours.'
          : 'Your own shelf: nobody else can buy it out from under you. Buy / sell prices each.'}
      </p>
      <div className="se-rows">
        {counter.products.map((entry) => {
          const usable = onMarket ? entry.market !== null : entry.supply !== null;
          return (
            <button type="button" key={entry.key} disabled={!usable}
              className={`se-row se-towncounter__row${entry.key === product ? ' se-towncounter__row--on' : ''}`}
              onClick={() => setProduct(entry.key)}>
              <span className="se-row__label">{nameOf(products, entry.key)}</span>
              <span className="se-row__value">
                {onMarket ? (
                  entry.market ? (
                    <>
                      <span className="se-num">{unitPrice(entry.market.buyCents)}</span>
                      <span className="se-muted se-num"> / {unitPrice(entry.market.sellCents)}</span>
                    </>
                  ) : <span className="se-muted">No market</span>
                ) : entry.supply === null ? <span className="se-muted">Not carried</span> : (
                  <>
                    <span className={`se-city__supply se-city__supply--${entry.supply.toLowerCase()}`}>{SUPPLY_WORD[entry.supply]}</span>
                    <span className="se-muted se-num"> ({formatNumber(entry.stock)})</span>
                    {' '}<span className="se-num">{unitPrice(entry.buyCents!)}</span>
                    <span className="se-muted se-num"> / {unitPrice(entry.sellCents!)}</span>
                  </>
                )}
              </span>
            </button>
          );
        })}
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
          {buying ? 'Buy' : 'Sell'} {row ? nameOf(products, row.key) : ''}{!block ? ` · ${onMarket ? 'about ' : ''}${formatCents(total)}` : ''}
        </Button>
        {!buying ? <p className="se-hint">Selling draws Heat here, more in towns with more police. Every trade risks a bust once your Heat is past this town&rsquo;s line.</p> : null}
      </form>
      {trade.error ? <Alert>{trade.error}</Alert> : null}
      {result ? (
        <p className={`se-hint ${result.trouble ? 'se-bad' : 'se-good'}`}>
          {result.direction === 'buy' ? 'Bought' : 'Sold'} {formatNumber(result.quantity)} {result.productName} for {formatCents(result.totalCents)}
          {result.venue === 'market' ? ` (${unitPrice(result.unitCents)} each on average)` : ''}.
          {result.heat && result.heat.added > 0 ? ` Heat ${result.heat.before} → ${result.heat.after}.` : ''}
          {result.trouble ? ` ${incidentText(result.trouble, products)}` : ` The run carries ${formatCents(result.runCashCents)}.`}
        </p>
      ) : null}
    </div>
  );
}

const GUN_NAMES: Record<string, [string, string]> = { PISTOL: ['pistol', 'pistols'], SHOTGUN: ['shotgun', 'shotguns'], TEK9: ['Tek-9', 'Tek-9s'], AK47: ['AK-47', 'AK-47s'] };
const gunText = (key: string, count: number) => `${formatNumber(count)} ${GUN_NAMES[key]![count === 1 ? 0 : 1]}`;

/** A stop, bust or arrest in one line. */
function incidentText(incident: RunIncidentDto, products: Products): string {
  const taken = Object.entries(incident.seized).filter(([, units]) => units > 0)
    .map(([key, units]) => (GUN_NAMES[key] ? gunText(key, units) : `${formatNumber(units)} ${nameOf(products, key)}`));
  const lost = [taken.join(', '), incident.fineCents > 0 ? formatCents(incident.fineCents) : ''].filter(Boolean).join(' and ') || 'nothing';
  if (incident.kind === 'STOP') return `Stopped on ${incident.road ?? 'the road'} into ${SHORT_NAME(incident.cityName)}: the police took ${lost}.`;
  if (incident.kind === 'BUST') return `Busted in ${SHORT_NAME(incident.cityName)}: the police took ${lost}.`;
  return `Arrested in ${SHORT_NAME(incident.cityName)}: the police took ${lost}, and the crew is driving home.`;
}

function IncidentList({ incidents, products }: { incidents: RunIncidentDto[]; products: Products }) {
  if (!incidents.length) return null;
  return (
    <>
      <h3 className="se-city__heading">Trouble</h3>
      <ul className="se-run__trades se-run__incidents">
        {incidents.map((incident, index) => <li key={index} className="se-bad">{incidentText(incident, products)}</li>)}
      </ul>
    </>
  );
}

/** 0.6.0-D. Establish or service an away corner while the run is physically in town. */
export function OutpostStopPanel({ run, data, onDone }: { run: RunDto; data: TravelDto; onDone: () => void }) {
  const rules = data.rules.outposts;
  const city = data.cities.find((entry) => entry.slug === run.position.city) ?? null;
  const turf = city?.turf ?? null;
  const establish = useGameAction<RunOutpostEstablishResult>();
  const transfer = useGameAction<RunOutpostTransferResult>();
  const openBlocks = turf?.blocks.filter((block) => !block.holder) ?? [];
  const owned = turf?.blocks.filter((block) => block.isMine && block.outpost) ?? [];
  const [district, setDistrict] = useState(openBlocks[0]?.district ?? '');
  const target = openBlocks.find((block) => block.district === district) ?? openBlocks[0] ?? null;
  const [thugs, setThugs] = useState<number | ''>(target?.cornerMinimumThugs ?? 1);
  const [cash, setCash] = useState<number | ''>(0);
  const [beer, setBeer] = useState<number | ''>(0);
  const [product, setProduct] = useState(run.cargo.find((entry) => entry.quantity > 0)?.key ?? data.products[0]?.key ?? '');
  const [productQty, setProductQty] = useState<number | ''>(0);

  const [serviceDistrict, setServiceDistrict] = useState(owned[0]?.district ?? '');
  const boxBlock = owned.find((block) => block.district === serviceDistrict) ?? owned[0] ?? null;
  const [direction, setDirection] = useState<'deposit' | 'withdraw'>('deposit');
  const [moveCash, setMoveCash] = useState<number | ''>(0);
  const [moveBeer, setMoveBeer] = useState<number | ''>(0);
  const [moveProduct, setMoveProduct] = useState(run.cargo.find((entry) => entry.quantity > 0)?.key ?? data.products[0]?.key ?? '');
  const [moveQty, setMoveQty] = useState<number | ''>(0);

  useEffect(() => {
    if (target) setThugs((current) => current === '' || current < target.cornerMinimumThugs ? target.cornerMinimumThugs : current);
  }, [target?.district, target?.cornerMinimumThugs]);

  if (!rules || !city || city.isHome || !turf) return null;

  const guns = Object.values(run.guns).reduce((sum, count) => sum + count, 0);
  const fitEscorts = run.escortThugs;
  const seedCashCents = (typeof cash === 'number' ? cash : 0) * 100;
  const seedBeer = typeof beer === 'number' ? beer : 0;
  const seedQty = typeof productQty === 'number' ? productQty : 0;
  const seedProducts = product && seedQty > 0 ? { [product]: seedQty } : {};
  const runHeld = run.cargo.find((entry) => entry.key === product)?.quantity ?? 0;
  const seedThugs = typeof thugs === 'number' ? thugs : 0;

  const establishBlock = establish.busy ? 'Setting up the corner.'
    : !target ? 'No open block is available in this city.'
      : turf.heldAway >= turf.awayCap ? `You already hold your ${turf.awayCap}-block away cap.`
        : target.presenceTurns < turf.presenceRequired ? `You need ${turf.presenceRequired} presence here; you have ${Math.floor(target.presenceTurns)}.`
          : seedThugs < target.cornerMinimumThugs ? `Leave at least ${target.cornerMinimumThugs} escorts.`
            : seedThugs > fitEscorts ? `The run only has ${fitEscorts} escorts.`
              : seedThugs > guns ? `The run only has ${guns} guns.`
                : seedCashCents > run.cashCents ? 'The run does not carry that much cash.'
                  : seedCashCents > rules.cashCapCents ? `The box holds at most ${formatCents(rules.cashCapCents)}.`
                    : seedBeer > run.beer ? `The run only carries ${run.beer} beer.`
                      : seedBeer > rules.beerCap ? `The box holds at most ${rules.beerCap} beer.`
                        : seedQty > runHeld ? `The run only carries ${runHeld} ${nameOf(data.products, product)}.`
                          : seedQty > rules.productCap ? `The box holds at most ${rules.productCap} product units.`
                            : data.home.turns < turf.postTurnCost + rules.transferTurnCost ? `This setup costs ${turf.postTurnCost + rules.transferTurnCost} turns.`
                              : null;

  const moveCashCents = (typeof moveCash === 'number' ? moveCash : 0) * 100;
  const moveBeerCount = typeof moveBeer === 'number' ? moveBeer : 0;
  const moveProductQty = typeof moveQty === 'number' ? moveQty : 0;
  const movedProducts = moveProduct && moveProductQty > 0 ? { [moveProduct]: moveProductQty } : {};
  const box = boxBlock?.outpost ?? null;
  const runProduct = run.cargo.find((entry) => entry.key === moveProduct)?.quantity ?? 0;
  const boxProduct = box?.products[moveProduct] ?? 0;
  const moveSomething = moveCashCents > 0 || moveBeerCount > 0 || moveProductQty > 0;
  const transferBlock = transfer.busy ? 'Moving stock.'
    : !boxBlock || !box ? 'Pick one of your outposts.'
      : !moveSomething ? 'Choose something to move.'
        : data.home.turns < rules.transferTurnCost ? `This transfer costs ${rules.transferTurnCost} turns.`
          : direction === 'deposit'
            ? moveCashCents > run.cashCents ? 'The run does not carry that much cash.'
              : moveBeerCount > run.beer ? `The run only carries ${run.beer} beer.`
                : moveProductQty > runProduct ? `The run only carries ${runProduct} ${nameOf(data.products, moveProduct)}.`
                  : box.cashCents + moveCashCents > rules.cashCapCents ? 'The outpost cash box would overflow.'
                    : box.beer + moveBeerCount > rules.beerCap ? 'The outpost beer stock would overflow.'
                      : Object.values(box.products).reduce((sum, value) => sum + value, 0) + moveProductQty > rules.productCap ? 'The outpost product box would overflow.'
                        : null
            : moveCashCents > box.cashCents ? 'The outpost does not hold that much cash.'
              : moveBeerCount > box.beer ? `The outpost only holds ${box.beer} beer.`
                : moveProductQty > boxProduct ? `The outpost only holds ${boxProduct} ${nameOf(data.products, moveProduct)}.`
                  : run.cargo.reduce((sum, entry) => sum + entry.quantity, run.beer) + moveBeerCount + moveProductQty > run.capacity ? 'The run does not have enough trunk room.'
                    : null;

  return (
    <div className="se-moveon se-outposts">
      <h3 className="se-city__heading">Outposts in {city.name}</h3>
      {openBlocks.length ? (
        <div className="se-grid">
          <div className="se-field">
            <label className="se-label" htmlFor="outpost-block">Open block</label>
            <select id="outpost-block" className="se-input" value={target?.district ?? ''} onChange={(event) => setDistrict(event.target.value)}>
              {openBlocks.map((block) => <option key={block.district} value={block.district}>{block.districtName} · {Math.floor(block.presenceTurns)}/{turf.presenceRequired} presence</option>)}
            </select>
          </div>
          <div className="se-launch__grid">
            <div className="se-field">
              <label className="se-label" htmlFor="outpost-thugs">Escorts staying</label>
              <input id="outpost-thugs" className="se-input" type="number" inputMode="numeric" min={target?.cornerMinimumThugs ?? 1} max={run.escortThugs} value={thugs}
                onChange={(event) => setThugs(whole(event.target.value))} />
            </div>
            <div className="se-field">
              <label className="se-label" htmlFor="outpost-cash">Seed cash</label>
              <input id="outpost-cash" className="se-input" type="number" inputMode="numeric" min={0} value={cash}
                onChange={(event) => setCash(whole(event.target.value))} />
            </div>
            <div className="se-field">
              <label className="se-label" htmlFor="outpost-beer">Seed beer</label>
              <input id="outpost-beer" className="se-input" type="number" inputMode="numeric" min={0} value={beer}
                onChange={(event) => setBeer(whole(event.target.value))} />
            </div>
          </div>
          <div className="se-launch__grid">
            <div className="se-field">
              <label className="se-label" htmlFor="outpost-product">Seed product</label>
              <select id="outpost-product" className="se-input" value={product} onChange={(event) => setProduct(event.target.value)}>
                {data.products.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
              </select>
            </div>
            <div className="se-field">
              <label className="se-label" htmlFor="outpost-product-qty">Units</label>
              <input id="outpost-product-qty" className="se-input" type="number" inputMode="numeric" min={0} value={productQty}
                onChange={(event) => setProductQty(whole(event.target.value))} />
            </div>
          </div>
          <Button type="button" className="se-btn se-btn--primary" disabledReason={establishBlock}
            onClick={async () => {
              if (!target) return;
              await establish.run((actionId): Promise<GameActionResult<RunOutpostEstablishResult>> => api.post('/game/travel/outpost/establish', {
                runId: run.id, district: target.district, thugs: seedThugs, cashCents: seedCashCents, beer: seedBeer, products: seedProducts, actionId,
              }));
              onDone();
            }}>
            Establish {target?.districtName ?? 'outpost'}
          </Button>
          <p className="se-hint">Remote turf still needs normal scouting presence. A win leaves these escorts and their guns on the corner; the seeded stock stays in the outpost box.</p>
          {establish.error ? <Alert>{establish.error}</Alert> : null}
        </div>
      ) : <p className="se-hint">No locals-held block is open for a new outpost here.</p>}

      {owned.length && boxBlock?.outpost ? (
        <div className="se-grid se-mt">
          <div className="se-field">
            <label className="se-label" htmlFor="outpost-service">Service outpost</label>
            <select id="outpost-service" className="se-input" value={boxBlock.district} onChange={(event) => setServiceDistrict(event.target.value)}>
              {owned.map((block) => <option key={block.district} value={block.district}>{block.districtName}</option>)}
            </select>
          </div>
          <div className="se-rows">
            <Row label="Box cash" value={formatCents(boxBlock.outpost.cashCents)} />
            <Row label="Box beer" value={formatNumber(boxBlock.outpost.beer)} />
            {Object.entries(boxBlock.outpost.products).filter(([, quantity]) => quantity > 0).map(([key, quantity]) => (
              <Row key={key} label={nameOf(data.products, key)} value={formatNumber(quantity)} />
            ))}
          </div>
          <p className="se-hint">Street tax lands in this cash box until it is full. Corner upkeep burns beer and your CORNER supply from this box each hour; if it runs dry, thugs can walk.</p>
          <div className="se-seg" role="group" aria-label="Outpost transfer direction">
            <button type="button" className={`se-seg__btn${direction === 'deposit' ? ' se-seg__btn--on' : ''}`} onClick={() => setDirection('deposit')}>Drop off</button>
            <button type="button" className={`se-seg__btn${direction === 'withdraw' ? ' se-seg__btn--on' : ''}`} onClick={() => setDirection('withdraw')}>Pick up</button>
          </div>
          <div className="se-launch__grid">
            <div className="se-field">
              <label className="se-label" htmlFor="outpost-move-cash">Cash</label>
              <input id="outpost-move-cash" className="se-input" type="number" inputMode="numeric" min={0} value={moveCash}
                onChange={(event) => setMoveCash(whole(event.target.value))} />
            </div>
            <div className="se-field">
              <label className="se-label" htmlFor="outpost-move-beer">Beer</label>
              <input id="outpost-move-beer" className="se-input" type="number" inputMode="numeric" min={0} value={moveBeer}
                onChange={(event) => setMoveBeer(whole(event.target.value))} />
            </div>
            <div className="se-field">
              <label className="se-label" htmlFor="outpost-move-product">Product</label>
              <select id="outpost-move-product" className="se-input" value={moveProduct} onChange={(event) => setMoveProduct(event.target.value)}>
                {data.products.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
              </select>
            </div>
            <div className="se-field">
              <label className="se-label" htmlFor="outpost-move-qty">Units</label>
              <input id="outpost-move-qty" className="se-input" type="number" inputMode="numeric" min={0} value={moveQty}
                onChange={(event) => setMoveQty(whole(event.target.value))} />
            </div>
          </div>
          <Button type="button" className="se-btn" disabledReason={transferBlock}
            onClick={async () => {
              await transfer.run((actionId): Promise<GameActionResult<RunOutpostTransferResult>> => api.post('/game/travel/outpost/transfer', {
                runId: run.id, district: boxBlock.district, direction, cashCents: moveCashCents, beer: moveBeerCount, products: movedProducts, actionId,
              }));
              onDone();
            }}>
            {direction === 'deposit' ? 'Drop off at outpost' : 'Pick up from outpost'} · {rules.transferTurnCost} turns
          </Button>
          {transfer.error ? <Alert>{transfer.error}</Alert> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Leave town: for another city, or home. */
function MoveOn({ run, data, onDone }: { run: RunDto; data: TravelDto; onDone: () => void }) {
  const move = useGameAction<RunMoveResult>();
  const [to, setTo] = useState('');
  const [route, setRoute] = useState(0);
  const { routes, error } = useRoutes(to, run.position.city, run.id);
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
      {to && routes ? <RoutePicker routes={routes} value={route} onChange={setRoute} name={`next-route-${run.id}`} costLabel={(turns) => (turns ? `${turns} more turns` : 'no extra turns')} /> : null}
      <div className="se-actions-row">
        <Button type="button" className="se-btn se-btn--primary" disabledReason={block}
          onClick={async () => {
            await move.run((actionId): Promise<GameActionResult<RunMoveResult>> => api.post('/game/travel/drive-on', { runId: run.id, to, route, actionId }));
            onDone();
          }}>
          Drive on
        </Button>
        <Button type="button" className="se-btn" disabledReason={move.busy ? 'On the move.' : null}
          onClick={async () => {
            await move.run((actionId): Promise<GameActionResult<RunMoveResult>> => api.post('/game/travel/head-home', { runId: run.id, actionId }));
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
          <div className="se-run__leg-head">
            <span className="se-muted">Current leg</span>
            <strong className="se-num">
              {run.position.road ? `${cityLabel(data, run.position.road.from)} → ${cityLabel(data, run.position.road.to)}` : ''}
            </strong>
            <span className="se-muted se-num">{Math.round(run.position.progress * 100)}%</span>
          </div>
          <div className="se-meter" aria-label={`${Math.round(run.position.progress * 100)}% of the way`}>
            <div className="se-meter__fill" style={{ width: `${Math.round(run.position.progress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      <div className="se-rows se-mt">
        <Row label="Cash in the car" value={formatCents(run.cashCents)} strong tooltip="What the run can spend. Home cash never reaches it." />
        <Row label="Trunk" value={`${formatNumber(trunk + run.beer)} / ${formatNumber(run.capacity)}`} />
        {run.beer > 0 ? <Row label="Beer" value={formatNumber(run.beer)} /> : null}
        {run.escortThugs > 0 ? (
          <Row label="Escorts carry" tooltip="Out of home stock, the best first. A bust or an arrest takes every one."
            value={Object.entries(run.guns).filter(([, count]) => count > 0).map(([key, count]) => gunText(key, count)).join(', ') || 'No guns'} />
        ) : null}
        {run.cargo.filter((entry) => entry.quantity > 0).map((entry) => (
          <Row key={entry.key} label={nameOf(data.products, entry.key)} value={formatNumber(entry.quantity)} />
        ))}
        <Row label="Back home" value={clock(run.stops[run.stops.length - 1]!.arriveAt)} />
      </div>

      {inTown ? (
        <>
          <TownCounter run={run} data={data} onDone={onDone} />
          <MoveOn run={run} data={data} onDone={onDone} />
        </>
      ) : (
        <p className="se-hint">You can trade once it gets there. A run left alone trades nothing: it waits out its window and comes home with what it has.</p>
      )}

      <IncidentList incidents={run.incidents} products={data.products} />
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
          <span>{trade.direction === 'buy' ? 'Bought' : 'Sold'} {formatNumber(trade.quantity)} {nameOf(products, trade.product)} in {SHORT_NAME(trade.cityName)}{trade.venue === 'market' ? ' (market)' : ''}</span>
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
        {receipt.startBeer > 0 || receipt.beer > 0 ? <Row label="Beer" value={<span className="se-num">{formatNumber(receipt.startBeer)} → {formatNumber(receipt.beer)}</span>} /> : null}
        {moved.map((entry) => (
          <Row key={entry.key} label={nameOf(products, entry.key)} value={<span className="se-num">{formatNumber(entry.startQuantity)} → {formatNumber(entry.quantity)}</span>} />
        ))}
        <Row label="Turns" value={formatNumber(receipt.turnsSpent)} />
      </div>
      <IncidentList incidents={receipt.incidents} products={products} />
      {receipt.trades.length ? <TradeList trades={receipt.trades} products={products} /> : <p className="se-hint">No trades: the crew only looked.</p>}
    </Panel>
  );
}
