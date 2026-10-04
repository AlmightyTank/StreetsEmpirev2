import { useEffect, useState } from 'react';
import type { LawPageDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { lawApi } from '../api/law.js';
import { useSession } from '../stores/session.js';
import { caseSourceName, formatCase, wantedStageBlurb, wantedStageName, wantedStageTone } from '../utils/law.js';
import { formatWhen } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Panel } from './Panel.js';

/** How many receipts show before "Show all". */
const RECEIPTS_SHOWN = 6;

/**
 * 1.3.0-A. "What they have on you": the player's Case in every city they have drawn Heat in,
 * read as a Wanted stage, with the receipts that built it. Private and read-only; nothing in
 * the game acts on the Case yet, and Heat works exactly as before.
 */
export function CasePanel() {
  const me = useSession((s) => s.me);
  const [page, setPage] = useState<LawPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const summary = me?.law;
  // Any action, settle or new Case can change the page; refetch when the player moves.
  const refreshKey = summary ? `${summary.case}|${me?.heat?.heat ?? 0}|${me?.lastActiveAt ?? ''}` : null;

  useEffect(() => {
    if (!refreshKey) return;
    let cancelled = false;
    lawApi.page()
      .then((next) => { if (!cancelled) { setPage(next); setError(null); } })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : 'Could not load your Case.');
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (!me || !summary) return null;

  const tone = wantedStageTone(summary.stage);
  const receipts = page ? (showAll ? page.receipts : page.receipts.slice(0, RECEIPTS_SHOWN)) : [];

  return (
    <Panel title="Case" id="case" aside={wantedStageName(summary.stage)}>
      <p className={`se-heat__status se-${tone}`}>
        {summary.cityName
          ? `${summary.cityName}: ${wantedStageName(summary.stage)}. ${wantedStageBlurb(summary.stage)}`
          : 'Quiet everywhere. No city has a file on you.'}
      </p>
      <p className="se-hint">
        {page
          ? `A ${Math.round(page.heatToCase * 100)}% share of the Heat you draw in a city builds a Case there. `
          : ''}
        Only you can see this. It lasts the round and stays in the city it was built in.
      </p>

      {error ? <Alert>{error}</Alert> : null}

      {page && page.cases.length ? (
        <ul className="se-case__cities">
          {page.cases.map((row) => (
            <li key={row.citySlug} className="se-case__city">
              <div className="se-case__cityhead">
                <span>
                  <strong>{row.cityName}</strong>
                  {row.isHome ? <span className="se-muted"> · home</span> : null}
                </span>
                <span className={`se-${wantedStageTone(row.stage)}`}>
                  {wantedStageName(row.stage)} · {formatCase(row.case)}
                </span>
              </div>
              <div className="se-meter se-heat__meter" aria-hidden="true">
                <div
                  className={`se-meter__fill${wantedStageTone(row.stage) === 'bad' ? ' se-meter__fill--bad' : wantedStageTone(row.stage) === 'warn' ? ' se-meter__fill--warn' : ''}`}
                  style={{ width: `${Math.min(100, (row.case / page.caseMax) * 100)}%` }}
                />
              </div>
              <span className="se-hint">
                {row.next
                  ? `${formatCase(Math.max(0, row.next.startsAt - row.case))} more to ${wantedStageName(row.next.stage)}`
                  : 'The top of the ladder'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {page ? (
        <p className="se-hint">
          Ladder: {page.stages.filter((stage) => stage.stage !== 'QUIET').map((stage) => `${wantedStageName(stage.stage)} ${formatNumber(stage.startsAt)}`).join(' · ')}, out of {formatNumber(page.caseMax)}.
        </p>
      ) : null}

      {receipts.length ? (
        <>
          <p className="se-eyebrow se-mt">What they have on you</p>
          <div className="se-rows">
            {receipts.map((receipt) => (
              <div className="se-row" key={receipt.id}>
                <span className="se-row__label">
                  {caseSourceName(receipt.source)}
                  <span className="se-muted"> · {receipt.cityName} · {formatWhen(receipt.at)}</span>
                </span>
                <span className="se-row__value">+{formatCase(receipt.added)}</span>
              </div>
            ))}
          </div>
          {page && page.receipts.length > RECEIPTS_SHOWN ? (
            <button type="button" className="se-btn se-btn--ghost se-btn--sm se-mt" onClick={() => setShowAll((value) => !value)}>
              {showAll ? 'Show fewer' : `Show the last ${formatNumber(page.receipts.length)}`}
            </button>
          ) : null}
        </>
      ) : null}
    </Panel>
  );
}
