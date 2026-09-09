import type { ReactNode } from 'react';
import type { GameActionResult } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';

export interface ResultLine {
  label: string;
  /** Rendered as a signed delta when `delta` is set, plainly otherwise. */
  value?: ReactNode;
  delta?: number;
  /** Optional post-action balance shown as `change / remaining`. */
  remaining?: number;
  /** Money deltas and remaining balances format as currency. */
  money?: boolean;
  /** For lines where going up is the bad news. */
  invert?: boolean;
  muted?: boolean;
}

function signed(value: number, money: boolean): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const magnitude = money
    ? formatCents(Math.abs(value))
    : formatNumber(Math.abs(value));
  return `${sign}${magnitude}`;
}

function Delta({
  value,
  money,
  invert,
}: {
  value: number;
  money: boolean;
  invert?: boolean;
}) {
  const good = invert ? value < 0 : value > 0;
  const bad = invert ? value > 0 : value < 0;
  const tone = good ? ' se-good' : bad ? ' se-bad' : ' se-muted';

  return <span className={`se-num${tone}`}>{signed(value, money)}</span>;
}

function DeltaPair({
  value,
  remaining,
  money,
  invert,
}: {
  value: number;
  remaining?: number;
  money: boolean;
  invert?: boolean;
}) {
  if (remaining === undefined) {
    return <Delta value={value} money={money} invert={invert} />;
  }

  return (
    <span className="se-result__delta-pair">
      <Delta value={value} money={money} invert={invert} />
      <span className="se-num se-result__remaining">
        {money ? formatCents(remaining) : formatNumber(remaining)}
      </span>
    </span>
  );
}

function Transition({
  before,
  after,
  money,
  prefix = '',
}: {
  before: number | null;
  after: number | null;
  money?: boolean;
  prefix?: string;
}) {
  if (before === null || after === null) return <span className="se-muted">&mdash;</span>;

  const fmt = (v: number) => (money ? formatCents(v) : `${prefix}${formatNumber(v)}`);
  const same = before === after;

  return (
    <span className="se-num">
      <span className="se-muted">{fmt(before)}</span>
      <span className="se-muted"> &rarr; </span>
      <span className={same ? '' : 'se-accent'}>{fmt(after)}</span>
    </span>
  );
}

/**
 * Sections 27, 30 and 37. Every action ends on the same shape of screen: what
 * you did, what it cost, and what it moved.
 *
 * 0.1.0-G adds the optional `remaining` balance so inventory-changing rows can
 * answer both questions at once: "what did this action use/find?" and "what do
 * I have now?" without forcing the player back to the dashboard.
 */
export function ActionResult<T>({
  title,
  subtitle,
  lines,
  result,
  onDismiss,
}: {
  title: string;
  subtitle?: ReactNode;
  lines: ResultLine[];
  result: GameActionResult<T>;
  onDismiss?: () => void;
}) {
  const { before, after, rankChanges } = result;

  const ranksMoved =
    rankChanges &&
    (rankChanges.localBefore !== rankChanges.localAfter ||
      rankChanges.nationalBefore !== rankChanges.nationalAfter);

  return (
    <section className="se-panel se-result">
      <header className="se-panel__head">
        <h2 className="se-panel__title">{title}</h2>
        {onDismiss ? (
          <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={onDismiss}>
            Dismiss
          </button>
        ) : null}
      </header>

      {subtitle ? <div className="se-result__subtitle">{subtitle}</div> : null}

      <div className="se-rows">
        {lines.map((line) => (
          <div className={`se-row${line.muted ? ' se-row--muted' : ''}`} key={line.label}>
            <span className="se-row__label">{line.label}</span>
            <span className="se-row__value">
              {line.delta !== undefined ? (
                <DeltaPair
                  value={line.delta}
                  remaining={line.remaining}
                  money={line.money ?? false}
                  invert={line.invert}
                />
              ) : (
                line.value
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="se-result__consequences">
        <p className="se-eyebrow">What it moved</p>
        <div className="se-rows">
          <div className="se-row">
            <span className="se-row__label">Cash</span>
            <span className="se-row__value">
              <Transition before={before.cashCents} after={after.cashCents} money />
            </span>
          </div>
          <div className="se-row">
            <span className="se-row__label">Net Worth</span>
            <span className="se-row__value">
              <Transition before={before.netWorthCents} after={after.netWorthCents} money />
            </span>
          </div>
          <div className="se-row">
            <span className="se-row__label">Whore Happiness</span>
            <span className="se-row__value">
              <span className="se-num">
                <span className="se-muted">{before.whoreHappiness}%</span>
                <span className="se-muted"> &rarr; </span>
                <span className={before.whoreHappiness === after.whoreHappiness ? '' : 'se-accent'}>
                  {after.whoreHappiness}%
                </span>
              </span>
            </span>
          </div>
          <div className="se-row">
            <span className="se-row__label">Thug Happiness</span>
            <span className="se-row__value">
              <span className="se-num">
                <span className="se-muted">{before.thugHappiness}%</span>
                <span className="se-muted"> &rarr; </span>
                <span className={before.thugHappiness === after.thugHappiness ? '' : 'se-accent'}>
                  {after.thugHappiness}%
                </span>
              </span>
            </span>
          </div>
          {ranksMoved ? (
            <>
              <div className="se-row">
                <span className="se-row__label">Local Rank</span>
                <span className="se-row__value">
                  <Transition
                    before={rankChanges.localBefore}
                    after={rankChanges.localAfter}
                    prefix="#"
                  />
                </span>
              </div>
              <div className="se-row">
                <span className="se-row__label">National Rank</span>
                <span className="se-row__value">
                  <Transition
                    before={rankChanges.nationalBefore}
                    after={rankChanges.nationalAfter}
                    prefix="#"
                  />
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
