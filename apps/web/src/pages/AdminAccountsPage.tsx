import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AdminAccountStatusFilter, AdminAccountSummaryDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AccountTags } from '../components/AdminParts.js';
import { Alert } from '../components/Alert.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

export function AdminAccountsPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AdminAccountStatusFilter>('all');
  const [accounts, setAccounts] = useState<AdminAccountSummaryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (nextQuery: string, nextStatus: AdminAccountStatusFilter) => {
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi.accounts({ query: nextQuery.trim() || undefined, status: nextStatus });
      setAccounts(result.accounts);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not search accounts.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void search('', 'all');
  }, [search]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void search(query, status);
  }

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Accounts</h1>
          <p className="se-eyebrow">Admin · search, moderate, inspect</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <Panel title="Search" className="se-mb">
        <form className="se-admin-filters" onSubmit={submit} noValidate>
          <Field
            id="admin-account-query"
            label="Name, email, Discord or #pimp id"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={80}
          />
          <div className="se-field">
            <label className="se-label" htmlFor="admin-account-status">Status</label>
            <select
              id="admin-account-status"
              className="se-input"
              value={status}
              onChange={(event) => setStatus(event.target.value as AdminAccountStatusFilter)}
            >
              <option value="all">All accounts</option>
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
              <option value="admin">Admins</option>
            </select>
          </div>
          <div className="se-field">
            <button className="se-btn se-btn--primary se-btn--block" disabled={busy}>{busy ? 'Searching...' : 'Search'}</button>
          </div>
        </form>
      </Panel>

      <Panel title="Accounts" aside={accounts ? `${formatNumber(accounts.length)} shown` : undefined} flush>
        {!accounts ? (
          <p className="se-muted se-admin-pad">Loading accounts...</p>
        ) : accounts.length === 0 ? (
          <p className="se-muted se-admin-pad">No accounts match that search.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Discord</th>
                  <th>Forum</th>
                  <th className="se-table__number">Sessions</th>
                  <th className="se-table__number">Rounds</th>
                  <th>Last login</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>
                      <Link to={`/game/admin/accounts/${account.id}`}><strong>{account.username}</strong></Link>
                      <br />
                      <span className="se-muted">{account.email}</span>
                    </td>
                    <td><AccountTags account={account} /></td>
                    <td>{account.discordUsername ?? <span className="se-muted">-</span>}</td>
                    <td>{account.forumUsername ?? <span className="se-muted">-</span>}</td>
                    <td className="se-table__number se-num">{formatNumber(account.activeSessions)}</td>
                    <td className="se-table__number se-num">{formatNumber(account.roundsPlayed)}</td>
                    <td>{adminWhen(account.lastLoginAt)}</td>
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
