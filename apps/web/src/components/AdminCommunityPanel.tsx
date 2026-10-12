import { useState, type FormEvent } from 'react';
import {
  ADMIN_DISCORD_TIMEOUT_LENGTHS,
  ADMIN_SUSPENSION_LENGTHS,
  type AdminCommunityDto,
  type AdminDiscordTimeoutLength,
  type AdminSuspensionLength,
} from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { adminWhen } from '../utils/admin.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel, Row } from './Panel.js';

type Pending = 'forum-suspend' | 'forum-lift' | 'discord-timeout' | 'discord-lift';

const PENDING_TEXT: Record<Pending, { label: string; copy: string }> = {
  'forum-suspend': { label: 'Suspend on the forum', copy: 'They can read the forum but not post until it ends. The forum shows them the reason.' },
  'forum-lift': { label: 'Lift forum suspension', copy: 'They can post on the forum again now.' },
  'discord-timeout': { label: 'Time out on Discord', copy: 'They stay in the server but cannot post, react or join voice until it ends. Discord caps a timeout at 28 days.' },
  'discord-lift': { label: 'Remove Discord timeout', copy: 'They can post in the Discord server again now.' },
};

/**
 * 1.7. The player on the forum and Discord beside their game account: status, the
 * suspend and timeout actions each platform allows, and their support tickets.
 * Every action is audited on the game's side as well as recorded where it lands.
 */
export function AdminCommunityPanel({ accountId, isSelf, community, loadError, onChange }: {
  accountId: string;
  isSelf: boolean;
  community: AdminCommunityDto | null;
  loadError: string | null;
  onChange: (community: AdminCommunityDto) => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [forumLength, setForumLength] = useState<AdminSuspensionLength>('7d');
  const [timeoutLength, setTimeoutLength] = useState<AdminDiscordTimeoutLength>('1d');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function choose(next: Pending) {
    setPending(next);
    setReason('');
    setError(null);
    setNotice(null);
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError(null);
    const why = reason.trim();
    try {
      const updated = pending === 'forum-suspend' ? await adminApi.forumSuspend(accountId, forumLength, why)
        : pending === 'forum-lift' ? await adminApi.forumUnsuspend(accountId, why)
          : pending === 'discord-timeout' ? await adminApi.discordTimeout(accountId, timeoutLength, why)
            : await adminApi.discordUntimeout(accountId, why);
      onChange(updated);
      setNotice(`${PENDING_TEXT[pending].label}: done.`);
      setPending(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not go through. Refresh before trying again.');
    } finally {
      setBusy(false);
    }
  }

  if (!community) {
    return (
      <Panel title="Community" className="se-mb">
        {loadError ? <Alert>{loadError}</Alert> : <p className="se-muted">Checking the forum and Discord...</p>}
      </Panel>
    );
  }

  const { forum, discord, tickets } = community;
  const button = (next: Pending) => (
    <Button key={next} type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => choose(next)} disabledReason={busy ? 'Working...' : null}>
      {PENDING_TEXT[next].label}
    </Button>
  );

  return (
    <Panel title="Community" aside="Forum and Discord" className="se-mb">
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      <div className="se-grid se-grid--2">
        <div>
          <p className="se-label">Forum</p>
          {forum.linked ? (
            <div className="se-rows">
              <Row label="Account" value={<a href={forum.profileUrl} target="_blank" rel="noreferrer">{forum.username}</a>} />
              <Row label="Status" value={forum.problem ? 'Unknown' : forum.suspendedUntil ? `Suspended until ${adminWhen(forum.suspendedUntil)}` : 'Can post'} />
              {forum.problem ? <p className="se-hint">{forum.problem}</p> : null}
              {!isSelf && forum.moderationEnabled && !forum.problem ? (
                <div className="se-admin-moderation se-mt">{button(forum.suspendedUntil ? 'forum-lift' : 'forum-suspend')}</div>
              ) : null}
            </div>
          ) : <p className="se-hint">No forum account linked.</p>}
        </div>
        <div>
          <p className="se-label">Discord</p>
          {discord.linked ? (
            <div className="se-rows">
              <Row label="Member" value={discord.inServer ? discord.displayName ?? 'In the server' : 'Not in the server'} />
              <Row label="Status" value={discord.timedOutUntil ? `Timed out until ${adminWhen(discord.timedOutUntil)}` : discord.inServer ? 'Can post' : '-'} />
              {discord.problem ? <p className="se-hint">{discord.problem}</p> : null}
              {!isSelf && discord.moderationEnabled && discord.canModerate ? (
                <div className="se-admin-moderation se-mt">{button(discord.timedOutUntil ? 'discord-lift' : 'discord-timeout')}</div>
              ) : null}
            </div>
          ) : <p className="se-hint">No Discord account linked.</p>}
        </div>
      </div>

      {pending ? (
        <form onSubmit={confirm} noValidate className="se-mt">
          <p><strong>{PENDING_TEXT[pending].label}.</strong> {PENDING_TEXT[pending].copy}</p>
          {pending === 'forum-suspend' ? (
            <div className="se-field">
              <label className="se-label" htmlFor="community-forum-length">How long</label>
              <select id="community-forum-length" className="se-input" value={forumLength} onChange={(event) => setForumLength(event.target.value as AdminSuspensionLength)}>
                {ADMIN_SUSPENSION_LENGTHS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </div>
          ) : null}
          {pending === 'discord-timeout' ? (
            <div className="se-field">
              <label className="se-label" htmlFor="community-timeout-length">How long</label>
              <select id="community-timeout-length" className="se-input" value={timeoutLength} onChange={(event) => setTimeoutLength(event.target.value as AdminDiscordTimeoutLength)}>
                {ADMIN_DISCORD_TIMEOUT_LENGTHS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </div>
          ) : null}
          <div className="se-field">
            <label className="se-label" htmlFor="community-reason">Reason</label>
            <textarea id="community-reason" className="se-input se-admin-reason" rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
            <p className="se-hint">Saved to the game's audit log{pending === 'forum-suspend' ? ' and shown to them on the forum' : pending === 'discord-timeout' ? " and Discord's audit log" : ''}. At least 5 characters.</p>
          </div>
          {error ? <Alert>{error}</Alert> : null}
          <div className="se-cta">
            <Button className="se-btn se-btn--primary" disabledReason={busy ? 'Working...' : reason.trim().length < 5 ? 'The audit log needs a reason of at least 5 characters.' : null}>
              {busy ? 'Working...' : 'Confirm'}
            </Button>
            <Button type="button" className="se-btn se-btn--ghost" onClick={() => setPending(null)} disabledReason={busy ? 'Working...' : null}>Cancel</Button>
          </div>
        </form>
      ) : null}

      <p className="se-label se-mt">Support tickets</p>
      {tickets.length ? (
        <ul className="se-admin-tickets">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              {ticket.threadUrl ? <a href={ticket.threadUrl} target="_blank" rel="noreferrer">{ticket.subject}</a> : ticket.subject}
              <span className="se-muted"> · opened {adminWhen(ticket.createdAt)} · {ticket.closedAt ? `closed by ${ticket.closedByName ?? 'staff'}` : 'open'}</span>
            </li>
          ))}
        </ul>
      ) : <p className="se-hint">No /support tickets.</p>}
    </Panel>
  );
}
