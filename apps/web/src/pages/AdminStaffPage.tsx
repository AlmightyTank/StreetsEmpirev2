import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { STAFF_ROLE_LABELS, formatNumber, type AdminStaffDto, type AdminStaffRoleChangeDto } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

const SOURCE_TEXT: Record<AdminStaffRoleChangeDto['source'], string> = {
  GAME: 'Admin panel',
  DISCORD: 'Discord /staff',
  CONSOLE: 'Server console',
};

function roleText(role: AdminStaffRoleChangeDto['fromRole']): string {
  return role ? STAFF_ROLE_LABELS[role] : 'Player';
}

/**
 * Admin → Staff: who holds each role, whether they have linked Discord and the forum
 * (where their roles will sync), and every role change. Roles are changed from the
 * account page, which checks rank.
 */
export function AdminStaffPage() {
  const [staff, setStaff] = useState<AdminStaffDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    adminApi.staff()
      .then((result) => { if (live) setStaff(result); })
      .catch((caught: unknown) => { if (live) setError(caught instanceof ApiError ? caught.message : 'Could not load the staff list.'); });
    return () => { live = false; };
  }, []);

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Staff</h1>
          <p className="se-eyebrow">Admin · roles and who holds them</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <Panel title="Staff" aside={staff ? `${formatNumber(staff.members.length)} people` : undefined} flush className="se-mb">
        {staff && staff.assignable.length ? (
          <p className="se-hint se-admin-pad">
            To give someone a role, open their account and use <strong>Change staff role</strong>. You can give:{' '}
            {staff.assignable.map((role) => STAFF_ROLE_LABELS[role]).join(', ')}.
          </p>
        ) : null}
        {!staff ? (
          <p className="se-muted se-admin-pad">{error ? 'Not loaded.' : 'Loading staff...'}</p>
        ) : staff.members.length === 0 ? (
          <p className="se-muted se-admin-pad">No staff yet.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Discord</th>
                  <th>Forum</th>
                  <th>Two-step</th>
                  <th>Last login</th>
                </tr>
              </thead>
              <tbody>
                {staff.members.map((member) => (
                  <tr key={member.accountId}>
                    <td className="se-td--title">
                      <Link to={`/game/admin/accounts/${member.accountId}`}><strong>{member.username}</strong></Link>
                      {member.isActive ? null : <><br /><span className="se-tag se-tag--bad">Deactivated</span></>}
                    </td>
                    <td data-label="Role">
                      <span className="se-tag se-tag--warn">{STAFF_ROLE_LABELS[member.staffRole]}</span>
                      {member.since ? <><br /><span className="se-hint">since {adminWhen(member.since)}</span></> : null}
                    </td>
                    <td data-label="Discord">{member.discordUsername ?? <span className="se-tag se-tag--bad" title="Their Discord role cannot sync until they link Discord.">Not linked</span>}</td>
                    <td data-label="Forum">{member.forumUsername ?? <span className="se-tag se-tag--bad" title="Their forum group cannot sync until they link the forum.">Not linked</span>}</td>
                    <td data-label="Two-step">{member.twoFactorEnabled ? 'Authenticator' : member.discordUsername ? 'Discord sign-in' : <span className="se-tag se-tag--bad">None</span>}</td>
                    <td data-label="Last login">{adminWhen(member.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Role changes" aside="Latest 50" flush>
        {!staff ? null : staff.history.length === 0 ? (
          <p className="se-muted se-admin-pad">No role changes recorded yet.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Change</th>
                  <th>By</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {staff.history.map((change) => (
                  <tr key={change.id}>
                    <td data-label="When">{adminWhen(change.createdAt)}</td>
                    <td className="se-td--title" data-label="Who">
                      {change.accountId ? <Link to={`/game/admin/accounts/${change.accountId}`}>{change.username}</Link> : change.username}
                    </td>
                    <td data-label="Change">{roleText(change.fromRole)} → {roleText(change.toRole)}</td>
                    <td data-label="By">{change.actorUsername} <span className="se-muted">· {SOURCE_TEXT[change.source]}</span></td>
                    <td data-label="Reason">{change.reason}</td>
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
