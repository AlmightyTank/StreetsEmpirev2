import { useCallback, useEffect, useState } from 'react';
import type { AdminDevBotsDto, AdminNpcGangControlInput, AdminNpcGangInspectDto } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { formatDuration } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel, Row } from './Panel.js';

/** What every control needs from the operator; the reason lands in the audit log. */
type Draft = AdminNpcGangControlInput extends infer Control ? Control extends unknown ? Omit<Control, 'reason'> : never : never;

function when(iso: string): string {
  const delta = Date.parse(iso) - Date.now();
  return delta <= 0 ? `${formatDuration(Math.abs(delta))} ago` : `in ${formatDuration(delta)}`;
}

/**
 * Phase O. Operator controls for one NPC gang: run it now, delay or pause it, wake it,
 * retune traits, tier and personality, reset momentum, grudges or a migration plan,
 * and read its decision log, audit trail and raw memory.
 */
export function AdminNpcGangControls({ roundPlayerId, controls, onChanged, onClose }: {
  roundPlayerId: string;
  controls: AdminDevBotsDto['controls'];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [gang, setGang] = useState<AdminNpcGangInspectDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState(60);
  const [pauseHours, setPauseHours] = useState('');
  const [tune, setTune] = useState({ aggression: 0, ambition: 0, discipline: 0, tier: '', archetype: '' });

  const load = useCallback(async () => {
    try {
      const next = await adminApi.npcGang(roundPlayerId);
      setGang(next);
      setTune({ aggression: next.aggression, ambition: next.ambition, discipline: next.discipline, tier: next.tier, archetype: next.archetype });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load that gang.');
    }
  }, [roundPlayerId]);

  useEffect(() => {
    setGang(null);
    setNotice(null);
    setError(null);
    void load();
  }, [load]);

  const reasonMissing = reason.trim().length < 5 ? 'Give a reason of at least 5 characters for the audit log.' : null;
  const blocked = busy ? 'The last control is still going through.' : reasonMissing;

  async function send(draft: Draft) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await adminApi.controlNpcGang(roundPlayerId, { ...draft, reason: reason.trim() } as AdminNpcGangControlInput);
      setGang(result.gang);
      setNotice(result.message);
      setReason('');
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not go through. Refresh before trying again.');
    } finally {
      setBusy(false);
    }
  }

  function tuneDraft(): Draft {
    if (!gang) return { action: 'TUNE' };
    return {
      action: 'TUNE',
      ...(tune.aggression !== gang.aggression ? { aggression: tune.aggression } : {}),
      ...(tune.ambition !== gang.ambition ? { ambition: tune.ambition } : {}),
      ...(tune.discipline !== gang.discipline ? { discipline: tune.discipline } : {}),
      ...(tune.tier !== gang.tier ? { tier: tune.tier } : {}),
      ...(tune.archetype !== gang.archetype ? { archetype: tune.archetype } : {}),
    };
  }
  const tuneChanges = Object.keys(tuneDraft()).length - 1;
  const dormant = Boolean(gang?.dormantUntil && Date.parse(gang.dormantUntil) > Date.now());

  return (
    <Panel title={gang ? `${gang.crewName} · ${gang.displayName}` : 'NPC gang'} aside={gang ? `${gang.tier} · ${gang.personality}` : undefined} className="se-mt">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      {!gang ? <p className="se-muted">Loading…</p> : (
        <>
          <div className="se-rows">
            <Row label="Next move" value={when(gang.nextActionAt)} />
            <Row label="Traits" value={`aggression ${gang.aggression} · ambition ${gang.ambition} · discipline ${gang.discipline}`} />
            {gang.paused
              ? <Row label="Paused" value={`by ${gang.paused.by}, until ${when(gang.paused.until)}: ${gang.paused.reason}`} strong />
              : dormant && gang.dormantUntil ? <Row label="Gone to ground" value={`back ${when(gang.dormantUntil)}`} strong /> : null}
          </div>

          <label className="se-label se-mt" htmlFor="npc-gang-reason">Reason (for the audit log)</label>
          <textarea id="npc-gang-reason" className="se-input se-admin-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />

          <div className="se-actions-row se-mt">
            <Button type="button" className="se-btn se-btn--sm" onClick={() => void send({ action: 'ACT_NOW' })}
              disabledReason={blocked ?? (dormant ? 'Wake it first.' : null)}>Act now</Button>
            <Button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => void send({ action: 'WAKE' })}
              disabledReason={blocked ?? (!dormant ? 'It is already awake.' : null)}>Wake</Button>
          </div>

          <div className="se-actions-row se-mt">
            <input className="se-input" type="number" min={5} max={10080} step={5} aria-label="Delay in minutes" value={delayMinutes}
              onChange={(event) => setDelayMinutes(Number(event.target.value))} />
            <Button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => void send({ action: 'DELAY', minutes: delayMinutes })}
              disabledReason={blocked ?? (delayMinutes < 5 ? 'Delay at least 5 minutes.' : null)}>Delay (minutes)</Button>
            <input className="se-input" type="number" min={1} max={720} placeholder="rest of round" aria-label="Pause in hours" value={pauseHours}
              onChange={(event) => setPauseHours(event.target.value)} />
            <Button type="button" className="se-btn se-btn--sm se-btn--ghost"
              onClick={() => void send(pauseHours ? { action: 'PAUSE', hours: Number(pauseHours) } : { action: 'PAUSE' })}
              disabledReason={blocked}>Pause (hours)</Button>
          </div>

          <div className="se-rows se-mt">
            {(['aggression', 'ambition', 'discipline'] as const).map((key) => (
              <label key={key} className="se-row">
                <span className="se-row__label">{key}</span>
                <input className="se-input" type="number" min={0} max={100} value={tune[key]}
                  onChange={(event) => setTune({ ...tune, [key]: Math.max(0, Math.min(100, Number(event.target.value))) })} />
              </label>
            ))}
            <label className="se-row">
              <span className="se-row__label">tier</span>
              <select className="se-input" value={tune.tier} onChange={(event) => setTune({ ...tune, tier: event.target.value })}>
                {controls.tiers.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
              </select>
            </label>
            <label className="se-row">
              <span className="se-row__label">personality</span>
              <select className="se-input" value={tune.archetype} onChange={(event) => setTune({ ...tune, archetype: event.target.value })}>
                {!controls.personalities.some((option) => option.key === tune.archetype)
                  ? <option value={tune.archetype}>{tune.archetype} (legacy)</option>
                  : null}
                {controls.personalities.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="se-actions-row se-mt">
            <Button type="button" className="se-btn se-btn--sm" onClick={() => void send(tuneDraft())}
              disabledReason={blocked ?? (tuneChanges < 1 ? 'Change a trait, the tier or the personality first.' : null)}>Save tuning</Button>
            <Button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => void send({ action: 'RESET', scope: 'MOMENTUM' })} disabledReason={blocked}>Reset momentum</Button>
            <Button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => void send({ action: 'RESET', scope: 'GRUDGES' })} disabledReason={blocked}>Clear grudges</Button>
            <Button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => void send({ action: 'RESET', scope: 'MIGRATION' })} disabledReason={blocked}>Drop move plan</Button>
          </div>

          <h3 className="se-mt">Recent decisions</h3>
          {gang.decisions.length ? (
            <ol className="se-admin-list">
              {gang.decisions.map((row) => (
                <li key={`${row.at}-${row.outcome}`}>
                  <span className="se-muted">{when(row.at)}</span>{' '}
                  {row.outcome.toLowerCase().replace(/_/g, ' ')}
                  {row.about ? ` · ${row.about}` : ''}
                  {row.won === null ? '' : row.won ? ' · won' : ' · lost'}
                  {row.error ? ` · ${row.error}` : ''}
                </li>
              ))}
            </ol>
          ) : <p className="se-muted">No decisions logged yet.</p>}

          <h3 className="se-mt">Audit</h3>
          {gang.audit.length ? (
            <ol className="se-admin-list">
              {gang.audit.map((row) => <li key={`${row.at}-${row.action}`}><span className="se-muted">{when(row.at)}</span> {row.actor} · {row.action}{row.reason ? ` · ${row.reason}` : ''}</li>)}
            </ol>
          ) : <p className="se-muted">No operator changes yet.</p>}

          <details className="se-mt">
            <summary>Raw memory</summary>
            <pre className="se-admin-json">{JSON.stringify(gang.memory, null, 2)}</pre>
          </details>
        </>
      )}
      <div className="se-actions-row se-mt">
        <Button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={onClose}>Close</Button>
      </div>
    </Panel>
  );
}
