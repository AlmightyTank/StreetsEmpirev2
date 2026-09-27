import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminTurfDto, AdminTurfHistoryDto, AdminTurfRepair } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AdminRoundPicker, useAdminRound } from '../components/AdminRoundPicker.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

interface PendingRepair {
  action: AdminTurfRepair;
  label: string;
  copy: string;
  turfId?: string;
  roundPlayerId?: string;
  pushId?: string;
}

const district = (key: string) => key.replace('_', ' ').toLowerCase();

/** 1.0.0-E. Every block, who held it, and the three audited repairs for turf state gone wrong. */
export function AdminTurfPage() {
  const { rounds, roundId, setRoundId, error: roundsError } = useAdminRound();
  const [turf, setTurf] = useState<AdminTurfDto | null>(null);
  const [history, setHistory] = useState<AdminTurfHistoryDto | null>(null);
  const [pending, setPending] = useState<PendingRepair | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!roundId) return;
    adminApi.turf(roundId)
      .then(setTurf)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load turf.'));
  }, [roundId]);
  useEffect(() => { load(); }, [load]);

  async function repair() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi.turfRepair({
        action: pending.action, reason: reason.trim(),
        ...(pending.turfId ? { turfId: pending.turfId } : {}),
        ...(pending.roundPlayerId ? { roundPlayerId: pending.roundPlayerId } : {}),
        ...(pending.pushId ? { pushId: pending.pushId } : {}),
      });
      setNotice(result.done);
      setPending(null);
      setReason('');
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That repair did not go through.');
    } finally {
      setBusy(false);
    }
  }

  const held = turf?.blocks.filter((block) => block.holder) ?? [];

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Turf</h1>
          <p className="se-eyebrow">Admin · blocks, ownership history and repairs</p>
        </div>
        <AdminRoundPicker rounds={rounds} roundId={roundId} onChange={setRoundId} />
      </div>
      {roundsError || error ? <Alert>{roundsError ?? error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}

      {pending ? (
        <Panel title={pending.label} className="se-mb">
          <p>{pending.copy}</p>
          <div className="se-field">
            <label className="se-label" htmlFor="admin-turf-reason">Reason</label>
            <textarea id="admin-turf-reason" className="se-input se-admin-reason" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
            <p className="se-hint">Saved to the audit log with the rows as they were. At least 5 characters.</p>
          </div>
          <div className="se-cta">
            <Button type="button" className="se-btn se-btn--primary" onClick={() => void repair()} disabledReason={busy ? 'Working...' : reason.trim().length < 5 ? 'Give a reason of at least 5 characters.' : null}>Confirm</Button>
            <Button type="button" className="se-btn se-btn--ghost" onClick={() => setPending(null)}>Cancel</Button>
          </div>
        </Panel>
      ) : null}

      {turf?.drift.length ? (
        <Panel title="Posted thugs out of step" aside="Posted count ≠ thugs standing on corners" className="se-mb">
          <ul className="se-admin-list">
            {turf.drift.map((row) => (
              <li key={row.player.id}>
                <Link to={`/game/admin/players/${row.player.id}`}>{row.player.displayName}</Link>: {formatNumber(row.postedThugs)} posted, {formatNumber(row.onCorners)} on corners{' '}
                <Button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setPending({
                  action: 'sync-posted', roundPlayerId: row.player.id, label: `Re-sync ${row.player.displayName}`,
                  copy: 'Recomputes their posted thugs and posted/outpost net worth from the corners and boxes they actually hold. Nothing on the street moves.',
                })}>Re-sync</Button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Blocks" aside={turf ? `${formatNumber(held.length)} held of ${formatNumber(turf.blocks.length)}` : undefined} flush className="se-mb">
        {!turf ? <p className="se-muted se-admin-pad">Loading turf...</p> : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead><tr><th>Block</th><th>Holder</th><th className="se-table__number">Corner</th><th className="se-table__number">Locals</th><th>Held since</th><th>In flight</th><th /></tr></thead>
              <tbody>
                {turf.blocks.map((block) => (
                  <tr key={block.id}>
                    <td className="se-td--title">
                      <button type="button" className="se-linkbtn" onClick={() => void adminApi.turfHistory(block.id).then(setHistory)}>{block.city} · {district(block.district)}</button>
                      {block.outpost ? <span className="se-tag"> Outpost {formatCents(block.outpost.cashCents)}</span> : null}
                      {block.shieldUntil && Date.parse(block.shieldUntil) > Date.now() ? <span className="se-tag se-tag--warn"> Shielded</span> : null}
                    </td>
                    <td data-label="Holder">{block.holder ? <Link to={`/game/admin/players/${block.holder.id}`}>{block.holder.displayName}</Link> : <span className="se-muted">locals</span>}</td>
                    <td className="se-table__number se-num" data-label="Corner">{formatNumber(block.cornerThugs)}</td>
                    <td className="se-table__number se-num" data-label="Locals">{formatNumber(block.localsThugs)}</td>
                    <td data-label="Held since">{block.heldSince ? adminWhen(block.heldSince) : '-'}</td>
                    <td data-label="In flight">
                      {block.pendingPushes.length === 0 ? '-' : block.pendingPushes.map((push) => (
                        <span key={push.id} className="se-admin-inline">
                          {push.attacker} ({push.squad}) lands {adminWhen(push.landsAt)}
                          {push.overdue ? (
                            <Button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setPending({
                              action: 'settle-push', pushId: push.id, label: `Settle ${push.attacker}'s push`,
                              copy: "This push is past its landing time and nobody has settled it. It lands now, exactly as the defender's next visit would land it.",
                            })}>Settle</Button>
                          ) : null}
                        </span>
                      ))}
                    </td>
                    <td>
                      {block.holder ? (
                        <Button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setPending({
                          action: 'release-block', turfId: block.id, label: `Release ${block.city} · ${district(block.district)}`,
                          copy: `The corner comes home to ${block.holder!.displayName}: ${block.cornerThugs} thugs and their guns${block.outpost ? ", and the outpost box's cash, beer and product" : ''}. The locals take the block back.`,
                        })}>Release</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {history ? (
        <Panel title={`Ownership history · ${history.city} · ${district(history.district)}`} aside={<button type="button" className="se-linkbtn" onClick={() => setHistory(null)}>Close</button>}>
          {history.segments.length === 0 ? <p className="se-muted">Nobody has held this block.</p> : (
            <ol className="se-admin-list">
              {history.segments.map((row, index) => (
                <li key={`${row.startedAt}-${index}`}>
                  {row.holderName} <span className="se-muted">#{row.holderPublicPimpId}{row.allianceTag ? ` [${row.allianceTag}]` : ''}</span> · {adminWhen(row.startedAt)} → {row.endedAt ? adminWhen(row.endedAt) : 'now'}
                </li>
              ))}
            </ol>
          )}
          {history.pushes.length ? (
            <>
              <h3 className="se-subtitle se-mt">Pushes</h3>
              <ol className="se-admin-list">
                {history.pushes.map((row) => (
                  <li key={row.id}>{row.attacker} pushed {row.defender} with {row.squad} · {row.status.toLowerCase()}{row.status === 'LANDED' ? (row.captured ? ', took it' : ', held') : ''} · {adminWhen(row.startedAt)}</li>
                ))}
              </ol>
            </>
          ) : null}
        </Panel>
      ) : null}
    </GameLayout>
  );
}
