import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AdminQuestContentDto, AdminRoundsDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

interface PendingToggle {
  kind: 'quest' | 'favor';
  key: string;
  name: string;
  enabled: boolean;
}

export function AdminQuestContentPage() {
  const [rounds, setRounds] = useState<AdminRoundsDto | null>(null);
  const [roundId, setRoundId] = useState('');
  const [data, setData] = useState<AdminQuestContentDto | null>(null);
  const [pending, setPending] = useState<PendingToggle | null>(null);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRounds = useCallback(async () => {
    try {
      const result = await adminApi.rounds();
      setRounds(result);
      setRoundId((current) => {
        if (current && result.rounds.some((round) => round.id === current)) return current;
        return result.rounds.find((round) => round.status === 'ACTIVE')?.id
          ?? result.rounds.find((round) => round.status === 'REGISTRATION')?.id
          ?? result.rounds[0]?.id
          ?? '';
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load rounds.');
    }
  }, []);

  const loadContent = useCallback(async () => {
    if (!roundId) {
      setData(null);
      return;
    }
    try {
      setError(null);
      setData(await adminApi.questContent(roundId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load quest content.');
    }
  }, [roundId]);

  useEffect(() => {
    void loadRounds();
  }, [loadRounds]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  const query = filter.trim().toLowerCase();
  const quests = useMemo(() => (data?.quests ?? []).filter((quest) =>
    !query
    || quest.key.toLowerCase().includes(query)
    || quest.title.toLowerCase().includes(query)
    || quest.type.toLowerCase().includes(query)
    || quest.category.toLowerCase().includes(query)
  ), [data, query]);
  const favors = useMemo(() => (data?.favors ?? []).filter((favor) =>
    !query
    || favor.key.toLowerCase().includes(query)
    || favor.name.toLowerCase().includes(query)
    || favor.contactKey.toLowerCase().includes(query)
  ), [data, query]);

  function choose(toggle: PendingToggle) {
    setPending(toggle);
    setReason('');
    setError(null);
    setNotice(null);
  }

  async function confirmToggle(event: FormEvent) {
    event.preventDefault();
    if (!pending || !data) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const enabled = !pending.enabled;
      const updated = pending.kind === 'quest'
        ? await adminApi.setQuestEnabled(data.round.id, pending.key, enabled, reason.trim())
        : await adminApi.setFavorEnabled(data.round.id, pending.key, enabled, reason.trim());
      setData(updated);
      setNotice(`${pending.name} is now ${enabled ? 'enabled' : 'disabled'} for ruleset ${updated.round.rulesetVersion}.`);
      setPending(null);
      setReason('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That content change did not go through.');
    } finally {
      setBusy(false);
    }
  }

  const enabledQuests = data?.quests.filter((quest) => quest.isEnabled).length ?? 0;
  const enabledFavors = data?.favors.filter((favor) => favor.isEnabled).length ?? 0;
  const reasonReady = reason.trim().length >= 5;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Quest Content</h1>
          <p className="se-eyebrow">Admin · catalog switches, rotations and favor kill switches</p>
        </div>
        <Link className="se-btn se-btn--ghost" to="/game/admin">Back to admin</Link>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}

      <Panel title="Content scope" className="se-mb">
        <div className="se-admin-filters">
          <div className="se-field">
            <label className="se-label" htmlFor="admin-content-round">Round / pinned ruleset</label>
            <select
              id="admin-content-round"
              className="se-input"
              value={roundId}
              onChange={(event) => {
                setRoundId(event.target.value);
                setPending(null);
                setNotice(null);
              }}
            >
              {(rounds?.rounds ?? []).map((round) => (
                <option key={round.id} value={round.id}>
                  {round.name} · {round.status} · {round.rulesetVersion}
                </option>
              ))}
            </select>
            <p className="se-hint">Switches apply to this pinned ruleset version, so older seasons keep their own content state.</p>
          </div>
          <div className="se-field">
            <label className="se-label" htmlFor="admin-content-filter">Filter catalog</label>
            <input
              id="admin-content-filter"
              className="se-input"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Quest, category, type or favor"
            />
          </div>
        </div>
      </Panel>

      {pending ? (
        <Panel title={`${pending.enabled ? 'Disable' : 'Enable'} ${pending.kind}: ${pending.name}`} className="se-mb">
          <form onSubmit={confirmToggle} noValidate>
            <p>
              {pending.kind === 'favor' && pending.enabled
                ? 'Disabling a favor blocks new activation immediately and stops its server-side effect while the switch is off. Armed single-use favors remain disarmable.'
                : pending.kind === 'quest' && pending.enabled
                  ? 'Disabling a quest removes it from player boards and blocks direct accept/claim requests. Existing state is preserved so the switch is reversible.'
                  : 'This restores the content for this ruleset version.'}
            </p>
            <div className="se-field">
              <label className="se-label" htmlFor="admin-content-reason">Reason</label>
              <textarea
                id="admin-content-reason"
                className="se-input se-admin-reason"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <p className="se-hint">Required and written to the admin audit log. At least 5 characters.</p>
            </div>
            <div className="se-cta">
              <Button
                className="se-btn se-btn--primary"
                disabledReason={busy ? 'The content change is still being saved.' : !reasonReady ? 'Write an audit reason of at least 5 characters.' : null}
              >
                {busy ? 'Saving...' : `Confirm ${pending.enabled ? 'disable' : 'enable'}`}
              </Button>
              <Button type="button" className="se-btn se-btn--ghost" onClick={() => setPending(null)} disabledReason={busy ? 'The content change is still being saved.' : null}>
                Cancel
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}

      <div className="se-stats se-mb">
        <Stat label="Quest definitions" value={data ? formatNumber(data.quests.length) : '-'} sub={data ? `${formatNumber(enabledQuests)} enabled` : undefined} />
        <Stat label="Favor definitions" value={data ? formatNumber(data.favors.length) : '-'} sub={data ? `${formatNumber(enabledFavors)} enabled` : undefined} />
        <Stat label="Ruleset" value={data?.round.rulesetVersion ?? '-'} sub={data?.round.name} />
      </div>

      <div className="se-grid se-grid--2 se-mb">
        <Panel title="Daily rotation" aside={data ? `${data.rotations.daily.keys.length}/${data.rotations.daily.slots} slots` : undefined}>
          {!data ? <p className="se-muted">Loading...</p> : (
            <>
              <p>{data.rotations.daily.keys.length ? data.rotations.daily.keys.join(' · ') : 'No enabled daily contracts.'}</p>
              <p className="se-hint">Resets {adminWhen(data.rotations.daily.resetAt)}. Selection is recomputed from enabled definitions.</p>
            </>
          )}
        </Panel>
        <Panel title="Weekly rotation" aside={data ? `${data.rotations.weekly.keys.length}/${data.rotations.weekly.slots} slots` : undefined}>
          {!data ? <p className="se-muted">Loading...</p> : (
            <>
              <p>{data.rotations.weekly.keys.length ? data.rotations.weekly.keys.join(' · ') : 'No enabled weekly contracts.'}</p>
              <p className="se-hint">Resets {adminWhen(data.rotations.weekly.resetAt)}. Category diversity is preserved where possible.</p>
            </>
          )}
        </Panel>
      </div>

      <Panel title="Quest definitions" aside={data ? `${formatNumber(quests.length)} shown` : undefined} flush className="se-mb">
        {!data ? (
          <p className="se-muted se-admin-pad">Loading quest catalog...</p>
        ) : quests.length === 0 ? (
          <p className="se-muted se-admin-pad">No quest definitions match this filter.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Quest</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Repeat</th>
                  <th>Status</th>
                  <th className="se-table__number">Attempts</th>
                  <th className="se-table__number">Open</th>
                  <th className="se-table__number">Action</th>
                </tr>
              </thead>
              <tbody>
                {quests.map((quest) => (
                  <tr key={quest.key}>
                    <td className="se-td--title">
                      <strong>{quest.title}</strong>
                      <br />
                      <span className="se-muted">{quest.key}</span>
                    </td>
                    <td data-label="Type">{quest.type}</td>
                    <td data-label="Category">{quest.category}</td>
                    <td data-label="Repeat">{quest.repeatability}</td>
                    <td data-label="Status">
                      <span className={`se-tag ${quest.isEnabled ? 'se-tag--good' : 'se-tag--bad'}`}>
                        {quest.isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="se-table__number se-num" data-label="Attempts">{formatNumber(quest.attempts)}</td>
                    <td className="se-table__number se-num" data-label="Open">{formatNumber(quest.openAttempts)}</td>
                    <td className="se-table__number" data-label="Action">
                      <Button
                        type="button"
                        className="se-btn se-btn--sm se-btn--ghost"
                        onClick={() => choose({ kind: 'quest', key: quest.key, name: quest.title, enabled: quest.isEnabled })}
                        disabledReason={busy ? 'Another content change is still saving.' : null}
                      >
                        {quest.isEnabled ? 'Disable' : 'Enable'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Favor definitions" aside={data ? `${formatNumber(favors.length)} shown` : undefined} flush>
        {!data ? (
          <p className="se-muted se-admin-pad">Loading favor catalog...</p>
        ) : favors.length === 0 ? (
          <p className="se-muted se-admin-pad">No favor definitions match this filter.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Favor</th>
                  <th>Contact</th>
                  <th>Activation</th>
                  <th>Effect</th>
                  <th>Status</th>
                  <th className="se-table__number">Action</th>
                </tr>
              </thead>
              <tbody>
                {favors.map((favor) => (
                  <tr key={favor.key}>
                    <td className="se-td--title">
                      <strong>{favor.name}</strong>
                      <br />
                      <span className="se-muted">{favor.key}</span>
                    </td>
                    <td data-label="Contact">{favor.contactKey}</td>
                    <td data-label="Activation">
                      {favor.activationKind} · {favor.category}
                      {favor.durationMinutes ? ` · ${favor.durationMinutes}m` : ''}
                    </td>
                    <td data-label="Effect">{favor.effectKind ?? '-'}</td>
                    <td data-label="Status">
                      <span className={`se-tag ${favor.isEnabled ? 'se-tag--good' : 'se-tag--bad'}`}>
                        {favor.isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td className="se-table__number" data-label="Action">
                      <Button
                        type="button"
                        className="se-btn se-btn--sm se-btn--ghost"
                        onClick={() => choose({ kind: 'favor', key: favor.key, name: favor.name, enabled: favor.isEnabled })}
                        disabledReason={busy ? 'Another content change is still saving.' : null}
                      >
                        {favor.isEnabled ? 'Disable' : 'Enable'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </GameLayout>
  );
}
