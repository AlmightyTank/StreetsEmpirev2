import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AllianceWireDto } from '@streets/shared';
import { WIRE_POST_MAX } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { wireApi } from '../api/playing-together.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

const REFRESH_MS = 30_000;

/** 0.3.0-D. Short posts only current members can read. Refreshes itself while the page is open. */
export function AllianceWire() {
  const [wire, setWire] = useState<AllianceWireDto | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    wireApi.list().then((data) => { setWire(data); setNow(Date.now()); }).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load the wire.');
    });
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!wire?.cooldownUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [wire?.cooldownUntil]);

  async function run(action: () => Promise<AllianceWireDto>) {
    setBusy(true);
    setError(null);
    try {
      setWire(await action());
      setNow(Date.now());
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not go through. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (await run(() => wireApi.post(draft))) setDraft('');
  }

  const cooldownSeconds = wire?.cooldownUntil ? Math.ceil((new Date(wire.cooldownUntil).getTime() - now) / 1000) : 0;
  const blocked = busy ? 'Your last post is still going through.'
    : wire && !wire.roundOpen ? 'This round is closed, so the wire is read-only.'
      : cooldownSeconds > 0 ? `You can post again in ${cooldownSeconds}s.`
        : draft.trim() === '' ? 'Write something first.' : null;

  return (
    <Panel title="Alliance wire" aside="Members only">
      {error ? <Alert>{error}</Alert> : null}
      <form onSubmit={(event) => void send(event)} className="se-wire__form">
        <label className="se-label" htmlFor="alliance-wire">Post to the wire</label>
        <textarea id="alliance-wire" className="se-input se-wire__input" maxLength={WIRE_POST_MAX} rows={2} value={draft}
          placeholder="Targets, timing, who needs medicine..." onChange={(event) => setDraft(event.target.value)} />
        <div className="se-wire__actions">
          <span className="se-hint">{draft.length}/{WIRE_POST_MAX} · only your alliance sees this</span>
          <Button type="submit" className="se-btn se-btn--primary se-btn--sm" disabledReason={blocked}>Post</Button>
        </div>
      </form>
      {!wire ? <p className="se-muted">Tuning in...</p> : null}
      {wire && wire.posts.length === 0 ? <p className="se-muted">Nothing on the wire yet.</p> : null}
      {wire?.posts.length ? (
        <ul className="se-wire">
          {wire.posts.map((post) => (
            <li key={post.id} className={`se-wire__post${post.isYours ? ' se-wire__post--yours' : ''}`}>
              <div className="se-wire__meta">
                <Link to={`/game/players/${post.author.publicPimpId}`} className="se-playerlink">{post.author.displayName}</Link>
                <span className="se-muted">{new Date(post.createdAt).toLocaleString()}</span>
                {post.canRemove ? (
                  <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={busy}
                    onClick={() => void run(() => wireApi.remove(post.id))}>Remove</button>
                ) : null}
              </div>
              <p className="se-wire__body">{post.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
