import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BUG_REPORT_CATEGORY_LABELS,
  formatNumber,
  type AdminBugReportDto,
  type AdminBugReportQueueDto,
  type AdminBugReportStatus,
  type BugReportResolution,
} from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

const RESOLUTION_TEXT: Record<BugReportResolution, string> = {
  FIXED: 'Fixed',
  WONT_FIX: 'Not a bug / won\'t fix',
  DUPLICATE: 'Duplicate',
};

function BugReport({ report, onResolved }: { report: AdminBugReportDto; onResolved: (queue: AdminBugReportQueueDto) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteId = `bug-note-${report.id}`;

  async function resolve(resolution: BugReportResolution) {
    setBusy(true);
    setError(null);
    try {
      onResolved(await adminApi.resolveBugReport(report.id, resolution, note.trim()));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not resolve that report.');
      setBusy(false);
    }
  }

  const noteReason = busy ? 'Working...' : note.trim().length < 5 ? 'Write a note of at least 5 characters.' : null;
  return (
    <Panel title={report.summary} className="se-mb se-admin-report">
      <p className="se-hint">
        {BUG_REPORT_CATEGORY_LABELS[report.category]} · {adminWhen(report.createdAt)} · from{' '}
        {report.accountId ? <Link to={`/game/admin/accounts/${report.accountId}`}>{report.username}</Link> : report.username}
        {report.pagePath ? <> · on <code>{report.pagePath}</code></> : null}
        {report.appVersion ? ` · v${report.appVersion}` : ''}
      </p>
      <p className="se-admin-thread__body">{report.details}</p>
      {report.userAgent ? <p className="se-hint">Browser: {report.userAgent}</p> : null}
      {report.resolvedAt ? (
        <p>
          {report.resolution ? RESOLUTION_TEXT[report.resolution] : 'Resolved'} by {report.resolvedByUsername}, {adminWhen(report.resolvedAt)}
          {report.resolutionNote ? ` · ${report.resolutionNote}` : ''}
        </p>
      ) : (
        <>
          <div className="se-field se-mt">
            <label className="se-label" htmlFor={noteId}>Resolution note</label>
            <textarea id={noteId} className="se-input se-admin-reason" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          {error ? <Alert>{error}</Alert> : null}
          <div className="se-cta">
            {(['FIXED', 'WONT_FIX', 'DUPLICATE'] as const).map((resolution) => (
              <Button key={resolution} type="button" className={`se-btn ${resolution === 'FIXED' ? 'se-btn--primary' : 'se-btn--ghost'} se-btn--sm`}
                onClick={() => void resolve(resolution)} disabledReason={noteReason}>
                {RESOLUTION_TEXT[resolution]}
              </Button>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

/** rc.2. Bugs players reported from the game: oldest open first. */
export function AdminBugReportsPage() {
  const [status, setStatus] = useState<AdminBugReportStatus>('open');
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<AdminBugReportQueueDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setQueue(await adminApi.bugReports(status, page));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load bug reports.');
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Bug Reports</h1>
          <p className="se-eyebrow">Admin · sent by players from Report a bug</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}

      <div className="se-seg se-mb" role="group" aria-label="Bug report status">
        {(['open', 'resolved'] as const).map((value) => (
          <button
            type="button"
            key={value}
            className={`se-seg__btn${status === value ? ' se-seg__btn--on' : ''}`}
            aria-pressed={status === value}
            onClick={() => { setStatus(value); setPage(1); setNotice(null); }}
          >
            {value === 'open' ? 'Open' : 'Resolved'} {queue ? `(${formatNumber(queue.counts[value])})` : ''}
          </button>
        ))}
      </div>

      {!queue ? <p className="se-muted">Loading bug reports...</p> : queue.reports.length === 0 ? (
        <Panel title={status === 'open' ? 'Nothing waiting' : 'No history yet'}>
          <p className="se-muted">{status === 'open' ? 'No open bug reports.' : 'Resolved bug reports will be listed here.'}</p>
        </Panel>
      ) : queue.reports.map((report) => (
        <BugReport
          key={report.id}
          report={report}
          onResolved={(next) => {
            setNotice('Bug report resolved.');
            if (status === 'open') setQueue(next); else void load();
          }}
        />
      ))}

      {queue && queue.totalPages > 1 ? (
        <div className="se-cta">
          <Button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setPage((value) => value - 1)} disabledReason={page <= 1 ? 'First page.' : null}>Previous</Button>
          <span className="se-muted">Page {queue.page} of {queue.totalPages}</span>
          <Button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setPage((value) => value + 1)} disabledReason={page >= queue.totalPages ? 'Last page.' : null}>Next</Button>
        </div>
      ) : null}
    </GameLayout>
  );
}
