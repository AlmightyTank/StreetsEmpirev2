import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminRoundDto } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { livingStoryAdminApi, type LivingStoryDiagnosis, type LivingStoryDraftInput,
  type LivingStoryOverview } from '../api/livingStoryAdmin.js';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { Panel } from './Panel.js';

const KNOWN_KINDS = ['war_win', 'operation_complete', 'npc_gang_migration',
  'supply_road_stop', 'takeover', 'city_condition_follow_up'] as const;
const CASES = ['CASE_MISSING_LEDGER', 'CASE_GHOST_SHIPMENT', 'CASE_THE_FIFTH_WITNESS',
  'CASE_FALSE_COLORS', 'CASE_MIDNIGHT_SIGNAL'] as const;
const INITIAL: Omit<LivingStoryDraftInput, 'roundId' | 'reason'> = {
  key: 'STORY_QA_NEW', title: '', caseKey: 'CASE_MISSING_LEDGER',
  eventKinds: ['war_win'], audience: 'ACTORS', visibility: 'OWNER_ONLY',
  expiresAfterActiveMinutes: 1440, rewardBudgetCents: 0,
};

export function AdminLivingStoriesPanel() {
  const [rounds, setRounds] = useState<AdminRoundDto[]>([]);
  const [roundId, setRoundId] = useState('');
  const [overview, setOverview] = useState<LivingStoryOverview | null>(null);
  const [ownerId, setOwnerId] = useState('');
  const [memoryId, setMemoryId] = useState('');
  const [storyKey, setStoryKey] = useState('');
  const [reason, setReason] = useState('');
  const [draft, setDraft] = useState(INITIAL);
  const [diagnosis, setDiagnosis] = useState<LivingStoryDiagnosis | null>(null);
  const [simResult, setSimResult] = useState<{ contractEligible: boolean; reason: string; note: string } | null>(null);
  const [testKind, setTestKind] = useState<string>('war_win');
  const [publicSource, setPublicSource] = useState(false);
  const [participant, setParticipant] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setOverview(await livingStoryAdminApi.overview(id));
  }, []);
  useEffect(() => {
    let mounted = true;
    void adminApi.rounds().then((result) => {
      if (!mounted) return;
      setRounds(result.rounds);
      setRoundId((current) => current || result.rounds.find((row) => row.status === 'ACTIVE')?.id
        || result.rounds[0]?.id || '');
    }).catch((err: unknown) => { if (mounted) setError(err instanceof Error ? err.message : 'Cannot load rounds.'); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!roundId) return;
    let mounted = true;
    void livingStoryAdminApi.overview(roundId).then((result) => {
      if (!mounted) return;
      setOverview(result);
      setStoryKey((old) => result.catalog.some((row) => row.key === old) ? old : result.catalog[0]?.key || '');
    }).catch((err: unknown) => { if (mounted) setError(err instanceof Error ? err.message : 'Cannot load case diagnostics.'); });
    return () => { mounted = false; };
  }, [roundId]);

  async function work(job: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try { await job(); } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Request failed.');
    } finally { setBusy(false); }
  }
  function editDraft(row: LivingStoryOverview['drafts'][number]) {
    setDraft({
      key: row.key, title: row.title, caseKey: row.caseKey, eventKinds: row.eventKinds,
      audience: row.audience, visibility: row.visibility,
      expiresAfterActiveMinutes: row.expiresAfterActiveMinutes, rewardBudgetCents: row.rewardBudgetCents,
    });
    setNotice(`Tuning disabled draft ${row.key}, revision ${row.revision}. Save to update.`);
  }
  const editing = overview?.drafts.find((d) => d.key === draft.key);
  const validReason = reason.trim().length >= 5;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!roundId || !validReason) return;
    await work(async () => {
      await livingStoryAdminApi.saveDraft({
        ...draft, roundId, reason: reason.trim(),
        ...(editing ? { expectedRevision: editing.revision } : {}),
      });
      await load(roundId);
      setNotice('Story proposal saved DISABLED. Publishing needs a new versioned ruleset and code review.');
    });
  }
  return (
    <section aria-label="Living Streets authoring and diagnostics">
      <Panel title="Living Streets · Story Diagnostics" subtitle="Admin only · authoritative ruleset snapshots and case quotas" className="se-mb">
        <div className="se-field">
          <label htmlFor="living-admin-round" className="se-label">Round to inspect</label>
          <select id="living-admin-round" className="se-input" value={roundId} onChange={(e) => {
            setRoundId(e.target.value); setOverview(null); setDiagnosis(null); setSimResult(null);
          }}>
            {rounds.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.status}</option>)}
          </select>
        </div>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {notice ? <Alert tone="info">{notice}</Alert> : null}
        {overview ? <>
          <p className="se-hint"><strong>{overview.round.rulesetId}</strong> · {overview.round.rulesetVersion} ·
            {overview.round.paused ? ' paused' : overview.round.status} · No changes to pinned rulesets</p>
          <div className="se-grid se-grid--2">
            <div><span className="se-eyebrow">Cases sampled</span><strong>{overview.caseStats.totalSampled}{overview.caseStats.truncated ? '+' : ''}</strong>
              <p className="se-hint">Solved {overview.caseStats.byStatus.SOLVED ?? 0} · Closed {overview.caseStats.byStatus.CLOSED ?? 0} · Expired {overview.caseStats.byStatus.EXPIRED ?? 0}</p></div>
            <div><span className="se-eyebrow">Limits</span>
              <p className="se-hint">Owner {overview.limits.maxPerOwnerRound} · City {overview.limits.maxPerCityRound}
                · Round {overview.limits.maxPerRound} · Cooldown {overview.limits.cooldownActiveMinutes} active minutes</p></div>
          </div>
          <div className="se-tablewrap"><table className="se-table"><thead><tr>
            <th>Versioned story</th><th>Audience & trigger</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>{overview.catalog.map((c) => <tr key={c.key}>
              <td><strong>{c.title}</strong><small>{c.key} · {c.caseKey}</small></td>
              <td>{c.audience}<small>{c.eventKinds.join(', ')}</small></td>
              <td>Weight: {c.weight} (uniform)<small>Max {c.rewardBudgetCents}¢ · {c.expiresAfterActiveMinutes} active mins</small></td>
              <td>{c.enabled ? 'Enabled in pinned ruleset' : 'Disabled'}</td>
            </tr>)}</tbody></table></div>
          <p className="se-hint">Weights shown are informational: Living Stories currently match eligible triggers rather than draw from a weighted lottery.</p>
          <div className="se-tablewrap"><table className="se-table"><thead><tr><th>Recent saved source</th><th>Visibility</th><th>Check</th></tr></thead>
            <tbody>{overview.recentSources.map((s) => <tr key={s.id}><td>{s.kind}<small>{s.id} · {new Date(s.happenedAt).toLocaleString()}</small></td>
              <td>{s.visibility}</td><td><button type="button" className="se-btn se-btn--secondary se-btn--sm"
                onClick={() => { setMemoryId(s.id); setNotice('Saved source selected for diagnostic check.'); }}>Select source</button></td></tr>)}</tbody></table></div>
          <div className="se-admin-filters">
            <div className="se-field"><label htmlFor="living-admin-owner" className="se-label">Round player ID</label>
              <input id="living-admin-owner" className="se-input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} placeholder="Existing RoundPlayer ID" /></div>
            <div className="se-field"><label htmlFor="living-admin-memory" className="se-label">Saved City Memory ID</label>
              <input id="living-admin-memory" className="se-input" value={memoryId} onChange={(e) => setMemoryId(e.target.value)} /></div>
            <div className="se-field"><label htmlFor="living-admin-key" className="se-label">Story</label>
              <select id="living-admin-key" className="se-input" value={storyKey} onChange={(e) => setStoryKey(e.target.value)}>
                {overview.catalog.map((c) => <option value={c.key} key={c.key}>{c.title}</option>)}</select></div>
            <div className="se-field"><label htmlFor="living-admin-reason" className="se-label">Admin reason (required for simulation & saving drafts)</label>
              <input id="living-admin-reason" className="se-input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain this QA check" /></div>
          </div>
          <div className="se-actions">
            <button type="button" className="se-btn se-btn--primary" disabled={busy || !ownerId || !memoryId || !storyKey}
              onClick={() => void work(async () => {
                setDiagnosis(await livingStoryAdminApi.diagnose({ roundId, ownerId, memoryId, storyKey }));
              })}>Explain real-source eligibility</button>
            <button type="button" className="se-btn se-btn--secondary" disabled={busy} onClick={() => void work(async () => {
              await load(roundId); setNotice('Read-only diagnostics refreshed.');
            })}>Refresh metrics</button>
          </div>
          {diagnosis ? <div role="status" className="se-panel se-mt" style={{ padding: '1rem' }}>
            <strong>{diagnosis.eligible ? 'Eligible for a real invitation' : 'Not eligible'} — {diagnosis.reason.replaceAll('_', ' ')}</strong>
            <p className="se-hint">Authoritative source: {diagnosis.source.kind} ({diagnosis.source.visibility}) · Existing case: {diagnosis.existingCase?.status ?? 'none'}</p>
            <p className="se-hint">Owner uses {diagnosis.counts.owner}/{diagnosis.limits.maxPerOwnerRound} · City {diagnosis.counts.city}/{diagnosis.limits.maxPerCityRound} · Round {diagnosis.counts.round}/{diagnosis.limits.maxPerRound} · Cooldown entries {diagnosis.counts.cooldown}</p>
          </div> : null}
        </> : <p className="se-muted">Choose a round to load its living-story diagnostics.</p>}
      </Panel>

      <Panel title="Hypothetical test trigger" subtitle="Dry run only — no event, case, evidence or reward writes" className="se-mb">
        <div className="se-admin-filters">
          <div className="se-field"><label htmlFor="living-test-kind" className="se-label">Synthetic source kind</label>
            <select id="living-test-kind" className="se-input" value={testKind} onChange={(e) => setTestKind(e.target.value)}>
              {KNOWN_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
          <label className="se-field"><span className="se-label">Public source <input type="checkbox" checked={publicSource} onChange={(e) => setPublicSource(e.target.checked)} /></span></label>
          <label className="se-field"><span className="se-label">Player involved <input type="checkbox" checked={participant} onChange={(e) => setParticipant(e.target.checked)} /></span></label>
        </div>
        <button type="button" className="se-btn se-btn--secondary" disabled={busy || !ownerId || !storyKey || !validReason || !roundId}
          onClick={() => void work(async () => {
            setSimResult(await livingStoryAdminApi.simulate({ roundId, ownerId, storyKey, eventKind: testKind,
              publicSource, participant, reason: reason.trim() }));
          })}>Run audited, no-payout QA simulation</button>
        {simResult ? <p role="status" className="se-hint">
          <strong>{simResult.contractEligible ? 'Hypothetical contract matches' : 'Hypothetical contract blocked'}</strong>
          · {simResult.reason}. {simResult.note}
        </p> : null}
      </Panel>

      <Panel title="Versioned story draft authoring" subtitle="All drafts stay disabled; activation needs new pinned ruleset" className="se-mb">
        <form className="se-admin-filters" onSubmit={(event) => void save(event)}>
          <div className="se-field"><label htmlFor="living-draft-key" className="se-label">New story key</label>
            <input id="living-draft-key" className="se-input" value={draft.key} maxLength={64}
              onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value.toUpperCase() }))} /></div>
          <div className="se-field"><label htmlFor="living-draft-title" className="se-label">Title</label>
            <input id="living-draft-title" className="se-input" maxLength={120} value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} /></div>
          <div className="se-field"><label htmlFor="living-draft-case" className="se-label">Case template</label>
            <select id="living-draft-case" className="se-input" value={draft.caseKey}
              onChange={(e) => setDraft((d) => ({ ...d, caseKey: e.target.value }))}>
              {CASES.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
          <div className="se-field"><label htmlFor="living-draft-kind" className="se-label">Trigger kind</label>
            <select id="living-draft-kind" className="se-input" value={draft.eventKinds[0]}
              onChange={(e) => setDraft((d) => ({ ...d, eventKinds: [e.target.value] }))}>
              {KNOWN_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
          <div className="se-field"><label htmlFor="living-draft-audience" className="se-label">Audience</label>
            <select id="living-draft-audience" className="se-input" value={draft.audience}
              onChange={(e) => setDraft((d) => ({ ...d, audience: e.target.value as LivingStoryDraftInput['audience'] }))}>
              <option value="ACTORS">Verified actors</option><option value="CITY_PLAYERS">City players (public only)</option></select></div>
          <div className="se-field"><label htmlFor="living-draft-visibility" className="se-label">Story visibility</label>
            <select id="living-draft-visibility" className="se-input" value={draft.visibility}
              onChange={(e) => setDraft((d) => ({ ...d, visibility: e.target.value as LivingStoryDraftInput['visibility'] }))}>
              <option value="OWNER_ONLY">Owner only</option><option value="PUBLIC_SUMMARY">Public summary (verified only)</option></select></div>
          <div className="se-field"><label htmlFor="living-draft-expiry" className="se-label">Active clock expiry · minutes</label>
            <input id="living-draft-expiry" className="se-input" type="number" min={5} max={10080}
              value={draft.expiresAfterActiveMinutes}
              onChange={(e) => setDraft((d) => ({ ...d, expiresAfterActiveMinutes: Number(e.target.value) }))} /></div>
          <div className="se-field"><label htmlFor="living-draft-budget" className="se-label">Case reward budget · cents (max 2500)</label>
            <input id="living-draft-budget" className="se-input" type="number" min={0} max={2500}
              value={draft.rewardBudgetCents}
              onChange={(e) => setDraft((d) => ({ ...d, rewardBudgetCents: Number(e.target.value) }))} /></div>
          <div className="se-actions"><button className="se-btn se-btn--primary" type="submit"
            disabled={busy || !roundId || !validReason || !draft.title.trim() || !draft.key.trim()}>
            {editing ? `Save tuning · revision ${editing.revision}` : 'Save disabled draft'}</button>
            {editing ? <button type="button" className="se-btn se-btn--secondary" onClick={() => setDraft(INITIAL)}>New draft</button> : null}
          </div>
        </form>
        {overview?.drafts.length ? <div className="se-tablewrap"><table className="se-table"><thead>
          <tr><th>Proposal</th><th>Review state</th><th>Rev</th><th>Action</th></tr></thead><tbody>
          {overview.drafts.map((d) => <tr key={d.id}><td>{d.title}<small>{d.key}</small></td>
            <td>Disabled · {d.baseRulesetVersion}</td><td>{d.revision}</td>
            <td><button type="button" className="se-btn se-btn--secondary se-btn--sm" onClick={() => editDraft(d)}>Tune</button></td></tr>)}
        </tbody></table></div> : null}
      </Panel>
    </section>
  );
}
