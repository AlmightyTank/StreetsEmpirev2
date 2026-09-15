import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminSignal, AdminSignalsDto } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AccountTags } from '../components/AdminParts.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

const signalText: Record<AdminSignal, { label: string; tone: string }> = {
  'shared-network': { label: 'Same network', tone: '' },
  'same-device': { label: 'Same browser', tone: ' se-tag--warn' },
  'created-together': { label: 'Created within 30 min', tone: ' se-tag--bad' },
};

export function AdminSignalsPage() {
  const [data, setData] = useState<AdminSignalsDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.signals()
      .then(setData)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load multi-account signals.'));
  }, []);

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Signals</h1>
          <p className="se-eyebrow">Admin · possible multi-accounts, matches only</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <Panel title="How to read this" className="se-mb">
        <p>
          Accounts seen from the same network in the last {data?.windowDays ?? 30} days, from sessions and email or password links.
          Households, schools and phone carriers share networks, so a match is a reason to look closer, never proof.
        </p>
        <p className="se-hint">Addresses and browser strings are never shown. The key tells groups apart and stays the same on this server.</p>
      </Panel>

      {!data ? (
        <p className="se-muted">Looking for matches...</p>
      ) : data.clusters.length === 0 ? (
        <Panel title="No matches"><p className="se-muted">No two accounts share a network in this window.</p></Panel>
      ) : (
        data.clusters.map((cluster) => (
          <Panel key={cluster.key} title={`Match ${cluster.key}`} aside={`last seen ${adminWhen(cluster.lastSeenAt)}`} flush className="se-mb">
            <div className="se-admin-pad">
              <span className="se-admin-tags">
                {cluster.signals.map((signal) => <span key={signal} className={`se-tag${signalText[signal].tone}`}>{signalText[signal].label}</span>)}
              </span>
            </div>
            <div className="se-tablewrap">
              <table className="se-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Status</th>
                    <th>Device</th>
                    <th>Created</th>
                    <th>Last login</th>
                    <th className="se-table__number">Sightings</th>
                  </tr>
                </thead>
                <tbody>
                  {cluster.accounts.map((account) => (
                    <tr key={account.id}>
                      <td><Link to={`/game/admin/accounts/${account.id}`}>{account.username}</Link></td>
                      <td><AccountTags account={{ isActive: account.isActive, isAdmin: account.isAdmin, emailVerified: true }} /></td>
                      <td>{account.device}</td>
                      <td>{adminWhen(account.createdAt)}</td>
                      <td>{adminWhen(account.lastLoginAt)}</td>
                      <td className="se-table__number se-num">{account.sightings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        ))
      )}
    </GameLayout>
  );
}
