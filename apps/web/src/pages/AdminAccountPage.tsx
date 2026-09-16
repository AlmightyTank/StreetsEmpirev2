import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AdminAccountAction, AdminAccountDetailDto, AdminSuspensionLength, RoundStatus } from '@streets/shared';
import { ADMIN_SUSPENSION_LENGTHS, formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AccountTags, AuditEntryList } from '../components/AdminParts.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { adminWhen } from '../utils/admin.js';

const actionText: Record<AdminAccountAction, { label: string; copy: string }> = {
  deactivate: { label: 'Deactivate', copy: 'Signs them out everywhere, hides them from rankings and raid targets, and blocks login until an admin reactivates them.' },
  reactivate: { label: 'Reactivate', copy: 'Lets them log in again and puts them back in rankings.' },
  suspend: { label: 'Suspend', copy: 'A cool-off with an end date. Signs them out now, refuses login until it passes, and shows them the reason and the date. It lifts itself - no admin has to remember.' },
  'lift-suspension': { label: 'Lift suspension', copy: 'Ends the suspension now. They can log straight back in.' },
  'revoke-sessions': { label: 'Sign out everywhere', copy: 'Ends every active session. They can log straight back in.' },
  rename: { label: 'Rename', copy: 'Changes their pimp name and the name on every round they played, archived results included.' },
  'reset-profile': { label: 'Reset profile', copy: 'Clears their profile title and featured badges and resets their accent.' },
  'grant-admin': { label: 'Make admin', copy: 'Gives full admin panel access. Everything they do there is audited.' },
  'revoke-admin': { label: 'Remove admin', copy: 'Removes admin panel access.' },
  'resend-verification': { label: 'Resend verification email', copy: 'Sends a fresh verification link to their current email address.' },
  'mark-email-verified': { label: 'Mark email verified', copy: 'Marks their current email as verified without a link. Only do this once you have confirmed they own it.' },
  'unlink-forum': { label: 'Unlink forum', copy: 'Removes the connection to their forum account on both sides. They can link again from their account settings.' },
  'resync-discord': { label: 'Resync Discord roles', copy: 'Asks the Discord bot to re-check their roles on its next pass, about a minute.' },
};

const DESTRUCTIVE: AdminAccountAction[] = ['deactivate', 'suspend', 'revoke-admin', 'unlink-forum'];

function statusTone(status: RoundStatus): string {
  if (status === 'ACTIVE') return ' se-tag--good';
  if (status === 'SCHEDULED' || status === 'REGISTRATION') return ' se-tag--warn';
  return '';
}

interface Pending {
  action: AdminAccountAction;
  sessionId?: string;
}

export function AdminAccountPage() {
  const { accountId = '' } = useParams();
  const myAccountId = useSession((s) => s.account?.id);
  const [detail, setDetail] = useState<AdminAccountDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const [newName, setNewName] = useState('');
  const [length, setLength] = useState<AdminSuspensionLength>('7d');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await adminApi.account(accountId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load that account.');
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  function choose(action: AdminAccountAction, sessionId?: string) {
    setPending(sessionId ? { action, sessionId } : { action });
    setReason('');
    setNewName(action === 'rename' ? detail?.account.username ?? '' : '');
    setFields({});
    setError(null);
    setNotice(null);
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError(null);
    setFields({});
    const why = reason.trim();
    try {
      const run = async (): Promise<AdminAccountDetailDto> => {
        switch (pending.action) {
          case 'deactivate': return adminApi.deactivateAccount(accountId, why);
          case 'reactivate': return adminApi.reactivateAccount(accountId, why);
          case 'suspend': return adminApi.suspendAccount(accountId, length, why);
          case 'lift-suspension': return adminApi.liftSuspension(accountId, why);
          case 'revoke-sessions': return adminApi.revokeSessions(accountId, why, pending.sessionId);
          case 'rename': return adminApi.renameAccount(accountId, newName.trim(), why);
          case 'reset-profile': return adminApi.resetProfile(accountId, why);
          case 'grant-admin': return adminApi.setAdmin(accountId, true, why);
          case 'revoke-admin': return adminApi.setAdmin(accountId, false, why);
          case 'resend-verification': return adminApi.resendVerification(accountId, why);
          case 'mark-email-verified': return adminApi.markEmailVerified(accountId, why);
          case 'unlink-forum': return adminApi.unlinkForum(accountId, why);
          case 'resync-discord':
            await adminApi.requestDiscordResync({ accountId, reason: why });
            return adminApi.account(accountId);
        }
      };
      const updated = await run();
      setDetail(updated);
      setNotice(`${pending.sessionId ? 'Sign out this session' : actionText[pending.action].label}: done for ${updated.account.username}.`);
      setPending(null);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields(caught.fields ?? {});
        setError(caught.message);
      } else {
        setError('That action did not go through. Refresh before trying again.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <GameLayout>
        {error ? <Alert>{error}</Alert> : <p className="se-muted">Loading account...</p>}
      </GameLayout>
    );
  }

  const { account, email, forumLink, discord } = detail;
  const isSelf = account.id === myAccountId;
  const accountActions: AdminAccountAction[] = [
    account.isActive ? 'deactivate' : 'reactivate',
    ...(account.suspension ? ['lift-suspension' as const] : account.isActive && !account.isAdmin ? ['suspend' as const] : []),
    'revoke-sessions',
    'rename',
    'reset-profile',
    ...(account.isAdmin ? ['revoke-admin' as const] : account.isActive ? ['grant-admin' as const] : []),
  ];
  const linkActions: AdminAccountAction[] = [
    ...(!email.verifiedAt && email.sendingEnabled ? ['resend-verification' as const] : []),
    ...(!email.verifiedAt ? ['mark-email-verified' as const] : []),
    ...(forumLink ? ['unlink-forum' as const] : []),
    ...(discord.linked && discord.botApiEnabled ? ['resync-discord' as const] : []),
  ];
  const reasonTooShort = reason.trim().length < 5;
  const working = 'The last admin action is still going through.';

  const actionButton = (action: AdminAccountAction) => (
    <Button
      type="button"
      key={action}
      className={`se-btn se-btn--sm${DESTRUCTIVE.includes(action) ? '' : ' se-btn--ghost'}`}
      onClick={() => choose(action)}
      disabledReason={busy ? working : null}
    >
      {actionText[action].label}
    </Button>
  );

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">{account.username}</h1>
          <p className="se-eyebrow"><Link to="/game/admin/accounts">Accounts</Link> · {account.email}</p>
          <AccountTags account={account} />
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}

      <div className="se-stats se-mb">
        <Stat label="Rounds played" value={formatNumber(account.roundsPlayed)} />
        <Stat label="Active sessions" value={formatNumber(account.activeSessions)} />
        <Stat label="Joined" value={adminWhen(account.createdAt)} />
        <Stat label="Last login" value={adminWhen(account.lastLoginAt)} />
      </div>

      {pending ? (
        <Panel title={`${pending.sessionId ? 'Sign out this session' : actionText[pending.action].label}: ${account.username}`} className="se-mb">
          <form onSubmit={confirm} noValidate>
            <p>{pending.sessionId ? 'Ends this one session. They can log straight back in.' : actionText[pending.action].copy}</p>
            {pending.action === 'suspend' ? (
              <div className="se-field">
                <label className="se-label" htmlFor="admin-suspend-length">How long</label>
                <select id="admin-suspend-length" className="se-input" value={length} onChange={(event) => setLength(event.target.value as AdminSuspensionLength)}>
                  {ADMIN_SUSPENSION_LENGTHS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
                <p className="se-hint">Ends {new Date(Date.now() + (ADMIN_SUSPENSION_LENGTHS.find((option) => option.key === length)?.hours ?? 0) * 3_600_000).toLocaleString()}.</p>
              </div>
            ) : null}
            {pending.action === 'rename' ? (
              <Field
                id="admin-rename"
                label="New pimp name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                maxLength={20}
                error={fields.username}
                hint="3 to 20 letters, numbers, underscores or hyphens."
              />
            ) : null}
            <div className="se-field">
              <label className="se-label" htmlFor="admin-account-reason">Reason</label>
              <textarea
                id="admin-account-reason"
                className="se-input se-admin-reason"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              {fields.reason ? <p className="se-error">{fields.reason}</p> : (
                <p className="se-hint">
                  Saved to the audit log. At least 5 characters.
                  {pending.action === 'suspend' ? ' The player is shown this reason when they try to log in.' : ''}
                </p>
              )}
            </div>
            <div className="se-cta se-mt">
              <Button className="se-btn se-btn--primary"
                disabledReason={busy ? working
                  : reasonTooShort ? 'The audit log needs a reason of at least 5 characters.'
                    : pending.action === 'rename' && newName.trim().length < 3 ? 'A new name needs at least 3 characters.'
                      : null}>
                {busy ? 'Working...' : 'Confirm'}
              </Button>
              <Button type="button" className="se-btn se-btn--ghost" onClick={() => setPending(null)} disabledReason={busy ? working : null}>Cancel</Button>
            </div>
          </form>
        </Panel>
      ) : null}

      <div className="se-grid se-grid--2 se-mb">
        <Panel title="Account" flush>
          <div className="se-rows">
            <Row label="Email" value={account.email} />
            {account.suspension ? (
              <Row
                label="Suspended until"
                value={`${adminWhen(account.suspension.until)}${account.suspension.byUsername ? ` by ${account.suspension.byUsername}` : ''}`}
                strong
              />
            ) : null}
            {account.suspension?.reason ? <Row label="Suspension reason" value={account.suspension.reason} /> : null}
            <Row label="Email verified" value={email.verifiedAt ? adminWhen(email.verifiedAt) : 'No'} />
            <Row label="Discord" value={discord.username ?? (discord.linked ? 'Linked' : '-')} />
            <Row
              label="Forum"
              value={forumLink ? <a href={forumLink.profileUrl} target="_blank" rel="noreferrer">{forumLink.forumUsername}</a> : '-'}
            />
            <Row label="Profile title" value={detail.profile.activeTitleKey ?? '-'} />
            <Row label="Accent" value={detail.profile.profileAccent} />
            <Row label="Featured badges" value={formatNumber(detail.profile.featuredBadgeKeys.length)} />
            <Row label="Account id" value={account.id} />
          </div>
        </Panel>

        <Panel title="Moderation">
          {isSelf ? (
            <p className="se-hint">This is your own account. Another admin has to moderate it.</p>
          ) : (
            <>
              <p className="se-label">Account</p>
              <div className="se-admin-moderation">{accountActions.map(actionButton)}</div>
              <p className="se-label se-mt">Email, forum and Discord</p>
              {linkActions.length ? (
                <div className="se-admin-moderation">{linkActions.map(actionButton)}</div>
              ) : (
                <p className="se-hint">Nothing to do: {email.verifiedAt ? 'the email is verified' : 'the mailer is off'}, {forumLink ? 'the forum is linked' : 'no forum link'}, {discord.linked ? (discord.botApiEnabled ? 'Discord is linked' : 'the bot API is off') : 'no Discord link'}.</p>
              )}
              {!email.verifiedAt && !email.sendingEnabled ? (
                <p className="se-hint se-mt">Resending is unavailable because the server has no mailer configured.</p>
              ) : null}
            </>
          )}
          <p className="se-hint se-mt">
            <Link to={`/game/admin/audit?targetType=account&targetId=${account.id}`}>Full audit history for this account</Link>
          </p>
        </Panel>
      </div>

      <Panel title="Sessions" aside="Device only, no IP addresses" flush className="se-mb">
        {detail.sessions.length === 0 ? (
          <p className="se-muted se-admin-pad">No active sessions.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Started</th>
                  <th>Last seen</th>
                  <th>Expires</th>
                  <th className="se-table__number">Actions</th>
                </tr>
              </thead>
              <tbody>
                {detail.sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="se-td--title">{session.device}</td>
                    <td data-label="Created">{adminWhen(session.createdAt)}</td>
                    <td data-label="Last seen">{adminWhen(session.lastSeenAt)}</td>
                    <td data-label="Expires">{adminWhen(session.expiresAt)}</td>
                    <td className="se-table__number" data-label="Actions">
                      {isSelf ? <span className="se-muted">-</span> : (
                        <Button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => choose('revoke-sessions', session.id)} disabledReason={busy ? working : null}>
                          Sign out
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Rounds played" flush className="se-mb">
        {detail.rounds.length === 0 ? (
          <p className="se-muted se-admin-pad">This account has not joined a round.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Round</th>
                  <th>Player</th>
                  <th className="se-table__number">Net worth</th>
                  <th className="se-table__number">National</th>
                  <th className="se-table__number">Local</th>
                  <th className="se-table__number">Inspect</th>
                </tr>
              </thead>
              <tbody>
                {detail.rounds.map((round) => (
                  <tr key={round.roundPlayerId}>
                    <td className="se-td--title">
                      <strong>{round.roundName}</strong>
                      <br />
                      <span className={`se-tag${statusTone(round.roundStatus)}`}>{round.roundStatus}</span>
                    </td>
                    <td data-label="Player">{round.displayName} <span className="se-muted">#{round.publicPimpId}</span></td>
                    <td className="se-table__number se-num" data-label="Net worth">{formatCents(round.netWorthCents)}</td>
                    <td className="se-table__number se-num" data-label="National">{round.nationalRank ? `#${round.nationalRank}` : '-'}</td>
                    <td className="se-table__number se-num" data-label="Local">{round.localRank ? `#${round.localRank}` : '-'}</td>
                    <td className="se-table__number" data-label="Actions">
                      <Link className="se-btn se-btn--sm se-btn--ghost" to={`/game/admin/players/${round.roundPlayerId}`}>Inspect</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Admin history" aside="Latest 25" flush>
        <AuditEntryList entries={detail.audit} empty="No admin actions on this account yet." />
      </Panel>
    </GameLayout>
  );
}
