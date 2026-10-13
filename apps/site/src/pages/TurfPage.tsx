import { useEffect, useState } from 'react';
import type { PublicTurfDto } from '@streets/shared';
import { Link } from 'react-router-dom';
import { publicSiteApi } from '../api/public.js';
import { PublicEventList } from '../components/PublicGameBlocks.js';
import { PublicError, PublicLoading, PublicPageHero } from '../components/PublicPageBits.js';

export function TurfPage() {
  const [data, setData] = useState<PublicTurfDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void publicSiteApi.turf()
      .then((result) => {
        if (live) setData(result);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="site-page">
      <PublicPageHero eyebrow="Turf" title="Who owns the streets right now.">
        <p>
          Blocks are claimed, built on and fought over. This is the live map —
          want the rules? They take two minutes.
        </p>
        <div className="archive-back">
          <Link className="btn btn-outline-light" to="/wiki/turf">How turf works →</Link>
          <Link className="btn btn-outline-light" to="/cities">Browse cities</Link>
        </div>
      </PublicPageHero>

      <section className="site-section site-section--tight">
        <div className="container public-game-stack">
          {!data && !failed ? <PublicLoading label="Checking the streets…" /> : null}
          {failed ? <PublicError title="The turf map is taking a break." /> : null}

          {data ? (
            data.enabled ? (
              <>
                <p className="wiki-crumb">{data.blocks.length} blocks shown · holders change all season</p>
                <section className="site-panel">
                  <div className="site-panel__head">
                    <div>
                      <span className="site-card__eyebrow">Live map</span>
                      <h2>The blocks</h2>
                    </div>
                  </div>

                  <div className="turf-grid">
                    {data.blocks.map((block) => (
                      <article className="turf-block" key={block.city.slug + ':' + block.district}>
                        <span>{block.city.name}</span>
                        <h3>{block.districtName}</h3>
                        {block.holder ? (
                          <>
                            <strong>
                              {block.holder.alliance ? '[' + block.holder.alliance.tag + '] ' : ''}
                              {block.holder.displayName}
                            </strong>
                            <Link to={'/players/' + block.holder.publicPimpId}>
                              Held by #{block.holder.publicPimpId} →
                            </Link>
                          </>
                        ) : (
                          <>
                            <strong>Open for the taking</strong>
                            <Link to="/wiki/turf">How to claim →</Link>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                </section>

                <section className="site-panel">
                  <div className="site-panel__head">
                    <div>
                      <span className="site-card__eyebrow">Fresh ink</span>
                      <h2>Latest takeovers</h2>
                    </div>
                  </div>
                  <PublicEventList events={data.recentCaptures} />
                </section>

                <section className="site-panel content-callout">
                  <div>
                    <span className="site-card__eyebrow">Want one of these blocks?</span>
                    <h2>Taking turf is simpler than it looks.</h2>
                    <p>Grow a crew, pick an open block, hold it. The wiki walks through it without jargon.</p>
                  </div>
                  <div className="archive-back">
                    <Link className="btn btn-outline-light" to="/wiki/turf">Turf guide</Link>
                    <a className="btn btn-primary" href="https://play.streetsempire.dev">Play free</a>
                  </div>
                </section>
              </>
            ) : (
              <PublicError title="No turf this season." />
            )
          ) : null}
        </div>
      </section>
    </div>
  );
}
