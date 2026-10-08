import { useState, type FormEvent, type ReactNode } from 'react';
import type { GameActionResult } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import type { ResultLine } from './ActionResult.js';

export interface ResultChip {
  key: string;
  label: string;
  text: string;
  tone: 'good' | 'bad' | 'muted';
}

function signed(value: number, money: boolean, suffix = ''): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${money ? formatCents(Math.abs(value)) : formatNumber(Math.abs(value))}${suffix}`;
}

function tone(value: number, invert = false): ResultChip['tone'] {
  if (value === 0) return 'muted';
  return (invert ? value < 0 : value > 0) ? 'good' : 'bad';
}

/** One signed change, coloured by whether it helped. */
export function deltaChip(
  label: string,
  delta: number,
  options: { money?: boolean; invert?: boolean; suffix?: string } = {},
): ResultChip {
  return {
    key: label,
    label,
    text: signed(delta, options.money ?? false, options.suffix),
    tone: tone(delta, options.invert),
  };
}

/**
 * The receipt squeezed to one line: every receipt row that moved, then the
 * happiness and rank shifts the full receipt lists under "What it moved".
 */
export function resultChips<T>(result: GameActionResult<T>, lines: ResultLine[]): ResultChip[] {
  const chips: ResultChip[] = lines
    .filter((line) => line.delta !== undefined && line.delta !== 0)
    .map((line, index) => ({
      ...deltaChip(line.label, line.delta!, { money: line.money, invert: line.invert }),
      key: `${index}:${line.label}`,
    }));

  const { before, after, rankChanges } = result;
  const happiness: Array<[string, number]> = [
    ['Whore happiness', after.whoreHappiness - before.whoreHappiness],
    ['Thug happiness', after.thugHappiness - before.thugHappiness],
  ];
  for (const [label, delta] of happiness) {
    if (delta !== 0) chips.push(deltaChip(label, delta, { suffix: '%' }));
  }

  if (rankChanges?.localBefore != null && rankChanges.localAfter != null && rankChanges.localBefore !== rankChanges.localAfter) {
    // A smaller rank number is the better one.
    const climbed = rankChanges.localBefore - rankChanges.localAfter;
    chips.push({ key: 'rank', label: 'City rank', text: `#${rankChanges.localAfter}`, tone: tone(climbed) });
  }

  return chips;
}

/**
 * The bottom-of-screen bar for pages built around one repeatable action.
 *
 * The controls stay under the thumb and the outcome lands right above them, so
 * the next trip never starts with a scroll back to the top to read the last
 * one. The full receipt is one tap away for players who want every line.
 */
export function ActionDock({
  label,
  onSubmit,
  outcome,
  children,
}: {
  label: string;
  onSubmit: (event: FormEvent) => void;
  outcome?: {
    /** Changes identity on every new result so the strip re-flashes. */
    id: unknown;
    title: ReactNode;
    /** A lost fight or a failed run reads differently from a finished job. */
    tone?: 'good' | 'bad';
    chips: ResultChip[];
    receipt: ReactNode;
    onDismiss: () => void;
  } | null;
  children: ReactNode;
}) {
  const [openReceipt, setOpenReceipt] = useState<unknown>(null);
  const expanded = outcome ? openReceipt === outcome.id : false;

  return (
    <form className="se-dock" aria-label={label} onSubmit={onSubmit}>
      <div className="se-dock__outcome" aria-live="polite">
        {outcome ? (
          <div className="se-dock__result" key={String(outcome.id)}>
            {expanded ? <div className="se-dock__receipt">{outcome.receipt}</div> : null}
            <div className="se-dock__summary">
              <strong className={`se-dock__title se-dock__title--${outcome.tone ?? 'good'}`}>{outcome.title}</strong>
              <ul className="se-dock__chips">
                {outcome.chips.length ? (
                  outcome.chips.map((chip) => (
                    <li key={chip.key} className={`se-dock__chip se-dock__chip--${chip.tone}`}>
                      <span>{chip.label}</span>
                      <strong>{chip.text}</strong>
                    </li>
                  ))
                ) : (
                  <li className="se-dock__chip se-dock__chip--muted"><span>Nothing moved</span></li>
                )}
              </ul>
              <div className="se-dock__tools">
                <button
                  type="button"
                  className="se-btn se-btn--ghost se-btn--sm"
                  aria-expanded={expanded}
                  onClick={() => setOpenReceipt(expanded ? null : outcome.id)}
                >
                  {expanded ? 'Hide receipt' : 'Receipt'}
                </button>
                <button
                  type="button"
                  className="se-btn se-btn--ghost se-btn--sm se-dock__dismiss"
                  aria-label="Dismiss result"
                  onClick={outcome.onDismiss}
                >
                  &times;
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="se-dock__controls">{children}</div>
    </form>
  );
}
