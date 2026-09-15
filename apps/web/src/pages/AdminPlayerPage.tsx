import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AdminPlayerDto, BattleReportDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

const yesNo = (value: boolean) => (value ? 'Yes' : 'No');

function battleResult(report: BattleReportDto): string {
  return report.won ? 'Won' : 'Lost';
}

export function AdminPlayerPage() {
  const { roundPlayerId = '' } = useParams();
  const [player, setPlayer] = useState<AdminPlayerDto | null>(null);
  const [reports, setReports] = useState<BattleReportDto[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    try {
      const [inspected, battles] = await Promise.all([adminApi.player(roundPlayerId), adminApi.playerBattles(roundPlayerId)]);
      setPlayer(inspected);
      setReports(battles.reports);
      setNextBefore(battles.nextBefore);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load that player.');
    }
  }, [roundPlayerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadOlder() {
    if (!nextBefore) return;
    setLoadingMore(true);
    try {
      const page = await adminApi.playerBattles(roundPlayerId, nextBefore);
      setReports((current) => [...current, ...page.reports]);
      setNextBefore(page.nextBefore);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load older battle reports.');
    } finally {
      setLoadingMore(false);
    }
  }

  if (!player) {
    return (
      <GameLayout>
        {error ? <Alert>{error}</Alert> : <p className="se-muted">Loading player...</p>}
      </GameLayout>
    );
  }

  const timers = player.timers;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">{player.displayName} <span className="se-muted">#{player.publicPimpId}</span></h1>
          <p className="se-eyebrow">
            {player.round.name} · {player.round.status} · {player.city} ·{' '}
            <Link to={`/game/admin/accounts/${player.account.id}`}>{player.account.username}{player.account.isActive ? '' : ' (deactivated)'}</Link>
          </p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      <p className="se-hint se-mb">Read-only. Opening this page never settles the player, so turns show what was stored at their last settlement.</p>

      <div className="se-stats se-mb">
        <Stat label="Net worth" value={formatCents(player.netWorthCents)} />
        <Stat label="Cash" value={formatCents(player.cashCents)} />
        <Stat label="Turns" value={formatNumber(player.turns)} sub={`as of ${adminWhen(player.lastTurnCalculationAt)}`} />
        <Stat label="National rank" value={player.ranks.national ? `#${player.ranks.national}` : '-'} sub={player.ranks.local ? `Local #${player.ranks.local}` : undefined} />
      </div>

      <div className="se-grid se-grid--2 se-mb">
        <Panel title="Crew and weapons" flush>
          <div className="se-rows">
            <Row label="Whores" value={formatNumber(player.crew.whores)} />
            <Row label="Thugs" value={`${formatNumber(player.crew.thugs)} (${formatNumber(player.crew.woundedThugs)} wounded)`} />
            <Row label="Low-Riders" value={formatNumber(player.crew.lowRiders)} />
            <Row label="Pistols" value={formatNumber(player.weapons.pistols)} />
            <Row label="Shotguns" value={formatNumber(player.weapons.shotguns)} />
            <Row label="Tek-9s" value={formatNumber(player.weapons.tek9s)} />
            <Row label="AK-47s" value={formatNumber(player.weapons.ak47s)} />
          </div>
        </Panel>

        <Panel title="Supplies and state" flush>
          <div className="se-rows">
            <Row label="Condoms" value={formatNumber(player.supplies.condoms)} />
            <Row label="Medicine" value={formatNumber(player.supplies.medicine)} />
            <Row label="Crack" value={formatNumber(player.supplies.crack)} />
            <Row label="Beer" value={formatNumber(player.supplies.beer)} />
            <Row label="Happiness" value={`Whores ${player.happiness.whores}% · Thugs ${player.happiness.thugs}%`} />
            <Row label="Payout" value={`${player.payoutPercent}%`} />
            <Row label="Last active" value={adminWhen(player.lastActiveAt)} />
          </div>
        </Panel>

        <Panel title="Raid timers" flush>
          <div className="se-rows">
            <Row label="Raid protected until" value={adminWhen(timers.raidProtectedUntil)} />
            <Row label="Raid cooldown until" value={adminWhen(timers.raidCooldownUntil)} />
            <Row label="Last raided" value={adminWhen(timers.lastRaidedAt)} />
            <Row label="Drive-by protected until" value={adminWhen(timers.driveByProtectedUntil)} />
            <Row label="Drive-by cooldown until" value={adminWhen(timers.driveByCooldownUntil)} />
            <Row label="Last driven by" value={adminWhen(timers.lastDrivenByAt)} />
            <Row label="Intel" value={`Watching ${player.intel.observing} · watched by ${player.intel.observedBy}`} />
          </div>
        </Panel>

        <Panel title="Progress" flush>
          <div className="se-rows">
            <Row label="Weapon unlocks" value={`Shotgun ${yesNo(player.unlocks.shotgun)} · Tek-9 ${yesNo(player.unlocks.tek9)} · AK ${yesNo(player.unlocks.ak47)}`} />
            <Row label="Hideout" value={`Safe ${player.hideout.safeRoom} · Lookouts ${player.hideout.lookouts} · Workshop ${player.hideout.workshop} · Office ${player.hideout.backOffice}`} />
            {player.reputation.length ? player.reputation.map((row) => (
              <Row key={row.trader} label={`Rep: ${row.trader}`} value={`${formatNumber(row.points)}${row.questDone ? ' · favor done' : ''}`} />
            )) : <Row label="Reputation" value="-" />}
          </div>
        </Panel>
      </div>

      {player.injuries.length ? (
        <Panel title="Wounds healing" flush className="se-mb">
          <div className="se-rows">
            {player.injuries.map((injury) => (
              <Row key={injury.id} label={`${formatNumber(injury.thugs)} thugs`} value={`recover ${adminWhen(injury.recoverAt)}`} />
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel title="Battle reports" aside={`${formatNumber(reports.length)} loaded`} flush className="se-mb">
        {reports.length === 0 ? (
          <p className="se-muted se-admin-pad">No battles yet.</p>
        ) : (
          <>
            <div className="se-tablewrap">
              <table className="se-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Kind</th>
                    <th>Role</th>
                    <th>Result</th>
                    <th>Opponent</th>
                    <th className="se-table__number">Cash</th>
                    <th className="se-table__number">Wounds</th>
                    <th className="se-table__number">Turns</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={`${report.id}-${report.createdAt}`}>
                      <td>{adminWhen(report.createdAt)}</td>
                      <td>{report.raidForm?.title ?? report.kind ?? 'RAID'}</td>
                      <td>{report.role}</td>
                      <td><span className={`se-tag ${report.won ? 'se-tag--good' : 'se-tag--bad'}`}>{battleResult(report)}</span></td>
                      <td>{report.opponent.displayName} <span className="se-muted">#{report.opponent.publicPimpId}</span></td>
                      <td className="se-table__number se-num">{typeof report.cashChangeCents === 'number' ? formatCents(report.cashChangeCents) : '-'}</td>
                      <td className="se-table__number se-num">{`${report.yourWounds ?? 0} / ${report.opponentWounds ?? 0}`}</td>
                      <td className="se-table__number se-num">{formatNumber(report.turnsSpent ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nextBefore ? (
              <div className="se-admin-pad">
                <button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => void loadOlder()} disabled={loadingMore}>
                  {loadingMore ? 'Loading...' : 'Load older reports'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </Panel>

      <Panel title="Activity" aside="Latest 50" flush>
        {player.activity.length === 0 ? (
          <p className="se-muted se-admin-pad">No activity recorded.</p>
        ) : (
          <ol className="se-admin-audit">
            {player.activity.map((entry) => (
              <li className="se-admin-audit__entry" key={entry.id}>
                <div className="se-admin-audit__head">
                  <strong>{entry.type}</strong>
                  <span className="se-muted">{adminWhen(entry.createdAt)}</span>
                </div>
                <pre className="se-admin-json se-admin-json--inline">{JSON.stringify(entry.payload)}</pre>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </GameLayout>
  );
}
