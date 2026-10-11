import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  RoundAftermathCategoriesDto,
  RoundAftermathCategoryDto,
  RoundAftermathCategoryKey,
  RoundAftermathLeaderboardDto,
  RoundAftermathOverviewDto,
} from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { roundsApi } from '../api/rounds.js';
import { Alert } from '../components/Alert.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { formatDate } from '../utils/time.js';

type TabKey = 'summary' | RoundAftermathCategoryKey;

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'summary', label: 'Entire Round' },
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
  const [overview, setOverview] = useState<RoundAftermathOverviewDto | null>(null);
  const [categories, setCategories] = useState<RoundAftermathCategoriesDto | null>(null);
  const [board, setBoard] = useState<RoundAftermathLeaderboardDto | null>(null);
  const [tab, setTab] = useState<TabKey>('summary');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setOverview(null);
    setCategories(null);
    setBoard(null);
    setError(null);
    setBoardError(null);
    void Promise.all([roundsApi.aftermath(roundId), roundsApi.aftermathCategories(roundId)])
      .then(([nextOverview, nextCategories]) => {
        if (!current) return;
        setOverview(nextOverview);
        setCategories(nextCategories);
      })
      .catch((caught: unknown) => {
        if (current) setError(caught instanceof ApiError ? caught.message : 'Could not load the round aftermath.');
      });
    return () => { current = false; };
  }, [roundId, retry]);

  const isSummary = tab === 'summary';
  const leaderboardCategory = isSummary ? 'wealth' : tab;
  const pageSize = isSummary ? 10 : 25;
  const selectedCategory = categories?.categories.find((category) => category.key === tab);

  useEffect(() => {
    let current = true;
    setBoard(null);
    setBoardError(null);
    if (!overview || overview.report.status !== 'READY' || (selectedCategory && selectedCategory.status !== 'AVAILABLE')) return () => { current = false; };
    void roundsApi.aftermathLeaderboard(roundId, leaderboardCategory, page, pageSize)
      .then((result) => { if (current) setBoard(result); })
      .catch((caught: unknown) => {
        if (current) setBoardError(caught instanceof ApiError ? caught.message : 'Could not load this leaderboard.');
      });
    return () => { current = false; };
  }, [roundId, overview, leaderboardCategory, page, pageSize, selectedCategory]);

  function selectTab(next: TabKey) {
    setTab(next);
    setPage(1);
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
  ) : null;

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
