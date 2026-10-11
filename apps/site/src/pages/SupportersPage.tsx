import { useEffect, useState } from 'react';
import type { PublicSupportersDto } from '@streets/shared';
import { Link } from 'react-router-dom';
import { publicSiteApi } from '../api/public.js';
import { PublicError, PublicLoading, PublicPageHero } from '../components/PublicPageBits.js';

/** "2026-10" as "October 2026". */
function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The supporter thank-you list: players who chose to be named, longest-standing first. */
export function SupportersPage() {
  const [data, setData] = useState<PublicSupportersDto | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void publicSiteApi.supporters().then((result) => live && setData(result)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);

  return (
    <div className="site-page">
      <PublicPageHero eyebrow="Thank you" title="Supporters">
        <p>The players who help keep StreetsEmpire running. Supporting is cosmetic only, so nobody here bought an edge.</p>
      </PublicPageHero>
      <section className="site-section site-section--tight">
        <div className="container public-game-stack">
          {!data && !failed ? <PublicLoading label="Loading supporters…" /> : null}
          {failed ? <PublicError title="The supporter list is temporarily unavailable." /> : null}
          {data ? (
            <section className="site-panel">
              <div className="site-panel__head">
                <div>
                  <span className="site-card__eyebrow">{data.supporters.length === 1 ? '1 supporter' : `${data.supporters.length} supporters`}</span>
                  <h2>Thank you</h2>
                </div>
              </div>
              {data.supporters.length ? (
                <ul className="supporter-wall">
                  {data.supporters.map((supporter) => (
                    <li className="supporter-wall__name" key={supporter.name}>
                      <strong>{supporter.name}</strong>
                      <span>Since {monthLabel(supporter.since)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="public-empty">No supporters have chosen to be listed yet.</p>
              )}
              <p className="supporter-wall__note">
                Only supporters who turn it on in their account settings appear here, with their name and the month they
                started. <Link to="/support">How supporting works</Link>.
              </p>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
