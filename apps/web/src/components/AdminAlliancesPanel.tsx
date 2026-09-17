import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminAllianceDto, AdminAlliancesDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminAllianceApi } from '../api/alliances.js';
import { ApiError } from '../api/client.js';
import { adminWhen } from '../utils/admin.js';
import { AdminWireView } from './AdminWireView.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

/** 0.3.0-C moderation: rename an offensive alliance or disband one. Both are audited. */
export function AdminAlliancesPanel({ roundId, finished }: { roundId: string; finished: boolean }) {
  const [data, setData] = useState<AdminAlliancesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminAllianceDto | null>(null);
  const [form, setForm] = useState({ name: '', tag: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [wireFor, setWireFor] = useState<string | null>(null);

  const load = useCallback(() => {
    adminAllianceApi.list(roundId).then(setData).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load alliances.');
    });
  }, [roundId]);

  useEffect(load, [load]);

  async function act(kind: 'rename' | 'disband') {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === 'rename') {
        await adminAllianceApi.rename(editing.id, {
          reason: form.reason,
          ...(form.name.trim() && form.name.trim() !== editing.name ? { name: form.name } : {}),
          ...(form.tag.trim() && form.tag.trim().toUpperCase() !== editing.tag ? { tag: form.tag } : {}),
        });
        setNotice(`Renamed [${editing.tag}] ${editing.name}.`);
      } else {
        await adminAllianceApi.disband(editing.id, form.reason);
        setNotice(`Disbanded [${editing.tag}] ${editing.name}. Its members are on the leave cooldown.`);
      }
      setEditing(null);
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That admin action did not go through.');
    } finally {
      setBusy(false);
    }
  }

  if (data && !data.enabled && data.alliances.length === 0) return null;
  const reasonShort = form.reason.trim().length < 5 ? 'The audit log needs a reason of at least 5 characters.' : null;

  return (
    <Panel title="Alliances" flush className="se-mt">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice se-admin-pad" role="status">{notice}</p> : null}
      {!data ? <p className="se-muted se-admin-pad">Loading alliances...</p> : null}
      {data && data.alliances.length === 0 ? <p className="se-muted se-admin-pad">No alliances in this round yet.</p> : null}
      {data && data.alliances.length ? (
        <div className="se-tablewrap">
          <table className="se-table se-table--cards">
            <thead>
              <tr>
                <th>Alliance</th>
                <th>Leader</th>
                <th className="se-table__number">Members</th>
                <th className="se-table__number">Combined</th>
                <th>Founded</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.alliances.map((alliance) => (
                <tr key={alliance.id}>
                  <td className="se-td--title">
                    [{alliance.tag}] {alliance.name}
                    {alliance.disbandedAt ? <span className="se-tag se-tag--bad" title={alliance.disbandReason ?? undefined}>Disbanded</span> : null}
                  </td>
                  <td data-label="Leader">
                    {alliance.leader ? <Link to={`/game/admin/players/${alliance.leader.roundPlayerId}`}>{alliance.leader.displayName}</Link> : '-'}
                  </td>
                  <td className="se-table__number se-num" data-label="Members">{formatNumber(alliance.memberCount)}</td>
                  <td className="se-table__number se-num" data-label="Combined">{formatCents(alliance.combinedNetWorthCents)}</td>
                  <td data-label="Founded">{adminWhen(alliance.createdAt)}</td>
                  <td data-label="">
                    <span className="se-inline-actions">
                      {alliance.disbandedAt ? null : (
                        <button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => {
                          setEditing(alliance);
                          setForm({ name: alliance.name, tag: alliance.tag, reason: '' });
                          setNotice(null);
                        }}>Moderate</button>
                      )}
                      <button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => setWireFor(alliance.id)}>Wire</button>
                      {alliance.forumUrl ? <a className="se-btn se-btn--sm se-btn--ghost" href={alliance.forumUrl} target="_blank" rel="noreferrer">Forum</a> : null}
                      <Link className="se-btn se-btn--sm se-btn--ghost" to={`/game/admin/audit?targetType=alliance&targetId=${alliance.id}`}>Audit</Link>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {wireFor ? <AdminWireView allianceId={wireFor} onClose={() => setWireFor(null)} /> : null}

      {editing ? (
        <div className="se-admin-pad">
          <p className="se-label">Moderating [{editing.tag}] {editing.name}</p>
          <div className="se-field">
            <label className="se-label" htmlFor="admin-alliance-name">Name</label>
            <input id="admin-alliance-name" className="se-input" maxLength={32} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div className="se-field">
            <label className="se-label" htmlFor="admin-alliance-tag">Tag</label>
            <input id="admin-alliance-tag" className="se-input" maxLength={5} value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value.toUpperCase() })} />
          </div>
          <div className="se-field">
            <label className="se-label" htmlFor="admin-alliance-reason">Reason</label>
            <textarea id="admin-alliance-reason" className="se-input se-admin-reason" maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
            <p className="se-hint">Saved to the audit log. Disbanding puts every member on the leave cooldown.</p>
          </div>
          <span className="se-inline-actions">
            <Button type="button" className="se-btn se-btn--primary se-btn--sm"
              disabledReason={busy ? 'The last admin action is still going through.' : reasonShort
                ?? (form.name.trim() === editing.name && form.tag.trim().toUpperCase() === editing.tag ? 'Change the name or tag first.' : null)}
              onClick={() => void act('rename')}>Rename</Button>
            <Button type="button" className="se-btn se-btn--ghost se-btn--sm"
              disabledReason={busy ? 'The last admin action is still going through.' : finished ? 'This round has finished, so its alliances are frozen.' : reasonShort}
              onClick={() => void act('disband')}>Disband</Button>
            <button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
          </span>
        </div>
      ) : null}
    </Panel>
  );
}
