import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type CasinoGameDestination = {
  key: string;
  label: string;
  icon: string;
  href: string;
};

export function CasinoGameSelector({
  games,
  activeKey,
  label = 'Switch game',
}: {
  games: readonly CasinoGameDestination[];
  activeKey: string;
  label?: string;
}) {
  return (
    <nav className="se-casino-switch se-casino-game-selector" aria-label={label}>
      {games.map((game) => (
        <Link
          key={game.key}
          to={game.href}
          aria-current={activeKey === game.key ? 'page' : undefined}
          title={game.label}
          className={'se-casino-switch__game' + (activeKey === game.key ? ' is-active' : '')}
        >
          <span aria-hidden="true">{game.icon}</span>
          <small>{game.label}</small>
        </Link>
      ))}
    </nav>
  );
}

export type CasinoBankrollMetric = {
  label: string;
  value: ReactNode;
  active?: boolean;
};

export function CasinoBankrollSummary({
  metrics,
  actions,
  note,
  label = 'Casino wallet',
}: {
  metrics: readonly CasinoBankrollMetric[];
  actions: ReactNode;
  note?: ReactNode;
  label?: string;
}) {
  return (
    <section className="se-casino-wallet se-casino-bankroll" aria-label={label}>
      <dl className="se-casino-wallet__stats">
        {metrics.map((metric) => (
          <div key={metric.label} className={metric.active ? 'is-live' : undefined}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
      <div className="se-casino-wallet__actions">{actions}</div>
      {note ? <p className="se-hint se-casino-wallet__note">{note}</p> : null}
    </section>
  );
}

export function CasinoBetControl({
  id,
  label,
  ariaLabel = label,
  value,
  onChange,
  onDecrease,
  onIncrease,
  onMax,
  disabled = false,
  maxDisabled = false,
  decreaseLabel = `Decrease ${label.toLowerCase()}`,
  increaseLabel = `Increase ${label.toLowerCase()}`,
  className = '',
  children,
}: {
  id: string;
  label: string;
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  onDecrease: () => void;
  onIncrease: () => void;
  onMax: () => void;
  disabled?: boolean;
  maxDisabled?: boolean;
  decreaseLabel?: string;
  increaseLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`se-dock__amount se-casino-bet-control ${className}`.trim()} role="group" aria-label={ariaLabel}>
      <label htmlFor={id}>{label}</label>
      <button type="button" className="se-btn se-btn--sm" disabled={disabled} aria-label={decreaseLabel} onClick={onDecrease}>−</button>
      <input
        id={id}
        className="se-input"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" className="se-btn se-btn--sm" disabled={disabled} aria-label={increaseLabel} onClick={onIncrease}>+</button>
      <button type="button" className="se-btn se-btn--sm" disabled={disabled || maxDisabled} onClick={onMax}>Max</button>
      {children}
    </div>
  );
}
