import { useEffect, useState } from 'react';
import type { GameActionResult, HeatThereDto, RelocationResult, TravelDto } from '@streets/shared';
import { formatCents } from '@streets/shared';
import { api } from '../api/client.js';
import { useCountdown } from '../hooks/useCountdown.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { formatDuration } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { minutesText } from './CityMap.js';
import { Panel, Row } from './Panel.js';

const percent = (value: number) => `${Math.round(value * 100)}%`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** What a Heat number costs in a city, in one line. */
function heatWords(heat: number, there: HeatThereDto): string {
  if (there.arrestChance > 0) return `arrest risk ${percent(there.arrestChance)} a trip`;
  if (there.bustChance > 0) return `bust risk ${percent(there.bustChance)} a trip`;
  if (there.takeMultiplier < 1) return `take down ${percent(1 - there.takeMultiplier)}`;
  return heat > 0 ? 'quiet' : 'nobody is looking';
}

function Moving({ moving, onDone }: { moving: NonNullable<NonNullable<TravelDto['relocation']>['moving']>; onDone: () => void }) {
  const { msRemaining } = useCountdown(moving.arrivesAt, onDone);
  return (
    <Panel title="Moving house" aside={`To ${moving.toName}`}>
      <p className="se-run__headline">On the road from {moving.fromName}: there in {formatDuration(msRemaining)}</p>
      <p className="se-hint">
        Nothing moves until the truck arrives around {when(moving.arrivesAt)}. Until then you still live in {moving.fromName}:
        ranked there, and a target there.
      </p>
    </Panel>
  );
}

/**
 * 0.5.0-D. Move the whole operation to another city: what it costs, how long the
 * truck takes, and what your Heat would mean there, before you pay.
 */
export function MovePanel({ data, selected, onDone }: { data: TravelDto; selected: string; onDone: () => void }) {
  const relocation = data.relocation!;
  const home = data.cities.find((city) => city.isHome)!;
  const [to, setTo] = useState(selected !== home.slug ? selected : '');
  const [confirming, setConfirming] = useState(false);
  const move = useGameAction<RelocationResult>();
  useEffect(() => { if (selected !== home.slug) setTo(selected); }, [selected, home.slug]);
  useEffect(() => { setConfirming(false); }, [to]);

  if (relocation.moving) return <Moving moving={relocation.moving} onDone={onDone} />;

  const destination = relocation.destinations.find((city) => city.slug === to) ?? null;
  const arrives = new Date(Date.now() + relocation.downtimeMinutes * 60_000).toISOString();
  const blocked = relocation.blockedReason
    ? `${relocation.blockedReason}${relocation.blockedUntil ? ` You can move from ${when(relocation.blockedUntil)}.` : ''}`
    : null;
  const block = move.busy ? 'Loading the truck.' : blocked ?? (!destination ? 'Pick a city.' : !destination.reachable ? 'There is no road there.' : null);

  async function submit() {
    if (block) return;
    if (!confirming) { setConfirming(true); return; }
    await move.run((actionId): Promise<GameActionResult<RelocationResult>> => api.post('/game/travel/move', { to, actionId }));
    setConfirming(false);
    onDone();
  }

  return (
    <Panel title="Move house" aside={formatCents(relocation.feeCents)}>
      <p className="se-dim">
        Everything goes: the stable, the stock, the cars, the hideout and your Heat. The city&rsquo;s own rules take over the moment
        you arrive.
      </p>
      <div className="se-field se-mt">
        <label className="se-label" htmlFor="move-to">Move to</label>
        <select id="move-to" className="se-input" value={to} onChange={(event) => setTo(event.target.value)}>
          <option value="">Pick a city</option>
          {relocation.destinations.map((city) => <option key={city.slug} value={city.slug}>{city.name}</option>)}
        </select>
      </div>
      <div className="se-rows se-mt">
        <Row label="Cost" value={formatCents(relocation.feeCents)} strong
          tooltip={`${percent(relocation.feeNetWorthFraction)} of your net worth, never under ${formatCents(relocation.feeFloorCents)}.`} />
        <Row label="On the road" value={`${minutesText(relocation.downtimeMinutes)}, there around ${when(arrives)}`}
          tooltip="You cannot act while the truck is on the road, and you stay a target where you live now until it arrives." />
        <Row label="Next move" value={`${relocation.cooldownHours} hours after this one`} />
      </div>
      {destination?.heat && relocation.here ? (
        <>
          <h3 className="se-city__heading">Your Heat of {relocation.heat}</h3>
          <div className="se-rows">
            <Row label={`In ${home.name}`} value={heatWords(relocation.heat, relocation.here)}
              tooltip={`Take drag from ${relocation.here.dragStartsAt}, busts from ${relocation.here.bustStartsAt}${relocation.here.arrestStartsAt !== null ? `, arrests from ${relocation.here.arrestStartsAt}` : ''}.`} />
            <Row label={`In ${destination.name}`} value={heatWords(relocation.heat, destination.heat)}
              tooltip={`Take drag from ${destination.heat.dragStartsAt}, busts from ${destination.heat.bustStartsAt}${destination.heat.arrestStartsAt !== null ? `, arrests from ${destination.heat.arrestStartsAt}` : ''}.`} />
            <Row label="Busts there from" value={`${destination.heat.bustStartsAt} Heat`} />
            {destination.heat.arrestStartsAt !== null ? <Row label="Arrests there from" value={`${destination.heat.arrestStartsAt} Heat`} /> : null}
          </div>
          <p className="se-hint">
            Where you live also sets what the blocks pay, what the stores charge and what Pip has on his shelf. The street talk says
            what {destination.name} is like; living there is how you find out the rest.
          </p>
        </>
      ) : null}
      <Button type="button" className="se-btn se-btn--primary se-btn--block se-mt" disabledReason={block} onClick={submit}>
        {move.busy ? 'Loading the truck...'
          : confirming ? `Confirm: move to ${destination?.name} for ${formatCents(relocation.feeCents)}`
            : destination ? `Move to ${destination.name}` : 'Move'}
      </Button>
      {confirming ? (
        <p className="se-hint se-warn">
          You cannot act for {minutesText(relocation.downtimeMinutes)}, and the fee is gone either way.{' '}
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setConfirming(false)}>Cancel</button>
        </p>
      ) : null}
      {move.error ? <Alert>{move.error}</Alert> : null}
    </Panel>
  );
}
