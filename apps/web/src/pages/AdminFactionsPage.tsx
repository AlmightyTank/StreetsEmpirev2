import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminFactionRoundDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AdminRoundPicker, useAdminRound } from '../components/AdminRoundPicker.js';
import { Alert } from '../components/Alert.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

/** 1.4.0-G. Faction standing health for staff: points, receipt totals and corrections. */
export function AdminFactionsPage() {
  const { rounds, roundId, setRoundId, error: roundsError } = useAdminRound();
  const [data, setData] = useState<AdminFactionRoundDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) return;
    setData(null);
    setError(null);
    adminApi.factions(roundId)
      .then(setData)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load faction standing.'));
  }, [roundId]);

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Factions</h1>
          <p className="se-eyebrow">Admin · standing, receipts and corrections · private to staff</p>
        </div>
        <AdminRoundPicker rounds={rounds} roundId={roundId} onChange={setRoundId} />
      </div>
      {roundsError || error ? <Alert>{roundsError ?? error}</Alert> : null}
      {!data ? <p className="se-muted">Reading faction standing...</p> : !data.enabled ? (
        <Panel title="No faction standing in this round">
          <p className="se-muted">This round runs {data.rulesetId}, which keeps no faction standing.</p>
        </Panel>
      ) : (
        <>
          <Panel title="Faction health" aside={`updated ${adminWhen(data.generatedAt)}`} className="se-mb">
            <div className="se-stats">
              <Stat label="Standing rows" value={formatNumber(data.integrity.checked)} />
              <Stat label="Receipt mismatches" value={formatNumber(data.integrity.mismatches.length)} />
              <Stat label="Staff corrections · 7d" value={formatNumber(data.adjustments7d)} />
              <Stat label="Receipt sources · 24h" value={formatNumber(data.receipts24h.length)} />
            </div>
          </Panel>

          <Panel title="Highest standing" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead>
                  <tr><th>Player</th><th>Faction</th><th>Tier</th><th className="se-table__number">Points</th><th className="se-table__number">Receipts</th><th>Updated</th></tr>
                </thead>
                <tbody>{data.standings.length ? data.standings.map((row) => (
                  <tr key={`${row.roundPlayerId}:${row.factionKey}`}>
                    <td className="se-td--title"><Link to={`/game/admin/players/${row.roundPlayerId}`}>{row.displayName}</Link></td>
                    <td data-label="Faction">{row.factionName}</td>
                    <td data-label="Tier">{row.tierName}</td>
                    <td data-label="Points" className="se-table__number se-num">{formatNumber(row.points)}</td>
                    <td data-label="Receipts" className="se-table__number se-num">{formatNumber(row.receiptPoints)} / {formatNumber(row.receipts)}</td>
                    <td data-label="Updated">{adminWhen(row.updatedAt)}</td>
                  </tr>
                )) : <tr><td colSpan={6} className="se-muted">Nobody has faction standing yet.</td></tr>}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Standing changes · last 24 hours" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Source</th><th className="se-table__number">Receipts</th><th className="se-table__number">Standing</th></tr></thead>
                <tbody>{data.receipts24h.length ? data.receipts24h.map((row) => (
                  <tr key={row.source}>
                    <td className="se-td--title">{row.source}</td>
                    <td data-label="Receipts" className="se-table__number se-num">{formatNumber(row.entries)}</td>
                    <td data-label="Standing" className="se-table__number se-num">{formatNumber(row.standing)}</td>
                  </tr>
                )) : <tr><td colSpan={3} className="se-muted">No standing changes in this window.</td></tr>}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Receipt integrity" flush>
            <p className="se-admin-pad se-hint">
              Every stored faction standing should equal the sum of its receipts.
            </p>
            {data.integrity.mismatches.length ? <ul className="se-admin-list se-admin-pad">{data.integrity.mismatches.map((row) => (
              <li key={`${row.roundPlayerId}:${row.factionKey}`}>
                <Link to={`/game/admin/players/${row.roundPlayerId}`}>{row.displayName}</Link> · {row.factionKey} · stored {formatNumber(row.stored)}, receipts {formatNumber(row.receipts)}
              </li>
            ))}</ul> : <p className="se-admin-pad se-muted">Every faction standing row adds up.</p>}
          </Panel>
        </>
      )}
    </GameLayout>
  );
}
