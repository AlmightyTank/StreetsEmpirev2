import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminCasinoDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AdminRoundPicker, useAdminRound } from '../components/AdminRoundPicker.js';
import { Alert } from '../components/Alert.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

const displayKind = (kind: string) => kind.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

/** 1.2.0-H. Read-only casino health, money movement and anti-abuse review cues. */
export function AdminCasinoPage() {
  const { rounds, roundId, setRoundId, error: roundsError } = useAdminRound();
  const [data, setData] = useState<AdminCasinoDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) return;
    setData(null);
    setError(null);
    adminApi.casino(roundId)
      .then(setData)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load casino telemetry.'));
  }, [roundId]);

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Casino Operations</h1>
          <p className="se-eyebrow">Admin · read-only telemetry and abuse review</p>
        </div>
        <AdminRoundPicker rounds={rounds} roundId={roundId} onChange={setRoundId} />
      </div>
      {roundsError || error ? <Alert>{roundsError ?? error}</Alert> : null}
      {!data ? <p className="se-muted">Reading casino activity…</p> : (
        <>
          <Panel title="Rated play · current season" aside={`updated ${adminWhen(data.generatedAt)}`} className="se-mb">
            <div className="se-stats">
              <Stat label="Players" value={formatNumber(data.rating.players)} />
              <Stat label="Rated wagers" value={formatNumber(data.rating.ratedWagers)} />
              <Stat label="Wager volume" value={formatCents(data.rating.wageredCents)} />
              <Stat label="Theoretical house win" value={formatCents(data.rating.theoCents)} />
              <Stat label="Comps spent" value={formatCents(data.rating.compsSpentCents)} />
              <Stat label="VIP wagers · jackpots" value={`${formatNumber(data.rating.vipWagers)} · ${formatNumber(data.rating.jackpots)}`} />
            </div>
          </Panel>

          <Panel title="Live games and integrity checks" className="se-mb">
            <div className="se-stats">
              <Stat label="Open bankrolls" value={formatNumber(data.operations.openSessions)} />
              <Stat label="Active Blackjack hands" value={formatNumber(data.operations.activeBlackjack)} />
              <Stat label="Active Dice points" value={formatNumber(data.operations.activeDiceRounds)} />
              <Stat label="Active solo Poker" value={formatNumber(data.operations.activeSoloPoker)} />
              <Stat label="Active table hands" value={formatNumber(data.operations.activeTableHands)} />
              <Stat label="Stale over 1 hour" value={formatNumber(data.operations.staleGames)} />
            </div>
            <p className="se-hint se-mt">These are review cues, not automatic penalties. Reconnect or travel can leave a legitimate game open.</p>
            {data.operations.duplicateOpenSessions.length || data.operations.gamesOnClosedSessions ? (
              <div className="se-tablewrap">
                <table className="se-table se-table--cards">
                  <thead><tr><th>Integrity cue</th><th>Player</th><th className="se-table__number">Count</th></tr></thead>
                  <tbody>
                    {data.operations.duplicateOpenSessions.map((row) => (
                      <tr key={row.playerId}><td>Multiple open bankrolls</td><td><Link to={`/game/admin/players/${row.playerId}`}>{row.displayName}</Link></td><td className="se-table__number">{row.count}</td></tr>
                    ))}
                    {data.operations.gamesOnClosedSessions ? <tr><td>Active games linked to closed/missing bankrolls</td><td>Review casino services</td><td className="se-table__number">{data.operations.gamesOnClosedSessions}</td></tr> : null}
                  </tbody>
                </table>
              </div>
            ) : <p className="se-muted">No bankroll or session integrity mismatches found.</p>}
          </Panel>

          <Panel title="Casino activity · last 24 hours" flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Ledger action</th><th className="se-table__number">Entries</th><th className="se-table__number">Cash change</th><th className="se-table__number">Wallet chips</th><th className="se-table__number">Session chips</th></tr></thead>
                <tbody>{data.ledger.length ? data.ledger.map((row) => (
                  <tr key={row.kind}>
                    <td className="se-td--title">{displayKind(row.kind)}</td>
                    <td className="se-table__number se-num">{formatNumber(row.entries)}</td>
                    <td className="se-table__number se-num">{formatCents(row.cashDeltaCents)}</td>
                    <td className="se-table__number se-num">{formatCents(row.walletChipDeltaCents)}</td>
                    <td className="se-table__number se-num">{formatCents(row.sessionChipDeltaCents)}</td>
                  </tr>
                )) : <tr><td colSpan={5} className="se-muted">No casino ledger actions in this window.</td></tr>}</tbody>
              </table>
            </div>
          </Panel>

          <Panel title={`Fast-play review cues · ${data.rapidPlayThreshold}+ ledger actions/hour`} className="se-mb">
            <p className="se-hint">High activity can come from fast legitimate play or retries. Review the player and action history before taking action.</p>
            {data.rapidPlay.length ? <ul className="se-admin-list">{data.rapidPlay.map((row) => (
              <li key={row.playerId}><Link to={`/game/admin/players/${row.playerId}`}>{row.displayName}</Link> · {formatNumber(row.entries)} actions · last {adminWhen(row.lastAt)}</li>
            ))}</ul> : <p className="se-muted">No players crossed this review threshold in the last hour.</p>}
          </Panel>

          <Panel title="Open casino exploit flags" aside={<Link to="/game/admin/combat">Review all flags</Link>} flush>
            {data.openCasinoFlags.length ? <div className="se-admin-list">{data.openCasinoFlags.map((flag) => (
              <p className="se-admin-pad" key={flag.id}>
                <strong>{flag.severity.toUpperCase()} · {flag.kind}</strong>{flag.playerId ? <> · <Link to={`/game/admin/players/${flag.playerId}`}>Player</Link></> : null}
                <br />{flag.message} · {formatNumber(flag.occurrences)} occurrence{flag.occurrences === 1 ? '' : 's'} · {adminWhen(flag.lastAt)}
              </p>
            ))}</div> : <p className="se-admin-pad se-muted">No open casino-specific exploit flags.</p>}
          </Panel>
        </>
      )}
    </GameLayout>
  );
}
