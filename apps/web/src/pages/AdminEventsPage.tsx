import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AdminEventOccurrenceDto, AdminEventPreviewDto, AdminEventReleaseReportDto } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel, Row } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';

const localDateTime = (value: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const showDate = (value: string | null): string => value ? new Date(value).toLocaleString() : 'Not scheduled';

function parseJsonField(value: string, label: string, array: boolean): unknown {
  const parsed: unknown = JSON.parse(value);
  const valid = array ? Array.isArray(parsed) : parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
  if (!valid) throw new Error(`${label} must be valid JSON ${array ? 'array' : 'object'}.`);
  return parsed;
}

export function AdminEventsPage() {
  const [report, setReport] = useState<AdminEventReleaseReportDto | null>(null);
  const [preview, setPreview] = useState<AdminEventPreviewDto | null>(null);
  const [rulesetId, setRulesetId] = useState('');
  const [selected, setSelected] = useState<AdminEventOccurrenceDto | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [draft, setDraft] = useState({ key: '', title: '', description: '', type: 'CITY_CONDITION', scope: 'CITY' });
  const [draftJson, setDraftJson] = useState({ schedule: '{\n  "kind": "QA_DRAFT"\n}', objectives: '[]', rewards: '[]', config: '{}' });
  const [tuningDraftId, setTuningDraftId] = useState<string | null>(null);
  const [tuneDraft, setTuneDraft] = useState({ title: '', description: '', schedule: '{}', objectives: '[]', rewards: '[]', config: '{}', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const result = await adminApi.eventOps();
    setReport(result);
    if (!rulesetId) setRulesetId(result.rulesets.at(-1)?.id ?? '');
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load event operations.'));
  }, []);

  useEffect(() => {
    if (!rulesetId) return;
    adminApi.eventPreview(rulesetId)
      .then(setPreview)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not preview that ruleset.'));
  }, [rulesetId]);

  const drafts = useMemo(() => report?.definitions.filter((item) => !item.sourceKind && !item.sourceKey) ?? [], [report]);

  async function updateCalendar(cancel: boolean) {
    if (!selected || reason.trim().length < 5) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.eventCalendar(selected.id, {
        reason,
        ...(cancel ? { cancel: true } : { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() }),
      });
      setNotice(cancel ? `${selected.title} cancelled.` : `${selected.title} rescheduled.`);
      setSelected(null);
      setReason('');
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update that event window.');
    } finally {
      setBusy(false);
    }
  }

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    if (!preview || reason.trim().length < 5 || !draft.key.trim() || !draft.title.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.createEventDraft({
        reason,
        rulesetId: preview.ruleset.id,
        rulesetVersion: preview.ruleset.version,
        key: draft.key.toUpperCase().replace(/\s+/g, '_'),
        title: draft.title,
        description: draft.description,
        type: draft.type,
        scope: draft.scope,
        schedule: parseJsonField(draftJson.schedule, 'Schedule', false) as Record<string, unknown>,
        objectives: parseJsonField(draftJson.objectives, 'Objectives', true) as unknown[],
        rewards: parseJsonField(draftJson.rewards, 'Rewards', true) as unknown[],
        config: parseJsonField(draftJson.config, 'Config', false) as Record<string, unknown>,
      });
      setNotice('QA draft saved disabled. To put it in a live event catalog, add it to a new pinned ruleset.');
      setDraft({ key: '', title: '', description: '', type: 'CITY_CONDITION', scope: 'CITY' });
      setDraftJson({ schedule: '{\n  "kind": "QA_DRAFT"\n}', objectives: '[]', rewards: '[]', config: '{}' });
      setReason('');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that event draft.');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftTune(event: FormEvent) {
    event.preventDefault();
    if (!tuningDraftId || tuneDraft.reason.trim().length < 5) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.tuneEventDraft(tuningDraftId, {
        title: tuneDraft.title,
        description: tuneDraft.description,
        reason: tuneDraft.reason,
        schedule: parseJsonField(tuneDraft.schedule, 'Schedule', false) as Record<string, unknown>,
        objectives: parseJsonField(tuneDraft.objectives, 'Objectives', true) as unknown[],
        rewards: parseJsonField(tuneDraft.rewards, 'Rewards', true) as unknown[],
        config: parseJsonField(tuneDraft.config, 'Config', false) as Record<string, unknown>,
      });
      setNotice('Disabled QA draft updated and recorded in the audit log.');
      setTuningDraftId(null);
      setTuneDraft({ title: '', description: '', schedule: '{}', objectives: '[]', rewards: '[]', config: '{}', reason: '' });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update that event draft.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div><h1 className="se-title">Event Operations</h1><p className="se-eyebrow">Admin · migration, QA and release checks</p></div>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {report ? <>
        <Panel title="Release checks" aside={`Checked ${new Date(report.generatedAt).toLocaleString()}`} className="se-mb">
          <div className="se-grid se-grid--2">
            {report.checks.map((check) => <article key={check.key} className={`se-event-admin-check se-event-admin-check--${check.status.toLowerCase()}`}>
              <strong>{check.status} · {check.key.replaceAll('-', ' ')}</strong><p>{check.detail}</p>
            </article>)}
          </div>
        </Panel>

        <Panel title="Migration inventory" className="se-mb">
          <div className="se-grid se-grid--3">
            <Row label="First-class definitions / occurrences" value={`${report.metrics.definitions} / ${report.metrics.occurrences}`} />
            <Row label="Participations / progress receipts" value={`${report.metrics.participations} / ${report.metrics.progressReceipts}`} />
            <Row label="First-class reward claims" value={report.metrics.rewardClaims} />
            <Row label="Legacy random encounter records" value={report.metrics.legacyRandomEncounters} />
            <Row label="Legacy event jobs / claims" value={`${report.metrics.legacyEventQuests} / ${report.metrics.legacyClaims}`} />
            <Row label="Aggregate legacy claim delta" value={report.migration.claimCountGap} />
          </div>
          <p className="se-hint">Legacy rows are retained for pinned-round compatibility. Review flagged rows before cleanup; this panel never deletes migration history.</p>
        </Panel>

        <Panel title="Pinned rulesets" className="se-mb" flush>
          <div className="se-tablewrap"><table className="se-table"><thead><tr><th>Ruleset</th><th>Version</th><th>First-class owners</th><th>Catalog entries</th></tr></thead>
            <tbody>{report.rulesets.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.version}</td><td>{item.firstClassTypes.join(', ')}</td><td>{item.catalogEntries}</td></tr>)}</tbody>
          </table></div>
        </Panel>

        <Panel title="QA preview and balance simulation" className="se-mb">
          <div className="se-field"><label className="se-label" htmlFor="admin-event-ruleset">Pinned ruleset</label>
            <select id="admin-event-ruleset" className="se-input" value={rulesetId} onChange={(event) => setRulesetId(event.target.value)}>
              {report.rulesets.map((item) => <option key={item.id} value={item.id}>{item.version} · {item.name}</option>)}
            </select>
          </div>
          {preview ? <>
            <p className="se-muted">{preview.catalog.length} catalog entries · owners: {preview.firstClassTypes.join(', ') || 'legacy only'}</p>
            <div className="se-tablewrap"><table className="se-table"><thead><tr><th>Event</th><th>Type / scope</th><th>Schedule</th></tr></thead>
              <tbody>{preview.catalog.map((entry) => <tr key={`${entry.type}:${entry.key}`}><td><strong>{entry.title}</strong><small>{entry.key}</small></td><td>{entry.type} · {entry.scope}</td><td><code>{JSON.stringify(entry.schedule)}</code></td></tr>)}</tbody>
            </table></div>
            {preview.modifierSimulation.length ? <div className="se-tablewrap"><table className="se-table"><thead><tr><th>Action / district</th><th>Worst-case raw</th><th>Applied cap</th><th>Conditions</th></tr></thead>
              <tbody>{preview.modifierSimulation.map((row) => <tr key={`${row.action}:${row.district}`}><td>{row.action} · {row.district}</td><td>{row.rawPercent}%</td><td>{row.cappedPercent}%</td><td>{row.sourceKeys.join(', ')}</td></tr>)}</tbody>
            </table></div> : null}
            <div className="se-grid se-grid--2">{preview.checks.map((check) => <p key={check.key}><strong>{check.status} · {check.key}:</strong> {check.detail}</p>)}</div>
          </> : <p className="se-muted">Choose a ruleset to preview its catalog.</p>}
        </Panel>

        <Panel title="Author a disabled QA draft" aside="Publishing requires a new pinned ruleset" className="se-mb">
          <form className="se-admin-filters" onSubmit={(event) => void createDraft(event)}>
            <Field label="Draft key" id="admin-event-draft-key" value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} maxLength={100} placeholder="CITY_TEST_FAIR" />
            <Field label="Title" id="admin-event-draft-title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={120} />
            <div className="se-field"><label className="se-label" htmlFor="admin-event-draft-type">Type</label><select id="admin-event-draft-type" className="se-input" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>
              {['COMMUNITY', 'SEASONAL', 'RANDOM_ENCOUNTER', 'CITY_CONDITION'].map((type) => <option key={type}>{type}</option>)}
            </select></div>
            <div className="se-field"><label className="se-label" htmlFor="admin-event-draft-scope">Scope</label><select id="admin-event-draft-scope" className="se-input" value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })}>
              {['ROUND', 'PLAYER', 'CITY'].map((scope) => <option key={scope}>{scope}</option>)}
            </select></div>
            <div className="se-field se-admin-event-description"><label className="se-label" htmlFor="admin-event-draft-description">Description</label><textarea id="admin-event-draft-description" className="se-input se-admin-textarea" maxLength={2000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></div>
            {(['schedule', 'objectives', 'rewards', 'config'] as const).map((key) => <div className="se-field" key={key}><label className="se-label" htmlFor={`admin-event-json-${key}`}>{key[0]!.toUpperCase() + key.slice(1)} JSON</label><textarea id={`admin-event-json-${key}`} className="se-input se-admin-textarea" value={draftJson[key]} onChange={(event) => setDraftJson({ ...draftJson, [key]: event.target.value })} /></div>)}
            <Field label="Reason" id="admin-event-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
            <Button className="se-btn se-btn--primary" disabled={busy || reason.trim().length < 5 || !draft.key.trim() || !draft.title.trim()}>Save disabled draft</Button>
          </form>
          {drafts.length ? <div className="se-tablewrap"><table className="se-table"><thead><tr><th>QA draft</th><th>State</th><th /></tr></thead><tbody>
            {drafts.map((item) => <tr key={item.id}><td>{item.title}<small>{item.key}</small></td><td>{item.isEnabled ? 'Enabled' : 'Disabled'}</td><td><Button className="se-btn se-btn--secondary" onClick={() => { setTuningDraftId(item.id); setTuneDraft({ title: item.title, description: item.description, schedule: JSON.stringify(item.schedule, null, 2), objectives: JSON.stringify(item.objectives, null, 2), rewards: JSON.stringify(item.rewards, null, 2), config: JSON.stringify(item.config, null, 2), reason: '' }); }}>Tune</Button></td></tr>)}
          </tbody></table></div> : null}
          {tuningDraftId ? <form className="se-admin-filters se-event-admin-calendar" onSubmit={(event) => void saveDraftTune(event)}>
            <Field label="Draft title" value={tuneDraft.title} onChange={(event) => setTuneDraft({ ...tuneDraft, title: event.target.value })} maxLength={120} />
            <div className="se-field se-admin-event-description"><label className="se-label" htmlFor="admin-event-tune-description">Description</label><textarea id="admin-event-tune-description" className="se-input se-admin-textarea" maxLength={2000} value={tuneDraft.description} onChange={(event) => setTuneDraft({ ...tuneDraft, description: event.target.value })} /></div>
            {(['schedule', 'objectives', 'rewards', 'config'] as const).map((key) => <div className="se-field" key={key}><label className="se-label" htmlFor={`admin-event-tune-json-${key}`}>{key[0]!.toUpperCase() + key.slice(1)} JSON</label><textarea id={`admin-event-tune-json-${key}`} className="se-input se-admin-textarea" value={tuneDraft[key]} onChange={(event) => setTuneDraft({ ...tuneDraft, [key]: event.target.value })} /></div>)}
            <Field label="Reason" value={tuneDraft.reason} onChange={(event) => setTuneDraft({ ...tuneDraft, reason: event.target.value })} maxLength={500} />
            <div className="se-actions"><Button className="se-btn se-btn--primary" disabled={busy || !tuneDraft.title.trim() || tuneDraft.reason.trim().length < 5}>Save tuning</Button><Button type="button" className="se-btn se-btn--secondary" onClick={() => setTuningDraftId(null)}>Close</Button></div>
          </form> : null}
        </Panel>

        <Panel title="Upcoming and live calendar" className="se-mb" flush>
          <div className="se-tablewrap"><table className="se-table"><thead><tr><th>Event</th><th>Round</th><th>Status</th><th>Window</th><th>Players</th><th>Control</th></tr></thead>
            <tbody>{report.calendar.map((item) => <tr key={item.id}><td>{item.title}<small>{item.key}</small></td><td>{item.roundName ?? 'Calendar'}</td><td>{item.status}</td><td>{showDate(item.startsAt)}<br />{showDate(item.endsAt)}</td><td>{item.participantCount}</td><td>{item.status === 'SCHEDULED' ? <Button className="se-btn se-btn--secondary" onClick={() => { setSelected(item); setStartsAt(localDateTime(item.startsAt)); setEndsAt(localDateTime(item.endsAt)); }}>Manage</Button> : 'Locked after start'}</td></tr>)}</tbody>
          </table></div>
          {selected ? <div className="se-event-admin-calendar">
            <h3>{selected.title}</h3>
            <div className="se-admin-filters"><Field label="Starts" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
              <Field label="Ends" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
              <Field label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
            </div>
            <div className="se-actions"><Button className="se-btn se-btn--primary" disabled={busy || !startsAt || !endsAt || reason.trim().length < 5} onClick={() => void updateCalendar(false)}>Reschedule</Button>
              <Button className="se-btn se-btn--danger" disabled={busy || reason.trim().length < 5} onClick={() => void updateCalendar(true)}>Cancel scheduled event</Button>
              <Button className="se-btn se-btn--secondary" onClick={() => setSelected(null)}>Close</Button></div>
          </div> : null}
        </Panel>

        <Panel title="Event lifecycle history" className="se-mb" flush>
          <div className="se-tablewrap"><table className="se-table"><thead><tr><th>When</th><th>Event</th><th>Action</th><th>Actor</th></tr></thead>
            <tbody>{report.history.map((item) => <tr key={item.id}><td>{showDate(item.happenedAt)}</td><td>{item.title}</td><td>{item.action}</td><td>{item.actorLabel ?? 'System'}</td></tr>)}</tbody>
          </table></div>
        </Panel>
      </> : <p className="se-muted">Loading event report…</p>}
    </GameLayout>
  );
}
