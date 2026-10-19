import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export type CareerDestinationKey = 'xp' | 'pass' | 'events' | 'profile';

const CAREER_DESTINATIONS: Array<{
  key: CareerDestinationKey;
  label: string;
  eyebrow: string;
  href: string;
}> = [
  { key: 'xp', label: 'XP Progress', eyebrow: 'Permanent level', href: '/game/xp-progress' },
  { key: 'pass', label: 'Street Pass', eyebrow: 'Round rewards', href: '/game/street-pass' },
  { key: 'events', label: 'Events', eyebrow: 'Timed objectives', href: '/game/events' },
  { key: 'profile', label: 'Profile', eyebrow: 'Public record', href: '/game/profile' },
];

export function CareerNavigation({ active, label = 'Career destinations' }: {
  active: CareerDestinationKey;
  label?: string;
}) {
  return (
    <nav className="se-career-nav" aria-label={label}>
      {CAREER_DESTINATIONS.map((destination) => (
        <Link
          key={destination.key}
          className={`se-career-nav__item${destination.key === active ? ' is-active' : ''}`}
          to={destination.href}
          aria-current={destination.key === active ? 'page' : undefined}
        >
          <small>{destination.eyebrow}</small>
          <strong>{destination.label}</strong>
        </Link>
      ))}
    </nav>
  );
}

export type CareerMetric = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'accent' | 'good' | 'warn' | 'muted';
};

export function CareerMetricStrip({ items, label = 'Career summary', className, scrollable = false }: {
  items: CareerMetric[];
  label?: string;
  className?: string;
  scrollable?: boolean;
}) {
  return (
    <div
      className={`se-career-metrics${className ? ` ${className}` : ''}`}
      role={scrollable ? 'region' : undefined}
      aria-label={label}
      tabIndex={scrollable ? 0 : undefined}
    >
      {items.map((item) => (
        <div className={`se-career-metric${item.tone ? ` se-career-metric--${item.tone}` : ''}`} key={item.label}>
          <span className="se-career-metric__label">{item.label}</span>
          <strong className="se-career-metric__value">{item.value}</strong>
          {item.detail ? <span className="se-career-metric__detail">{item.detail}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function CareerGuidance({ title, summary = 'How it works', children, action }: {
  title: string;
  summary?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <details className="se-career-guidance">
      <summary>
        <span>{summary}</span>
        <strong>{title}</strong>
      </summary>
      <div className="se-career-guidance__body">{children}</div>
      {action ? <div className="se-career-guidance__action">{action}</div> : null}
    </details>
  );
}
