import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  AdminReportDetailDto,
  AdminReportQueueDto,
  AdminReportResolution,
  AdminReportStatus,
  AdminReportSummaryDto,
} from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

function Party({ label, party }: { label: string; party: AdminReportSummaryDto['sender'] }) {
  return (
    <span>
      {label} <Link to={`/game/admin/accounts/${party.accountId}`}>{party.displayName}</Link>
      <span className="se-muted"> (#{party.publicPimpId} · {party.username})</span>
    </span>
  );
}

/** One opened report: the reported message and its immediate thread, then a decision. */
function OpenedReport({
  detail,
  onResolved,
  onClose,
}: {
  detail: AdminReportDetailDto;
  onResolved: (queue: AdminReportQueueDto) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { report } = detail;

  async function resolve(resolution: AdminReportResolution) {
    setBusy(true);
    setError(null);
    try {
      onResolved(await adminApi.resolveReport(report.id, resolution, note.trim()));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not resolve that report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={`Report · ${report.source === 'AUTO' ? 'automated flag' : `from ${report.reporterUsername ?? 'a player'}`}`} className="se-mb se-admin-report">
      <p><strong>Reason:</strong> {report.reason}</p>
      <p className="se-admin-report__parties">
        <Party label="From" party={report.sender} /> · <Party label="to" party={report.recipient} /> · {report.roundName}
      </p>
      {detail.senderComms ? (
        <p className="se-hint">Sender is already muted {detail.senderComms.permanent ? 'permanently' : `until ${adminWhen(detail.senderComms.until)}`}.</p>
      ) : null}

      <p className="se-hint">
        Opening this report was recorded in the audit log. Only this thread is shown
        {detail.omitted.before || detail.omitted.after ? ` (${formatNumber(detail.omitted.before)} earlier and ${formatNumber(detail.omitted.after)} later messages left out)` : ''}.
      </p>
      <ol className="se-admin-thread">
        {detail.thread.map((message) => (
          <li
            key={message.id}
            className={`se-admin-thread__msg${message.fromSender ? ' se-admin-thread__msg--sender' : ''}${message.id === report.messageId ? ' se-admin-thread__msg--reported' : ''}`}
          >
            <p className="se-hint">
              {message.fromSender ? report.sender.displayName : report.recipient.displayName} · {adminWhen(message.createdAt)}
              {message.id === report.messageId ? ' · reported message' : message.reported ? ' · also reported' : ''}
            </p>
            <strong>{message.subject}</strong>
            <p className="se-admin-thread__body">{message.body}</p>
          </li>
        ))}
      </ol>

      {report.resolvedAt ? (
        <p>
          Resolved {adminWhen(report.resolvedAt)} by {report.resolvedByUsername}: <strong>{report.resolution === 'ACTIONED' ? 'Action taken' : 'Dismissed'}</strong>
          {report.resolutionNote ? ` · ${report.resolutionNote}` : ''}
        </p>
      ) : (
        <>
          <div className="se-field se-mt">
            <label className="se-label" htmlFor="report-note">Resolution note</label>
            <textarea id="report-note" className="se-input se-admin-reason" rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
            <p className="se-hint">
              Saved to the report history and the audit log. Resolving closes every open report on this message.
              Muting or suspending the sender is a separate action on <Link to={`/game/admin/accounts/${report.sender.accountId}`}>their account</Link>.
            </p>
          </div>
          {error ? <Alert>{error}</Alert> : null}
          <div className="se-cta">
            <Button className="se-btn se-btn--primary" onClick={() => void resolve('ACTIONED')}
              disabledReason={busy ? 'Working...' : note.trim().length < 5 ? 'Write a note of at least 5 characters.' : null}>
              Resolve: action taken
            </Button>
            <Button className="se-btn se-btn--ghost" onClick={() => void resolve('DISMISSED')}
              disabledReason={busy ? 'Working...' : note.trim().length < 5 ? 'Write a note of at least 5 characters.' : null}>
              Dismiss
            </Button>
          </div>
        </>
      )}
      <Button type="button" className="se-btn se-btn--ghost se-btn--sm se-mt" onClick={onClose}>Close</Button>
    </Panel>
  );
}

/** 0.9.0-H. The message reports queue: purpose-driven, never a message browser. */
export function AdminReportsPage() {
  const [status, setStatus] = useState<AdminReportStatus>('open');
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<AdminReportQueueDto | null>(null);
  const [opened, setOpened] = useState<AdminReportDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setQueue(await adminApi.reports(status, page));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the reports queue.');
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(reportId: string) {
    setNotice(null);
    try {
      setOpened(await adminApi.openReport(reportId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not open that report.');
    }
  }

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Reports</h1>
          <p className="se-eyebrow">Admin · message reports and automated spam flags</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}

      <div className="se-seg se-mb" role="group" aria-label="Report status">
        {(['open', 'resolved'] as const).map((value) => (
          <button
            type="button"
            key={value}
            className={`se-seg__btn${status === value ? ' se-seg__btn--on' : ''}`}
            aria-pressed={status === value}
            onClick={() => { setStatus(value); setPage(1); setOpened(null); }}
          >
            {value === 'open' ? 'Open' : 'Resolved'} {queue ? `(${formatNumber(queue.counts[value])})` : ''}
          </button>
        ))}
      </div>

      {opened ? (
        <OpenedReport
          detail={opened}
          onClose={() => setOpened(null)}
          onResolved={(next) => {
            setOpened(null);
            setNotice('Report resolved.');
            if (status === 'open') setQueue(next); else void load();
          }}
        />
      ) : null}

      {!queue ? <p className="se-muted">Loading reports...</p> : queue.reports.length === 0 ? (
        <Panel title={status === 'open' ? 'Nothing waiting' : 'No history yet'}>
          <p className="se-muted">{status === 'open' ? 'No open reports or spam flags.' : 'Resolved reports will be listed here.'}</p>
        </Panel>
      ) : (
        <Panel title={status === 'open' ? 'Oldest first' : 'Latest decisions first'} flush className="se-mb">
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Reported</th>
                  <th>Source</th>
                  <th>Reason</th>
                  <th>Sender</th>
                  <th className="se-table__number">Open vs sender</th>
                  <th>{status === 'open' ? 'Action' : 'Decision'}</th>
                </tr>
              </thead>
              <tbody>
                {queue.reports.map((report) => (
                  <tr key={report.id}>
                    <td data-label="Reported">{adminWhen(report.createdAt)}</td>
                    <td data-label="Source">
                      <span className={`se-tag${report.source === 'AUTO' ? ' se-tag--warn' : ''}`}>{report.source === 'AUTO' ? 'Auto flag' : report.reporterUsername ?? 'Player'}</span>
                    </td>
                    <td className="se-td--title" data-label="Reason">{report.reason}</td>
                    <td data-label="Sender">
                      <Link to={`/game/admin/accounts/${report.sender.accountId}`}>{report.sender.displayName}</Link>
                      {report.senderRestricted ? <span className="se-tag se-tag--bad se-admin-report__muted">Muted</span> : null}
                    </td>
                    <td className="se-table__number se-num" data-label="Open vs sender">{formatNumber(report.openAgainstSender)}</td>
                    <td data-label={status === 'open' ? 'Action' : 'Decision'}>
                      {report.resolvedAt ? (
                        <span>
                          {report.resolution === 'ACTIONED' ? 'Action taken' : 'Dismissed'} by {report.resolvedByUsername}
                          {report.resolutionNote ? <span className="se-hint"> · {report.resolutionNote}</span> : null}
                        </span>
                      ) : null}
                      <Button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void open(report.id)}>
                        {report.resolvedAt ? 'Review' : 'Open'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

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
