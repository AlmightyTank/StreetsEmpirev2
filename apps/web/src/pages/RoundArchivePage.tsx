import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { RoundAftermathArchiveDto, RoundAftermathOverviewDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { roundsApi } from '../api/rounds.js';
import { Alert } from '../components/Alert.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { formatDate } from '../utils/time.js';

const PAGE_SIZE = 25;

function reportStatusLabel(status: RoundAftermathArchiveDto['rounds'][number]['reportStatus']): string {
  if (status === 'READY') return 'Frozen report available';
  if (status === 'PREPARING') return 'Report preparing';
  return 'Historical report unavailable';
}

function formatCents(value: string): string {
  const cents = BigInt(value);
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}$${(absolute / 100n).toLocaleString('en-US')}`;
}

function metric(round: RoundAftermathOverviewDto, key: keyof NonNullable<RoundAftermathOverviewDto['global']>): string {
  const value = round.global?.[key];
  if (value === undefined || value === null) return 'Not available';
  return typeof value === 'string' ? formatCents(value) : formatNumber(value);
}

export function RoundArchivePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPage = Number(searchParams.get('page'));
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 2_147_483_647
    ? requestedPage
    : 1;
  const q = searchParams.get('q') ?? '';
  const year = searchParams.get('year') ?? '';
  const reportStatus = searchParams.get('reportStatus') ?? '';
  const order = searchParams.get('order') === 'oldest' ? 'oldest' : 'newest';
  const parsedYear = Number(year);
  const archiveYear = year && Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100 ? parsedYear : undefined;
  const archiveStatus = reportStatus === 'READY' || reportStatus === 'UNAVAILABLE' || reportStatus === 'PREPARING'
    ? reportStatus
    : undefined;
  const compareIds = [...new Set((searchParams.get('compare') ?? '').split(',').filter(Boolean))].slice(0, 2);
  const [draftQ, setDraftQ] = useState(q);
  const [draftYear, setDraftYear] = useState(year);
  const [draftStatus, setDraftStatus] = useState(reportStatus);
  const [draftOrder, setDraftOrder] = useState(order);
  const [archive, setArchive] = useState<RoundAftermathArchiveDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [comparison, setComparison] = useState<RoundAftermathOverviewDto[]>([]);
  const [firstComparison, secondComparison] = comparison;
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState('');

  useEffect(() => {
    setDraftQ(q);
    setDraftYear(year);
    setDraftStatus(reportStatus);
    setDraftOrder(order);
  }, [q, year, reportStatus, order]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    void roundsApi.aftermathArchive({
      page,
      pageSize: PAGE_SIZE,
      q: q || undefined,
      year: archiveYear,
      reportStatus: archiveStatus,
      order,
    }).then((result) => {
      if (current) setArchive(result);
    }).catch((caught: unknown) => {
      if (current) setError(caught instanceof ApiError ? caught.message : 'Could not load the round archive.');
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [page, q, year, reportStatus, order, retry]);

  useEffect(() => {
    let current = true;
    setComparison([]);
    setComparisonError(null);
    if (compareIds.length !== 2) return () => { current = false; };
    void Promise.all(compareIds.map((id) => roundsApi.aftermath(id)))
      .then((rounds) => { if (current) setComparison(rounds); })
      .catch((caught: unknown) => {
        if (current) setComparisonError(caught instanceof ApiError ? caught.message : 'Could not load the selected round reports.');
      });
    return () => { current = false; };
  }, [searchParams]);

  function updateParams(values: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateParams({
      q: draftQ.trim() || null,
      year: draftYear || null,
      reportStatus: draftStatus || null,
      order: draftOrder === 'newest' ? null : draftOrder,
      page: null,
    });
  }

  function toggleCompare(id: string) {
    if (!compareIds.includes(id) && compareIds.length === 2) return;
    const selected = compareIds.includes(id) ? compareIds.filter((value) => value !== id) : [...compareIds, id];
    updateParams({ compare: selected.length ? selected.join(',') : null });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMessage('Archive link copied.');
    } catch {
      setShareMessage('Could not copy the link. Copy it from your browser address bar.');
    }
  }

  return (
    <GameLayout>
      <main className="se-aftermath se-round-archive">
        <header className="se-aftermath-hero">
          <div>
            <span className="se-eyebrow">Permanent history</span>
            <h1>Round archive</h1>
            <p>Browse completed rounds, compare frozen outcomes, and share a link to this view.</p>
          </div>
          <button type="button" className="se-btn" onClick={() => void copyLink()}>Copy archive link</button>
        </header>

        <form className="se-round-archive-filters" onSubmit={applyFilters}>
          <label>Round name<input value={draftQ} maxLength={80} onChange={(event) => setDraftQ(event.target.value)} placeholder="Search rounds" /></label>
          <label>Year<input type="number" min={2000} max={2100} value={draftYear} onChange={(event) => setDraftYear(event.target.value)} placeholder="Any year" /></label>
          <label>Report
            <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}>
              <option value="">All report states</option>
              <option value="READY">Frozen report available</option>
              <option value="UNAVAILABLE">Historical data unavailable</option>
              <option value="PREPARING">Preparing</option>
            </select>
          </label>
          <label>Order
            <select value={draftOrder} onChange={(event) => setDraftOrder(event.target.value as 'newest' | 'oldest')}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <button type="submit" className="se-btn se-btn--primary">Apply filters</button>
        </form>
        {shareMessage ? <p className="se-round-archive-share" role="status">{shareMessage}</p> : null}
        {error ? <><Alert>{error}</Alert><button type="button" className="se-btn" onClick={() => setRetry((value) => value + 1)}>Retry loading archive</button></> : null}
        {loading ? <div className="se-aftermath-loading" role="status">Loading completed rounds...</div> : null}
        {!loading && archive && !error ? (
          <>
            <div className="se-round-archive-summary">
              <span>{formatNumber(archive.total)} completed rounds</span>
              {compareIds.length > 0 ? (
                <div className="se-round-archive-selected">
                  <span>{compareIds.length === 2 ? 'Two rounds selected' : 'Choose one more round to compare'}</span>
                  {compareIds.map((id) => (
                    <button type="button" className="se-round-archive-remove" key={id} onClick={() => toggleCompare(id)}>
                      Remove {archive.rounds.find((round) => round.id === id)?.name ?? id}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {comparisonError ? <Alert>{comparisonError}</Alert> : null}
            {firstComparison && secondComparison ? (
              <section className="se-round-archive-compare">
                <div><span className="se-eyebrow">Side-by-side comparison</span><h2>{firstComparison.round.name} vs {secondComparison.round.name}</h2></div>
                <div className="se-tablewrap">
                  <table className="se-table se-table--cards">
                    <thead><tr><th>Frozen metric</th>{comparison.map((round) => <th key={round.round.id}>{round.round.name}</th>)}</tr></thead>
                    <tbody>
                      <tr><th>Report state</th>{comparison.map((round) => <td key={round.round.id}>{round.report.status}</td>)}</tr>
                      <tr><th>Participants</th>{comparison.map((round) => <td key={round.round.id}>{metric(round, 'participants')}</td>)}</tr>
                      <tr><th>Eligible competitors</th>{comparison.map((round) => <td key={round.round.id}>{metric(round, 'eligibleCompetitors')}</td>)}</tr>
                      <tr><th>Cities</th>{comparison.map((round) => <td key={round.round.id}>{metric(round, 'citiesInRound')}</td>)}</tr>
                      <tr><th>Final net worth</th>{comparison.map((round) => <td key={round.round.id}>{metric(round, 'finalNetWorthCents')}</td>)}</tr>
                      <tr><th>Crew members</th>{comparison.map((round) => <td key={round.round.id}>{metric(round, 'finalCrewMembers')}</td>)}</tr>
                      <tr><th>Turf blocks held</th>{comparison.map((round) => <td key={round.round.id}>{metric(round, 'playerHeldTurfBlocks')}</td>)}</tr>
                      <tr><th>Active businesses</th>{comparison.map((round) => <td key={round.round.id}>{metric(round, 'activeBusinessesHeld')}</td>)}</tr>
                      <tr><th>Crime actions</th>{comparison.map((round) => <td key={round.round.id}>{metric(round, 'crimeActions')}</td>)}</tr>
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
            {archive.rounds.length ? (
              <div className="se-round-archive-list">
                {archive.rounds.map((round) => (
                  <article className="se-round-archive-card" key={round.id}>
                    <div className="se-round-archive-card__heading">
                      <div>
                        <span className="se-eyebrow">{reportStatusLabel(round.reportStatus)}</span>
                        <h2>{round.name}</h2>
                        <p>{formatDate(round.startsAt)} – {formatDate(round.endedAt)} · Ruleset {round.rulesetVersion}</p>
                      </div>
                      <label className="se-round-archive-compare-select">
                        <input type="checkbox" checked={compareIds.includes(round.id)} disabled={compareIds.length === 2 && !compareIds.includes(round.id)} onChange={() => toggleCompare(round.id)} aria-label={`Select ${round.name} for comparison`} />
                        Compare
                      </label>
                    </div>
                    {round.global ? (
                      <div className="se-round-archive-metrics">
                        <div><span>Participants</span><strong>{formatNumber(round.global.participants)}</strong></div>
                        <div><span>Net worth</span><strong>{formatCents(round.global.finalNetWorthCents)}</strong></div>
                        <div><span>Turf blocks</span><strong>{formatNumber(round.global.playerHeldTurfBlocks)}</strong></div>
                        <div><span>Businesses</span><strong>{formatNumber(round.global.activeBusinessesHeld)}</strong></div>
                      </div>
                    ) : (
                      <p className="se-round-archive-unavailable">
                        {round.reportStatus === 'PREPARING'
                          ? 'The frozen totals are not published yet.'
                          : 'No canonical frozen totals are available for this round. Historical statistics have not been reconstructed.'}
                      </p>
                    )}
                    <Link className="se-aftermath-archive-link" to={`/game/rounds/${encodeURIComponent(round.id)}/aftermath`}>Open permanent round report <span aria-hidden="true">→</span></Link>
                  </article>
                ))}
              </div>
            ) : <p className="se-aftermath-empty">No completed rounds match these filters.</p>}
            <nav className="se-round-archive-pagination" aria-label="Archive pages">
              <button type="button" className="se-btn" disabled={page <= 1} onClick={() => updateParams({ page: String(page - 1) })}>Previous</button>
              <span>Page {archive.page} of {Math.max(archive.totalPages, 1)}</span>
              <button type="button" className="se-btn" disabled={page >= archive.totalPages} onClick={() => updateParams({ page: String(page + 1) })}>Next</button>
            </nav>
          </>
        ) : null}
      </main>
    </GameLayout>
  );
}
