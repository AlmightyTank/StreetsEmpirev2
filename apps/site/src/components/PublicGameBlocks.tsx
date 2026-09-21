import { formatCentsCompact, formatNumber, type PublicCurrentGameDto } from '@streets/shared';
import { Link } from 'react-router-dom';

export function gameProgress(game: PublicCurrentGameDto): number {
  const start = new Date(game.round.startsAt).getTime();
  const end = new Date(game.round.endsAt).getTime();
  const now = Date.now();
  if (game.round.status !== 'ACTIVE' || end <= start) return game.round.status === 'ENDED' ? 100 : 0;
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}

export function timeRemaining(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'Ending now';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h remaining`;
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (hours > 0) return `${hours}h ${minutes % 60}m remaining`;
  return `${minutes}m remaining`;
}

export function formatPublicDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function districtName(key: string): string {
  return key
    .toLowerCase()
    .split(/[_-]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function CurrentGameHeader({ game }: { game: PublicCurrentGameDto }) {
  const progress = gameProgress(game);
  return (
    <div className="public-game-head">
      <div>
        <span className="site-status-badge">{game.round.status}</span>
        <h2>{game.round.name}</h2>
        <p>
          {game.ruleset.name} · {game.ruleset.version} · {timeRemaining(game.round.endsAt)}
        </p>
      </div>
      <div className="public-game-progress" aria-label={`${Math.round(progress)}% of season elapsed`}>
        <div className="public-game-progress__meta">
          <span>{formatPublicDate(game.round.startsAt)}</span>
          <strong>{Math.round(progress)}%</strong>
          <span>{formatPublicDate(game.round.endsAt)}</span>
        </div>
        <div className="public-game-progress__track">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

export function PublicGameStats({ game }: { game: PublicCurrentGameDto }) {
  const stats = [
    ['Players', formatNumber(game.stats.players)],
    ['Alliances', formatNumber(game.stats.alliances)],
    ['Cities', formatNumber(game.stats.cities)],
    ['Turf Held', formatNumber(game.stats.turfBlocksHeld)],
    ['Turf Battles', formatNumber(game.stats.turfBattles)],
    ['Game Economy', formatCentsCompact(game.stats.economyNetWorthCents)],
  ] as const;

  return (
    <div className="public-stat-grid">
      {stats.map(([label, value]) => (
        <div className="public-stat" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function PublicRankings({ game, limit }: { game: PublicCurrentGameDto; limit?: number }) {
  const rows = limit ? game.topRankings.slice(0, limit) : game.topRankings;

  return (
    <div className="public-list">
      {rows.length === 0 ? <p className="public-empty">No ranked players yet.</p> : rows.map((row) => (
        <Link className="public-ranking-row" key={row.publicPimpId} to={`/players/${row.publicPimpId}`}>
          <span className="public-ranking-row__rank">#{row.rank}</span>
          <span className="public-ranking-row__player">
            <strong>
              {row.alliance ? `[${row.alliance.tag}] ` : ''}
              {row.displayName}
            </strong>
            <small>#{row.publicPimpId} · {row.city.name}</small>
          </span>
          <span className="public-ranking-row__worth">{formatCentsCompact(row.netWorthCents)}</span>
        </Link>
      ))}
    </div>
  );
}

export function PublicEvents({ game, limit }: { game: PublicCurrentGameDto; limit?: number }) {
  const rows = limit ? game.recentEvents.slice(0, limit) : game.recentEvents;

  return (
    <div className="public-list">
      {rows.length === 0 ? <p className="public-empty">No public turf captures yet.</p> : rows.map((event, index) => (
        <div className="public-event-row" key={`${event.occurredAt}-${event.player.publicPimpId}-${index}`}>
          <span className="public-event-row__marker">◆</span>
          <div>
            <p>
              <Link to={`/players/${event.player.publicPimpId}`}>
                <strong>{event.alliance ? `[${event.alliance.tag}] ` : ''}{event.player.displayName}</strong>
              </Link>
              {' captured '}
              <strong>{districtName(event.district)}</strong>
              {' in '}
              <Link to={`/cities/${event.city.slug}`}>{event.city.name}</Link>.
            </p>
            <small>{new Date(event.occurredAt).toLocaleString('en-US')}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PublicNews({ game, limit }: { game: PublicCurrentGameDto; limit?: number }) {
  const rows = limit ? game.recentNews.slice(0, limit) : game.recentNews;

  return (
    <div className="public-list">
      {rows.length === 0 ? <p className="public-empty">No published news yet.</p> : rows.map((item) => (
        <Link className="public-news-row" key={item.id} to={`/news/${item.id}`}>
          <span>
            {item.isPinned ? <span className="public-news-row__pin">Pinned</span> : null}
            <strong>{item.title}</strong>
          </span>
          <small>{formatPublicDate(item.publishedAt)}</small>
        </Link>
      ))}
    </div>
  );
}
