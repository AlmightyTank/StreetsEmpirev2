import { useEffect, useState } from 'react';
import type { PublicStatusDto } from '@streets/shared';
import { publicSiteApi } from '../api/public.js';
import { PublicError, PublicLoading, PublicPageHero } from '../components/PublicPageBits.js';

export function StatusPage() {
  const [data, setData] = useState<PublicStatusDto | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void publicSiteApi.status()
      .then((result) => { if (live) setData(result); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  return (
    <div className="site-page">
      <PublicPageHero eyebrow="Operations" title="Service Status">
        <p>Live health for the public API/database plus links to the separate game and forum services.</p>
      </PublicPageHero>

      <section className="site-section site-section--tight">
        <div className="container public-game-stack">
          {!data && !failed ? <PublicLoading label="Checking services…" /> : null}
          {failed ? (
            <PublicError title="The public API health check is unavailable.">
              <p>If this page loaded, the static website itself is still responding.</p>
            </PublicError>
          ) : null}

          {data ? (
            <>
              <div className="status-grid">
                <article className="status-card"><span className="status-dot status-dot--ok" /><div><strong>Public API</strong><small>{data.api}</small></div></article>
                <article className="status-card"><span className="status-dot status-dot--ok" /><div><strong>Database</strong><small>{data.database}</small></div></article>
                <article className="status-card"><span className="status-dot status-dot--ok" /><div><strong>Current game</strong><small>{data.currentRound ? data.currentRound.name + ' · ' + data.currentRound.status : 'No open round'}</small></div></article>
              </div>

              <div className="site-panel">
                <span className="site-card__eyebrow">Other services</span>
                <h2>External checks</h2>
                <p className="content-lead">The live game and forum run on separate hostnames. Use these direct links if you need to verify them independently.</p>
                <div className="archive-back">
                  <a className="btn btn-outline-light" href="https://play.streetsempire.dev">Live Game</a>
                  <a className="btn btn-outline-light" href="https://forum.streetsempire.dev">Forum</a>
                  <a className="btn btn-outline-light" href="https://beta.streetsempire.dev">Beta</a>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
