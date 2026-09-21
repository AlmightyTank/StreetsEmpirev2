import { useEffect, useState } from 'react';
import type { PublicNewsFeedDto } from '@streets/shared';
import { Link } from 'react-router-dom';
import { publicSiteApi } from '../api/public.js';
import { PublicError, PublicLoading, PublicPageHero } from '../components/PublicPageBits.js';

export function NewsPage() {
  const [data, setData] = useState<PublicNewsFeedDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void publicSiteApi.news().then((x) => live && setData(x)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="site-page">
      <PublicPageHero eyebrow="Updates" title="News">
        <p>Official StreetsEmpire announcements, releases and season updates.</p>
      </PublicPageHero>
      <section className="site-section site-section--tight">
        <div className="container">
          {!data && !failed ? <PublicLoading /> : null}
          {failed ? <PublicError /> : null}
          {data?.news.length === 0 ? (
            <article className="site-panel article-body">
              <h2>No updates published yet.</h2>
              <p>Check back for release notes, season changes and public announcements.</p>
            </article>
          ) : null}
          {data && data.news.length > 0 ? (
            <div className="news-grid">
              {data.news.map((n) => (
                <article className="news-card" key={n.id}>
                  {n.isPinned ? <span className="site-status-badge">Pinned</span> : null}
                  <h2>
                    <Link to={`/news/${n.id}`}>{n.title}</Link>
                  </h2>
                  <p className="news-card__meta">
                    {new Date(n.publishedAt).toLocaleDateString()} {n.round ? `· ${n.round.name}` : ''}
                  </p>
                  <p>{n.body.length > 240 ? `${n.body.slice(0, 240)}...` : n.body}</p>
                  <Link className="site-card__link" to={`/news/${n.id}`}>Read update -&gt;</Link>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
