import type { AdminAccountSummaryDto, AdminAuditEntryDto, AdminSuspensionDto } from '@streets/shared';
import { adminWhen, snapshotJson } from '../utils/admin.js';

type TaggedAccount = Pick<AdminAccountSummaryDto, 'isActive' | 'isAdmin' | 'emailVerified'> & { suspension?: AdminSuspensionDto | null };

export function AccountTags({ account }: { account: TaggedAccount }) {
  const suspension = account.suspension ?? null;
  return (
    <span className="se-admin-tags">
      <span className={`se-tag ${account.isActive ? 'se-tag--good' : 'se-tag--bad'}`}>{account.isActive ? 'Active' : 'Deactivated'}</span>
      {suspension ? (
        <span className="se-tag se-tag--bad" title={`${suspension.reason}${suspension.byUsername ? ` (${suspension.byUsername})` : ''}`}>
          Suspended to {adminWhen(suspension.until)}
        </span>
      ) : null}
      {account.isAdmin ? <span className="se-tag se-tag--warn">Admin</span> : null}
      {account.emailVerified ? null : <span className="se-tag">Unverified</span>}
    </span>
  );
}

/** Admin actions with who, when, why, and the full before/after snapshots on demand. */
export function AuditEntryList({ entries, names, empty = 'No admin actions yet.' }: {
  entries: AdminAuditEntryDto[];
  names?: Map<string, string>;
  empty?: string;
}) {
  if (!entries.length) return <p className="se-muted se-admin-pad">{empty}</p>;
  return (
    <ol className="se-admin-audit">
      {entries.map((entry) => (
        <li className="se-admin-audit__entry" key={entry.id}>
          <div className="se-admin-audit__head">
            <strong>{entry.action}</strong>
            <span className="se-muted">{adminWhen(entry.createdAt)}</span>
          </div>
          <p>
            {entry.actorUsername} · {entry.targetType}
            {entry.targetId ? ` ${names?.get(entry.targetId) ?? entry.targetId}` : ''}
          </p>
          {entry.reason ? <p className="se-hint">Reason: {entry.reason}</p> : null}
          <details className="se-admin-snapshot">
            <summary>Before and after</summary>
            <div className="se-admin-snapshot__grid">
              <div>
                <p className="se-label">Before</p>
                <pre className="se-admin-json">{snapshotJson(entry.before)}</pre>
              </div>
              <div>
                <p className="se-label">After</p>
                <pre className="se-admin-json">{snapshotJson(entry.after)}</pre>
              </div>
            </div>
          </details>
        </li>
      ))}
    </ol>
  );
}
