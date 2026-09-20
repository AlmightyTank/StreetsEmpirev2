import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import type { CitiesDto, CityCharacterDto, RankingsDto, TurfBlockDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { api, ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

const ORDER: Record<TurfBlockDto['district'], number> = {
  CASINO: 0,
  NIGHTCLUB: 1,
  LOW_RENT: 2,
  URBAN_GHETTO: 3,
  WINO_SLUMS: 4,
};

function durationFrom(iso: string | null, now = Date.now()): string {
  if (!iso) return '—';
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function turfTime(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m`;
  const hours = seconds / 3600;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function pulse(city: CityCharacterDto) {
  const blocks = city.turf?.blocks ?? [];
  const held = blocks.filter((block) => block.holder);
  const vacant = blocks.filter((block) => !block.holder && block.localsReclaimAt);
  const locals = blocks.filter((block) => !block.holder && !block.localsReclaimAt);
  const ages = held.flatMap((block) => block.heldSince ? [Date.now() - new Date(block.heldSince).getTime()] : []);
  return {
    held: held.length,
    mine: held.filter((block) => block.isMine).length,
    locals: locals.length,
    vacant: vacant.length,
    postedThugs: held.reduce((sum, block) => sum + block.cornerThugs, 0),
    guns: held.reduce((sum, block) => sum + block.cornerGuns.total, 0),
    visiblePushes: blocks.filter((block) => block.push).length,
    averageHold: ages.length ? ages.reduce((sum, value) => sum + value, 0) / ages.length : 0,
  };
}

function holder(block: TurfBlockDto) {
  if (!block.holder) {
    return block.localsReclaimAt
      ? <span className="se-muted">Vacant · locals rebuilding</span>
      : <span className="se-muted">Locals</span>;
  }
  return (
    <span className="se-turfboard__owner">
      <AllianceTag alliance={block.holder.alliance} />
      <Link to={`/game/players/${block.holder.publicPimpId}`} className="se-playerlink">{block.holder.displayName}</Link>
      {block.isMine ? <span className="se-you">YOU</span> : null}
    </span>
  );
}

function CityBlockBoard({ city }: { city: CityCharacterDto }) {
  if (!city.turf) return <p className="se-muted">Turf is not enabled in this round.</p>;
  const blocks = [...city.turf.blocks].sort((a, b) => ORDER[a.district] - ORDER[b.district]);

  return (
    <div className="se-turfboard" role="list" aria-label={`${city.name} district control`}>
      {blocks.map((block) => {
        const status = block.isMine ? 'mine' : block.holder ? 'held' : block.localsReclaimAt ? 'vacant' : 'locals';
        return (
          <article key={block.district} role="listitem" className={`se-turfboard__block se-turfboard__block--${status}`}>
            <div className="se-turfboard__head">
              <div>
                <span className="se-eyebrow">{block.districtName}</span>
                <div className="se-turfboard__holder">{holder(block)}</div>
              </div>
              <span className="se-turfboard__age" title={block.heldSince ? `Held since ${new Date(block.heldSince).toLocaleString()}` : undefined}>
                {block.holder ? `held ${durationFrom(block.heldSince)}` : block.localsReclaimAt ? 'open' : 'locals'}
              </span>
            </div>

            <div className="se-turfboard__stats">
              {block.holder ? (
                <>
                  <span><b className="se-num">{formatNumber(block.cornerThugs)}</b><small>posted</small></span>
                  <span><b className="se-num">{formatNumber(block.cornerGuns.total)}</b><small>guns</small></span>
                </>
              ) : (
                <>
                  <span><b className="se-num">{formatNumber(block.localsThugs)}</b><small>locals</small></span>
                  <span><b className="se-num">{formatNumber(block.localsFullThugs)}</b><small>full strength</small></span>
                </>
              )}
              <span><b className="se-num">{Math.floor(block.presenceTurns)}</b><small>your presence</small></span>
            </div>

            {block.push ? (
              <div className="se-turfboard__pressure">
                <strong>{block.push.role === 'attacker' ? 'Your push' : block.push.role === 'defender' ? 'Incoming push' : 'Alliance call'}</strong>
                <span>{formatNumber(block.push.squad)} attacking · lands {new Date(block.push.landsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              </div>
            ) : null}

            {block.outpost ? <span className="se-turfboard__outpost">Your outpost</span> : null}
          </article>
        );
      })}
    </div>
  );
}

export function TurfPage() {
  const me = useSession((s) => s.me);
  const [cities, setCities] = useState<CitiesDto | null>(null);
  const [rankings, setRankings] = useState<RankingsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    Promise.all([
      api.get<CitiesDto>('/game/cities'),
      communityApi.rankings(),
    ]).then(([cityData, rankingData]) => {
      setCities(cityData);
      setRankings(rankingData);
      setError(null);
    }).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load city blocks.');
    });
  }, [me?.id]);

  const turfCities = useMemo(() => cities?.cities.filter((city) => city.turf) ?? [], [cities]);
  const selected = turfCities.find((city) => city.slug === params.get('city'))
    ?? turfCities.find((city) => city.isHome)
    ?? turfCities[0]
    ?? null;
  const selectedPulse = selected ? pulse(selected) : null;

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">City Blocks</h1>
          <p className="se-eyebrow">Who controls every district · how the Turf race is moving</p>
        </div>
        {selected ? <Link className="se-btn se-btn--ghost se-btn--sm" to={`/game/travel?city=${encodeURIComponent(selected.slug)}`}>Open {selected.name}</Link> : null}
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {!cities && !error ? <p className="se-muted" role="status">Checking the blocks...</p> : null}
      {cities && !turfCities.length ? (
        <Panel title="No Turf this round">
          <p className="se-dim">City Blocks comes alive on Turf rulesets. This round does not have holdable districts.</p>
        </Panel>
      ) : null}

      {turfCities.length ? (
        <>
          <div className="se-turfcitystrip" role="tablist" aria-label="Cities">
            {turfCities.map((city) => {
              const stats = pulse(city);
              const active = city.slug === selected?.slug;
              return (
                <button
                  key={city.slug}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`se-turfcitystrip__city${active ? ' se-turfcitystrip__city--on' : ''}`}
                  onClick={() => setParams({ city: city.slug }, { replace: true })}
                >
                  <strong>{city.name}</strong>
                  <span>{city.turf?.control ? `[${city.turf.control.alliance.tag}] controls` : 'No city controller'}</span>
                  <span className="se-num">{stats.held}/5 player-held</span>
                </button>
              );
            })}
          </div>

          {selected && selectedPulse ? (
            <div className="se-grid">
              <Panel
                title={selected.name}
                aside={selected.turf?.control
                  ? <Link to={`/game/alliances/${encodeURIComponent(selected.turf.control.alliance.tag)}`}>[{selected.turf.control.alliance.tag}] controls {selected.turf.control.blocksHeld}/5</Link>
                  : 'No alliance controls the city'}
              >
                <div className="se-turfpulse">
                  <div><span>Player-held</span><strong className="se-num">{selectedPulse.held}/5</strong></div>
                  <div><span>Your blocks</span><strong className="se-num">{selectedPulse.mine}</strong></div>
                  <div><span>Locals</span><strong className="se-num">{selectedPulse.locals}</strong></div>
                  <div><span>Vacant</span><strong className="se-num">{selectedPulse.vacant}</strong></div>
                  <div><span>Posted crew</span><strong className="se-num">{formatNumber(selectedPulse.postedThugs)}</strong></div>
                  <div><span>Posted guns</span><strong className="se-num">{formatNumber(selectedPulse.guns)}</strong></div>
                  <div><span>Avg. current hold</span><strong className="se-num">{selectedPulse.averageHold ? durationFrom(new Date(Date.now() - selectedPulse.averageHold).toISOString()) : '—'}</strong></div>
                  <div><span>Pressure you can see</span><strong className="se-num">{selectedPulse.visiblePushes}</strong></div>
                </div>
                <p className="se-hint">The city pulse is a current snapshot. Cumulative Turf performance below uses block-time across the whole round.</p>
              </Panel>

              <Panel title="District control" aside="5 blocks">
                <CityBlockBoard city={selected} />
              </Panel>

              {rankings?.territory ? (
                <div className="se-grid se-grid--2">
                  <Panel title="Top crews · round" aside="block-time">
                    {rankings.territory.crews.length ? (
                      <ol className="se-turfleaders">
                        {rankings.territory.crews.slice(0, 5).map((row) => (
                          <li key={row.publicPimpId} className={row.isYou ? 'se-turfleaders__you' : undefined}>
                            <span>
                              <b className="se-num">#{row.rank}</b>{' '}
                              <AllianceTag alliance={row.alliance} />
                              <Link className="se-playerlink" to={`/game/players/${row.publicPimpId}`}>{row.displayName}</Link>
                            </span>
                            <span className="se-num">{turfTime(row.heldSeconds)} · {row.currentBlocks} now</span>
                          </li>
                        ))}
                      </ol>
                    ) : <p className="se-muted">No crew has banked block-time yet.</p>}
                  </Panel>

                  <Panel title="Top alliances · round" aside="block-time">
                    {rankings.territory.alliances.length ? (
                      <ol className="se-turfleaders">
                        {rankings.territory.alliances.slice(0, 5).map((row) => (
                          <li key={row.tag} className={row.isYours ? 'se-turfleaders__you' : undefined}>
                            <span><b className="se-num">#{row.rank}</b>{' '}<Link className="se-playerlink" to={`/game/alliances/${encodeURIComponent(row.tag)}`}>[{row.tag}] {row.name}</Link></span>
                            <span className="se-num">{turfTime(row.heldSeconds)} · {row.currentBlocks} now</span>
                          </li>
                        ))}
                      </ol>
                    ) : <p className="se-muted">No alliance has banked block-time yet.</p>}
                  </Panel>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </GameLayout>
  );
}
