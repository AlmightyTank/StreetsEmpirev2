import { useState } from 'react';
import type { GameActionResult, TravelDto, TripOutpostVisitResult } from '@streets/shared';
import { formatCents } from '@streets/shared';
import { api, ApiError } from '../api/client.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel, Row } from './Panel.js';

type Trips = NonNullable<TravelDto['trips']>;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** Trips D2. Walk an outpost in the city the boss is in; a boss off a plane can carry its cash. */
function OutpostRow({ outpost, onDone }: { outpost: Trips['outpostsHere'][number]; onDone: () => void }) {
  const visit = useGameAction<TripOutpostVisitResult>();
  const [collect, setCollect] = useState(false);
  return (
    <li className="se-convoys__target">
      <p className="se-convoys__line">
        <span><strong>{outpost.districtName}</strong> · {formatCents(outpost.cashCents)} in the box</span>
        <span className="se-muted">{outpost.moraleUntil ? `crew steady until ${when(outpost.moraleUntil)}` : 'not visited'}</span>
      </p>
      {outpost.canCollect ? (
        <label className="se-hint">
          <input type="checkbox" checked={collect} onChange={(event) => setCollect(event.target.checked)} /> Carry the box&rsquo;s cash in the bankroll
        </label>
      ) : null}
      <Button type="button" className="se-btn se-btn--primary se-btn--sm" disabledReason={visit.busy ? 'On the corner.' : null}
        onClick={async () => {
          await visit.run((actionId): Promise<GameActionResult<TripOutpostVisitResult>> =>
            api.post('/game/travel/trip/outpost', { outpostId: outpost.id, collectCents: collect ? outpost.cashCents : 0, actionId }));
          onDone();
        }}>
        Walk the corner
      </Button>
      {visit.error ? <Alert>{visit.error}</Alert> : null}
    </li>
  );
}

/**
 * Trips D2. The boss in person: outposts they can walk where they are, and sit-downs with
 * other bosses in the same city. Hidden when there is nothing to show.
 */
export function BossPresencePanel({ data, onDone }: { data: TravelDto; onDone: () => void }) {
  const trips = data.trips;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!trips) return null;
  const sit = trips.sitDowns;
  const nothing = !trips.outpostsHere.length && (!sit || (!sit.candidates.length && !sit.incoming.length && !sit.outgoing.length && !sit.truces.length));
  if (nothing) return null;

  const call = async (url: string, body: object) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(url, body);
      onDone();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="In person" aside={trips.presence ? trips.presence.cityName : undefined}>
      {trips.outpostsHere.length ? (
        <>
          <p className="se-dim">
            Walk a corner you hold here and its crew stays put for a day, however short the box runs.
            {trips.presence?.via === 'trip' ? ' You can carry its cash home in the bankroll, up to the carry-on cap.' : ''}
          </p>
          <ul className="se-convoys__list">{trips.outpostsHere.map((outpost) => <OutpostRow key={outpost.id} outpost={outpost} onDone={onDone} />)}</ul>
        </>
      ) : null}
      {sit ? (
        <>
          {sit.incoming.length ? (
            <>
              <h3 className="se-city__heading">Asked to sit down</h3>
              <ul className="se-convoys__list">
                {sit.incoming.map((row) => (
                  <li key={row.id} className="se-convoys__tail se-convoys__tail--alert">
                    <p className="se-convoys__line"><span><strong>{row.from.displayName}</strong> wants to sit down in {row.cityName}</span><span className="se-muted">until {when(row.expiresAt)}</span></p>
                    <div className="se-actions-row">
                      <Button type="button" className="se-btn se-btn--primary se-btn--sm" disabledReason={busy ? 'Working on it.' : null}
                        onClick={() => call('/game/travel/sit-down/answer', { sitDownId: row.id, accept: true })}>Agree to a truce</Button>
                      <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={busy ? 'Working on it.' : null}
                        onClick={() => call('/game/travel/sit-down/answer', { sitDownId: row.id, accept: false })}>Decline</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {sit.candidates.length ? (
            <>
              <h3 className="se-city__heading">Sit down with</h3>
              <p className="se-hint">Agreed, neither crew can hit the other for {sit.truceHours} hours: no raids, drive-bys, tails or hits on the boss.</p>
              <ul className="se-convoys__list">
                {sit.candidates.map((row) => (
                  <li key={row.publicPimpId} className="se-convoys__target">
                    <p className="se-convoys__line">
                      <span><strong>{row.displayName}</strong>{row.allianceTag ? ` [${row.allianceTag}]` : ''} · {row.how}</span>
                      <Button type="button" className="se-btn se-btn--ghost se-btn--sm"
                        disabledReason={busy ? 'Working on it.' : sit.outgoing.some((out) => out.to.publicPimpId === row.publicPimpId) ? 'Waiting for their answer.' : null}
                        onClick={() => call('/game/travel/sit-down', { targetPublicPimpId: row.publicPimpId })}>Ask to sit down</Button>
                    </p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {sit.truces.length ? (
            <div className="se-rows se-mt">
              {sit.truces.map((row) => <Row key={row.with.publicPimpId} label={`Truce with ${row.with.displayName}`} value={`until ${when(row.until)}`} />)}
            </div>
          ) : null}
        </>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
    </Panel>
  );
}
