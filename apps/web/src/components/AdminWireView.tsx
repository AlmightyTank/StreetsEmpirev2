import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminWireDto } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { adminWireApi } from '../api/playing-together.js';
import { adminWhen } from '../utils/admin.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';

/** 0.3.0-D. An alliance's wire as admins see it, removed posts included. Removing a post is audited. */
export function AdminWireView({ allianceId, onClose }: { allianceId: string; onClose: () => void }) {
  const [wire, setWire] = useState<AdminWireDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminWireApi.list(allianceId).then(setWire).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the wire.');
    });
  }, [allianceId]);

  useEffect(load, [load]);

  async function remove(postId: string) {
    setBusy(true);
    setError(null);
    try {
      await adminWireApi.remove(postId, reason);
      setRemoving(null);
      setReason('');
      load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not remove that post.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="se-admin-pad">
      <div className="se-admin-audit__head">
        <p className="se-label">Wire{wire ? ` · [${wire.alliance.tag}] ${wire.alliance.name}` : ''}</p>
        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={onClose}>Close</button>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {!wire ? <p className="se-muted">Loading the wire...</p> : null}
      {wire && wire.posts.length === 0 ? <p className="se-muted">Nothing has been posted.</p> : null}
      {wire?.posts.length ? (
        <ul className="se-wire">
          {wire.posts.map((post) => (
            <li key={post.id} className={`se-wire__post${post.removedAt ? ' se-wire__post--removed' : ''}`}>
              <div className="se-wire__meta">
                <Link to={`/game/admin/players/${post.author.roundPlayerId}`}>{post.author.displayName}</Link>
                <span className="se-muted">{adminWhen(post.createdAt)}</span>
                {post.kind === 'ANNOUNCEMENT' ? <span className="se-tag se-tag--warn">Announcement</span> : null}
                {post.pinned ? <span className="se-tag se-tag--good">Pinned</span> : null}
                {post.removedAt ? (
                  <span className="se-tag se-tag--bad" title={post.removedReason ?? undefined}>
                    Removed by {post.removedByRole === 'admin' ? `admin ${post.removedByName}` : post.removedByRole}
                  </span>
                ) : removing === post.id ? null : (
                  <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => { setRemoving(post.id); setReason(''); }}>Remove</button>
                )}
              </div>
              <p className="se-wire__body">{post.body}</p>
              {removing === post.id ? (
                <div className="se-field">
                  <label className="se-label" htmlFor={`wire-reason-${post.id}`}>Reason</label>
                  <textarea id={`wire-reason-${post.id}`} className="se-input se-admin-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
                  <span className="se-inline-actions">
                    <Button type="button" className="se-btn se-btn--primary se-btn--sm"
                      disabledReason={busy ? 'Still removing.' : reason.trim().length < 5 ? 'The audit log needs a reason of at least 5 characters.' : null}
                      onClick={() => void remove(post.id)}>Remove post</Button>
                    <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setRemoving(null)}>Cancel</button>
                  </span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
