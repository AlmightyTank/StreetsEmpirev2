import { useEffect, useState } from 'react';
import type { GameNewsDto } from '@streets/shared';
import { roundsApi } from '../api/rounds.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { InfoLayout } from '../layouts/InfoLayout.js';
import { formatDate } from '../utils/time.js';

/** Public: logged-out visitors and the forum footer link here. */
export function NewsPage() {
  const [news, setNews] = useState<GameNewsDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    roundsApi.news()
      .then((response) => setNews(response.news))
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load the news.'))
      .finally(() => setLoading(false));
  }, []);

  const pinnedCount = news.filter((post) => post.isPinned).length;
  const latest = news[0] ?? null;

  return (
    <InfoLayout>
      <div className="se-news-page">
        <section className="se-info-hero se-info-hero--news">
          <div className="se-info-hero__copy">
            <span className="se-info-hero__kicker">The street wire</span>
            <h1 className="se-info-hero__title">News</h1>
            <p className="se-info-hero__body">Round announcements, patch notes and notices from the people running the streets. Pinned dispatches stay at the top.</p>
          </div>
          <div className="se-info-hero__readout" aria-label="News summary">
            <span><small>Dispatches</small><strong>{loading ? '—' : news.length}</strong></span>
            <span><small>Pinned</small><strong>{loading ? '—' : pinnedCount}</strong></span>
            <span><small>Latest</small><strong>{latest ? formatDate(latest.publishedAt) : '—'}</strong></span>
            <span><small>Wire</small><strong>Official</strong></span>
          </div>
        </section>

        {error ? <Alert>{error}</Alert> : null}

        <section className="se-info-section">
          <div className="se-info-sectionhead">
            <div>
              <span className="se-eyebrow">Latest dispatches</span>
              <h2>What changed on the street</h2>
            </div>
            <span className="se-info-sectionhead__meta">{loading ? 'Checking the wire…' : `${news.length} posts · newest first`}</span>
          </div>

          {loading ? (
            <div className="se-info-loading" role="status">Checking the wire...</div>
          ) : news.length === 0 ? (
            <div className="se-info-empty"><strong>The wire is quiet.</strong><span>No round news has been posted yet.</span></div>
          ) : (
            <div className="se-news-page__list">
              {news.map((post, index) => (
                <article className={`se-panel se-news-card${post.isPinned ? ' se-news-card--pinned' : ''}${index === 0 ? ' se-news-card--latest' : ''}`} key={post.id}>
                  <div className="se-news-card__head">
                    <div>
                      <div className="se-news-card__meta">
                        <span className={`se-news-card__tag${post.isPinned ? ' se-news-card__tag--pinned' : ''}`}>
                          {post.isPinned ? 'Pinned' : 'Dispatch'}
                        </span>
                        {index === 0 ? <span className="se-news-card__tag">Latest</span> : null}
                      </div>
                      <h2 className="se-news-card__title">{post.title}</h2>
                    </div>
                    <time className="se-news-card__date se-num" dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                  </div>
                  <p className="se-news-card__body">{post.body}</p>
                  <footer className="se-news-card__footer">
                    <span>{post.authorName ? `Posted by ${post.authorName}` : 'StreetsEmpire wire'}</span>
                    <span>Official round notice</span>
                  </footer>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </InfoLayout>
  );
}
