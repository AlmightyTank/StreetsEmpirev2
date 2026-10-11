import { useCallback, useEffect, useState } from 'react';
import { formatCentsExact, formatNumber, type AdminSportsbookDto, type SportsbookFeedStatus } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { confirmAction } from '../stores/confirm.js';
import { adminWhen } from '../utils/admin.js';
import { formatAgo } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel, Stat } from './Panel.js';

const FEED_LABEL: Record<SportsbookFeedStatus, string> = {
  FRESH: 'Fresh', STALE: 'Stale — betting paused', WAITING: 'Waiting for first snapshot', OFF: 'Off — no provider key',
};

const ago = (iso: string | null) => (iso ? formatAgo(iso) : 'never');

/**
 * 1.8.0-C. Sportsbook feed health for staff: last success and attempt, failures, quota, each
 * league, and games whose result never arrived. The two repairs (recheck, void) are audited.
 */
export function AdminSportsbookPanel() {
  const [data, setData] = useState<AdminSportsbookDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await adminApi.sportsbook());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load sportsbook feed health.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(eventId: string, action: () => Promise<{ message: string; report: AdminSportsbookDto }>) {
    setBusy(eventId);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      setData(result.report);
      setNotice(result.message);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not go through. Refresh before trying again.');
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function voidGame(eventId: string, label: string, tickets: number) {
    const ok = await confirmAction({
      title: `Void ${label}?`,
      body: `Refunds the stake on ${tickets} open ticket${tickets === 1 ? '' : 's'}. This cannot be undone, and a result that arrives later is ignored.`,
      confirmLabel: 'Void and refund',
      tone: 'danger',
    });
    if (!ok) return;
    await run(eventId, async () => {
      const result = await adminApi.sportsbookVoid(eventId, reason.trim());
      setReason('');
      return result;
    });
  }

  const reasonMissing = reason.trim().length < 5 ? 'Give a reason of at least 5 characters for the audit log.' : null;

  return (
    <Panel
      title="Sportsbook feed"
      aside={data ? <>updated {adminWhen(data.generatedAt)} · <button type="button" className="se-linkbtn" onClick={() => void load()}>Refresh</button></> : null}
      className="se-mb"
    >
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {!data ? <p className="se-muted">Reading the sportsbook feed…</p> : (
        <>
          <div className="se-stats">
            <Stat label="Feed" value={FEED_LABEL[data.feed.status]} sub={`last success ${ago(data.feed.lastPolledAt)} · every ${data.pollMinutes} min`} />
            <Stat
              label="Last attempt"
              value={ago(data.feed.lastAttemptAt)}
              sub={data.feed.pollInProgress ? 'a poll is running now' : `results checked ${ago(data.feed.lastResultCheckAt)}`}
            />
            <Stat label="Failed runs in a row" value={formatNumber(data.feed.consecutiveFailures)} sub={data.feed.lastErrorAt ? `last error ${ago(data.feed.lastErrorAt)}` : 'no errors recorded'} />
            <Stat
              label="Datapoints remaining"
              value={data.quota.remaining === null ? 'unknown' : `${formatNumber(data.quota.remaining)}${data.quota.limit ? ` / ${formatNumber(data.quota.limit)}` : ''}`}
              sub={data.quota.resultsPaused ? 'odds and result checks paused' : data.quota.oddsPaused ? 'odds paused; results still checked'
                : `${formatNumber(data.quota.lastRunDatapoints)} last run${data.quota.period ? ` · per ${data.quota.period}` : ''}`}
              {...(data.quota.remaining !== null && data.quota.limit ? { meter: { value: data.quota.remaining, max: data.quota.limit } } : {})}
            />
            <Stat label="Open tickets" value={formatNumber(data.exposure.openTickets)} sub={`${formatCentsExact(data.exposure.openStakeCents)} staked · pays up to ${formatCentsExact(data.exposure.openPayoutCents)}`} />
            <Stat label="Settled · 24 hours" value={formatNumber(data.settledLast24h.tickets)} sub={`${formatNumber(data.settledLast24h.events)} game${data.settledLast24h.events === 1 ? '' : 's'}`} />
          </div>
          {data.feed.lastError ? (
            <Alert tone={data.feed.consecutiveFailures ? 'error' : 'warning'}>
              Last run{data.feed.lastErrorAt ? ` (${adminWhen(data.feed.lastErrorAt)})` : ''}: {data.feed.lastError}
            </Alert>
          ) : null}

          <div className="se-tablewrap se-mt">
            <table className="se-table se-table--cards">
              <caption className="se-sr">Odds feed by league</caption>
              <thead><tr><th>League</th><th>Last success</th><th className="se-table__number">Upcoming</th><th className="se-table__number">Pulled</th><th className="se-table__number">Seen last run</th><th>Last error</th></tr></thead>
              <tbody>{data.leagues.map((league) => (
                <tr key={league.key}>
                  <td className="se-td--title">{league.name}</td>
                  <td data-label="Last success">{league.lastSuccessAt ? adminWhen(league.lastSuccessAt) : 'never'}</td>
                  <td data-label="Upcoming" className="se-table__number se-num">{formatNumber(league.upcoming)}</td>
                  <td data-label="Pulled" className="se-table__number se-num">{formatNumber(league.pulled)}</td>
                  <td data-label="Seen last run" className="se-table__number se-num">{formatNumber(league.eventsSeen)}</td>
                  <td data-label="Last error">{league.lastError ? <span>{league.lastError}{league.lastErrorAt ? <span className="se-muted"> · {adminWhen(league.lastErrorAt)}</span> : null}</span> : <span className="se-muted">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <h3 className="se-label se-mt">Started games waiting on a result</h3>
          <p className="se-hint">
            Results are checked on a schedule after each game should be over. Recheck asks the provider now; it settles only if the
            result is final and can never pay a ticket twice. Void refunds every open ticket on a game that will never be graded.
          </p>
          {data.unresolved.length ? (
            <>
              <label className="se-label" htmlFor="sportsbook-void-reason">Reason for a void (for the audit log)</label>
              <textarea id="sportsbook-void-reason" className="se-input se-admin-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
              <div className="se-tablewrap se-mt">
                <table className="se-table se-table--cards se-sportsbook-admin">
                  <caption className="se-sr">Started games with open tickets and no result</caption>
                  <thead><tr><th>Game</th><th className="se-table__number">Open tickets</th><th>Result checks</th><th>Actions</th></tr></thead>
                  <tbody>{data.unresolved.map((row) => {
                    const label = `${row.awayTeam} at ${row.homeTeam}`;
                    const working = busy !== null ? 'Another action is still going through.' : null;
                    return (
                      <tr key={row.id}>
                        <td className="se-td--title">{row.sport} · {label}<br /><span className="se-muted">started {adminWhen(row.startsAt)} · {row.status.toLowerCase()}</span></td>
                        <td data-label="Open tickets" className="se-table__number se-num"><span>{formatNumber(row.openTickets)}<br /><span className="se-muted">{formatCentsExact(row.openStakeCents)} · up to {formatCentsExact(row.openPayoutCents)}</span></span></td>
                        <td data-label="Result checks">
                          <span>
                            {formatNumber(row.resultCheckCount)} · last {ago(row.resultCheckedAt)}
                            <br /><span className="se-muted">next {row.nextResultCheckAt ? adminWhen(row.nextResultCheckAt) : 'when due'}</span>
                            {row.resultError ? <><br /><span className="se-bad">{row.resultError}</span></> : null}
                          </span>
                        </td>
                        <td data-label="Actions">
                          <div className="se-admin-actions">
                            <Button type="button" className="se-btn se-btn--sm" onClick={() => void run(row.id, () => adminApi.sportsbookRecheck(row.id))}
                              disabledReason={working ?? (!data.configured ? 'No provider key on this server.' : null)}>
                              {busy === row.id ? 'Working…' : 'Recheck result'}
                            </Button>
                            <Button type="button" className="se-btn se-btn--sm se-btn--danger" onClick={() => void voidGame(row.id, label, row.openTickets)}
                              disabledReason={working ?? reasonMissing}>
                              Void and refund
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </>
          ) : <p className="se-muted">Every started game with open tickets has settled.</p>}
        </>
      )}
    </Panel>
  );
}
