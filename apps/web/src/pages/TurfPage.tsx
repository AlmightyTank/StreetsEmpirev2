import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import type { CitiesDto, CityCharacterDto, RankingsDto, TravelDto, TurfBlockDto } from '@streets/shared';
import { formatCentsExact, formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { api, ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { Panel } from '../components/Panel.js';
import { OutpostStopPanel } from '../components/RunPanels.js';
import { TurfActions } from '../components/TurfActions.js';
import { useCountdown } from '../hooks/useCountdown.js';
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

function CityBlockBoard({ city, onChanged }: { city: CityCharacterDto; onChanged: () => void }) {
  const turf = city.turf;
  if (!turf) return <p className="se-muted">Turf is not enabled in this round.</p>;
  const blocks = [...turf.blocks].sort((a, b) => ORDER[a.district] - ORDER[b.district]);

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

            {block.outpost ? <span className="se-turfboard__outpost">Your outpost</span> : null}
            {block.revengeAvailable && block.revengeUntil ? (
              <span className="se-hint se-good">
                Revenge active until {new Date(block.revengeUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · no presence required.
              </span>
            ) : null}
            <TurfActions
              block={block}
              isHome={city.isHome}
              holdingEnabled={turf.holdingEnabled}
              warsEnabled={turf.warsEnabled}
              onChanged={onChanged}
            />
          </article>
        );
      })}
    </div>
  );
}

function turfName(player: { displayName: string; allianceTag: string | null }): string {
  return player.allianceTag ? `[${player.allianceTag}] ${player.displayName}` : player.displayName;
}

function TurfReports({ city }: { city: CityCharacterDto }) {
  const reports = city.turf?.reports ?? [];
  if (!reports.length) return <p className="se-muted">No recent Turf fights in this city.</p>;
  return (
    <ul className="se-turfblocks">
      {reports.slice(0, 5).map((report) => {
        const opponent = report.role === 'attacker' ? report.defender : report.attacker;
        const result = report.stale
          ? 'Corner changed before the push landed'
          : report.role === 'attacker'
            ? report.captured ? 'You took the block' : 'The corner held'
            : report.captured ? 'The block was lost' : 'Your side held';
        return (
          <li key={report.id} className="se-turfblocks__block">
            <span><strong>{report.districtName}</strong><span className="se-muted"> · {result}</span></span>
            <span className="se-hint">
              vs {turfName(opponent)} · {formatNumber(report.attackers)} attackers · {formatNumber(report.defenders.corner + report.defenders.ownerBackup + report.defenders.allyShowed)} defenders
            </span>
            <span className="se-hint">
              Wounds: {formatNumber(report.yourWounds)} yours / {formatNumber(report.opponentWounds)} theirs
              {report.role === 'ally' ? report.showedUp ? ' · your backup showed' : ' · your backup did not arrive' : ''}
            </span>
            {report.revengeUntil && new Date(report.revengeUntil).getTime() > Date.now() ? (
              <span className="se-hint">
                Revenge open until {new Date(report.revengeUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. It waives presence, not the hold shield.
              </span>
            ) : null}
            {report.outpostLoot ? (
              <span className="se-hint">
                Outpost loot: {formatCentsExact(report.outpostLoot.cashCents)}
                {report.outpostLoot.beer ? ` · ${formatNumber(report.outpostLoot.beer)} beer` : ''}
                {Object.entries(report.outpostLoot.products).map(([key, quantity]) => ` · ${formatNumber(quantity)} ${key.toLowerCase()}`).join('')}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TurfPage() {
  const me = useSession((s) => s.me);
  const [cities, setCities] = useState<CitiesDto | null>(null);
  const [rankings, setRankings] = useState<RankingsDto | null>(null);
  const [travel, setTravel] = useState<TravelDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();

  const load = useCallback(() => {
    Promise.all([
      api.get<CitiesDto>('/game/cities'),
      communityApi.rankings(),
      api.get<TravelDto>('/game/travel'),
    ]).then(([cityData, rankingData, travelData]) => {
      setCities(cityData);
      setRankings(rankingData);
      setTravel(travelData);
      setError(null);
    }).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load city blocks.');
    });
  }, []);

  useEffect(load, [load, me?.id]);

  const turfCities = useMemo(() => cities?.cities.filter((city) => city.turf) ?? [], [cities]);
  const selected = turfCities.find((city) => city.slug === params.get('city'))
    ?? turfCities.find((city) => city.isHome)
    ?? turfCities[0]
    ?? null;
  const selectedPulse = selected ? pulse(selected) : null;
  const activeRuns = travel?.runs ?? (travel?.run ? [travel.run] : []);
  const nextRunDeadline = activeRuns.reduce<string | null>((next, run) => {
    if (!next) return run.position.until;
    return new Date(run.position.until).getTime() < new Date(next).getTime() ? run.position.until : next;
  }, null);
  useCountdown(nextRunDeadline, load);

  const runsHere = selected
    ? activeRuns.filter((run) => run.position.phase === 'town' && run.position.city === selected.slug)
    : [];

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">City Blocks</h1>
          <p className="se-eyebrow">Control, defend and work every corner from one place</p>
        </div>
        {selected ? <Link className="se-btn se-btn--ghost se-btn--sm" to={`/game/travel?city=${encodeURIComponent(selected.slug)}`}>Travel / roads</Link> : null}
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

              <Panel title="District control & corner work" aside="5 blocks">
                <CityBlockBoard city={selected} onChanged={load} />
              </Panel>

              {!selected.isHome && travel?.rules.outposts ? (
                <Panel title="Away corners & outposts" aside={runsHere.length ? `${runsHere.length} run${runsHere.length === 1 ? '' : 's'} in town` : 'Run required'}>
                  {runsHere.length ? (
                    <div className="se-grid">
                      {runsHere.map((run) => <OutpostStopPanel key={run.id} run={run} data={travel} onDone={load} />)}
                    </div>
                  ) : (
                    <p className="se-hint">
                      Establishing or servicing an away corner requires one of your runs to be physically in {selected.name}.{' '}
                      <Link to={`/game/travel?city=${encodeURIComponent(selected.slug)}`}>Send or move a run from Travel.</Link>
                    </p>
                  )}
                </Panel>
              ) : null}

              <Panel title="Recent Turf fights" aside={selected.name}>
                <TurfReports city={selected} />
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
