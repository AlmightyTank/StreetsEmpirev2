import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel, Stat } from './Panel.js';

interface RecoveryAudit {
  id: string;
  roundPlayerId: string;
  displayName: string;
  dayIndex: number;
  reason: string;
  stampsBefore: number;
  missedBefore: number;
  createdAt: string;
}
interface Overview {
  status: string;
  clock: { roundDays: number; requiredStamps: number };
  players: number;
  actualLogins: number;
  recoveredStamps: number;
  recoveryAudits: number;
  rewardClaims: number;
  auditMatchesStampCount: boolean;
  releaseWarnings: string[];
  economy: {
    rewardVersion: string;
    requiredStamps: number;
    rarityCounts: { common: number; uncommon: number; rare: number; legendary: number };
    perPlayer: { cashCents: number; turns: number; supplies: { beer: number; condoms: number; medicine: number } };
    worstCase: { cashCents: number; turns: number; supplies: number };
    allStepsWithinCaps: boolean;
  } | null;
  recoveryLimitPerPlayer: number;
  recentRecoveries: RecoveryAudit[];
}
interface Diagnosis {
  player: { id: string; displayName: string; createdAt: string };
  attendance: { stamps: number; requiredStamps: number; missedCompletedDays: number; allowanceRemaining: number; completed: boolean };
  recovery: { used: number; limit: number; eligible: boolean; reason: string; history: { dayIndex: number; recoveredAt: string }[] };
  grandPrize: { unlocked: boolean };
  claimedRewardTiers: number[];
  anomalies: { auditStampMismatch: boolean; exceedsRecoveryCap: boolean; unpairedGrandPrize: boolean };
}

export function AdminRoundRollCallPanel({ roundId }: { roundId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [detail, setDetail] = useState<Diagnosis | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setOverview(null);
    setDetail(null);
    setError(null);
    api.get<Overview>('/admin/round-roll-call/overview?roundId=' + encodeURIComponent(roundId))
      .then((result) => { if (live) setOverview(result); })
      .catch((caught: unknown) => { if (live) setError(caught instanceof Error ? caught.message : 'Cannot load login rewards.'); });
    return () => { live = false; };
  }, [roundId, refresh]);

  async function diagnose(id: string) {
    const target = id.trim();
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.get<Diagnosis>('/admin/round-roll-call/diagnose?roundId=' + encodeURIComponent(roundId)
        + '&roundPlayerId=' + encodeURIComponent(target));
      setDetail(response);
      setPlayerId(target);
    } catch (caught) {
      setDetail(null);
      setError(caught instanceof Error ? caught.message : 'Player inspection failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Round Roll Call · diagnostics" aside="Admin only · read-only" flush className="se-mt">
      <div className="se-admin-pad">
        <p className="se-hint">
          Monitor attendance, capped makeups and grant integrity. This console cannot create stamps or
          manually award the exclusive collection. Each recovery carries an immutable action receipt.
        </p>
        {error ? <Alert>{error}</Alert> : null}
        <Button size="sm" variant="ghost" onClick={() => setRefresh((n) => n + 1)}>Refresh diagnostics</Button>
      </div>
      {overview ? (
        <>
          <div className="se-stats se-admin-pad">
            <Stat label="Players" value={String(overview.players)} />
            <Stat label="Real login stamps" value={String(overview.actualLogins)} />
            <Stat label="Recovered days" value={String(overview.recoveredStamps)} />
            <Stat label="Reward claims" value={String(overview.rewardClaims)} />
            <Stat label="Required stamps" value={String(overview.clock.requiredStamps)} />
          </div>
          <div className="se-admin-pad">
            <h3>Release balance &amp; integrity</h3>
            {overview.economy ? (
              <>
                <p className="se-hint">
                  Deterministic all-players, all-tiers claim ceiling; not actual payouts or a currency grant.
                  {' '}Reward catalog {overview.economy.rewardVersion}.
                </p>
                <div className="se-stats">
                  <Stat label="Cash / player" value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(overview.economy.perPlayer.cashCents / 100)} />
                  <Stat label="Turns / player" value={String(overview.economy.perPlayer.turns)} />
                  <Stat label="Maximum round cash" value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(overview.economy.worstCase.cashCents / 100)} />
                  <Stat label="Maximum supply items" value={String(overview.economy.worstCase.supplies)} />
                </div>
              </>
            ) : <Alert>Cannot simulate this round's pinned reward catalog. The rest of the diagnostics remain available.</Alert>}
            <p role="status" className="se-hint">
              {overview.releaseWarnings.length === 0 && overview.economy?.allStepsWithinCaps
                ? 'All aggregate integrity and per-step economy checks are within expected bounds.'
                : 'Review required: ' + [
                  ...overview.releaseWarnings,
                  ...(overview.economy && !overview.economy.allStepsWithinCaps ? ['REWARD_CAP_EXCEEDED'] : []),
                ].join(', ')}
            </p>
          </div>
          <div className="se-admin-pad">
            <p role="status" className="se-hint">
              {overview.auditMatchesStampCount
                ? 'Recovery stamp and audit counts match.'
                : 'Warning: recovery stamps and audit receipts do NOT match. Investigate before release.'}
              {' '}Maximum {overview.recoveryLimitPerPlayer} recovery days per player.
            </p>
            <form onSubmit={(event) => { event.preventDefault(); void diagnose(playerId); }}>
              <label className="se-label" htmlFor="se-rollcall-admin-player">Inspect a RoundPlayer ID</label>
              <div className="se-row se-row--wrap">
                <input id="se-rollcall-admin-player" className="se-input" value={playerId}
                  onChange={(event) => setPlayerId(event.target.value)} maxLength={128}
                  placeholder="RoundPlayer ID" />
                <Button size="sm" loading={busy} disabled={!playerId.trim()}>Diagnose</Button>
              </div>
            </form>
          </div>
          {detail ? (
            <div className="se-admin-pad" role="region" aria-label="Round Roll Call player diagnosis">
              <h3>{detail.player.displayName}</h3>
              <p className="se-hint">
                {detail.attendance.stamps} / {detail.attendance.requiredStamps} stamps ·
                {' '}{detail.attendance.missedCompletedDays} missed ·
                {' '}{detail.attendance.allowanceRemaining} native allowance left ·
                {' '}{detail.recovery.used} / {detail.recovery.limit} recoveries ·
                {' '}Grand prize {detail.grandPrize.unlocked ? 'owned' : 'locked'}
              </p>
              <p className="se-hint">Recovery: {detail.recovery.reason}. Paid tiers: {detail.claimedRewardTiers.join(', ') || 'none'}.</p>
              {(detail.anomalies.auditStampMismatch || detail.anomalies.exceedsRecoveryCap || detail.anomalies.unpairedGrandPrize) ? (
                <Alert>Integrity warning: inspect this player's original receipts before any correction.</Alert>
              ) : <p className="se-hint">No detected integrity anomalies.</p>}
            </div>
          ) : null}
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead><tr><th>Player</th><th>Recovered day</th><th>Missed before</th><th>Audit time</th><th>Inspect</th></tr></thead>
              <tbody>
                {overview.recentRecoveries.map((entry) => (
                  <tr key={entry.id}>
                    <td data-label="Player">{entry.displayName}</td>
                    <td data-label="Day">{entry.dayIndex}</td>
                    <td data-label="Missed">{entry.missedBefore}</td>
                    <td data-label="Time">{new Date(entry.createdAt).toLocaleString()}</td>
                    <td data-label="Inspect"><Button size="sm" variant="ghost" disabled={busy}
                      onClick={() => void diagnose(entry.roundPlayerId)}>Inspect</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {overview.recentRecoveries.length === 0 ? <p className="se-muted se-admin-pad">No catch-up actions have been used in this round.</p> : null}
          </div>
        </>
      ) : !error ? <p className="se-muted se-admin-pad">Loading Roll Call diagnostics…</p> : null}
    </Panel>
  );
}
