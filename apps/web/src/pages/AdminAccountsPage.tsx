import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AdminAccountStatusFilter, AdminAccountSummaryDto, AdminPlayerSearchDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AccountTags } from '../components/AdminParts.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

export function AdminAccountsPage() {
  const [searchParams] = useSearchParams();
  const accountMessage = searchParams.get('accountMessage');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<AdminAccountStatusFilter>('all');
  const [accounts, setAccounts] = useState<AdminAccountSummaryDto[] | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<AdminAccountSummaryDto[] | null>(null);
  const [pendingBusyId, setPendingBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(accountMessage);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playerQuery, setPlayerQuery] = useState('');
  const [players, setPlayers] = useState<AdminPlayerSearchDto | null>(null);
  const [playerBusy, setPlayerBusy] = useState(false);

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

  const loadPending = useCallback(async () => {
    try {
      const result = await adminApi.accounts({ status: 'beta-pending', limit: 50 });
      setPendingApprovals(result.accounts);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load pending beta approvals.');
    }
  }, []);

  useEffect(() => {
    void search('', 'all');
    void loadPending();
  }, [search, loadPending]);

  async function approvePending(account: AdminAccountSummaryDto) {
    setPendingBusyId(account.id);
    setError(null);
    setNotice(null);
    try {
      await adminApi.setBetaApproved(account.id, true, 'Approved from pending beta approvals queue.');
      setNotice(`${account.username} now has beta access.`);
      await Promise.all([loadPending(), search(query, status)]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not approve that beta account.');
    } finally {
      setPendingBusyId(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void search(query, status);
  }

  async function searchPlayers(event: FormEvent) {
    event.preventDefault();
    const needle = playerQuery.trim();
    if (!needle) return;
    setPlayerBusy(true);
    setError(null);
    try {
      setPlayers(await adminApi.players({ query: needle }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not search players.');
    } finally {
      setPlayerBusy(false);
    }
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
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}

      <Panel
        title="Pending Beta Approvals"
        aside={pendingApprovals ? `${formatNumber(pendingApprovals.length)} waiting` : undefined}
        flush
        className="se-mb"
      >
        {pendingApprovals === null ? (
          <p className="se-muted se-admin-pad">Loading pending approvals...</p>
        ) : pendingApprovals.length === 0 ? (
          <p className="se-muted se-admin-pad">No accounts are waiting for beta approval.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Requested</th>
                  <th>Discord</th>
                  <th>Email</th>
                  <th className="se-table__number">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingApprovals.map((account) => (
                  <tr key={account.id}>
                    <td className="se-td--title">
                      <Link to={`/game/admin/accounts/${account.id}`}><strong>{account.username}</strong></Link>
                      <br />
                      <span className="se-tag se-tag--warn">Pending beta</span>
                    </td>
                    <td data-label="Requested">{adminWhen(account.createdAt)}</td>
                    <td data-label="Discord">{account.discordUsername ?? <span className="se-muted">-</span>}</td>
                    <td data-label="Email">{account.email}</td>
                    <td className="se-table__number" data-label="Actions">
                      <div className="se-admin-moderation">
                        <Button
                          type="button"
                          className="se-btn se-btn--sm se-btn--primary"
                          onClick={() => void approvePending(account)}
                          disabledReason={pendingBusyId ? 'An approval is still being saved.' : null}
                        >
                          {pendingBusyId === account.id ? 'Approving...' : 'Approve'}
                        </Button>
                        <Link className="se-btn se-btn--sm se-btn--ghost" to={`/game/admin/accounts/${account.id}`}>Review</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

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
              <option value="suspended">Suspended</option>
              <option value="beta-pending">Pending beta approval</option>
              <option value="admin">Admins</option>
            </select>
          </div>
          <div className="se-field">
            <Button className="se-btn se-btn--primary se-btn--block" disabledReason={busy ? 'Still searching for the last query.' : null}>{busy ? 'Searching...' : 'Search'}</Button>
          </div>
        </form>
      </Panel>

      <Panel title="Find a player" className="se-mb">
        <p className="se-hint">
          A dispute usually names a pimp, not an account. Search a pimp name or public id to open the inspector.
        </p>
        <form className="se-admin-filters" onSubmit={searchPlayers} noValidate>
          <Field
            id="admin-player-query"
            label="Pimp name or #id"
            value={playerQuery}
            onChange={(event) => setPlayerQuery(event.target.value)}
            maxLength={80}
          />
          <div className="se-field">
            <Button className="se-btn se-btn--primary se-btn--block"
              disabledReason={playerBusy ? 'Still looking for the last name.' : playerQuery.trim().length < 1 ? 'Type a pimp name or public id first.' : null}>
              {playerBusy ? 'Looking...' : 'Find player'}
            </Button>
          </div>
        </form>

        {players === null ? null : players.players.length === 0 ? (
          <p className="se-muted">No player in any round matches that.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Round</th>
                  <th>City</th>
                  <th className="se-table__number">Net worth</th>
                  <th>Account</th>
                  <th>Last active</th>
                </tr>
              </thead>
              <tbody>
                {players.players.map((player) => (
                  <tr key={player.roundPlayerId}>
                    <td className="se-td--title">
                      <Link to={`/game/admin/players/${player.roundPlayerId}`}><strong>{player.displayName}</strong></Link>
                      <br />
                      <span className="se-muted">#{player.publicPimpId}{player.nationalRank ? ` · rank ${player.nationalRank}` : ''}</span>
                    </td>
                    <td data-label="Round">
                      <Link to={`/game/admin/rounds/${player.roundId}`}>{player.roundName}</Link>
                      <br />
                      <span className={`se-tag${player.roundStatus === 'ACTIVE' ? ' se-tag--good' : player.roundStatus === 'REGISTRATION' ? ' se-tag--warn' : ''}`}>{player.roundStatus}</span>
                    </td>
                    <td data-label="City">{player.city}</td>
                    <td className="se-table__number se-num" data-label="Net worth">{formatCents(player.netWorthCents)}</td>
                    <td data-label="Account">
                      <Link to={`/game/admin/accounts/${player.account.id}`}>{player.account.username}</Link>
                      {player.account.isActive ? null : <span className="se-tag se-tag--bad">Deactivated</span>}
                      {player.account.suspended ? <span className="se-tag se-tag--bad">Suspended</span> : null}
                    </td>
                    <td data-label="Last active">{adminWhen(player.lastActiveAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {players.truncated ? <p className="se-hint se-admin-pad">More players matched than are shown. Narrow the name or use the public id.</p> : null}
          </div>
        )}
      </Panel>

      <Panel title="Accounts" aside={accounts ? `${formatNumber(accounts.length)} shown` : undefined} flush>
        {!accounts ? (
          <p className="se-muted se-admin-pad">Loading accounts...</p>
        ) : accounts.length === 0 ? (
          <p className="se-muted se-admin-pad">No accounts match that search.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
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
                    <td className="se-td--title">
                      <Link to={`/game/admin/accounts/${account.id}`}><strong>{account.username}</strong></Link>
                      <br />
                      <span className="se-muted">{account.email}</span>
                    </td>
                    <td data-label="Status"><AccountTags account={account} /></td>
                    <td data-label="Discord">{account.discordUsername ?? <span className="se-muted">-</span>}</td>
                    <td data-label="Forum">{account.forumUsername ?? <span className="se-muted">-</span>}</td>
                    <td className="se-table__number se-num" data-label="Sessions">{formatNumber(account.activeSessions)}</td>
                    <td className="se-table__number se-num" data-label="Rounds">{formatNumber(account.roundsPlayed)}</td>
                    <td data-label="Last login">{adminWhen(account.lastLoginAt)}</td>
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
