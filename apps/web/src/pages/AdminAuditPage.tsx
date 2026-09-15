import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AdminAuditEntryDto, AdminAuditFilters } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AuditEntryList } from '../components/AdminParts.js';
import { Alert } from '../components/Alert.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { localInputToIso } from '../utils/admin.js';

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
            <button className="se-btn se-btn--primary" disabled={busy}>Apply</button>
            <button type="button" className="se-btn se-btn--ghost" onClick={clear} disabled={busy}>Clear</button>
          </div>
        </form>
      </Panel>

      <Panel title="Entries" aside={entries ? `${formatNumber(entries.length)} loaded` : undefined} flush>
        {!entries ? (
          <p className="se-muted se-admin-pad">Loading audit log...</p>
        ) : (
          <>
            <AuditEntryList entries={entries} empty="No admin actions match these filters." />
            {nextBefore ? (
              <div className="se-admin-pad">
                <button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => void load(applied, nextBefore)} disabled={busy}>
                  {busy ? 'Loading...' : 'Load older entries'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </Panel>
    </GameLayout>
  );
}
