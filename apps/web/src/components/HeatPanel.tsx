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
import { formatWhen } from '../utils/time.js';

/** Product keys read as names on receipts. */
function productLabel(key: string): string {
  return key.charAt(0) + key.slice(1).toLowerCase();
}

export function heatTone(heat: Pick<HeatDto, 'heat' | 'dragStartsAt' | 'bustStartsAt'>): 'good' | 'warn' | 'bad' {
  return heat.heat >= heat.bustStartsAt ? 'bad' : heat.heat >= heat.dragStartsAt ? 'warn' : 'good';
}

/** Receipt lines for what a trip did to Heat, shared by Scout and Produce. */
export function heatReceiptLines(
  heat: TripHeatDto | undefined,
  includeResourceChanges = true,
): Array<{ label: string; value: string }> {
  if (!heat) return [];
  const lines = [
    { label: 'Heat', value: `${formatNumber(heat.before)} → ${formatNumber(heat.after)}` },
  ];
  if (heat.takeMultiplier < 1) lines.push({ label: 'Heat drag', value: 'Your take was reduced by police attention.' });

  if (heat.arrested) {
    lines.push({ label: 'ARRESTED', value: 'Police took you into custody.' });
    if (includeResourceChanges) {
      const seized = Object.entries(heat.seized).map(([key, units]) => `${formatNumber(units)} ${productLabel(key)}`);
      if (seized.length) lines.push({ label: 'Seized', value: seized.join(', ') });
      if (heat.fineCents > 0) lines.push({ label: 'Fine', value: formatCents(heat.fineCents) });
    }
    if (heat.lockedUntil) lines.push({ label: 'Locked up', value: `Until ${formatWhen(heat.lockedUntil)}` });
  } else if (heat.busted) {
    lines.push({ label: 'BUSTED', value: 'Police seized product and issued a fine.' });
    if (includeResourceChanges) {
      const seized = Object.entries(heat.seized).map(([key, units]) => `${formatNumber(units)} ${productLabel(key)}`);
      if (seized.length) lines.push({ label: 'Seized', value: seized.join(', ') });
      if (heat.fineCents > 0) lines.push({ label: 'Fine', value: formatCents(heat.fineCents) });
    }
  }
  return lines;
}

/**
 * A brief warning on Scout and Produce while police attention is elevated.
 */
export function HeatNotice() {
  const heat = useSession((s) => s.me?.heat);
  if (!heat || heatTone(heat) === 'good') return null;
  const tone = heatTone(heat);

  return (
    <p className={`se-hint se-${tone} se-golinks`}>
      <span>
        Police attention is reducing your take. A trip could lead to a bust or arrest.
      </span>
      <Link className="se-golink" to="/game#heat">Cool it on the dashboard</Link>
    </p>
  );
}

/** Heat status and the options available to respond. */
export function HeatPanel() {
  const me = useSession((s) => s.me);
  const bribe = useGameAction<{ points: number; costCents: number; heatBefore: number; heatAfter: number }>();
  const [points, setPoints] = useState<number | ''>('');

  const heat = me?.heat;
  if (!me || !heat) return null;

  const tone = heatTone(heat);
  const lockedUntil = heat.lockedUntil ? formatWhen(heat.lockedUntil) : null;
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
    ? `You are in custody until ${formatWhen(lockedUntil)} and cannot take game actions.`
    : tone === 'bad'
      ? 'Police attention is high. Trips are dangerous, and you are earning less.'
      : tone === 'warn'
        ? 'Police attention is starting to reduce what you earn.'
        : 'Police attention is low.';

  return (
    <Panel title="Heat" id="heat" aside={formatNumber(heat.heat)}>
      <p className={`se-heat__status se-${lockedUntil ? 'bad' : tone}`}>{status}</p>
      <p className="se-hint">
        Heat brings police attention. Higher Heat can cost product, money, and time in custody.
        Laying low lets attention fade; paying it off can bring it down sooner.
      </p>

      {heat.heat > 0 && !lockedUntil ? (
        <form className="se-heat__bribe" onSubmit={onSubmit}>
          <label className="se-label" htmlFor="heat-bribe-points">Pay off Heat</label>
          <div className="se-heat__bribe-row">
            <input
              id="heat-bribe-points"
              className="se-input"
              inputMode="numeric"
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
          <p className="se-hint">Paying off Heat costs money. The total appears on the button.</p>
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
