import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminVehicleRoundDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AdminRoundPicker, useAdminRound } from '../components/AdminRoundPicker.js';
import { Alert } from '../components/Alert.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

/** 1.5.0-E. Vehicle health for staff: where the round's cars are, what the garage takes, and runs that do not add up. */
export function AdminVehiclesPage() {
  const { rounds, roundId, setRoundId, error: roundsError } = useAdminRound();
  const [data, setData] = useState<AdminVehicleRoundDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) return;
    setData(null);
    setError(null);
    adminApi.vehicles(roundId)
      .then(setData)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load vehicles.'));
  }, [roundId]);

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Vehicles</h1>
          <p className="se-eyebrow">Admin · fleets, the garage and corrections</p>
        </div>
        <AdminRoundPicker rounds={rounds} roundId={roundId} onChange={setRoundId} />
      </div>
      {roundsError || error ? <Alert>{roundsError ?? error}</Alert> : null}
      {!data ? <p className="se-muted">Counting cars...</p> : !data.enabled ? (
        <Panel title="No vehicle classes in this round">
          <p className="se-muted">This round runs {data.rulesetId}, which only has Low-Riders.</p>
        </Panel>
      ) : (
        <>
          <Panel title="Garage health" aside={`updated ${adminWhen(data.generatedAt)}`} className="se-mb">
            <div className="se-stats">
              <Stat label="Garage · 24h" value={`${formatCents(data.service24h.spentCents)} · ${formatNumber(data.service24h.entries)}`} />
              <Stat label="Garage · 7d" value={`${formatCents(data.service7d.spentCents)} · ${formatNumber(data.service7d.entries)}`} />
              <Stat label="Sedan & Van sales · 7d" value={`${formatCents(data.purchases7d.spentCents)} · ${formatNumber(data.purchases7d.entries)}`} />
              <Stat label="Staff corrections · 7d" value={formatNumber(data.adjustments7d)} />
            </div>
          </Panel>

          <Panel title="The round's fleet" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead>
                  <tr><th>Class</th><th className="se-table__number">Ready</th><th className="se-table__number">Away</th><th className="se-table__number">Damaged</th><th className="se-table__number">Disabled</th></tr>
                </thead>
                <tbody>{data.fleet.map((row) => (
                  <tr key={row.classId}>
                    <td className="se-td--title">{row.name}</td>
                    <td data-label="Ready" className="se-table__number se-num">{formatNumber(row.ready)}</td>
                    <td data-label="Away" className="se-table__number se-num">{formatNumber(row.away)}</td>
                    <td data-label="Damaged" className="se-table__number se-num">{formatNumber(row.damaged)}</td>
                    <td data-label="Disabled" className="se-table__number se-num">{formatNumber(row.disabled)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Largest fleets" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead>
                  <tr><th>Player</th><th className="se-table__number">Ready</th><th className="se-table__number">Away</th><th className="se-table__number">Damaged</th><th className="se-table__number">Disabled</th></tr>
                </thead>
                <tbody>{data.players.length ? data.players.map((row) => (
                  <tr key={row.roundPlayerId}>
                    <td className="se-td--title"><Link to={`/game/admin/players/${row.roundPlayerId}`}>{row.displayName}</Link></td>
                    <td data-label="Ready" className="se-table__number se-num">{formatNumber(row.ready)}</td>
                    <td data-label="Away" className="se-table__number se-num">{formatNumber(row.away)}</td>
                    <td data-label="Damaged" className="se-table__number se-num">{formatNumber(row.damaged)}</td>
                    <td data-label="Disabled" className="se-table__number se-num">{formatNumber(row.disabled)}</td>
                  </tr>
                )) : <tr><td colSpan={5} className="se-muted">Nobody owns a vehicle yet.</td></tr>}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Run integrity" flush>
            <p className="se-admin-pad se-hint">
              Every active run's classes should add up to its car count. {formatNumber(data.integrity.checked)} active run{data.integrity.checked === 1 ? '' : 's'} checked.
            </p>
            {data.integrity.problems.length ? <ul className="se-admin-list se-admin-pad">{data.integrity.problems.map((row) => (
              <li key={row.runId}>
                <Link to={`/game/admin/players/${row.roundPlayerId}`}>{row.displayName}</Link> · run {row.runId} · {row.problem}
              </li>
            ))}</ul> : <p className="se-admin-pad se-muted">Every active run adds up.</p>}
          </Panel>
        </>
      )}
    </GameLayout>
  );
}
