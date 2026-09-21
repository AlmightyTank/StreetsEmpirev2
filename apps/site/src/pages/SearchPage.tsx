import { useState, type FormEvent } from 'react';
import type { PublicSearchDto } from '@streets/shared';
import { Link, useSearchParams } from 'react-router-dom';
import { publicSiteApi } from '../api/public.js';
import { PublicError, PublicPageHero } from '../components/PublicPageBits.js';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const [data, setData] = useState<PublicSearchDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run(q: string) {
    const clean = q.trim();
    setParams(clean ? { q: clean } : {});
    if (clean.length < 2) {
      setData({ query: clean, results: [] });
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      setData(await publicSiteApi.search(clean));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(query);
  }

  return (
    <div className="site-page">
      <PublicPageHero eyebrow="Find anything" title="Search StreetsEmpire">
        <p>Search current players and alliances, completed games, published news and cities.</p>
      </PublicPageHero>

      <section className="site-section site-section--tight">
        <div className="container search-wrap">
          <form className="site-search-form" onSubmit={submit}>
            <label htmlFor="site-search">Search</label>
            <div>
              <input
                id="site-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Player, alliance, game, news, city…"
                autoComplete="off"
              />
              <button className="btn btn-primary" type="submit">Search</button>
            </div>
          </form>

          {loading ? <div className="site-panel public-state"><strong>Searching…</strong></div> : null}
          {failed ? <PublicError title="Search is temporarily unavailable." /> : null}

          {data ? (
            <div className="site-panel search-results">
              <div className="site-panel__head">
                <div>
                  <span className="site-card__eyebrow">Results</span>
                  <h2>{data.query ? 'Matches for “' + data.query + '”' : 'Search the site'}</h2>
                </div>
              </div>

              {data.results.length ? (
                <div className="public-list">
                  {data.results.map((result, index) => (
                    <Link className="search-result" key={result.kind + ':' + result.href + ':' + index} to={result.href}>
                      <span className="site-status-badge">{result.kind}</span>
                      <div>
                        <strong>{result.title}</strong>
                        <small>{result.subtitle}</small>
                      </div>
                      <span>→</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="public-empty">{data.query.length < 2 ? 'Enter at least two characters.' : 'No public results found.'}</p>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
