import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CriminalCaseFileDto, CriminalCasePageDto } from '@streets/shared';
import { formatCents } from '@streets/shared';
import { caseFilesApi, notifyCaseFilesChanged, type PublicCaseOpportunity } from '../api/caseFiles.js';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { EmptyState, GameDialog, StatusBadge } from './GameUI.js';
import { CASE_ACTION_LINKS, CASE_STATUS_LABEL, caseProgress, caseTimeline } from '../utils/caseFiles.js';
import { formatWhen } from '../utils/time.js';

interface Decision {
  caseId: string;
  branchKey: string;
  title: string;
}
const PAGE_SIZE = 12;
const EMPTY: CriminalCasePageDto = {
  active: [], archived: [], pageSize: PAGE_SIZE,
  activePage: 1, archivePage: 1, activeHasMore: false, archivedHasMore: false,
};

function CaseTimeline({ file }: { file: CriminalCaseFileDto }) {
  return (
    <ol className="se-casefiles-timeline" aria-label={`Evidence timeline for ${file.title}`}>
      {caseTimeline(file).map((event) => (
        <li key={event.key} className={`se-casefiles-timeline__${event.kind.toLowerCase()}`}>
          <span className="se-casefiles-timeline__pin" aria-hidden="true" />
          <div>
            <strong>{event.title}</strong>
            <time dateTime={event.at}>{formatWhen(event.at)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}

function CaseFileCard({ file, busy, onActivate, onChoose, archive = false }: {
  file: CriminalCaseFileDto;
  busy: boolean;
  onActivate: (caseId: string) => void;
  onChoose: (choice: Decision) => void;
  archive?: boolean;
}) {
  const next = file.nextAction ? CASE_ACTION_LINKS[file.nextAction] : null;
  return (
    <article id={`case-${file.id}`} tabIndex={-1} className={`se-casefile se-casefile--${file.status.toLowerCase()}`}>
      <header className="se-casefile__head">
        <div>
          <span className="se-eyebrow">Criminal Case File · {file.cityId.replaceAll('_', ' ')}</span>
          <h3>{file.title}</h3>
        </div>
        <StatusBadge tone={file.status === 'SOLVED' || file.status === 'CLOSED' ? 'good'
          : file.status === 'EXPIRED' ? 'warning' : file.status === 'ACTIVE' ? 'accent' : 'neutral'}>
          {CASE_STATUS_LABEL[file.status]}
        </StatusBadge>
      </header>
      <div className="se-casefile__stats">
        <span><strong>{file.cluesFound} / {file.cluesRequired}</strong> verified clues</span>
        <span><strong>{file.confidence}</strong> confidence</span>
        <span>{file.status === 'EXPIRED' ? 'Expired without penalty' : 'Optional investigation'}</span>
      </div>
      <div className="se-casefile__meter" role="progressbar" aria-label={`Investigation progress for ${file.title}`}
        aria-valuemin={0} aria-valuemax={file.cluesRequired} aria-valuenow={file.cluesFound}>
        <span style={{ width: `${caseProgress(file)}%` }} />
      </div>
      {file.status === 'AVAILABLE' ? (
        <div className="se-casefile__callout">
          <p>A new lead has reached your crew. Starting it is optional and doesn't spend cash or turns.</p>
          <button className="se-btn se-btn--primary se-btn--sm" type="button" disabled={busy}
            onClick={() => onActivate(file.id)}>{busy ? 'Opening…' : 'Open investigation'}</button>
        </div>
      ) : null}
      {file.status === 'ACTIVE' && next ? (
        <div className="se-casefile__callout">
          <span className="se-eyebrow">Next lead</span>
          <strong>{file.clues.find((clue) => clue.key === file.nextClueKey)?.hint ?? next.label}</strong>
          <p>{next.detail}. Your evidence is recorded only after a verified action.</p>
          <Link className="se-btn se-btn--primary se-btn--sm" to={next.to}>{next.label}</Link>
        </div>
      ) : null}
      {file.status === 'SOLVED' ? (
        <div className="se-casefile__decisions">
          <span className="se-eyebrow">Your call · evidence complete</span>
          <p>Pick how this story ends. Neither choice costs resources or changes the case's reward.</p>
          <div className="se-casefile__choicegrid">
            {file.choiceDetails.map((choice) => (
              <button className="se-casefile__choice" type="button" key={choice.key} disabled={busy}
                onClick={() => onChoose({ caseId: file.id, branchKey: choice.key, title: choice.title })}>
                <span>{choice.category}</span><strong>{choice.title}</strong><small>Review this ending →</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {file.outcome ? (
        <div className="se-casefile__outcome">
          <span className="se-eyebrow">Final report · {file.outcome.category}</span>
          <strong>{file.outcome.title}</strong>
          <p>{file.outcome.summary}</p>
          {file.rewardCents > 0 ? <small>{formatCents(file.rewardCents)} credited once to your ledger</small>
            : <small>Case closed · no additional payout</small>}
        </div>
      ) : null}
      <details className="se-casefile__timeline" open={!archive && file.status === 'ACTIVE'}>
        <summary>Evidence trail · {file.cluesFound} confirmed</summary>
        <CaseTimeline file={file} />
        {file.status === 'ACTIVE' && file.clues.some((clue) => !clue.found) ? (
          <p className="se-hint">Unverified clues remain sealed until you complete each distinct source action.</p>
        ) : null}
      </details>
      {file.status === 'EXPIRED' ? <p className="se-hint">The trail went cold. Your crew lost nothing by leaving it unfinished.</p> : null}
    </article>
  );
}

export function CaseFilesPanel({ focusId }: { focusId: string | null }) {
  const [page, setPage] = useState<CriminalCasePageDto>(EMPTY);
  const [focusedCase, setFocusedCase] = useState<CriminalCaseFileDto | null>(null);
  const [opportunities, setOpportunities] = useState<PublicCaseOpportunity[]>([]);
  const [activePage, setActivePage] = useState(1);
  const [archivePage, setArchivePage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [result, setResult] = useState<CriminalCaseFileDto | null>(null);
  const focused = useRef<string | null>(null);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setError(null);
    Promise.all([caseFilesApi.page(activePage, archivePage, PAGE_SIZE), caseFilesApi.opportunities()])
      .then(([files, available]) => {
        if (!active) return;
        setPage(files);
        setOpportunities(available.opportunities);
        setLoaded(true);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof ApiError ? cause.message : 'Case Files are temporarily unavailable.');
        setLoaded(true);
      });
    return () => { active = false; };
  }, [activePage, archivePage, revision]);

  useEffect(() => {
    const onChange = () => reload();
    const onVisible = () => { if (!document.hidden) reload(); };
    window.addEventListener('streets:quests-changed', onChange);
    window.addEventListener('streets:case-files-changed', onChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('streets:quests-changed', onChange);
      window.removeEventListener('streets:case-files-changed', onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  // Archive pagination must not break owner-authorized deep links to old
  // cases. Retrieve only the requested case via the private owner-checked API.
  useEffect(() => {
    if (!focusId || page.active.some((item) => item.id === focusId)
      || page.archived.some((item) => item.id === focusId)) {
      setFocusedCase(null);
      return;
    }
    let mounted = true;
    void caseFilesApi.get(focusId).then((file) => {
      if (mounted) setFocusedCase(file);
    }).catch(() => { if (mounted) setFocusedCase(null); });
    return () => { mounted = false; };
  }, [focusId, page]);

  useEffect(() => {
    if (!focusId || !loaded || focused.current === focusId) return;
    const target = document.getElementById(`case-${focusId}`);
    if (!target) return;
    focused.current = focusId;
    target.scrollIntoView({ block: 'nearest' });
    target.focus({ preventScroll: true });
  }, [focusId, page, focusedCase, loaded]);

  async function change(runId: string, call: () => Promise<unknown>) {
    if (busyId) return;
    setBusyId(runId);
    setError(null);
    try {
      await call();
      notifyCaseFilesChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The story action could not be confirmed. Please check your case before trying again.');
    } finally {
      setBusyId(null);
    }
  }
  async function finalize() {
    if (!decision || busyId) return;
    const chosen = decision;
    setDecision(null);
    await change(chosen.caseId, async () => {
      const closed = await caseFilesApi.close(chosen.caseId, chosen.branchKey);
      setResult(closed);
    });
  }

  return (
    <section className="se-casefiles" aria-labelledby="casefiles-heading">
      <header className="se-casefiles__heading">
        <div><span className="se-eyebrow">Living Streets Stories</span><h2 id="casefiles-heading">Criminal Case Files</h2>
          <p>Investigate real street leads, verify independent clues and choose how each story ends.</p></div>
        <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/news">Read Streets Daily</Link>
      </header>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!loaded ? <p className="se-muted" role="status">Opening your private case records…</p> : null}
      {focusedCase && !page.active.some((item) => item.id === focusedCase.id)
        && !page.archived.some((item) => item.id === focusedCase.id) ? (
        <section className="se-casefiles__focused" aria-label="Linked case file">
          <p className="se-eyebrow">Linked case · from your archive</p>
          <CaseFileCard file={focusedCase} busy={busyId !== null}
            onActivate={(id) => void change(id, () => caseFilesApi.activate(id))}
            onChoose={setDecision} />
        </section>
      ) : null}
      {loaded && opportunities.length > 0 ? (
        <section className="se-casefiles__opportunities" aria-labelledby="case-opportunities-heading">
          <h3 id="case-opportunities-heading">Street stories near you</h3>
          <p className="se-hint">Public city reports sometimes reveal optional investigations. Taking one never costs turns.</p>
          <div className="se-casefiles__offerlist">
            {opportunities.map((story) => (
              <article className="se-casefiles__offer" key={`${story.memoryId}:${story.storyKey}`}>
                <div><span className="se-eyebrow">New street lead</span><strong>{story.title}</strong></div>
                <button type="button" className="se-btn se-btn--primary se-btn--sm" disabled={busyId !== null}
                  onClick={() => void change(story.memoryId, () => caseFilesApi.optIn(story.memoryId))}>Investigate</button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {loaded ? (
        <>
          <div className="se-casefiles__sectionhead"><h3>Open investigations</h3><span>{page.active.length} shown</span></div>
          {page.active.length ? (
            <div className="se-casefiles__list">
              {page.active.map((file) => (
                <CaseFileCard key={file.id} file={file} busy={busyId !== null}
                  onActivate={(id) => void change(id, () => caseFilesApi.activate(id))}
                  onChoose={setDecision} />
              ))}
            </div>
          ) : <EmptyState title="No active investigations" description="Keep an eye on turf, operations, events and the streets. Stories appear when verified incidents occur." />}
          <div className="se-casefiles__pagination" aria-label="Open cases pagination">
            <button className="se-btn se-btn--ghost se-btn--sm" type="button" disabled={activePage <= 1}
              onClick={() => setActivePage((p) => Math.max(1, p - 1))}>Previous open cases</button>
            <span>Page {activePage}</span>
            <button className="se-btn se-btn--ghost se-btn--sm" type="button" disabled={!page.activeHasMore}
              onClick={() => setActivePage((p) => p + 1)}>More open cases</button>
          </div>
          <section className="se-casefiles__archive" aria-labelledby="casefiles-archive-heading">
            <div className="se-casefiles__sectionhead"><h3 id="casefiles-archive-heading">Case archive</h3><span>Closed, solved or expired</span></div>
            {page.archived.length ? <div className="se-casefiles__list">
              {page.archived.map((file) => (
                <CaseFileCard key={file.id} file={file} archive busy={busyId !== null}
                  onActivate={() => {}} onChoose={setDecision} />
              ))}
            </div> : <p className="se-hint">Your final reports and expired cases will be filed here.</p>}
            <div className="se-casefiles__pagination" aria-label="Archive pagination">
              <button className="se-btn se-btn--ghost se-btn--sm" type="button" disabled={archivePage <= 1}
                onClick={() => setArchivePage((p) => Math.max(1, p - 1))}>Previous archive</button>
              <span>Page {archivePage}</span>
              <button className="se-btn se-btn--ghost se-btn--sm" type="button" disabled={!page.archivedHasMore}
                onClick={() => setArchivePage((p) => p + 1)}>Older case files</button>
            </div>
          </section>
        </>
      ) : null}
      <GameDialog open={decision !== null} title="Close this investigation?"
        description={decision ? `Choose “${decision.title}” as the permanent ending. Both conclusions cost nothing and grant the same eligible reward.` : undefined}
        onClose={() => setDecision(null)}
        actions={<>
          <button className="se-btn se-btn--ghost" type="button" onClick={() => setDecision(null)}>Review evidence</button>
          <button className="se-btn se-btn--primary" type="button" disabled={busyId !== null} onClick={() => void finalize()}>Confirm conclusion</button>
        </>} />
      <GameDialog open={result !== null} title={result?.outcome?.title ?? 'Case closed'} onClose={() => setResult(null)}
        description={result?.outcome?.summary}
        actions={<button className="se-btn se-btn--primary" type="button" onClick={() => setResult(null)}>
          Back to your case files{result && result.rewardCents > 0 ? ` · ${formatCents(result.rewardCents)} earned` : ''}
        </button>} />
    </section>
  );
}
