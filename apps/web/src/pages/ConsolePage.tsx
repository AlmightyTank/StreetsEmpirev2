import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  ConsoleBlocksDto,
  ConsoleFolder,
  DirectMessageDto,
  PimpConsoleDto,
} from '@streets/shared';
import {
  MESSAGE_BODY_MAX,
  MESSAGE_REPORT_REASON_MAX,
  MESSAGE_SUBJECT_MAX,
} from '@streets/shared';
import { consoleApi } from '../api/console.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { newActionId } from '../utils/actionId.js';

type ConsoleView = ConsoleFolder | 'blocked';
type ConsoleMode = 'detail' | 'compose';

const VIEWS: Array<{ key: ConsoleView; label: string }> = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'sent', label: 'Sent' },
  { key: 'archived', label: 'Archived' },
  { key: 'blocked', label: 'Blocked' },
];

function messageTime(value: string): string {
  return new Date(value).toLocaleString();
}

function subjectForReply(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export function ConsolePage() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<ConsoleView>('inbox');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PimpConsoleDto | null>(null);
  const [blocks, setBlocks] = useState<ConsoleBlocksDto | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<ConsoleMode>('detail');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const actionId = useRef(newActionId());

  const selected = data?.messages.find((message) => message.id === selectedId) ?? null;
  const counts = data?.counts ?? null;

  useEffect(() => {
    const to = searchParams.get('to');
    if (!to || !/^\d+$/.test(to)) return;
    setRecipient(to);
    setMode('compose');
  }, [searchParams]);

  useEffect(() => {
    let live = true;
    setError(null);
    setSelectedId(null);
    setReporting(false);

    if (view === 'blocked') {
      consoleApi.blocks()
        .then((next) => { if (live) setBlocks(next); })
        .catch((caught: unknown) => {
          if (live) setError(caught instanceof ApiError ? caught.message : 'Could not load blocked players.');
        });
      return () => { live = false; };
    }

    consoleApi.page(view, page)
      .then((next) => { if (live) setData(next); })
      .catch((caught: unknown) => {
        if (live) setError(caught instanceof ApiError ? caught.message : 'Could not load the Console.');
      });
    return () => { live = false; };
  }, [view, page]);

  function changeComposeField(setter: (value: string) => void, value: string) {
    setter(value);
    actionId.current = newActionId();
  }

  async function refreshCurrent() {
    if (view === 'blocked') {
      setBlocks(await consoleApi.blocks());
      return;
    }
    setData(await consoleApi.page(view, page));
  }

  async function openMessage(message: DirectMessageDto) {
    setSelectedId(message.id);
    setMode('detail');
    setReporting(false);
    setReportReason('');

    if (message.direction === 'in' && !message.readAt) {
      try {
        await consoleApi.read(message.id);
        setData((current) => current ? {
          ...current,
          counts: {
            ...current.counts,
            unread: Math.max(0, current.counts.unread - 1),
          },
          messages: current.messages.map((row) =>
            row.id === message.id ? { ...row, readAt: new Date().toISOString() } : row),
        } : current);
      } catch {
        // Opening the message should still work if the read receipt fails.
      }
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const target = Number(recipient.replace(/^#/, ''));
    if (!Number.isSafeInteger(target) || target < 1) {
      setError('Enter a valid public pimp number.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await consoleApi.send({
        recipientPublicPimpId: target,
        subject,
        body,
        actionId: actionId.current,
      });
      setNotice(result.replayed ? 'That message was already delivered.' : 'Message sent.');
      setRecipient('');
      setSubject('');
      setBody('');
      actionId.current = newActionId();
      setMode('detail');
      setView('sent');
      setPage(1);
      setData(await consoleApi.page('sent', 1));
      setSelectedId(result.message.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The message did not go through.');
    } finally {
      setBusy(false);
    }
  }

  function reply(message: DirectMessageDto) {
    setRecipient(String(message.counterpart.publicPimpId));
    setSubject(subjectForReply(message.subject));
    setBody('');
    actionId.current = newActionId();
    setMode('compose');
    setReporting(false);
  }

  async function archive(message: DirectMessageDto, archived: boolean) {
    setBusy(true);
    setError(null);
    try {
      await consoleApi.archive(message.id, archived);
      setSelectedId(null);
      await refreshCurrent();
      setNotice(archived ? 'Message archived.' : 'Message restored.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not update that message.');
    } finally {
      setBusy(false);
    }
  }

  async function report(message: DirectMessageDto) {
    if (!reportReason.trim()) {
      setError('Tell us why you are reporting this message.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await consoleApi.report(message.id, reportReason.trim());
      setData((current) => current ? {
        ...current,
        messages: current.messages.map((row) =>
          row.id === message.id ? { ...row, reported: true } : row),
      } : current);
      setReporting(false);
      setReportReason('');
      setNotice('Report saved for moderation.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not submit that report.');
    } finally {
      setBusy(false);
    }
  }

  async function block(message: DirectMessageDto) {
    setBusy(true);
    setError(null);
    try {
      const next = await consoleApi.block(message.counterpart.publicPimpId);
      setBlocks(next);
      setData((current) => current ? {
        ...current,
        counts: { ...current.counts, blocked: next.blocked.length },
        messages: current.messages.map((row) =>
          row.counterpart.publicPimpId === message.counterpart.publicPimpId
            ? { ...row, blocked: true }
            : row),
      } : current);
      setNotice(`${message.counterpart.displayName} is blocked. Messages are disabled both ways.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not block that player.');
    } finally {
      setBusy(false);
    }
  }

  async function unblock(publicPimpId: number) {
    setBusy(true);
    setError(null);
    try {
      const next = await consoleApi.unblock(publicPimpId);
      setBlocks(next);
      setData((current) => current ? {
        ...current,
        counts: { ...current.counts, blocked: next.blocked.length },
      } : current);
      setNotice('Player unblocked.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not unblock that player.');
    } finally {
      setBusy(false);
    }
  }

  function countFor(key: ConsoleView): number {
    if (!counts) return key === 'blocked' ? blocks?.blocked.length ?? 0 : 0;
    if (key === 'inbox') return counts.inbox;
    if (key === 'sent') return counts.sent;
    if (key === 'archived') return counts.archived;
    return counts.blocked;
  }

  return (
    <GameLayout>
      <div className="se-console">
        <header className="se-console-hero">
          <div>
            <span className="se-eyebrow">0.9.0 · Pimp Console</span>
            <h1>Console</h1>
            <p>Private street mail, kept asynchronous and round-scoped. Blocking is account-wide and survives the season.</p>
          </div>
          <div className="se-console-hero__stats">
            <span><small>Unread</small><strong>{counts?.unread ?? 0}</strong></span>
            <span><small>Inbox</small><strong>{counts?.inbox ?? 0}</strong></span>
            <span><small>Sent</small><strong>{counts?.sent ?? 0}</strong></span>
            <span><small>Blocked</small><strong>{counts?.blocked ?? blocks?.blocked.length ?? 0}</strong></span>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert>{notice}</Alert> : null}

        <section className="se-console-bar">
          <div className="se-console-tabs" role="tablist" aria-label="Console folders">
            {VIEWS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                className={`se-console-tab${view === key ? ' se-console-tab--active' : ''}`}
                onClick={() => {
                  setView(key);
                  setPage(1);
                  setMode('detail');
                }}
              >
                <span>{label}</span>
                <strong>{countFor(key)}</strong>
                {key === 'inbox' && (counts?.unread ?? 0) > 0
                  ? <em>{counts!.unread} unread</em>
                  : null}
              </button>
            ))}
          </div>
          <button type="button" className="se-btn se-btn--primary" onClick={() => setMode('compose')}>
            Compose
          </button>
        </section>

        {view === 'blocked' ? (
          <Panel title="Blocked players" aside={blocks ? `${blocks.blocked.length} current-round` : 'Loading'} className="se-console-panel">
            {!blocks ? <p className="se-muted">Loading blocks...</p> : null}
            {blocks?.blocked.length === 0 ? <p className="se-muted">Nobody in this round is on your block list.</p> : null}
            <div className="se-console-blocks">
              {blocks?.blocked.map((player) => (
                <div key={player.publicPimpId} className="se-console-block">
                  <div>
                    <strong>{player.displayName}</strong>
                    <span className="se-muted se-num">#{player.publicPimpId}</span>
                  </div>
                  <button
                    type="button"
                    className="se-btn se-btn--ghost se-btn--sm"
                    disabled={busy}
                    onClick={() => void unblock(player.publicPimpId)}
                  >
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <section className="se-console-work">
            <Panel
              title={view === 'inbox' ? 'Inbox' : view === 'sent' ? 'Sent mail' : 'Archived mail'}
              aside={data ? `${data.messages.length} of ${data.total}` : 'Loading'}
              flush
              className="se-console-listpanel"
            >
              {!data ? <p className="se-muted se-console-pad">Checking the wire...</p> : null}
              {data && data.messages.length === 0 ? (
                <div className="se-console-empty">
                  <strong>No messages here.</strong>
                  <span>{view === 'inbox' ? 'When another player writes, it will land here.' : 'This folder is clear.'}</span>
                </div>
              ) : null}
              <div className="se-console-list">
                {data?.messages.map((message) => (
                  <button
                    key={message.id}
                    type="button"
                    className={`se-console-message${selectedId === message.id ? ' se-console-message--selected' : ''}${message.direction === 'in' && !message.readAt ? ' se-console-message--unread' : ''}`}
                    onClick={() => void openMessage(message)}
                  >
                    <span className="se-console-message__top">
                      <strong>{message.counterpart.displayName}</strong>
                      <time>{messageTime(message.createdAt)}</time>
                    </span>
                    <span className="se-console-message__subject">{message.subject}</span>
                    <span className="se-console-message__meta">
                      <span className="se-num">#{message.counterpart.publicPimpId}</span>
                      <span>{message.direction === 'in' ? 'Received' : 'Sent'}</span>
                      {message.blocked ? <span>Blocked</span> : null}
                      {message.reported ? <span>Reported</span> : null}
                    </span>
                  </button>
                ))}
              </div>
              {data && data.totalPages > 1 ? (
                <div className="se-console-pagination">
                  <button
                    type="button"
                    className="se-btn se-btn--ghost se-btn--sm"
                    disabled={data.page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </button>
                  <span className="se-num">Page {data.page} / {data.totalPages}</span>
                  <button
                    type="button"
                    className="se-btn se-btn--ghost se-btn--sm"
                    disabled={data.page >= data.totalPages}
                    onClick={() => setPage((current) => Math.min(data.totalPages, current + 1))}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </Panel>

            <div className="se-console-detail">
              {mode === 'compose' ? (
                <Panel title="Compose" aside="Private message" className="se-console-panel">
                  <form className="se-console-compose" onSubmit={(event) => void send(event)}>
                    <label>
                      <span>Recipient pimp #</span>
                      <input
                        className="se-input"
                        inputMode="numeric"
                        value={recipient}
                        placeholder="1042"
                        onChange={(event) => changeComposeField(setRecipient, event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Subject</span>
                      <input
                        className="se-input"
                        maxLength={MESSAGE_SUBJECT_MAX}
                        value={subject}
                        onChange={(event) => changeComposeField(setSubject, event.target.value)}
                      />
                      <small>{subject.length}/{MESSAGE_SUBJECT_MAX}</small>
                    </label>
                    <label>
                      <span>Message</span>
                      <textarea
                        className="se-input se-console-compose__body"
                        maxLength={MESSAGE_BODY_MAX}
                        value={body}
                        onChange={(event) => changeComposeField(setBody, event.target.value)}
                      />
                      <small>{body.length}/{MESSAGE_BODY_MAX}</small>
                    </label>
                    <div className="se-inline-actions">
                      <button
                        type="submit"
                        className="se-btn se-btn--primary"
                        disabled={busy || !recipient.trim() || !subject.trim() || !body.trim()}
                      >
                        {busy ? 'Sending...' : 'Send message'}
                      </button>
                      <button type="button" className="se-btn se-btn--ghost" onClick={() => setMode('detail')}>
                        Cancel
                      </button>
                    </div>
                    <p className="se-hint">Retries reuse the same delivery key until you edit the draft, preventing double sends.</p>
                  </form>
                </Panel>
              ) : selected ? (
                <Panel
                  title={selected.subject}
                  aside={selected.direction === 'in' ? 'Received' : 'Sent'}
                  className="se-console-panel"
                >
                  <article className="se-console-letter">
                    <header>
                      <div>
                        <strong>{selected.counterpart.displayName}</strong>
                        <span className="se-num">#{selected.counterpart.publicPimpId}</span>
                      </div>
                      <time>{messageTime(selected.createdAt)}</time>
                    </header>
                    <p>{selected.body}</p>
                  </article>

                  <div className="se-console-actions">
                    <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => reply(selected)}>
                      Reply
                    </button>
                    <button
                      type="button"
                      className="se-btn se-btn--ghost se-btn--sm"
                      disabled={busy}
                      onClick={() => void archive(selected, !selected.archived)}
                    >
                      {selected.archived ? 'Restore' : 'Archive'}
                    </button>
                    {selected.direction === 'in' && !selected.blocked ? (
                      <button
                        type="button"
                        className="se-btn se-btn--ghost se-btn--sm"
                        disabled={busy}
                        onClick={() => void block(selected)}
                      >
                        Block sender
                      </button>
                    ) : null}
                    {selected.direction === 'in' ? (
                      <button
                        type="button"
                        className="se-btn se-btn--ghost se-btn--sm"
                        onClick={() => setReporting((current) => !current)}
                      >
                        {selected.reported ? 'Update report' : 'Report'}
                      </button>
                    ) : null}
                    <Link className="se-btn se-btn--ghost se-btn--sm" to={`/game/players/${selected.counterpart.publicPimpId}`}>
                      Profile
                    </Link>
                  </div>

                  {reporting && selected.direction === 'in' ? (
                    <div className="se-console-report">
                      <label>
                        <span>Why are you reporting this message?</span>
                        <textarea
                          className="se-input"
                          maxLength={MESSAGE_REPORT_REASON_MAX}
                          value={reportReason}
                          onChange={(event) => setReportReason(event.target.value)}
                        />
                      </label>
                      <div className="se-inline-actions">
                        <button
                          type="button"
                          className="se-btn se-btn--primary se-btn--sm"
                          disabled={busy || !reportReason.trim()}
                          onClick={() => void report(selected)}
                        >
                          Submit report
                        </button>
                        <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setReporting(false)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </Panel>
              ) : (
                <Panel title="Street mail" className="se-console-panel">
                  <div className="se-console-placeholder">
                    <strong>Select a message or start a new one.</strong>
                    <p>Messages are asynchronous. Blocking either account disables private messages in both directions.</p>
                    <button type="button" className="se-btn se-btn--primary" onClick={() => setMode('compose')}>
                      Compose
                    </button>
                  </div>
                </Panel>
              )}
            </div>
          </section>
        )}

        <footer className="se-console-links">
          <span>Existing systems stay authoritative:</span>
          <Link to="/game/alliance">Alliance Wire</Link>
          <Link to="/game/activity">Activity & attacks</Link>
          <Link to="/game/players">Player directory</Link>
        </footer>
      </div>
    </GameLayout>
  );
}
