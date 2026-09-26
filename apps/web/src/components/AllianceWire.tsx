import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AllianceWireDto, WirePostDto, WirePostKindDto } from '@streets/shared';
import { WIRE_POST_MAX } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { wireApi } from '../api/playing-together.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

const REFRESH_MS = 30_000;

function PostRow({ post, busy, run }: {
  post: WirePostDto;
  busy: boolean;
  run: (action: () => Promise<AllianceWireDto>) => Promise<boolean>;
}) {
  return (
    <li className={`se-wire__post${post.isYours ? ' se-wire__post--yours' : ''}${post.kind === 'ANNOUNCEMENT' ? ' se-wire__post--announcement' : ''}`}>
      <div className="se-wire__meta">
        <Link to={`/game/players/${post.author.publicPimpId}`} className="se-playerlink">{post.author.displayName}</Link>
        <span className="se-muted">{new Date(post.createdAt).toLocaleString()}</span>
        {post.kind === 'ANNOUNCEMENT' ? <span className="se-tag se-tag--warn">Announcement</span> : null}
        {post.pinned ? <span className="se-tag se-tag--good">Pinned</span> : null}
        <span className="se-wire__tools">
          {post.canPin ? (
            <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={busy}
              onClick={() => void run(() => wireApi.pin(post.id, !post.pinned))}>{post.pinned ? 'Unpin' : 'Pin'}</button>
          ) : null}
          {post.canRemove ? (
            <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={busy}
              onClick={() => void run(() => wireApi.remove(post.id))}>Remove</button>
          ) : null}
        </span>
      </div>
      <p className="se-wire__body">{post.body}</p>
    </li>
  );
}

/** 0.3.0-D. Short posts only current members can read. Refreshes itself while the page is open. */
export function AllianceWire() {
  const [wire, setWire] = useState<AllianceWireDto | null>(null);
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<WirePostKindDto>('MESSAGE');
  const [pinAnnouncement, setPinAnnouncement] = useState(false);
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
    if (await run(() => wireApi.post(draft, kind, kind === 'ANNOUNCEMENT' && pinAnnouncement))) {
      setDraft('');
      setKind('MESSAGE');
      setPinAnnouncement(false);
    }
  }

  const cooldownSeconds = wire?.cooldownUntil ? Math.ceil((new Date(wire.cooldownUntil).getTime() - now) / 1000) : 0;
  const blocked = busy ? 'Your last post is still going through.'
    : wire && !wire.roundOpen ? 'This round is closed, so the wire is read-only.'
      : cooldownSeconds > 0 ? `You can post again in ${cooldownSeconds}s.`
        : draft.trim() === '' ? 'Write something first.' : null;

  return (
    <Panel title="Alliance console" aside="Members only">
      {error ? <Alert>{error}</Alert> : null}
      {wire?.pinnedAnnouncement ? (
        <div className="se-wire__pinned">
          <span className="se-eyebrow">Pinned announcement</span>
          <p>{wire.pinnedAnnouncement.body}</p>
          <small>{wire.pinnedAnnouncement.author.displayName} · {new Date(wire.pinnedAnnouncement.createdAt).toLocaleString()}</small>
        </div>
      ) : null}
      {wire?.cards.length ? (
        <div className="se-wire-cards" aria-label="Alliance coordination cards">
          {wire.cards.map((card) => (
            <article key={card.id} className={`se-wire-card se-wire-card--${card.tone}`}>
              <div>
                <span className="se-eyebrow">{card.kind.replace(/_/g, ' ').toLowerCase()}</span>
                <strong>{card.title}</strong>
                <p>{card.detail}</p>
                <time dateTime={card.at}>{new Date(card.at).toLocaleString()}</time>
              </div>
              <Link className="se-btn se-btn--ghost se-btn--sm" to={card.href}>{card.actionLabel}</Link>
            </article>
          ))}
        </div>
      ) : null}
      <form onSubmit={(event) => void send(event)} className="se-wire__form">
        <label className="se-label" htmlFor="alliance-wire">Post to the wire</label>
        <textarea id="alliance-wire" className="se-input se-wire__input" maxLength={WIRE_POST_MAX} rows={2} value={draft}
          placeholder="Targets, timing, who needs medicine..." onChange={(event) => setDraft(event.target.value)} />
        {wire?.canPostAnnouncement ? (
          <div className="se-wire__options">
            <label className="se-field se-field--compact">
              <span className="se-label">Post type</span>
              <select className="se-input" value={kind} onChange={(event) => setKind(event.target.value as WirePostKindDto)}>
                <option value="MESSAGE">Message</option>
                <option value="ANNOUNCEMENT">Announcement</option>
              </select>
            </label>
            <label className="se-checkrow se-checkrow--inline">
              <input type="checkbox" checked={pinAnnouncement} disabled={kind !== 'ANNOUNCEMENT'} onChange={(event) => setPinAnnouncement(event.target.checked)} />
              <span>Pin announcement</span>
            </label>
          </div>
        ) : null}
        <div className="se-wire__actions">
          <span className="se-hint">{draft.length}/{WIRE_POST_MAX} · only your alliance sees this</span>
          <Button type="submit" className="se-btn se-btn--primary se-btn--sm" disabledReason={blocked}>Post</Button>
        </div>
      </form>
      {!wire ? <p className="se-muted">Tuning in...</p> : null}
      {wire && wire.posts.length === 0 ? <p className="se-muted">Nothing on the wire yet.</p> : null}
      {wire?.posts.length ? (
        <ul className="se-wire">
          {wire.posts.map((post) => <PostRow key={post.id} post={post} busy={busy} run={run} />)}
        </ul>
      ) : null}
    </Panel>
  );
}
