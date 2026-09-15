import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AdminAuditEntryDto, AdminRoundAction, AdminRoundDto, AdminRoundsDto, RoundStatus } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Field } from '../components/Field.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';

const actionLabel: Record<AdminRoundAction, string> = {
  'open-registration': 'Open registration',
  start: 'Start',
  'end-early': 'End early',
  archive: 'Archive',
};

const actionCopy: Record<AdminRoundAction, string> = {
  'open-registration': 'Players can register for this round from now on.',
  start: 'The round goes live now. If it was scheduled for later, its start moves to now.',
  'end-early': 'Every player is settled and final standings freeze at this moment. Final awards apply like a normal finish. This cannot be undone.',
  archive: 'The round moves to the archive. Its results stay in the Hall of Fame.',
};

const statusPhrase: Record<RoundStatus, string> = {
  SCHEDULED: 'scheduled',
  REGISTRATION: 'open for registration',
  ACTIVE: 'live',
  ENDED: 'ended',
  ARCHIVED: 'archived',
};

const emptyForm = { name: '', slug: '', rulesetId: '', startsAt: '', endsAt: '', registrationOpensAt: '' };

function statusTone(status: RoundStatus): string {
  if (status === 'ACTIVE') return ' se-tag--good';
  if (status === 'SCHEDULED' || status === 'REGISTRATION') return ' se-tag--warn';
  return '';
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** datetime-local inputs hold local time with no zone; the API takes ISO timestamps. */
function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function snapshotStatus(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('status' in value)) return null;
  return String((value as { status: unknown }).status);
}

function auditChange(entry: AdminAuditEntryDto): string {
  const before = snapshotStatus(entry.before);
  const after = snapshotStatus(entry.after);
  if (before && after) return before === after ? after : `${before} → ${after}`;
  return after ? `created as ${after}` : '-';
}

interface Pending {
  round: AdminRoundDto;
  action: AdminRoundAction;
}

export function AdminPage() {
  const [data, setData] = useState<AdminRoundsDto | null>(null);
  const [audit, setAudit] = useState<AdminAuditEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [handoffWarning, setHandoffWarning] = useState<string | null>(null);
  const [confirmHandoff, setConfirmHandoff] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [scheduling, setScheduling] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rounds, log] = await Promise.all([adminApi.rounds(), adminApi.audit()]);
      setData(rounds);
      setAudit(log.entries);
      setForm((current) => (current.rulesetId ? current : { ...current, rulesetId: rounds.rulesets[0]?.id ?? '' }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the admin panel.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roundNames = useMemo(() => new Map((data?.rounds ?? []).map((round) => [round.id, round.name])), [data]);

  const update = (key: keyof typeof emptyForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  function choose(round: AdminRoundDto, action: AdminRoundAction) {
    setPending({ round, action });
    setReason('');
    setHandoffWarning(null);
    setConfirmHandoff(false);
    setError(null);
    setNotice(null);
  }

  async function confirmAction(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    const { round, action } = pending;
    setBusy(true);
    setError(null);
    try {
      const result = action === 'open-registration'
        ? await adminApi.openRegistration(round.id)
        : action === 'start'
          ? await adminApi.startRound(round.id, confirmHandoff)
          : action === 'end-early'
            ? await adminApi.endRoundEarly(round.id, reason.trim())
            : await adminApi.archiveRound(round.id);
      setNotice(`${result.round.name} is now ${statusPhrase[result.round.status]}.`);
      setPending(null);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'ROUND_HANDOFF_REQUIRED') {
        setHandoffWarning(caught.message);
      } else {
        setError(caught instanceof ApiError ? caught.message : 'That admin action did not go through. Refresh before trying again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function scheduleRound(event: FormEvent) {
    event.preventDefault();
    setScheduling(true);
    setFields({});
    setError(null);
    setNotice(null);
    try {
      const startsAt = toIso(form.startsAt);
      if (!startsAt) {
        setFields({ startsAt: 'Pick a start date and time.' });
        return;
      }
      const endsAt = toIso(form.endsAt);
      const registrationOpensAt = toIso(form.registrationOpensAt);
      const result = await adminApi.scheduleRound({
        name: form.name.trim(),
        rulesetId: form.rulesetId,
        startsAt,
        ...(form.slug.trim() ? { slug: form.slug.trim() } : {}),
        ...(endsAt ? { endsAt } : {}),
        ...(registrationOpensAt ? { registrationOpensAt } : {}),
      });
      setNotice(`${result.round.name} is scheduled.`);
      setForm((current) => ({ ...emptyForm, rulesetId: current.rulesetId }));
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields(caught.fields ?? {});
        setError(caught.message);
      } else {
        setError('Could not schedule that round.');
      }
    } finally {
      setScheduling(false);
    }
  }

  const rounds = data?.rounds ?? [];
  const reasonTooShort = pending?.action === 'end-early' && reason.trim().length < 5;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Admin Panel</h1>
          <p className="se-eyebrow">Rounds · every action is audited</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}

      <div className="se-stats se-mb">
        <Stat label="Live" value={data ? formatNumber(rounds.filter((round) => round.status === 'ACTIVE').length) : '-'} />
        <Stat label="Upcoming" value={data ? formatNumber(rounds.filter((round) => round.status === 'SCHEDULED' || round.status === 'REGISTRATION').length) : '-'} />
        <Stat label="Finished" value={data ? formatNumber(rounds.filter((round) => round.status === 'ENDED' || round.status === 'ARCHIVED').length) : '-'} />
      </div>

      {pending ? (
        <Panel title={`${actionLabel[pending.action]}: ${pending.round.name}`} className="se-mb">
          <form onSubmit={confirmAction} noValidate>
            <p>{actionCopy[pending.action]}</p>
            {pending.action === 'end-early' ? (
              <div className="se-field">
                <label className="se-label" htmlFor="admin-end-reason">Reason</label>
                <textarea
                  id="admin-end-reason"
                  className="se-input se-admin-reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                />
                <p className="se-hint">Saved to the audit log. At least 5 characters.</p>
              </div>
            ) : null}
            {handoffWarning ? (
              <label className="se-checkrow se-checkrow--inline">
                <input type="checkbox" checked={confirmHandoff} onChange={(event) => setConfirmHandoff(event.target.checked)} />
                <span>
                  <strong>Hand off the live round</strong>
                  <small>{handoffWarning}</small>
                </span>
              </label>
            ) : null}
            <div className="se-cta se-mt">
              <button className="se-btn se-btn--primary" disabled={busy || reasonTooShort || (handoffWarning !== null && !confirmHandoff)}>
                {busy ? 'Working...' : `Confirm: ${actionLabel[pending.action].toLowerCase()}`}
              </button>
              <button type="button" className="se-btn se-btn--ghost" onClick={() => setPending(null)} disabled={busy}>Cancel</button>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel title="Rounds" aside={data ? `${formatNumber(rounds.length)} shown` : undefined} flush className="se-mb">
        {!data ? (
          <p className="se-muted se-admin-pad">Loading rounds...</p>
        ) : rounds.length === 0 ? (
          <p className="se-muted se-admin-pad">No rounds yet. Schedule the first one below.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Status</th>
                  <th>Ruleset</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th className="se-table__number">Players</th>
                  <th className="se-table__number">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((round) => (
                  <tr key={round.id}>
                    <td>
                      <strong>{round.name}</strong>
                      <br />
                      <span className="se-muted">{round.slug}</span>
                    </td>
                    <td><span className={`se-tag${statusTone(round.status)}`}>{round.status}</span></td>
                    <td className="se-num">{round.rulesetVersion}</td>
                    <td>{when(round.startsAt)}</td>
                    <td>{when(round.endsAt)}</td>
                    <td className="se-table__number se-num">{formatNumber(round.playerCount)}</td>
                    <td className="se-table__number">
                      <div className="se-admin-actions">
                        {round.actions.length ? round.actions.map((action) => (
                          <button
                            type="button"
                            key={action}
                            className={`se-btn se-btn--sm${action === 'end-early' ? '' : ' se-btn--ghost'}`}
                            onClick={() => choose(round, action)}
                            disabled={busy}
                          >
                            {actionLabel[action]}
                          </button>
                        )) : <span className="se-muted">-</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="se-grid se-grid--2">
        <Panel title="Schedule a round">
          <form onSubmit={scheduleRound} noValidate>
            <Field
              id="admin-round-name"
              label="Name"
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              required
              minLength={3}
              maxLength={80}
              error={fields.name}
              hint="Shown to players, e.g. Game #011 - Alliances."
            />
            <Field
              id="admin-round-slug"
              label="Slug"
              value={form.slug}
              onChange={(event) => update('slug', event.target.value)}
              maxLength={60}
              error={fields.slug}
              hint="Optional. Made from the name when left blank."
            />
            <div className="se-field">
              <label className="se-label" htmlFor="admin-round-ruleset">Ruleset</label>
              <select
                id="admin-round-ruleset"
                className="se-input"
                value={form.rulesetId}
                onChange={(event) => update('rulesetId', event.target.value)}
              >
                {data?.rulesets.map((ruleset) => (
                  <option value={ruleset.id} key={ruleset.id}>{ruleset.version} · {ruleset.name}</option>
                ))}
              </select>
              {fields.rulesetId ? <p className="se-error">{fields.rulesetId}</p> : <p className="se-hint">A round keeps its ruleset for the whole season.</p>}
            </div>
            <Field
              id="admin-round-starts"
              label="Starts"
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => update('startsAt', event.target.value)}
              required
              error={fields.startsAt}
            />
            <Field
              id="admin-round-ends"
              label="Ends"
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => update('endsAt', event.target.value)}
              error={fields.endsAt}
              hint="Optional. Defaults to the ruleset's season length."
            />
            <Field
              id="admin-round-registration"
              label="Registration opens"
              type="datetime-local"
              value={form.registrationOpensAt}
              onChange={(event) => update('registrationOpensAt', event.target.value)}
              error={fields.registrationOpensAt}
              hint="Optional. Players cannot join before this, even once registration is open."
            />
            <button className="se-btn se-btn--primary se-btn--block" disabled={scheduling || !data}>
              {scheduling ? 'Scheduling...' : 'Schedule round'}
            </button>
          </form>
        </Panel>

        <Panel title="Audit log" aside="Latest 50" flush>
          {!audit ? (
            <p className="se-muted se-admin-pad">Loading audit log...</p>
          ) : audit.length === 0 ? (
            <p className="se-muted se-admin-pad">No admin actions yet.</p>
          ) : (
            <ol className="se-admin-audit">
              {audit.map((entry) => (
                <li className="se-admin-audit__entry" key={entry.id}>
                  <div className="se-admin-audit__head">
                    <strong>{entry.action}</strong>
                    <span className="se-muted">{when(entry.createdAt)}</span>
                  </div>
                  <p>
                    {entry.actorUsername} · {entry.targetId ? roundNames.get(entry.targetId) ?? entry.targetId : entry.targetType} · {auditChange(entry)}
                  </p>
                  {entry.reason ? <p className="se-hint">Reason: {entry.reason}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </GameLayout>
  );
}
