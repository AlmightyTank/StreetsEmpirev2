import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AdminRoundHealthDto, AdminUpdateRoundInput } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen, isoToLocalInput, localInputToIso } from '../utils/admin.js';

const emptyForm = { name: '', startsAt: '', endsAt: '', registrationOpensAt: '', reason: '' };

export function AdminRoundPage() {
  const { roundId = '' } = useParams();
  const [health, setHealth] = useState<AdminRoundHealthDto | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await adminApi.roundHealth(roundId);
      setHealth(result);
      setForm({
        name: result.round.name,
        startsAt: isoToLocalInput(result.round.startsAt),
        endsAt: isoToLocalInput(result.round.endsAt),
        registrationOpensAt: isoToLocalInput(result.round.registrationOpensAt),
        reason: '',
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load that round.');
    }
  }, [roundId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!health) return;
    const round = health.round;
    const input: AdminUpdateRoundInput = { reason: form.reason.trim() };
    if (form.name.trim() !== round.name) input.name = form.name.trim();
    if (form.startsAt !== isoToLocalInput(round.startsAt)) {
      const startsAt = localInputToIso(form.startsAt);
      if (startsAt) input.startsAt = startsAt;
    }
    if (form.endsAt !== isoToLocalInput(round.endsAt)) {
      const endsAt = localInputToIso(form.endsAt);
      if (endsAt) input.endsAt = endsAt;
    }
    if (form.registrationOpensAt !== isoToLocalInput(round.registrationOpensAt)) {
      input.registrationOpensAt = localInputToIso(form.registrationOpensAt) ?? null;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    setFields({});
    try {
      await adminApi.updateRound(round.id, input);
      setNotice('Round details saved.');
      await load();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields(caught.fields ?? {});
        setError(caught.message);
      } else {
        setError('Could not save that round.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!health) {
    return (
      <GameLayout>
        {error ? <Alert>{error}</Alert> : <p className="se-muted">Loading round...</p>}
      </GameLayout>
    );
  }

  const { round, players, days, topPlayers } = health;
  const finished = round.status === 'ENDED' || round.status === 'ARCHIVED';
  const running = round.status === 'ACTIVE';

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">{round.name}</h1>
          <p className="se-eyebrow"><Link to="/game/admin">Rounds</Link> · {round.status} · {round.rulesetVersion} · {round.slug}</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}

      <div className="se-stats se-mb">
        <Stat label="Players" value={formatNumber(players.total)} />
        <Stat label="Active 24h" value={formatNumber(players.active24h)} />
        <Stat label="Active 7d" value={formatNumber(players.active7d)} />
        <Stat label="Never acted" value={formatNumber(players.neverActed)} tooltip="Joined, but nothing in their activity log after joining." />
      </div>

      <Panel title="Last 14 days" aside="UTC days" flush className="se-mb">
        {days.length === 0 ? (
          <p className="se-muted se-admin-pad">No activity yet.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="se-table__number">Joins</th>
                  <th className="se-table__number">Active</th>
                  <th className="se-table__number">Turns spent</th>
                  <th className="se-table__number">Raids</th>
                  <th className="se-table__number">Drive-bys</th>
                  <th className="se-table__number">Special</th>
                  <th className="se-table__number">Recon</th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.day}>
                    <td className="se-td--title se-num">{day.day}</td>
                    <td className="se-table__number se-num" data-label="Joins">{formatNumber(day.joins)}</td>
                    <td className="se-table__number se-num" data-label="Active">{formatNumber(day.activePlayers)}</td>
                    <td className="se-table__number se-num" data-label="Turns spent">{formatNumber(day.turnsSpent)}</td>
                    <td className="se-table__number se-num" data-label="Raids">{formatNumber(day.raids)}</td>
                    <td className="se-table__number se-num" data-label="Drive-bys">{formatNumber(day.driveBys)}</td>
                    <td className="se-table__number se-num" data-label="Special raids">{formatNumber(day.specialRaids)}</td>
                    <td className="se-table__number se-num" data-label="Recon">{formatNumber(day.recon)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="se-grid se-grid--2">
        <Panel title="Richest players" flush>
          {topPlayers.length === 0 ? (
            <p className="se-muted se-admin-pad">Nobody has joined yet.</p>
          ) : (
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th className="se-table__number">Net worth</th>
                    <th>Last active</th>
                  </tr>
                </thead>
                <tbody>
                  {topPlayers.map((player) => (
                    <tr key={player.roundPlayerId}>
                      <td className="se-td--title">
                        <Link to={`/game/admin/players/${player.roundPlayerId}`}>{player.displayName}</Link>{' '}
                        <span className="se-muted">#{player.publicPimpId}{player.nationalRank ? ` · rank ${player.nationalRank}` : ''}</span>
                      </td>
                      <td className="se-table__number se-num" data-label="Net worth">{formatCents(player.netWorthCents)}</td>
                      <td data-label="Last active">{adminWhen(player.lastActiveAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Edit round">
          {finished ? (
            <p className="se-hint">This round has finished, so its details are frozen.</p>
          ) : (
            <form onSubmit={save} noValidate>
              <Field id="admin-round-edit-name" label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={80} error={fields.name} />
              <Field
                id="admin-round-edit-starts"
                label="Starts"
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                disabled={running}
                error={fields.startsAt}
                hint={running ? 'Fixed: the round is already running.' : undefined}
              />
              <Field
                id="admin-round-edit-ends"
                label="Ends"
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => setForm({ ...form, endsAt: event.target.value })}
                error={fields.endsAt}
                hint="Extend or pull in the season. To finish it now, use End early."
              />
              <Field
                id="admin-round-edit-registration"
                label="Registration opens"
                type="datetime-local"
                value={form.registrationOpensAt}
                onChange={(event) => setForm({ ...form, registrationOpensAt: event.target.value })}
                error={fields.registrationOpensAt}
                hint="Optional. Clear it to allow joining as soon as registration is open."
              />
              <div className="se-field">
                <label className="se-label" htmlFor="admin-round-edit-reason">Reason</label>
                <textarea id="admin-round-edit-reason" className="se-input se-admin-reason" maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
                {fields.reason ? <p className="se-error">{fields.reason}</p> : <p className="se-hint">Saved to the audit log. At least 5 characters.</p>}
              </div>
              <Button className="se-btn se-btn--primary se-btn--block"
                disabledReason={busy ? 'The last admin action is still going through.' : form.reason.trim().length < 5 ? 'The audit log needs a reason of at least 5 characters.' : null}>
                {busy ? 'Saving...' : 'Save changes'}
              </Button>
            </form>
          )}
          <p className="se-hint se-mt">
            <Link to={`/game/admin/audit?targetType=round&targetId=${round.id}`}>Audit history for this round</Link>
          </p>
        </Panel>
      </div>
    </GameLayout>
  );
}
