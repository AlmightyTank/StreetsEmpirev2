import { useEffect, useState } from 'react';
import { rememberedKey, useRememberedState } from '../utils/remembered.js';
import { Link, Navigate } from 'react-router-dom';
import { LevelChip } from '../components/LevelChip.js';
import type { AllianceRankingsDto, RankingEntryDto, RankingsDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { allianceApi } from '../api/alliances.js';
import { communityApi } from '../api/community.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { AvatarPortrait } from '../components/BuiltAvatar.js';
import { SupporterMark } from '../components/SupporterMark.js';
import { ThemeSwatch } from '../components/ThemeSwatch.js';
import { Panel } from '../components/Panel.js';
import { SocialNavigation } from '../components/SocialExperience.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { AllianceRankingTable } from '../components/AllianceRankingTable.js';
import { formatElapsed, formatWhen } from '../utils/time.js';
import { HallOfFamePage } from './HallOfFamePage.js';
import { roundAftermathPublicEnabled } from '../config/features.js';

type RankingView = 'national' | 'local' | 'alliances' | 'turf-crews' | 'turf-alliances';

const heldFor = (iso: string) => formatElapsed(iso);

function movementText(value: number | null): string {
  if (value === null || value === 0) return 'even';
  return value > 0 ? `up ${formatNumber(value)}` : `down ${formatNumber(Math.abs(value))}`;
}

function movementTone(value: number | null): string {
  if (value === null || value === 0) return 'even';
  return value > 0 ? 'up' : 'down';
}

function turfTime(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.max(1, Math.floor(seconds / 60))}m`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function playerInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0]?.[0] ?? ''}${words.at(-1)?.[0] ?? ''}` : displayName.slice(0, 2)).toUpperCase();
}

function RankingMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'accent' | 'good' | 'warn';
}) {
  return (
    <div className={`se-rankings-metric${tone ? ` se-rankings-metric--${tone}` : ''}`}>
      <span className="se-rankings-metric__label">{label}</span>
      <strong className="se-rankings-metric__value">{value}</strong>
      {detail ? <span className="se-rankings-metric__detail">{detail}</span> : null}
    </div>
  );
}

function RankingTable({ rows, showCity }: { rows: RankingEntryDto[]; showCity: boolean }) {
  if (rows.length === 0) {
    return <div className="se-panel__body"><p className="se-muted">Nobody is ranked yet.</p></div>;
  }

  return (
    <div className="se-tablewrap">
      <table className="se-table se-table--cards se-ranking-table se-rankings-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Pimp</th>
            {showCity ? <th>City</th> : null}
            <th className="se-table__number">Net Worth</th>
            <th>Held</th>
            <th>Move</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.publicPimpId}
              className={`${row.isYou ? 'se-rank-you ' : ''}se-rankings-row se-rankings-row--${Math.min(row.rank, 4)}`}
            >
              <td className="se-num se-rankings-row__rank" data-label="Rank">#{formatNumber(row.rank)}</td>
              <td className="se-td--title">
                <div className="se-rankings-player" data-profile-hover-trigger="">
                  <span className={`se-rankings-player__avatar${row.avatarFrame ? ' se-rankings-player__avatar--framed' : ''}`} aria-hidden="true">
                    <AvatarPortrait imageUrl={row.imageUrl} avatar={row.avatar} frameKey={row.avatarFrame} fallback={playerInitials(row.displayName)} />
                  </span>
                  <span className="se-rankings-player__identity">
                    <AllianceTag alliance={row.alliance} />
                    <Link to={`/game/players/${row.publicPimpId}`} className="se-playerlink">
                      {row.displayName} <span className="se-muted se-num">#{row.publicPimpId}</span>
                    </Link>
                    {row.isSupporter ? <SupporterMark /> : null}
                    <LevelChip level={row.accountLevel} />
                    <ThemeSwatch theme={row.siteTheme} label={row.siteThemeLabel} />
                    {row.isYou ? <span className="se-you">YOU</span> : null}
                  </span>
                </div>
              </td>
              {showCity ? <td data-label="City">{row.city.name}</td> : null}
              <td className="se-table__number se-num" data-label="Net worth">{formatCents(row.netWorthCents)}</td>
              <td className="se-num" data-label="Held" title={`Held since ${formatWhen(row.rankHeldSinceAt)}`}>{heldFor(row.rankHeldSinceAt)}</td>
              <td className={`se-num se-rankings-move se-rankings-move--${movementTone(row.rankMovement)}`} data-label="Move">
                {movementText(row.rankMovement)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TerritoryCrewTable({ data }: { data: RankingsDto }) {
  const rows = data.territory?.crews ?? [];
  if (!rows.length) {
    return <div className="se-panel__body"><p className="se-muted">Nobody has held a block long enough to hit the ledger yet.</p></div>;
  }

  return (
    <div className="se-tablewrap">
      <table className="se-table se-table--cards se-rankings-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Crew</th>
            <th className="se-table__number">Block-time</th>
            <th className="se-table__number">Held now</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row) => (
            <tr key={row.publicPimpId} className={row.isYou ? 'se-rank-you' : undefined}>
              <td className="se-num se-rankings-row__rank" data-label="Rank">#{formatNumber(row.rank)}</td>
              <td className="se-td--title">
                <div className="se-rankings-player" data-profile-hover-trigger="">
                  <span className={`se-rankings-player__avatar${row.avatarFrame ? ' se-rankings-player__avatar--framed' : ''}`} aria-hidden="true">
                    <AvatarPortrait imageUrl={row.imageUrl} avatar={row.avatar} frameKey={row.avatarFrame} fallback={playerInitials(row.displayName)} />
                  </span>
                  <span className="se-rankings-player__identity">
                    <AllianceTag alliance={row.alliance} />
                    <Link to={`/game/players/${row.publicPimpId}`} className="se-playerlink">{row.displayName}</Link>
                    {row.isYou ? <span className="se-you">YOU</span> : null}
                    {row.hallOfFameLeader ? <span className="se-you">TURF LEADER</span> : null}
                  </span>
                </div>
              </td>
              <td className="se-table__number se-num" data-label="Block-time">{turfTime(row.heldSeconds)}</td>
              <td className="se-table__number se-num" data-label="Held now">{formatNumber(row.currentBlocks)} blocks</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TerritoryAllianceTable({ data }: { data: RankingsDto }) {
  const rows = data.territory?.alliances ?? [];
  if (!rows.length) {
    return <div className="se-panel__body"><p className="se-muted">No alliance has earned block-time yet.</p></div>;
  }

  return (
    <div className="se-tablewrap">
      <table className="se-table se-table--cards se-rankings-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Alliance</th>
            <th className="se-table__number">Block-time</th>
            <th className="se-table__number">Held now</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 10).map((row) => (
            <tr key={row.tag} className={row.isYours ? 'se-rank-you' : undefined}>
              <td className="se-num se-rankings-row__rank" data-label="Rank">#{formatNumber(row.rank)}</td>
              <td className="se-td--title">
                <Link to={`/game/alliances/${encodeURIComponent(row.tag)}`} className="se-playerlink">[{row.tag}] {row.name}</Link>
                {row.isYours ? <span className="se-you">YOURS</span> : null}
                {row.hallOfFameLeader ? <span className="se-you">TURF LEADER</span> : null}
              </td>
              <td className="se-table__number se-num" data-label="Block-time">{turfTime(row.heldSeconds)}</td>
              <td className="se-table__number se-num" data-label="Held now">{formatNumber(row.currentBlocks)} blocks</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RankingsPage() {
  const me = useSession((s) => s.me);
  const [data, setData] = useState<RankingsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alliances, setAlliances] = useState<AllianceRankingsDto | null>(null);
  const [latestEndedRound, setLatestEndedRound] = useState<{ id: string; name: string } | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [view, setView] = useRememberedState<RankingView>(rememberedKey('rankings.view', me?.id), 'national',
    { accept: (value): value is RankingView => value === 'national' || value === 'local' || value === 'alliances' || value === 'turf-crews' || value === 'turf-alliances' });

  useEffect(() => {
    communityApi.rankings()
      .then(setData)
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught.message : 'Could not load the rankings.');
      });
    allianceApi.rankings().then(setAlliances).catch(() => setAlliances(null));
      communityApi.hallOfFame()
        .then((archive) => setLatestEndedRound(archive.rounds[0] ? { id: archive.rounds[0].id, name: archive.rounds[0].name } : null))
        .catch((caught: unknown) => setArchiveError(caught instanceof ApiError ? caught.message : 'Past round reports are temporarily unavailable.'));
  }, []);

  useEffect(() => {
    if (view === 'alliances' && alliances && !alliances.enabled) setView('national');
    if ((view === 'turf-crews' || view === 'turf-alliances') && data && !data.territory) setView('national');
  }, [view, alliances, data]);

  if (!me) return <Navigate to="/join" replace />;

  const nationalMe = data?.national.find((row) => row.isYou) ?? null;
  const localMe = data?.local.find((row) => row.isYou) ?? null;
  const ownAlliance = alliances?.enabled ? alliances.alliances.find((row) => row.isYours) ?? null : null;
  const ownTurf = data?.territory?.crews.find((row) => row.isYou) ?? null;

  const title = view === 'national'
    ? 'National leaderboard'
    : view === 'local'
      ? `${data?.localCity.name ?? 'Local'} leaderboard`
      : view === 'alliances'
        ? 'Alliance leaderboard'
        : view === 'turf-crews'
          ? 'Territory · Crews'
          : 'Territory · Alliances';

  const explanation = view === 'national'
    ? 'Players across the round, ordered by net worth.'
    : view === 'local'
      ? 'Players in your current city, ordered by net worth.'
      : view === 'alliances'
        ? 'Alliances ordered by combined active-member net worth.'
        : 'Territory standings use cumulative block-time rather than only blocks held right now.';

  return (
    <GameLayout>
      <div className="se-rankings">
        <SocialNavigation active="rankings" />
        <header className="se-rankings-hero">
          <div className="se-rankings-hero__copy">
            <span className="se-eyebrow">Live round ledger</span>
            <h1>Rankings</h1>
            <p>See where your crew stands, who is moving, and who has held the street long enough to own the current board.</p>
            {roundAftermathPublicEnabled ? <div className="se-rankings-archive-link">
              {latestEndedRound ? (
                <Link to={`/game/rounds/${encodeURIComponent(latestEndedRound.id)}/aftermath?view=records`}>
                  Open {latestEndedRound.name} records & awards <span aria-hidden="true">→</span>
                </Link>
              ) : (
                <Link to="/game/hall-of-fame">Browse finished rounds <span aria-hidden="true">→</span></Link>
              )}
              {archiveError ? <span role="status">{archiveError}</span> : null}
            </div> : null}
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}

        {data ? (
          <>
            <section className="se-rankings-summary">
              <div className="se-rankings-sectionhead">
                <div>
                  <span className="se-eyebrow">Your standing</span>
                  <h2>Current round position</h2>
                </div>
                <p>Rank movement compares your current position with the previous ranking snapshot. Rank streak shows how long the current position has been held.</p>
              </div>

              <div className="se-rankings-metrics" role="region" aria-label="Your ranking statistics" tabIndex={0}>
                <RankingMetric
                  label="National rank"
                  value={`#${formatNumber(data.me.nationalRank)}`}
                  detail={nationalMe ? `${movementText(nationalMe.rankMovement)} · held ${heldFor(nationalMe.rankHeldSinceAt)}` : 'current round'}
                  tone="accent"
                />
                <RankingMetric
                  label={`${data.localCity.name} rank`}
                  value={`#${formatNumber(data.me.localRank)}`}
                  detail={localMe ? `${movementText(localMe.rankMovement)} · held ${heldFor(localMe.rankHeldSinceAt)}` : 'current city'}
                />
                <RankingMetric
                  label="Net worth"
                  value={formatCents(me.netWorthCents)}
                  detail="value used by net-worth leaderboards"
                />
                <RankingMetric
                  label="Alliance rank"
                  value={ownAlliance ? `#${formatNumber(ownAlliance.rank)}` : alliances?.enabled ? 'Unranked' : 'Solo round'}
                  detail={ownAlliance ? `${formatNumber(ownAlliance.memberCount)} members` : 'combined net worth board'}
                />
                <RankingMetric
                  label="Territory rank"
                  value={ownTurf ? `#${formatNumber(ownTurf.rank)}` : data.territory ? 'Unranked' : 'Not enabled'}
                  detail={ownTurf ? `${turfTime(ownTurf.heldSeconds)} block-time · ${formatNumber(ownTurf.currentBlocks)} now` : 'cumulative block-time'}
                  tone={ownTurf?.currentBlocks ? 'good' : undefined}
                />
              </div>
            </section>

            <section className="se-rankings-board">
              <div className="se-rankings-sectionhead">
                <div>
                  <span className="se-eyebrow">Leaderboard</span>
                  <h2>{title}</h2>
                </div>
                <p>{explanation}</p>
              </div>

              <div className="se-rankings-tabs" role="tablist" aria-label="Ranking board">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'national'}
                  className={`se-rankings-tabs__tab${view === 'national' ? ' se-rankings-tabs__tab--active' : ''}`}
                  onClick={() => setView('national')}
                >
                  <span>National</span>
                  <strong>{formatNumber(data.national.length)}</strong>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'local'}
                  className={`se-rankings-tabs__tab${view === 'local' ? ' se-rankings-tabs__tab--active' : ''}`}
                  onClick={() => setView('local')}
                >
                  <span>{data.localCity.name}</span>
                  <strong>{formatNumber(data.local.length)}</strong>
                </button>
                {alliances?.enabled ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'alliances'}
                    className={`se-rankings-tabs__tab${view === 'alliances' ? ' se-rankings-tabs__tab--active' : ''}`}
                    onClick={() => setView('alliances')}
                  >
                    <span>Alliances</span>
                    <strong>{formatNumber(alliances.alliances.length)}</strong>
                  </button>
                ) : null}
                {data.territory ? (
                  <>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={view === 'turf-crews'}
                      className={`se-rankings-tabs__tab${view === 'turf-crews' ? ' se-rankings-tabs__tab--active' : ''}`}
                      onClick={() => setView('turf-crews')}
                    >
                      <span>Turf crews</span>
                      <strong>{formatNumber(data.territory.crews.length)}</strong>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={view === 'turf-alliances'}
                      className={`se-rankings-tabs__tab${view === 'turf-alliances' ? ' se-rankings-tabs__tab--active' : ''}`}
                      onClick={() => setView('turf-alliances')}
                    >
                      <span>Turf alliances</span>
                      <strong>{formatNumber(data.territory.alliances.length)}</strong>
                    </button>
                  </>
                ) : null}
              </div>

              <div className="se-rankings-surface">
                {view === 'national' ? (
                  <Panel title="National board" aside="Net worth" flush className="se-rankings-panel">
                    <RankingTable rows={data.national} showCity />
                  </Panel>
                ) : null}

                {view === 'local' ? (
                  <Panel title={data.localCity.name} aside="Net worth" flush className="se-rankings-panel">
                    <RankingTable rows={data.local} showCity={false} />
                  </Panel>
                ) : null}

                {view === 'alliances' && alliances?.enabled ? (
                  <Panel title="Alliance board" aside={<Link to="/game/alliances">Full alliance board</Link>} flush className="se-rankings-panel">
                    {alliances.alliances.length
                      ? <AllianceRankingTable rows={alliances.alliances.slice(0, 10)} />
                      : <div className="se-panel__body"><p className="se-muted">No alliances yet. <Link to="/game/alliance">Found the first one.</Link></p></div>}
                  </Panel>
                ) : null}

                {view === 'turf-crews' && data.territory ? (
                  <Panel title="Territory crews" aside="Cumulative block-time" flush className="se-rankings-panel">
                    <TerritoryCrewTable data={data} />
                  </Panel>
                ) : null}

                {view === 'turf-alliances' && data.territory ? (
                  <Panel title="Territory alliances" aside="Cumulative block-time" flush className="se-rankings-panel">
                    <TerritoryAllianceTable data={data} />
                  </Panel>
                ) : null}
              </div>

              <div className="se-rankings-footnote">
                <span>Public leaderboard data only.</span>
                <span>Open a player profile for public history and achievements.</span>
                <span>Use recon for private raid intelligence.</span>
              </div>
            </section>
          </>
        ) : !error ? (
          <div className="se-rankings-loading" role="status">Counting stacks and checking the ledger...</div>
        ) : null}
      </div>
      <section id="hall-of-fame" className="se-mt">
        {roundAftermathPublicEnabled ? <Link className="se-aftermath-archive-link" to="/game/round-archive">Browse and compare archived round reports <span aria-hidden="true">→</span></Link> : null}
        <HallOfFamePage />
      </section>
    </GameLayout>
  );
}
import '../styles/rankings.css';
import '../styles/social-experience.css';
import '../styles/aftermath.css';
