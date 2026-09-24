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

  return (
    <InfoLayout>
      <div className="se-news-page">
      <section className="se-info-hero">
        <span className="se-info-hero__kicker">The street wire</span>
        <h1 className="se-info-hero__title">News</h1>
        <p className="se-info-hero__body">Round announcements, changes and notices. Pinned posts stay at the top of the wire.</p>
        {news.length ? <div className="se-info-hero__metrics"><span className="se-info-chip"><strong>{news.length}</strong> posts loaded</span></div> : null}
      </section>

      {error ? <Alert>{error}</Alert> : null}
      {loading ? <p className="se-muted">Checking the wire...</p> : null}
      {!loading && news.length === 0 ? <p className="se-muted">No round news has been posted yet.</p> : null}

      <div className="se-news-page__list">
        {news.map((post) => (
          <article className={`se-panel se-news${post.isPinned ? ' se-news--pinned' : ''}`} key={post.id}>
            <div className="se-panel__head">
              <h2 className="se-panel__title">{post.isPinned ? 'Pinned · ' : ''}{post.title}</h2>
              <span className="se-news-card__date se-num">{formatDate(post.publishedAt)}</span>
            </div>
            <div className="se-panel__body">
              <p className="se-news-card__body">{post.body}</p>
              <p className="se-hint se-news-card__byline">{post.authorName ? `Posted by ${post.authorName}` : 'StreetsEmpire wire'}</p>
            </div>
          </article>
        ))}
      </div>
    </InfoLayout>
  );
}
