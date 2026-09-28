import { useEffect, useState } from 'react';
import type {
  GameActionResult,
  TravelDto,
  TripDto,
  TripExtendResult,
  TripHeadHomeResult,
  TripLaunchResult,
  TripReceiptDto,
  TripRentGunsResult,
} from '@streets/shared';
import { formatCents } from '@streets/shared';
import { api } from '../api/client.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { formatDuration } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { minutesText } from './CityMap.js';
import { Panel, Row } from './Panel.js';

type TripPanelData = NonNullable<TravelDto['trips']>;

const percent = (value: number) => `${Math.round(value * 100)}%`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const wholeDollars = (value: string): number | '' => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : '';
};

const PHASE_HEADLINE: Record<TripDto['phase'], (trip: TripDto) => string> = {
  outbound: (trip) => `In the air to ${trip.cityName}`,
  town: (trip) => `Checked in at ${trip.cityName}`,
  inbound: () => 'In the air, flying home',
};

/** Trips A. The boss is away: where, until when, and the two things they can do about it. */
const GUN_NAMES: Record<keyof TripDto['rentedGuns'], string> = { PISTOL: 'Pistol', SHOTGUN: 'Shotgun', TEK9: 'Tek-9', AK47: 'AK-47' };

function gunsText(guns: TripDto['rentedGuns']): string {
  return (Object.keys(guns) as Array<keyof TripDto['rentedGuns']>).filter((key) => guns[key] > 0).map((key) => `${guns[key]} ${GUN_NAMES[key]}`).join(', ');
}

/** Trips D. Rent guns for the bodyguards from Tommy's people in town, out of the bankroll. */
function RentGuns({ trip, rules, weapons, onDone }: { trip: TripDto; rules: TripPanelData['rules']; weapons: Array<keyof TripDto['rentedGuns']>; onDone: () => void }) {
  const rent = useGameAction<TripRentGunsResult>();
  const [weapon, setWeapon] = useState<keyof TripDto['rentedGuns']>(weapons[weapons.length - 1] ?? 'PISTOL');
  const carrying = Object.values(trip.rentedGuns).reduce((sum, count) => sum + count, 0);
  const room = Math.max(0, trip.bodyguards - carrying);
  const [count, setCount] = useState<number | ''>(room);
  const qty = typeof count === 'number' ? count : 0;
  const price = rules.bodyguards?.gunRentCents[weapon] ?? 0;
  const block = rent.busy ? 'Making the call.' : trip.rentBlockedReason
    ?? (qty < 1 || qty > room ? `Rent 1 to ${room}.` : price * qty > trip.bankrollCents ? 'Your bankroll cannot cover it.' : null);
  return (
    <div className="se-field se-mt">
      <span className="se-label">Rent guns from Tommy&rsquo;s people <span className="se-muted">{room} unarmed</span></span>
      <div className="se-launch__with-all">
        <select className="se-input" value={weapon} aria-label="Weapon" onChange={(event) => setWeapon(event.target.value as keyof TripDto['rentedGuns'])}>
          {weapons.map((key) => <option key={key} value={key}>{GUN_NAMES[key]} · {formatCents(rules.bodyguards?.gunRentCents[key] ?? 0)}</option>)}
        </select>
        <input className="se-input" type="number" inputMode="numeric" min={1} max={room} value={count} aria-label="How many"
          onChange={(event) => setCount(wholeDollars(event.target.value))} />
        <Button type="button" className="se-btn se-btn--primary se-btn--sm" disabledReason={block}
          onClick={async () => {
            await rent.run((actionId): Promise<GameActionResult<TripRentGunsResult>> =>
              api.post('/game/travel/trip/guns', { guns: { [weapon]: qty }, actionId }));
            onDone();
          }}>
          Rent · {formatCents(price * qty)}
        </Button>
      </div>
      <p className="se-hint">For the rest of the stay, out of the bankroll. They go back at check-out and are never yours.</p>
      {rent.error ? <Alert>{rent.error}</Alert> : null}
    </div>
  );
}

function Away({ trip, rules, gunConnect, onDone }: { trip: TripDto; rules: TripPanelData['rules']; gunConnect: TripPanelData['gunConnect']; onDone: () => void }) {
  const { msRemaining } = useCountdown(trip.until, onDone);
  const extend = useGameAction<TripExtendResult>();
  const home = useGameAction<TripHeadHomeResult>();
  const busy = extend.busy || home.busy;

  async function stayOn() {
    await extend.run((actionId): Promise<GameActionResult<TripExtendResult>> => api.post('/game/travel/trip/extend', { blocks: 1, actionId }));
    onDone();
  }
  async function checkOut() {
    await home.run((actionId): Promise<GameActionResult<TripHeadHomeResult>> => api.post('/game/travel/trip/home', { actionId }));
    onDone();
  }

  const next = trip.phase === 'outbound' ? 'lands' : trip.phase === 'town' ? 'checks out' : 'lands home';
  return (
    <Panel title="The boss is away" aside={trip.cityName}>
      <p className="se-run__headline">{PHASE_HEADLINE[trip.phase](trip)}: {next} in {formatDuration(msRemaining)}</p>
      {trip.hitLandsAt ? (
        <Alert>Your lookouts spotted people on you in {trip.cityName}. They move at {when(trip.hitLandsAt)}: check out now or take the beating.</Alert>
      ) : null}
      <div className="se-rows se-mt">
        <Row label="Bankroll" value={formatCents(trip.bankrollCents)} strong
          tooltip="All the boss has in town. Nothing is wired from home; it all comes back when the boss does." />
        <Row label="Hotel paid" value={formatCents(trip.hotelCents)} />
        {trip.airportSeizedCents > 0 || trip.airportDelayMinutes > 0 ? (
          <Row label="Airport" value={`pulled aside · ${formatCents(trip.airportSeizedCents)} taken · ${trip.airportDelayMinutes} min late`} />
        ) : null}
        {trip.bodyguards > 0 ? (
          <Row label="Bodyguards" value={`${trip.bodyguards}${trip.woundedBodyguards ? ` (${trip.woundedBodyguards} wounded)` : ''} · ${gunsText(trip.rentedGuns) || 'unarmed'}`}
            tooltip="They fight anyone who comes for the boss. Rented guns go back to Tommy's people at check-out." />
        ) : null}
        <Row label="Checks out" value={when(trip.stayUntil)} />
        <Row label="Home by" value={when(trip.returnsAt)} />
        <Row label="Lieutenant's cut" value={percent(rules.lieutenantCut)}
          tooltip="Home keeps working while the boss is gone, but the lieutenant skims this share of every Scout and Produce take until the boss is back." />
      </div>
      {trip.phase === 'town' ? (
        <div className="se-actions-row se-mt">
          <Button type="button" className="se-btn se-btn--primary" disabledReason={busy ? 'Working on it.' : trip.extend.blockedReason} onClick={stayOn}>
            Stay {minutesText(trip.extend.minutes)} more · {formatCents(trip.extend.hotelCents)}
          </Button>
          <Button type="button" className="se-btn se-btn--ghost" disabledReason={busy ? 'Working on it.' : trip.canHeadHome ? null : 'Not from here.'} onClick={checkOut}>
            Check out and fly home
          </Button>
        </div>
      ) : null}
      {trip.phase === 'town' ? <p className="se-hint">Extra nights come out of the bankroll. Checking out early refunds nothing.</p> : null}
      {trip.phase === 'town' && trip.bodyguards > 0 && gunConnect ? <RentGuns trip={trip} rules={rules} weapons={gunConnect.weapons} onDone={onDone} /> : null}
      {extend.error ? <Alert>{extend.error}</Alert> : null}
      {home.error ? <Alert>{home.error}</Alert> : null}
    </Panel>
  );
}

function Receipt({ receipt }: { receipt: TripReceiptDto }) {
  const spent = receipt.startBankrollCents - receipt.bankrollCents;
  return (
    <div className="se-rows se-mt">
      <Row label="Last trip" value={`${receipt.cityName}, home ${when(receipt.returnedAt)}`} />
      <Row label="Flight and hotel" value={formatCents(receipt.ticketCents + receipt.hotelCents)} />
      <Row label="Bankroll back" value={formatCents(receipt.bankrollCents)}
        tooltip={spent > 0 ? `${formatCents(spent)} of the bankroll went on extra nights.` : 'The whole bankroll came home.'} />
    </div>
  );
}

/**
 * Trips A. The boss flies to another city for a stay and flies home. Home stays where
 * it is and keeps working, run by a lieutenant who skims the take.
 */
export function TripPanel({ data, selected, onDone }: { data: TravelDto; selected: string; onDone: () => void }) {
  const trips = data.trips!;
  const home = data.cities.find((city) => city.isHome)!;
  const [to, setTo] = useState(selected !== home.slug ? selected : '');
  const [stay, setStay] = useState(trips.rules.stayMinutes[0] ?? 0);
  const [bankroll, setBankroll] = useState<number | ''>(0);
  const [guards, setGuards] = useState<number | ''>(0);
  const [confirming, setConfirming] = useState(false);
  const launch = useGameAction<TripLaunchResult>();
  useEffect(() => { if (selected !== home.slug) setTo(selected); }, [selected, home.slug]);
  useEffect(() => { setConfirming(false); }, [to, stay, bankroll, guards]);

  if (trips.trip) return <Away trip={trips.trip} rules={trips.rules} gunConnect={trips.gunConnect?.unlocked ? trips.gunConnect : null} onDone={onDone} />;
  if (trips.bossRun) {
    return (
      <Panel title="The boss is on the road" aside={trips.bossRun.cityName}>
        <p className="se-run__headline">Riding with your run to {trips.bossRun.cityName}</p>
        <p className="se-hint">
          Drive on or head home from the run above. Until it is back, the lieutenant runs home and skims {percent(trips.rules.lieutenantCut)} of
          every Scout and Produce take.
        </p>
      </Panel>
    );
  }

  const destination = trips.destinations.find((city) => city.slug === to) ?? null;
  const bankrollCents = (typeof bankroll === 'number' ? bankroll : 0) * 100;
  // Trips D: bodyguards fly on their own tickets and are lodged by the hour.
  const bg = trips.rules.bodyguards;
  const guardCount = bg && typeof guards === 'number' ? guards : 0;
  const ticketCents = trips.rules.ticketCents + (bg ? bg.ticketCents * guardCount : 0);
  const hotelCents = destination ? (destination.hotelCentsPerHour + (bg ? bg.lodgingCentsPerThugHour * guardCount : 0)) * Math.ceil(stay / 60) : 0;
  const totalCents = ticketCents + hotelCents + bankrollCents;
  const flight = trips.rules.flightMinutes;
  const blocked = trips.blockedReason
    ? `${trips.blockedReason}${trips.blockedUntil ? ` You can fly from ${when(trips.blockedUntil)}.` : ''}`
    : null;
  // Trips D2: what the airport means at the boss's Heat right now.
  const airport = trips.airport;
  const airportChance = airport ? Math.min(0.5, airport.checkChance + airport.checkChancePerBodyguard * guardCount) : 0;
  const airportNote = airport && airportChance > 0
    ? `With ${airport.heat} Heat${guardCount > 0 ? ` and ${guardCount} bodyguard${guardCount === 1 ? '' : 's'}` : ''}, security pulls you aside about ${Math.round(airportChance * 100)}% of the time${airport.checkHome ? ', each way' : ''}: ${airport.seizePercent}% of the bankroll and ${airport.delayMinutes} minutes.`
    : airport && airport.bodyguardHeat > 0 && bg
      ? `Each bodyguard counts as ${airport.bodyguardHeat} more Heat at airport security${airport.checkHome ? ', going and coming back' : ''}.`
      : null;
  const laidUpNote = trips.laidUpUntil
    ? `The boss is laid up until ${when(trips.laidUpUntil)}. Home defends a little weaker and the lieutenant keeps skimming until then.`
    : null;
  const block = launch.busy ? 'Heading to the airport.'
    : blocked
      ?? (!destination ? 'Pick a city.'
        : bankrollCents > trips.rules.carryOnCapCents ? `You can carry at most ${formatCents(trips.rules.carryOnCapCents)} onto a plane.`
          : bg && guardCount > Math.min(bg.max, trips.fitThugs) ? `Bring at most ${Math.min(bg.max, trips.fitThugs)} bodyguards: ${trips.fitThugs} fit thugs at home.`
          : data.home.turns < trips.rules.launchTurns ? `Getting out the door takes ${trips.rules.launchTurns} turns.`
            : totalCents > data.home.cashCents ? `That comes to ${formatCents(totalCents)}; you have ${formatCents(data.home.cashCents)} at home.`
              : null);

  async function submit() {
    if (block) return;
    if (!confirming) { setConfirming(true); return; }
    await launch.run((actionId): Promise<GameActionResult<TripLaunchResult>> =>
      api.post('/game/travel/trip', { to, stayMinutes: stay, bankrollCents, ...(guardCount > 0 ? { bodyguards: guardCount } : {}), actionId }));
    setConfirming(false);
    onDone();
  }

  return (
    <Panel title="Take a trip" aside={`${formatCents(trips.rules.ticketCents)} a ticket`}>
      <p className="se-dim">
        {bg ? 'The boss flies alone or with bodyguards, who land unarmed: nothing gets through the airport.' : 'The boss flies alone.'} Home stays home: you still live in {home.name}, rank there and can be hit there, and the operation keeps
        working. While you are gone the lieutenant skims {percent(trips.rules.lieutenantCut)} of every Scout and Produce take.
      </p>
      <div className="se-field se-mt">
        <label className="se-label" htmlFor="trip-to">Fly to</label>
        <select id="trip-to" className="se-input" value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">Pick a city</option>
          {trips.destinations.map((city) => <option key={city.slug} value={city.slug}>{city.name} · {formatCents(city.hotelCentsPerHour)}/h</option>)}
        </select>
      </div>
      <div className="se-field se-mt">
        <span className="se-label">Stay</span>
        <div className="se-actions-row">
          {trips.rules.stayMinutes.map((minutes) => (
            <button key={minutes} type="button" aria-pressed={stay === minutes}
              className={`se-btn se-btn--sm ${stay === minutes ? 'se-btn--primary' : 'se-btn--ghost'}`} onClick={() => setStay(minutes)}>
              {minutesText(minutes)}
            </button>
          ))}
        </div>
      </div>
      <div className="se-field se-mt">
        <label className="se-label" htmlFor="trip-bankroll">Bankroll <span className="se-muted">up to {formatCents(trips.rules.carryOnCapCents)}</span></label>
        <input id="trip-bankroll" className="se-input" type="number" inputMode="numeric" min={0} step={1} value={bankroll}
          onChange={(event) => setBankroll(wholeDollars(event.target.value))} />
      </div>
      {bg ? (
        <div className="se-field se-mt">
          <label className="se-label" htmlFor="trip-guards">Bodyguards <span className="se-muted">up to {Math.min(bg.max, trips.fitThugs)}</span></label>
          <input id="trip-guards" className="se-input" type="number" inputMode="numeric" min={0} max={Math.min(bg.max, trips.fitThugs)} step={1} value={guards}
            onChange={(event) => setGuards(wholeDollars(event.target.value))} />
          <p className="se-hint">
            {formatCents(bg.ticketCents)} a ticket and {formatCents(bg.lodgingCentsPerThugHour)} an hour each. They fight anyone who comes for the boss
            {trips.gunConnect?.unlocked ? ', and Tommy\u2019s people can rent them guns in town.' : ', bare-handed unless Tommy\u2019s people in town will rent to you.'}
          </p>
        </div>
      ) : null}
      <div className="se-rows se-mt">
        <Row label={guardCount > 0 ? 'Tickets' : 'Ticket'} value={formatCents(ticketCents)} />
        <Row label="Hotel" value={destination ? formatCents(hotelCents) : '-'} tooltip="Paid up front for the whole stay." />
        <Row label="Bankroll" value={formatCents(bankrollCents)} tooltip="Comes home with you, less anything spent in town." />
        <Row label="Out of home cash" value={formatCents(totalCents)} strong />
        <Row label="Turns" value={`${trips.rules.launchTurns}`} />
        <Row label="In the air" value={`${minutesText(flight)} each way`} />
        <Row label="Home by" value={when(new Date(Date.now() + (flight * 2 + stay) * 60_000).toISOString())} />
      </div>
      <Button type="button" className="se-btn se-btn--primary se-btn--block se-mt" disabledReason={block} onClick={submit}>
        {launch.busy ? 'Heading to the airport...'
          : confirming ? `Confirm: fly to ${destination?.name} for ${formatCents(totalCents)}`
            : destination ? `Fly to ${destination.name}` : 'Fly'}
      </Button>
      {confirming ? (
        <p className="se-hint se-warn">
          The ticket and the hotel are gone either way; checking out early refunds nothing.{' '}
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setConfirming(false)}>Cancel</button>
        </p>
      ) : null}
      {launch.error ? <Alert>{launch.error}</Alert> : null}
      {laidUpNote ? <p className="se-hint se-warn">{laidUpNote}</p> : null}
      {airportNote ? <p className="se-hint se-warn">{airportNote}</p> : null}
      {trips.lastTrip ? <Receipt receipt={trips.lastTrip} /> : null}
    </Panel>
  );
}
