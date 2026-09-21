import type { ReactNode } from 'react';

export function PublicPageHero({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <section className="site-page-hero">
      <div className="container">
        <p className="site-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        {children}
      </div>
    </section>
  );
}

export function PublicLoading({ label = 'Loading…' }: { label?: string }) {
  return <div className="site-panel public-state"><strong>{label}</strong></div>;
}

export function PublicError({ title = 'This page is temporarily unavailable.', children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="site-panel public-state">
      <strong>{title}</strong>
      {children ?? (
        <>
          <p>Live public data could not be reached. Try refreshing, or jump into the live game while the public view catches up.</p>
          <div className="archive-back">
            <a className="btn btn-outline-light" href="https://play.streetsempire.dev">Play Now</a>
          </div>
        </>
      )}
    </div>
  );
}

export function PublicStatGrid({ stats }: { stats: ReadonlyArray<readonly [string, string]> }) {
  return (
    <div className="archive-stat-grid">
      {stats.map(([label, value]) => (
        <div className="public-stat" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function movementText(value: number | null): string {
  if (value === null || value === 0) return '—';
  return value > 0 ? `▲ ${value}` : `▼ ${Math.abs(value)}`;
}

export function relativeTime(value: string): string {
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 60_000) return 'just now';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
