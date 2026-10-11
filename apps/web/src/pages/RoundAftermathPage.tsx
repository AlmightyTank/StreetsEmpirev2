import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type {
  RoundAftermathCategoriesDto,
  RoundAftermathCategoryDto,
  RoundAftermathCategoryKey,
  RoundAftermathCityDetailDto,
  RoundAftermathAlliancesDto,
  RoundAftermathLeaderboardDto,
  RoundAftermathOverviewDto,
  RoundAftermathPersonalDto,
  RoundAftermathRecordsDto,
} from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { roundsApi } from '../api/rounds.js';
import { Alert } from '../components/Alert.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { formatDate } from '../utils/time.js';

type TabKey = 'summary' | 'cities' | 'alliances' | 'me' | 'records' | RoundAftermathCategoryKey;

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'summary', label: 'Entire Round' },
  { key: 'cities', label: 'By City' },
  { key: 'alliances', label: 'Alliances' },
  { key: 'me', label: 'My Empire' },
  { key: 'records', label: 'Records & Awards' },
  { key: 'wealth', label: 'Wealth' },
  { key: 'turf', label: 'Turf' },
  { key: 'crew', label: 'Crew' },
  { key: 'drugs', label: 'Drugs' },
  { key: 'businesses', label: 'Businesses' },
  { key: 'crime', label: 'Crime' },
  { key: 'competition', label: 'Competition' },
];

function cents(value: string): string {
  const amount = BigInt(value);
  const negative = amount < 0n;
  const dollars = (negative ? -amount : amount) / 100n;
  return `${negative ? '-' : ''}$${dollars.toLocaleString('en-US')}`;
}

function formatValue(category: RoundAftermathCategoryKey, value: string): string {
  if (category === 'wealth') return cents(value);
  if (category === 'competition') return `#${formatNumber(Number(value))}`;
  return formatNumber(Number(value));
}

function describeMetric(category: RoundAftermathCategoryKey, value: string): string {
  const formatted = formatValue(category, value);
  if (category === 'turf') return `${formatted} blocks`;
  if (category === 'crew') return `${formatted} members`;
  if (category === 'businesses') return `${formatted} active lots`;
  if (category === 'crime') return `${formatted} attempts`;
  if (category === 'competition') return `Final rank ${formatted}`;
  return formatted;
}

function personalMetricValue(category: RoundAftermathCategoryKey, value: string): string {
  if (category === 'wealth') return cents(value);
  if (category === 'competition') return `#${formatNumber(Number(value))}`;
  return formatNumber(Number(value));
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="se-aftermath-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function PlayerRows({
  board,
  category,
}: {
  board: RoundAftermathLeaderboardDto;
  category: RoundAftermathCategoryKey;
}) {
  const highest = board.entries.reduce((value, row) => {
    if (category === 'competition') return value;
    const candidate = BigInt(row.value);
    return candidate > value ? candidate : value;
  }, 0n);

  if (board.entries.length === 0) {
    return <p className="se-aftermath-empty">No eligible entries are recorded for this category.</p>;
  }

  return (
    <div className="se-tablewrap">
      <table className="se-table se-table--cards se-aftermath-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Empire</th>
            <th>Final city</th>
            <th className="se-table__number">{category === 'wealth' ? 'Net worth' : category === 'competition' ? 'Final placement' : 'Recorded total'}</th>
            {category !== 'competition' ? <th>Comparison</th> : null}
          </tr>
        </thead>
        <tbody>
          {board.entries.map((entry) => {
            const percent = category === 'competition' || highest <= 0n
              ? 0
              : Math.max(0, Math.min(100, Number((BigInt(entry.value) * 10_000n) / highest) / 100));
            const metric = formatValue(category, entry.value);
            return (
              <tr key={`${category}-${entry.publicPimpId}`}>
                <td className="se-num se-aftermath-rank" data-label="Rank">#{formatNumber(entry.rank)}</td>
                <td className="se-td--title" data-label="Empire">
                  <strong>{entry.displayName}</strong>
                  <span className="se-muted se-num">#{formatNumber(entry.publicPimpId)}</span>
                </td>
                <td data-label="Final city">{entry.cityName || 'Not recorded'}</td>
                <td className="se-table__number se-num" data-label="Recorded total">{category === 'competition' ? `#${formatNumber(Number(entry.value))}` : metric}</td>
                {category !== 'competition' ? (
                  <td data-label="Comparison">
                    <div
                      className="se-aftermath-meter"
                      role="meter"
                      aria-label={`${entry.displayName}: ${describeMetric(category, entry.value)}, relative to the highest listed value`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                    >
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatusNotice({ overview }: { overview: RoundAftermathOverviewDto }) {
  if (overview.report.status === 'UNAVAILABLE') {
    return (
      <section className="se-aftermath-notice" role="status">
        <strong>Historical report unavailable</strong>
        <p>This round predates frozen aftermath reports. Its totals were not reconstructed from live or incomplete data.</p>
      </section>
    );
  }
  if (overview.report.status === 'PREPARING') {
    return (
      <section className="se-aftermath-notice" role="status" aria-live="polite">
        <strong>Final report not published</strong>
        <p>This round’s report becomes available after final settlement. No live or partial totals are shown as final.</p>
        <div className="se-aftermath-skeleton" aria-hidden="true"><span /><span /><span /></div>
      </section>
    );
  }
  return null;
}

function AwardHighlights({ categories }: { categories: RoundAftermathCategoryDto[] }) {
  const awards = categories.filter((category) =>
    category.key !== 'competition' && category.status === 'AVAILABLE' && category.leaders.length > 0,
  );
  if (awards.length === 0) return <p className="se-aftermath-empty">No supported category awards were recorded.</p>;

  return (
    <div className="se-aftermath-awards">
      {awards.map((award) => (
        <article className="se-aftermath-award" key={award.key}>
          <span>{award.title} leader{award.leaders.length === 1 ? '' : 's'}</span>
          {award.leaders.map((leader) => (
            <strong key={`${award.key}-${leader.publicPimpId}`}>
              {leader.displayName}
              <small>#{formatNumber(leader.publicPimpId)} · {describeMetric(award.key, leader.value)}</small>
            </strong>
          ))}
        </article>
      ))}
    </div>
  );
}

export function RoundAftermathPage() {
  const { roundId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [overview, setOverview] = useState<RoundAftermathOverviewDto | null>(null);
  const [categories, setCategories] = useState<RoundAftermathCategoriesDto | null>(null);
  const [board, setBoard] = useState<RoundAftermathLeaderboardDto | null>(null);
  const [cityDetail, setCityDetail] = useState<RoundAftermathCityDetailDto | null>(null);
  const [alliances, setAlliances] = useState<RoundAftermathAlliancesDto | null>(null);
  const [personal, setPersonal] = useState<RoundAftermathPersonalDto | null>(null);
  const [records, setRecords] = useState<RoundAftermathRecordsDto | null>(null);
  const [tab, setTab] = useState<TabKey>(searchParams.get('view') === 'records' ? 'records' : 'summary');
  const [recordsCategory, setRecordsCategory] = useState<RoundAftermathCategoryKey>('wealth');
  const [recordsCitySlug, setRecordsCitySlug] = useState('');
  const [citySlug, setCitySlug] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [alliancesError, setAlliancesError] = useState<string | null>(null);
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setOverview(null);
    setCategories(null);
    setBoard(null);
    setCityDetail(null);
    setAlliances(null);
    setPersonal(null);
    setRecords(null);
    setError(null);
    setBoardError(null);
    setCityError(null);
    setAlliancesError(null);
    setPersonalError(null);
    setRecordsError(null);
    void Promise.all([roundsApi.aftermath(roundId), roundsApi.aftermathCategories(roundId)])
      .then(([nextOverview, nextCategories]) => {
        if (!current) return;
        setOverview(nextOverview);
        setCategories(nextCategories);
        setCitySlug(nextOverview.cities.find((city) => city.slug)?.slug ?? '');
      })
      .catch((caught: unknown) => {
        if (current) setError(caught instanceof ApiError ? caught.message : 'Could not load the round aftermath.');
      });
    return () => { current = false; };
  }, [roundId, retry]);

  const isSummary = tab === 'summary';
  const isCities = tab === 'cities';
  const isAlliances = tab === 'alliances';
  const selectedCategory = categories?.categories.find((category) => category.key === tab);
  const leaderboardCategory: RoundAftermathCategoryKey = isSummary ? 'wealth' : selectedCategory?.key ?? 'wealth';
  const pageSize = isSummary ? 10 : 25;
  const selectableCities = overview?.cities.filter((city) => city.slug) ?? [];

  useEffect(() => {
    let current = true;
    setBoard(null);
    setBoardError(null);
    if (!overview
      || overview.report.status !== 'READY'
      || (!isSummary && !selectedCategory)
      || (selectedCategory && selectedCategory.status !== 'AVAILABLE')) return () => { current = false; };
    void roundsApi.aftermathLeaderboard(roundId, leaderboardCategory, page, pageSize)
      .then((result) => { if (current) setBoard(result); })
      .catch((caught: unknown) => {
        if (current) setBoardError(caught instanceof ApiError ? caught.message : 'Could not load this leaderboard.');
      });
    return () => { current = false; };
  }, [roundId, overview, isSummary, leaderboardCategory, page, pageSize, selectedCategory]);

  useEffect(() => {
    let current = true;
    setCityDetail(null);
    setCityError(null);
    if (!isCities || !citySlug || overview?.report.status !== 'READY') return () => { current = false; };
    void roundsApi.aftermathCity(roundId, citySlug)
      .then((result) => { if (current) setCityDetail(result); })
      .catch((caught: unknown) => {
        if (current) setCityError(caught instanceof ApiError ? caught.message : 'Could not load this city breakdown.');
      });
    return () => { current = false; };
  }, [roundId, overview, isCities, citySlug]);

  useEffect(() => {
    let current = true;
    setAlliances(null);
    setAlliancesError(null);
    if (!isAlliances || overview?.report.status !== 'READY') return () => { current = false; };
    void roundsApi.aftermathAlliances(roundId)
      .then((result) => { if (current) setAlliances(result); })
      .catch((caught: unknown) => {
        if (current) setAlliancesError(caught instanceof ApiError ? caught.message : 'Could not load the alliance breakdown.');
      });
    return () => { current = false; };
  }, [roundId, overview, isAlliances]);

  useEffect(() => {
    let current = true;
    setPersonal(null);
    setPersonalError(null);
    if (tab !== 'me' || !overview) return () => { current = false; };
    void roundsApi.aftermathMine(roundId)
      .then((result) => { if (current) setPersonal(result); })
      .catch((caught: unknown) => {
        if (!current) return;
        if (caught instanceof ApiError && caught.isUnauthenticated) {
          setPersonalError('Sign in to view your private round report.');
        } else {
          setPersonalError(caught instanceof ApiError ? caught.message : 'Could not load your personal report.');
        }
      });
    return () => { current = false; };
  }, [roundId, overview, tab]);

  useEffect(() => {
    let current = true;
    setRecords(null);
    setRecordsError(null);
    if (tab !== 'records' || overview?.report.status !== 'READY') return () => { current = false; };
    void roundsApi.aftermathRecords(roundId, recordsCategory, page, recordsCitySlug || undefined)
      .then((result) => { if (current) setRecords(result); })
      .catch((caught: unknown) => {
        if (current) setRecordsError(caught instanceof ApiError ? caught.message : 'Could not load this record board.');
      });
    return () => { current = false; };
  }, [roundId, overview, tab, recordsCategory, recordsCitySlug, page]);

  function selectTab(next: TabKey) {
    setTab(next);
    setPage(1);
    if (next === 'records') setSearchParams({ view: 'records' }, { replace: true });
    else if (searchParams.has('view')) setSearchParams({}, { replace: true });
  }

  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const currentIndex = TABS.findIndex((item) => item.key === tab);
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (currentIndex + offset + TABS.length) % TABS.length;
    selectTab(TABS[nextIndex]!.key);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  }

  const global = overview?.global;
  const competition = categories?.categories.find((category) => category.key === 'competition');
  const cityContent = (
    <section className="se-aftermath-board" aria-labelledby="se-aftermath-city-title">
      <header className="se-aftermath-sectionhead">
        <div><span className="se-eyebrow">Final city attribution</span><h2 id="se-aftermath-city-title">City breakdown</h2></div>
        <p>Residents and their net worth/crew use final city. Turf and businesses use their physical city; round-wide crime attempts are not assigned to a city.</p>
      </header>
      {selectableCities.length ? (
        <label className="se-aftermath-city-picker" htmlFor="se-aftermath-city">
          <span>Select a city</span>
          <select id="se-aftermath-city" value={citySlug} onChange={(event) => setCitySlug(event.target.value)}>
            {selectableCities.map((city) => (
              <option key={city.slug} value={city.slug!}>{city.name ?? city.slug}</option>
            ))}
          </select>
        </label>
      ) : (
        <div className="se-aftermath-notice" role="status">
          <strong>City breakdown unavailable</strong>
          <p>{overview?.report.schemaVersion && overview.report.schemaVersion < 2
            ? 'This report predates frozen city keys and local standings; current city data is not used to reconstruct it.'
            : 'No participant or turf cities were recorded in this report.'}</p>
        </div>
      )}
      {cityError ? <Alert>{cityError}</Alert> : null}
      {citySlug && !cityDetail && !cityError ? <div className="se-aftermath-loading" role="status">Loading city breakdown…</div> : null}
      {cityDetail ? (
        <>
          <section className="se-aftermath-summary" aria-label={`${cityDetail.city.name ?? 'City'} totals`}>
            <StatCard label="Participants" value={formatNumber(cityDetail.city.participants)} detail={`${formatNumber(cityDetail.city.eligibleCompetitors)} eligible competitors`} />
            <StatCard label="Final resident wealth" value={cents(cityDetail.city.netWorthCents)} detail="Eligible players · attributed once" />
            <StatCard label="Final resident crew" value={formatNumber(cityDetail.city.crewMembers)} detail="At the round cutoff" />
            <StatCard label="Turf held" value={formatNumber(cityDetail.city.turfBlocksHeld)} detail="By physical city" />
            <StatCard label="Businesses" value={formatNumber(cityDetail.city.activeBusinessesHeld)} detail="Active lots by physical city" />
          </section>
          <div className="se-aftermath-board">
            <header className="se-aftermath-sectionhead">
              <div><span className="se-eyebrow">Frozen local standings</span><h3>{cityDetail.city.name ?? 'City'} leaderboard</h3></div>
              <p>Local ranks come from the final standings snapshot and are not recalculated.</p>
            </header>
            {cityDetail.localStandings.length === 0 ? (
              <p className="se-aftermath-empty">No eligible local standings were recorded for this city.</p>
            ) : (
              <div className="se-tablewrap">
                <table className="se-table se-table--cards se-aftermath-table">
                  <thead><tr><th>Local rank</th><th>Empire</th><th>National rank</th><th className="se-table__number">Net worth</th><th>Crew</th><th>Turf</th><th>Businesses</th></tr></thead>
                  <tbody>{cityDetail.localStandings.map((entry) => (
                    <tr key={entry.publicPimpId}>
                      <td className="se-num" data-label="Local rank">#{formatNumber(entry.localRank)}</td>
                      <td className="se-td--title" data-label="Empire"><strong>{entry.displayName}</strong><span className="se-muted se-num">#{formatNumber(entry.publicPimpId)}</span></td>
                      <td className="se-num" data-label="National rank">#{formatNumber(entry.nationalRank)}</td>
                      <td className="se-table__number se-num" data-label="Net worth">{cents(entry.netWorthCents)}</td>
                      <td data-label="Crew">{formatNumber(entry.crewMembers)}</td>
                      <td data-label="Turf">{formatNumber(entry.turfBlocksHeld)}</td>
                      <td data-label="Businesses">{formatNumber(entry.activeBusinessesHeld)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
  const allianceContent = (
    <section className="se-aftermath-board" aria-labelledby="se-aftermath-alliances-title">
      <header className="se-aftermath-sectionhead">
        <div><span className="se-eyebrow">Cutoff roster and control</span><h2 id="se-aftermath-alliances-title">Alliance standings</h2></div>
        <p>Membership and leadership are frozen at the round cutoff. Combined wealth sums eligible members; turf control follows each member’s cutoff holdings.</p>
      </header>
      {alliancesError ? <Alert>{alliancesError}</Alert> : null}
      {!alliances && !alliancesError ? <div className="se-aftermath-loading" role="status">Loading alliance breakdown…</div> : null}
      {alliances?.status === 'NOT_RECORDED' ? (
        <div className="se-aftermath-notice" role="status">
          <strong>Alliance cutoff data unavailable</strong>
          <p>{alliances.reason ?? 'Alliance standings will appear when the finalized report is ready.'}</p>
        </div>
      ) : null}
      {alliances?.status === 'AVAILABLE' && alliances.alliances.length === 0 ? (
        <p className="se-aftermath-empty">No active alliances were recorded at the round cutoff.</p>
      ) : null}
      {alliances?.status === 'AVAILABLE' ? (
        <div className="se-aftermath-alliance-list">
          {alliances.alliances.map((alliance) => (
            <article className="se-aftermath-alliance" key={`${alliance.tag}-${alliance.name}`}>
              <header>
                <div><span className="se-eyebrow">Alliance rank #{formatNumber(alliance.rank)}</span><h3>[{alliance.tag}] {alliance.name}</h3></div>
                <strong>{cents(alliance.combinedNetWorthCents)} <small>combined eligible wealth</small></strong>
              </header>
              <div className="se-aftermath-alliance-stats">
                <span>{formatNumber(alliance.memberCount)} rostered · {formatNumber(alliance.eligibleCompetitors)} eligible</span>
                <span>{formatNumber(alliance.turfBlocksHeld)} turf blocks</span>
                <span>{formatNumber(alliance.activeBusinessesHeld)} businesses</span>
                {alliance.leader ? <span>Leader: {alliance.leader.displayName} · #{formatNumber(alliance.leader.publicPimpId)}</span> : <span>Leader not eligible at cutoff</span>}
              </div>
              {alliance.cityControl.length ? (
                <p className="se-aftermath-alliance-cities">Territory: {alliance.cityControl.map((city) => `${city.cityName ?? 'Unspecified city'} (${formatNumber(city.turfBlocksHeld)})`).join(' · ')}</p>
              ) : null}
              {alliance.members.length ? (
                <ul className="se-aftermath-alliance-members">
                  {alliance.members.map((member) => (
                    <li key={member.publicPimpId}><strong>{member.displayName}</strong><span>#{formatNumber(member.publicPimpId)} · {member.cityName} · national #{formatNumber(member.nationalRank)} · {cents(member.netWorthCents)}</span></li>
                  ))}
                </ul>
              ) : <p className="se-aftermath-empty">No eligible competitors were rostered at cutoff.</p>}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
  const personalContent = (
    <section className="se-aftermath-board" aria-labelledby="se-aftermath-personal-title">
      <header className="se-aftermath-sectionhead">
        <div><span className="se-eyebrow">Private account report</span><h2 id="se-aftermath-personal-title">My Empire</h2></div>
        <p>Your archived performance is visible only to your signed-in account. Values and ranks come from the frozen report.</p>
      </header>
      {personalError ? (
        <div className="se-aftermath-notice" role="status">
          <strong>{personalError}</strong>
          {personalError.startsWith('Sign in') ? <p><Link to="/login">Sign in</Link> to see your report.</p> : null}
        </div>
      ) : null}
      {!personal && !personalError ? <div className="se-aftermath-loading" role="status">Loading your private report…</div> : null}
      {personal?.reportStatus === 'PREPARING' ? (
        <div className="se-aftermath-notice" role="status"><strong>Your report is preparing</strong><p>Personal results appear after the round snapshot is finalized.</p></div>
      ) : null}
      {personal?.reportStatus === 'UNAVAILABLE' ? (
        <div className="se-aftermath-notice" role="status"><strong>Historical personal report unavailable</strong><p>This round predates frozen reports; private results were not reconstructed from current data.</p></div>
      ) : null}
      {personal?.participation === 'NOT_PLAYED' ? (
        <div className="se-aftermath-notice" role="status"><strong>No empire recorded for this round</strong><p>Your account did not have a player entry in the finalized round snapshot.</p></div>
      ) : null}
      {personal?.participation === 'PLAYED' && personal.player ? (
        <>
          <section className="se-aftermath-champion" aria-label="Personal final standings">
            <span className="se-eyebrow">{personal.player.eligibleCompetitor ? 'Final standings' : 'Participation recorded'}</span>
            <strong>{personal.player.displayName}<small>
              #{formatNumber(personal.player.publicPimpId)} · {personal.player.cityName}
              {personal.player.nationalRank === null
                ? ' · no eligible final rank'
                : ` · national #${formatNumber(personal.player.nationalRank)} · ${personal.player.localRank === null ? 'local rank unavailable' : `local #${formatNumber(personal.player.localRank)}`}`}
              {personal.player.percentile === null ? '' : ` · ${personal.player.percentile}th percentile`}
            </small></strong>
          </section>
          <section className="se-aftermath-summary" aria-label="Your frozen round totals">
            <StatCard label="Final net worth" value={cents(personal.player.netWorthCents)} detail="Integer cents, converted for display" />
            <StatCard label="Crew" value={formatNumber(personal.player.crewMembers)} detail="At the round cutoff" />
            <StatCard label="Turf held" value={formatNumber(personal.player.turfBlocksHeld)} detail="Blocks at cutoff" />
            <StatCard label="Businesses" value={formatNumber(personal.player.activeBusinessesHeld)} detail="Active lots at cutoff" />
            <StatCard label="Crime actions" value={formatNumber(personal.player.crimeActions)} detail={`${formatNumber(personal.player.raidsAttempted)} raids · ${formatNumber(personal.player.driveBysAttempted)} drive-bys attempted`} />
          </section>
          <section className="se-aftermath-board" aria-label="Your category rankings">
            <header className="se-aftermath-sectionhead"><div><span className="se-eyebrow">Compared with eligible competitors</span><h3>Category ranks</h3></div><p>Ranks use descending recorded totals, except competition uses the frozen national rank. Ties share rank.</p></header>
            <div className="se-aftermath-personal-metrics">
              {personal.metrics.map((metric) => (
                <article className="se-aftermath-personal-metric" key={metric.category}>
                  <span>{metric.category}</span>
                  {metric.status === 'AVAILABLE' ? (
                    <>
                      <strong>{personalMetricValue(metric.category, metric.value ?? '0')}</strong>
                      <small>{metric.rank === null ? 'Not eligible for ranking' : `Rank #${formatNumber(metric.rank)} · ${metric.percentile ?? 0}% percentile · ${formatNumber(metric.tiedCompetitors)} tied`}</small>
                    </>
                  ) : (
                    <>
                      <strong>Not recorded</strong>
                      <small>{metric.category === 'drugs' ? 'Complete round production and sales totals are unavailable.' : 'This category has no eligible records for the round.'}</small>
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>
          <section className="se-aftermath-board" aria-label="Milestones and personal bests">
            <div className="se-aftermath-personal-panels">
              <div>
                <span className="se-eyebrow">This round</span>
                <h3>Milestones</h3>
                {personal.milestones.length ? <ul>{personal.milestones.map((milestone) => <li key={milestone}>{milestone}</li>)}</ul> : <p className="se-aftermath-empty">No ranked milestones were recorded.</p>}
              </div>
              <div>
                <span className="se-eyebrow">Archived reports</span>
                <h3>Personal bests</h3>
                {personal.personalBests.length ? (
                  <ul>{personal.personalBests.map((best) => (
                    <li key={best.category}>
                      <strong>{best.category}</strong> — {personalMetricValue(best.category, best.value)} · {best.roundName}
                    </li>
                  ))}</ul>
                ) : <p className="se-aftermath-empty">No earlier eligible reports were available to compare.</p>}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
  const recordsContent = (
    <section className="se-aftermath-board" aria-labelledby="se-aftermath-records-title">
      <header className="se-aftermath-sectionhead">
        <div><span className="se-eyebrow">Frozen records · next-round bonus</span><h2 id="se-aftermath-records-title">Records & Awards</h2></div>
        <p>National top-10 placements and supported global award distinctions earn $500 each toward the next round’s starting cash, capped at $2,500. City awards are recognition only. Tied leaders share recognition; unsupported totals are not guessed.</p>
      </header>
      <div className="se-aftermath-record-filters">
        <label className="se-aftermath-city-picker" htmlFor="se-aftermath-record-category">
          <span>Category</span>
          <select id="se-aftermath-record-category" value={recordsCategory} onChange={(event) => {
            setRecordsCategory(event.target.value as RoundAftermathCategoryKey);
            setPage(1);
          }}>
            {TABS.filter((item): item is { key: RoundAftermathCategoryKey; label: string } =>
              item.key !== 'summary' && item.key !== 'cities' && item.key !== 'alliances' && item.key !== 'me' && item.key !== 'records',
            ).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </label>
        <label className="se-aftermath-city-picker" htmlFor="se-aftermath-record-city">
          <span>Leaderboard scope</span>
          <select id="se-aftermath-record-city" value={recordsCitySlug} onChange={(event) => {
            setRecordsCitySlug(event.target.value);
            setPage(1);
          }}>
            <option value="">Entire round</option>
            {selectableCities.map((city) => <option key={city.slug} value={city.slug!}>{city.name ?? city.slug}</option>)}
          </select>
        </label>
      </div>
      {recordsError ? <Alert>{recordsError}</Alert> : null}
      {!records && !recordsError ? <div className="se-aftermath-loading" role="status">Loading frozen records…</div> : null}
      {records ? (
        <>
          <section className="se-aftermath-award-definition" aria-live="polite">
            <div>
              <span className="se-eyebrow">{records.award.status === 'AVAILABLE' ? 'Award formula' : 'Award unavailable'}</span>
              <h3>{records.award.title}</h3>
            </div>
            <p>{records.award.formula}</p>
          </section>
          {records.award.leaders.length ? (
            <div className="se-aftermath-record-winners">
              {records.award.leaders.map((leader) => (
                <strong key={leader.publicPimpId}>{leader.displayName}<small>#{formatNumber(leader.publicPimpId)} · {leader.cityName} · {formatValue(records.category, leader.value)}</small></strong>
              ))}
              {records.award.leadersTruncated ? <span>Additional tied winners are included in the leaderboard.</span> : null}
            </div>
          ) : null}
          {records.categoryStatus !== 'AVAILABLE' ? (
            <div className="se-aftermath-notice" role="status">
              <strong>{records.categoryStatus === 'PREPARING' ? 'Report preparing' : records.categoryStatus === 'UNAVAILABLE' ? 'Historical records unavailable' : 'No supported record for this scope'}</strong>
              <p>{records.award.formula}</p>
            </div>
          ) : (
            <>
              <div className="se-tablewrap">
                <table className="se-table se-table--cards se-aftermath-table">
                  <thead><tr><th>Rank</th><th>Empire</th><th>Final city</th><th className="se-table__number">{records.category === 'wealth' ? 'Net worth' : records.category === 'competition' ? 'Final rank' : 'Recorded total'}</th></tr></thead>
                  <tbody>{records.entries.map((entry) => (
                    <tr key={entry.publicPimpId}>
                      <td className="se-num" data-label="Rank">#{formatNumber(entry.rank)}</td>
                      <td className="se-td--title" data-label="Empire"><strong>{entry.displayName}</strong><span className="se-muted se-num">#{formatNumber(entry.publicPimpId)}</span></td>
                      <td data-label="Final city">{entry.cityName || 'Not recorded'}</td>
                      <td className="se-table__number se-num" data-label="Recorded total">{formatValue(records.category, entry.value)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {records.totalPages > 1 ? (
                <nav className="se-aftermath-pagination" aria-label="Records leaderboard pages">
                  <button type="button" className="se-btn" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
                  <span>Page {formatNumber(records.page)} of {formatNumber(records.totalPages)} · {formatNumber(records.total)} players</span>
                  <button type="button" className="se-btn" disabled={page >= records.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
                </nav>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </section>
  );
  const pageContent = selectedCategory ? (
    <section className="se-aftermath-board" aria-labelledby="se-aftermath-board-title">
      <header className="se-aftermath-sectionhead">
        <div>
          <span className="se-eyebrow">{selectedCategory.status === 'AVAILABLE' ? 'Frozen category record' : 'Metric status'}</span>
          <h2 id="se-aftermath-board-title">{selectedCategory.title}</h2>
        </div>
        <p>{selectedCategory.description}</p>
      </header>
      {selectedCategory.status !== 'AVAILABLE' ? (
        <div className={`se-aftermath-notice se-aftermath-notice--${selectedCategory.status.toLowerCase()}`} role="status">
          <strong>{selectedCategory.status === 'PREPARING' ? 'Report preparing' : selectedCategory.status === 'UNAVAILABLE' ? 'Not available for this round' : 'Not recorded for this round'}</strong>
          <p>{selectedCategory.description}</p>
        </div>
      ) : (
        <>
          {boardError ? <Alert>{boardError}</Alert> : null}
          {!board && !boardError ? <div className="se-aftermath-loading" role="status">Loading frozen leaderboard…</div> : null}
          {board ? <PlayerRows board={board} category={selectedCategory.key} /> : null}
          {board && board.totalPages > 1 ? (
            <nav className="se-aftermath-pagination" aria-label={`${selectedCategory.title} leaderboard pages`}>
              <button type="button" className="se-btn" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
              <span>Page {formatNumber(board.page)} of {formatNumber(board.totalPages)} · {formatNumber(board.total)} players</span>
              <button type="button" className="se-btn" disabled={page >= board.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
            </nav>
          ) : null}
        </>
      )}
    </section>
  ) : isCities ? cityContent
    : isAlliances ? allianceContent
      : tab === 'me' ? personalContent
        : tab === 'records' ? recordsContent
          : null;

  return (
    <GameLayout>
      <main className="se-aftermath">
        <header className="se-aftermath-hero">
          <div>
            <span className="se-eyebrow">Permanent round record · {overview?.round.rulesetVersion ?? 'Frozen report'}</span>
            <h1>Round Aftermath</h1>
            <p>{overview?.round.name ?? 'Loading round…'} · the final ledger, recorded after settlement.</p>
          </div>
          <div className="se-aftermath-cutoff">
            <span>{overview?.report.status === 'READY' ? 'Frozen at' : 'Report status'}</span>
            <strong>{overview?.report.cutoffAt ? formatDate(overview.report.cutoffAt) : overview?.report.status ?? 'Loading'}</strong>
          </div>
        </header>

        {error ? (
          <section className="se-aftermath-error">
            <Alert>{error}</Alert>
            <button type="button" className="se-btn" onClick={() => setRetry((value) => value + 1)}>Try again</button>
          </section>
        ) : null}

        {overview && categories ? (
          <>
            <StatusNotice overview={overview} />
            <div className="se-aftermath-tabs" role="tablist" aria-label="Round aftermath categories" onKeyDown={moveTab}>
              {TABS.map((item) => (
                <button
                  key={item.key}
                  id={`se-aftermath-tab-${item.key}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.key}
                  aria-controls="se-aftermath-content"
                  tabIndex={tab === item.key ? 0 : -1}
                  className={`se-aftermath-tab${tab === item.key ? ' se-aftermath-tab--active' : ''}`}
                  onClick={() => selectTab(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div id="se-aftermath-content" className="se-aftermath-content" role="tabpanel" aria-labelledby={`se-aftermath-tab-${tab}`} tabIndex={0}>
              {isSummary && overview.report.status === 'READY' && global ? (
                <>
                  <section className="se-aftermath-summary" aria-label="Round-wide totals">
                    <StatCard label="Participants" value={formatNumber(global.participants)} detail={`${formatNumber(global.eligibleCompetitors)} eligible competitors`} />
                    <StatCard label="Cities" value={formatNumber(global.citiesInRound)} detail="Present in the frozen round data" />
                    <StatCard label="Final net worth" value={cents(global.finalNetWorthCents)} detail="Eligible players · integer cents" />
                    <StatCard label="Crew" value={formatNumber(global.finalCrewMembers)} detail="Thugs and workers at cutoff" />
                    <StatCard label="Turf held" value={formatNumber(global.playerHeldTurfBlocks)} detail="Player-held blocks at cutoff" />
                    <StatCard label="Businesses" value={formatNumber(global.activeBusinessesHeld)} detail="Active lots held at cutoff" />
                    <StatCard label="Crime actions" value={formatNumber(global.crimeActions)} detail="Attempted raids and drive-bys" />
                  </section>

                  {competition?.leaders.length ? (
                    <section className="se-aftermath-champion" aria-label="Final champion">
                      <span className="se-eyebrow">Top empire</span>
                      {competition.leaders.map((leader) => (
                        <strong key={leader.publicPimpId}>{leader.displayName}<small>#{formatNumber(leader.publicPimpId)} · {leader.cityName} · final rank #{leader.rank}</small></strong>
                      ))}
                    </section>
                  ) : null}

                  <section className="se-aftermath-board" aria-labelledby="se-aftermath-top-ten-title">
                    <header className="se-aftermath-sectionhead">
                      <div><span className="se-eyebrow">National standings</span><h2 id="se-aftermath-top-ten-title">Final top 10</h2></div>
                      <p>Final net worth at the round cutoff. Tied ranks are preserved from the frozen standings.</p>
                    </header>
                    {boardError ? <Alert>{boardError}</Alert> : null}
                    {!board && !boardError ? <div className="se-aftermath-loading" role="status">Loading final standings…</div> : null}
                    {board ? <PlayerRows board={board} category="wealth" /> : null}
                    {board && board.total > 10 ? <button className="se-aftermath-more" type="button" onClick={() => selectTab('wealth')}>Browse the full wealth leaderboard <span aria-hidden="true">→</span></button> : null}
                  </section>

                  <section className="se-aftermath-board">
                    <header className="se-aftermath-sectionhead">
                      <div><span className="se-eyebrow">Category records</span><h2>Standout empires</h2></div>
                      <p>Record holders are frozen from the same source as the report.</p>
                    </header>
                    <AwardHighlights categories={categories.categories} />
                  </section>
                </>
              ) : isSummary ? (
                <div className="se-aftermath-empty">Global totals will appear here when a finalized report is available.</div>
              ) : pageContent}
            </div>

            {overview.report.status === 'READY' ? (
              <footer className="se-aftermath-footnote">
                <span>Report schema {overview.report.schemaVersion}</span>
                <span>Source {overview.report.sourceRevision}</span>
                <span>Cutoff {overview.report.cutoffAt ? new Date(overview.report.cutoffAt).toLocaleString() : 'not recorded'}</span>
                <span>Unsupported categories are shown as not recorded, never as zero.</span>
              </footer>
            ) : null}
            <Link className="se-aftermath-archive-link" to="/game/hall-of-fame">Browse the round archive</Link>
          </>
        ) : null}
      </main>
    </GameLayout>
  );
}
