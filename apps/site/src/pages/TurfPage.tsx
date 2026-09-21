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
      <PublicPageHero eyebrow="Territory" title="Turf">
        <p>See who controls each public district and the latest completed captures.</p>
      </PublicPageHero>

      <section className="site-section site-section--tight">
        <div className="container public-game-stack">
          {!data && !failed ? <PublicLoading /> : null}
          {failed ? <PublicError /> : null}

          {data ? (
            data.enabled ? (
              <>
                <section className="site-panel">
                  <div className="site-panel__head">
                    <div>
                      <span className="site-card__eyebrow">Current control</span>
                      <h2>Blocks</h2>
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
                              #{block.holder.publicPimpId}
                            </Link>
                          </>
                        ) : (
                          <strong>Locals / Unclaimed</strong>
                        )}
                      </article>
                    ))}
                  </div>
                </section>

                <section className="site-panel">
                  <div className="site-panel__head">
                    <div>
                      <span className="site-card__eyebrow">Street wire</span>
                      <h2>Recent captures</h2>
                    </div>
                  </div>
                  <PublicEventList events={data.recentCaptures} />
                </section>
              </>
            ) : (
              <PublicError title="Turf is not enabled in the current ruleset." />
            )
          ) : null}
        </div>
      </section>
    </div>
  );
}
