import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AdminAuditEntryDto, AdminAuditFilters, AdminAuditRetentionDto } from '@streets/shared';
import { AUDIT_EXPORT_MAX_ROWS, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AuditEntryList } from '../components/AdminParts.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel, Row } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen, localInputToIso } from '../utils/admin.js';

interface FilterForm {
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  from: string;
  to: string;
}

function toFilters(form: FilterForm): AdminAuditFilters {
  return {
    actor: form.actor.trim() || undefined,
    action: form.action || undefined,
    targetType: form.targetType || undefined,
    targetId: form.targetId.trim() || undefined,
    from: localInputToIso(form.from),
    to: localInputToIso(form.to),
  };
}

export function AdminAuditPage() {
  const [params] = useSearchParams();
  const [form, setForm] = useState<FilterForm>({
    actor: params.get('actor') ?? '',
    action: params.get('action') ?? '',
    targetType: params.get('targetType') ?? '',
    targetId: params.get('targetId') ?? '',
    from: '',
    to: '',
  });
  const [applied, setApplied] = useState<AdminAuditFilters>(() => toFilters(form));
  const [entries, setEntries] = useState<AdminAuditEntryDto[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retention, setRetention] = useState<AdminAuditRetentionDto | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeReason, setPurgeReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);


  const load = useCallback(async (filters: AdminAuditFilters, before?: string) => {
    setBusy(true);
    setError(null);
    try {
      const page = await adminApi.audit({ ...filters, before, limit: 50 });
      setEntries((current) => (before && current ? [...current, ...page.entries] : page.entries));
      setNextBefore(page.nextBefore);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the audit log.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(applied);
  }, [applied, load]);

  const loadRetention = useCallback(async () => {
    try {
      setRetention(await adminApi.auditRetention());
    } catch {
      // The log itself still works without the retention summary.
      setRetention(null);
    }
  }, []);

  useEffect(() => {
    void loadRetention();
  }, [loadRetention]);

  async function confirmPurge(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi.purgeAudit(purgeReason.trim());
      setRetention(result.retention);
      setPurging(false);
      setNotice(`Purged ${formatNumber(result.removed)} entries older than ${adminWhen(result.cutoff)}.`);
      await load(applied);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That purge did not go through.');
    } finally {
      setBusy(false);
    }
  }


  const update = (key: keyof FilterForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    setApplied(toFilters(form));
  }

  function clear() {
    const empty = { actor: '', action: '', targetType: '', targetId: '', from: '', to: '' };
    setForm(empty);
    setApplied(toFilters(empty));
  }

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Audit Log</h1>
          <p className="se-eyebrow">Admin · every admin action, who, when and why</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}

      <Panel title="Filters" className="se-mb">
        <form className="se-admin-filters" onSubmit={submit} noValidate>
          <Field id="admin-audit-actor" label="Admin" value={form.actor} onChange={(event) => update('actor', event.target.value)} maxLength={40} />
          <div className="se-field">
            <label className="se-label" htmlFor="admin-audit-action">Action</label>
            <select id="admin-audit-action" className="se-input" value={form.action} onChange={(event) => update('action', event.target.value)}>
              <option value="">Any action</option>
              <option value="round.">Round actions</option>
              <option value="account.">Account actions</option>
              <option value="account.deactivate">Deactivations</option>
              <option value="account.rename">Renames</option>
              <option value="account.grant-admin">Admin grants</option>
              <option value="account.revoke-admin">Admin removals</option>
            </select>
          </div>
          <div className="se-field">
            <label className="se-label" htmlFor="admin-audit-target-type">Target</label>
            <select id="admin-audit-target-type" className="se-input" value={form.targetType} onChange={(event) => update('targetType', event.target.value)}>
              <option value="">Any target</option>
              <option value="round">Rounds</option>
              <option value="account">Accounts</option>
            </select>
          </div>
          <Field id="admin-audit-target-id" label="Target id" value={form.targetId} onChange={(event) => update('targetId', event.target.value)} maxLength={64} />
          <Field id="admin-audit-from" label="From" type="datetime-local" value={form.from} onChange={(event) => update('from', event.target.value)} />
          <Field id="admin-audit-to" label="To" type="datetime-local" value={form.to} onChange={(event) => update('to', event.target.value)} />
          <div className="se-field se-cta">
            <Button className="se-btn se-btn--primary" disabledReason={busy ? 'Still loading the last set of entries.' : null}>Apply</Button>
            <Button type="button" className="se-btn se-btn--ghost" onClick={clear} disabledReason={busy ? 'Still loading the last set of entries.' : null}>Clear</Button>
          </div>
        </form>
      </Panel>


      <Panel title="History and retention" className="se-mb">
        {!retention ? (
          <p className="se-muted">Checking how much history there is...</p>
        ) : (
          <>
            <div className="se-rows">
              <Row label="Entries kept" value={formatNumber(retention.total)} strong />
              <Row label="Oldest entry" value={retention.oldestAt ? adminWhen(retention.oldestAt) : '-'} />
              <Row label="Retention" value={retention.days > 0 ? `${formatNumber(retention.days)} days` : 'Kept forever'} />
              {retention.days > 0 ? <Row label="Past the window" value={formatNumber(retention.expired)} /> : null}
            </div>
            {retention.days > 0 ? (
              <p className="se-hint">
                Nothing is deleted on its own. A purge removes entries older than {adminWhen(retention.cutoff)} and is itself
                written to the log, so the gap always has a record. Export first if you want to keep them.
              </p>
            ) : (
              <p className="se-hint">Set ADMIN_AUDIT_RETENTION_DAYS on the server to turn purging on.</p>
            )}
            <div className="se-cta se-mt">
              <a className="se-btn" href={adminApi.auditExportUrl(applied)}>Download CSV</a>
              {retention.days > 0 ? (
                <Button type="button" className="se-btn se-btn--ghost" onClick={() => { setPurging(true); setPurgeReason(''); }}
                  disabledReason={purging ? 'The purge form is already open below.'
                    : retention.expired === 0 ? 'No entries are older than the retention window.'
                      : null}>
                  Purge {formatNumber(retention.expired)} old entries
                </Button>
              ) : null}
            </div>
            <p className="se-hint">The download takes the filters above, newest first, up to {formatNumber(AUDIT_EXPORT_MAX_ROWS)} rows.</p>

            {purging ? (
              <form onSubmit={confirmPurge} noValidate className="se-mt">
                <div className="se-field">
                  <label className="se-label" htmlFor="admin-audit-purge-reason">Reason</label>
                  <textarea id="admin-audit-purge-reason" className="se-input se-admin-reason" maxLength={500}
                    value={purgeReason} onChange={(event) => setPurgeReason(event.target.value)} />
                  <p className="se-hint">Saved with the purge record. At least 5 characters. This cannot be undone.</p>
                </div>
                <div className="se-cta">
                  <Button className="se-btn se-btn--primary"
                    disabledReason={busy ? 'The purge is still running.' : purgeReason.trim().length < 5 ? 'The purge record needs a reason of at least 5 characters.' : null}>
                    {busy ? 'Purging...' : `Purge ${formatNumber(retention.expired)} entries`}
                  </Button>
                  <Button type="button" className="se-btn se-btn--ghost" onClick={() => setPurging(false)} disabledReason={busy ? 'The purge is still running.' : null}>Cancel</Button>
                </div>
              </form>
            ) : null}
          </>
        )}
      </Panel>

      <Panel title="Entries" aside={entries ? `${formatNumber(entries.length)} loaded` : undefined} flush>
        {!entries ? (
          <p className="se-muted se-admin-pad">Loading audit log...</p>
        ) : (
          <>
            <AuditEntryList entries={entries} empty="No admin actions match these filters." />
            {nextBefore ? (
              <div className="se-admin-pad">
                <Button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => void load(applied, nextBefore)} disabledReason={busy ? 'Still loading the last set of entries.' : null}>
                  {busy ? 'Loading...' : 'Load older entries'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Panel>
    </GameLayout>
  );
}
