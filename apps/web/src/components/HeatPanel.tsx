import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { HeatDto, TripHeatDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { api } from '../api/client.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { useSession } from '../stores/session.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** "25 minutes", "1 hour", "2.5 hours". */
function coolText(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  const rounded = Math.round(hours * 10) / 10;
  return rounded === 1 ? '1 hour' : `${rounded} hours`;
}

/** "Crack", "Ecstasy": product keys read as names on receipts. */
function productLabel(key: string): string {
  return key.charAt(0) + key.slice(1).toLowerCase();
}

function lockedUntilText(lockedUntil: string): string {
  return new Date(lockedUntil).toLocaleString();
}

export function heatTone(heat: Pick<HeatDto, 'heat' | 'dragStartsAt' | 'bustStartsAt'>): 'good' | 'warn' | 'bad' {
  return heat.heat >= heat.bustStartsAt ? 'bad' : heat.heat >= heat.dragStartsAt ? 'warn' : 'good';
}

/** Receipt lines for what a trip did to Heat, shared by Scout and Produce. */
export function heatReceiptLines(heat: TripHeatDto | undefined): Array<{ label: string; value: string }> {
  if (!heat) return [];
  const lines = [
    { label: 'Heat', value: `${formatNumber(heat.before)} → ${formatNumber(heat.after)} (+${formatNumber(heat.added)} from product)` },
  ];
  if (heat.takeMultiplier < 1) lines.push({ label: 'Heat drag', value: `Take cut ${percent(1 - heat.takeMultiplier)}` });

  if (heat.arrested) {
    lines.push({ label: 'ARRESTED', value: `${percent(heat.arrestChance ?? 0)} chance landed` });
    const seized = Object.entries(heat.seized).map(([key, units]) => `${formatNumber(units)} ${productLabel(key)}`);
    if (seized.length) lines.push({ label: 'Seized', value: seized.join(', ') });
    if (heat.fineCents > 0) lines.push({ label: 'Fine', value: formatCents(heat.fineCents) });
    if (heat.lockedUntil) lines.push({ label: 'Locked up', value: `Until ${lockedUntilText(heat.lockedUntil)}` });
  } else if (heat.busted) {
    lines.push({ label: 'BUSTED', value: `${percent(heat.bustChance)} chance landed` });
    const seized = Object.entries(heat.seized).map(([key, units]) => `${formatNumber(units)} ${productLabel(key)}`);
    if (seized.length) lines.push({ label: 'Seized', value: seized.join(', ') });
    if (heat.fineCents > 0) lines.push({ label: 'Fine', value: formatCents(heat.fineCents) });
  }
  return lines;
}

/**
 * One line on Scout and Produce once Heat is costing something: what it costs,
 * and the way to the bribe on the dashboard. Nothing while things are quiet.
 */
export function HeatNotice() {
  const heat = useSession((s) => s.me?.heat);
  if (!heat || heatTone(heat) === 'good') return null;
  const tone = heatTone(heat);
  const arresting = Boolean(heat.arrest && heat.heat >= heat.arrest.startsAt);
  const risk = arresting && heat.arrest
    ? `, ${percent(heat.arrest.chance)} arrest risk each trip`
    : tone === 'bad'
      ? `, ${percent(heat.bustChance)} bust risk each trip`
      : '';

  return (
    <p className={`se-hint se-${tone} se-golinks`}>
      <span>
        Heat {formatNumber(heat.heat)}: take down {percent(1 - heat.takeMultiplier)}{risk}.
      </span>
      <Link className="se-golink" to="/game#heat">Cool it on the dashboard</Link>
    </p>
  );
}

/**
 * 0.4.0-C Heat, extended in 0.5.0-C with city arrest thresholds and lockup.
 * The DTO already carries the current home city's rules, so every threshold here is local.
 */
export function HeatPanel() {
  const me = useSession((s) => s.me);
  const bribe = useGameAction<{ points: number; costCents: number; heatBefore: number; heatAfter: number }>();
  const [points, setPoints] = useState<number | ''>('');

  const heat = me?.heat;
  if (!me || !heat) return null;

  const tone = heatTone(heat);
  const lockedUntil = heat.lockedUntil ? lockedUntilText(heat.lockedUntil) : null;
  const arresting = Boolean(heat.arrest && heat.heat >= heat.arrest.startsAt);
  const hoursToCool = heat.heat <= 0 ? 0 : (Math.ceil(heat.heat / heat.decayPerInterval) * heat.intervalMinutes) / 60;
  const wanted = typeof points === 'number' ? points : 0;
  const cost = wanted * heat.bribeCentsPerPoint;
  const block = bribe.busy
    ? 'Paying off the precinct...'
    : lockedUntil
      ? `Locked up until ${lockedUntil}.`
      : heat.heat <= 0
        ? 'Nobody is looking at you.'
        : wanted < 1
          ? 'Say how many points to pay off.'
          : wanted > heat.heat
            ? `You only have ${formatNumber(heat.heat)} Heat.`
            : cost > me.resources.cashCents
              ? 'You cannot cover that bribe.'
              : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (block) return;
    await bribe.run((actionId) => api.post('/game/heat/bribe', { points: wanted, actionId }));
    setPoints('');
  }

  const status = lockedUntil
    ? `Locked up until ${lockedUntil}. You cannot take game actions until you are out.`
    : arresting && heat.arrest
      ? `Arrest risk is live: ${percent(heat.arrest.chance)} on the next trip. Busts are also live at ${percent(heat.bustChance)}.`
      : tone === 'bad'
        ? `Every trip risks a bust: ${percent(heat.bustChance)} right now, and the take is down ${percent(1 - heat.takeMultiplier)}.`
        : tone === 'warn'
          ? `The attention is costing you ${percent(1 - heat.takeMultiplier)} of the take.`
          : 'Quiet. Nobody is costing you anything yet.';

  return (
    <Panel title="Heat" id="heat" aside={`${formatNumber(heat.heat)} / ${formatNumber(heat.max)}`}>
      <div className="se-meter se-heat__meter">
        <div className={`se-meter__fill${tone === 'bad' ? ' se-meter__fill--bad' : tone === 'warn' ? ' se-meter__fill--warn' : ''}`} style={{ width: `${Math.min(100, (heat.heat / heat.max) * 100)}%` }} />
      </div>
      <p className={`se-heat__status se-${lockedUntil || arresting ? 'bad' : tone}`}>{status}</p>
      <p className="se-hint">
        Take drag from {heat.dragStartsAt}, bust risk from {heat.bustStartsAt}
        {heat.arrest ? `, arrest risk from ${heat.arrest.startsAt}` : ''}. A bust seizes {percent(heat.bust.productSeizedFraction)} of your
        product and fines {percent(heat.bust.cashFineFraction)} of your cash.
        {heat.arrest ? ` An arrest seizes ${percent(heat.arrest.productSeizedFraction)} of product, fines ${percent(heat.arrest.cashFineFraction)} of cash, drops ${formatNumber(heat.arrest.heatDrop)} Heat and locks you up for ${coolText(heat.arrest.downtimeMinutes / 60)}.` : ''}
        {' '}Heat cools {formatNumber(heat.decayPerInterval)} every {heat.intervalMinutes} minutes
        {hoursToCool > 0 ? `, about ${coolText(hoursToCool)} to clear` : ''}.
      </p>

      {heat.heat > 0 && !lockedUntil ? (
        <form className="se-heat__bribe" onSubmit={onSubmit}>
          <label className="se-label" htmlFor="heat-bribe-points">Pay off Heat</label>
          <div className="se-heat__bribe-row">
            <input
              id="heat-bribe-points"
              className="se-input"
              type="number"
              min={1}
              max={heat.heat}
              step={1}
              value={points}
              onChange={(event) => setPoints(event.target.value === '' ? '' : Math.max(0, Math.floor(Number(event.target.value))))}
            />
            <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={bribe.busy ? 'Paying...' : null} onClick={() => setPoints(heat.heat)}>
              All
            </Button>
            <Button className="se-btn se-btn--primary se-btn--sm" disabledReason={block}>
              Bribe{wanted > 0 ? ` ${formatCents(cost)}` : ''}
            </Button>
          </div>
          <p className="se-hint">{formatCents(heat.bribeCentsPerPoint)} a point, priced on your net worth.</p>
        </form>
      ) : null}
      {bribe.error ? <Alert>{bribe.error}</Alert> : null}
      {bribe.result ? (
        <p className="se-hint se-good">
          Paid {formatCents(bribe.result.result.costCents)}: Heat {bribe.result.result.heatBefore} → {bribe.result.result.heatAfter}.
        </p>
      ) : null}
    </Panel>
  );
}
