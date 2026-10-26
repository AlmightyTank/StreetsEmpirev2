import { useEffect, useState } from 'react';
import '../styles/admin.css';
import { Link } from 'react-router-dom';
import type { AdminCrewRosterDto, AdminCrewReleaseHealthDto, AdminCrewProvenanceDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AdminRoundPicker, useAdminRound } from '../components/AdminRoundPicker.js';
import { Alert } from '../components/Alert.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

/** 1.7.0-F. Read-only health and career distribution for the round's crew roster. */
export function AdminCrewPage() {
  const { rounds, roundId, setRoundId, error: roundsError } = useAdminRound();
  const [data, setData] = useState<AdminCrewRosterDto | null>(null);
  const [health, setHealth] = useState<AdminCrewReleaseHealthDto | null>(null);
  const [inspection, setInspection] = useState<AdminCrewProvenanceDto | null>(null);
  const [repairReason, setRepairReason] = useState('');
  const [legacyPlayerId, setLegacyPlayerId] = useState('');
  const [repairBusy, setRepairBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) return;
    let active = true;
    setData(null);
    setHealth(null);
    setInspection(null);
    setError(null);
    setResultMessage(null);
    void Promise.all([adminApi.crewRoster(roundId), adminApi.crewReleaseHealth(roundId)])
      .then(([roster, release]) => { if (active) { setData(roster); setHealth(release); } })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load crew release health.');
      });
    return () => { active = false; };
  }, [roundId]);

  const inspect = async (roundPlayerId: string, memberId: string) => {
    setError(null);
    setResultMessage(null);
    try { setInspection(await adminApi.crewReceiptProvenance(roundPlayerId, memberId)); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not read verified crew receipts.'); }
  };
  const reconcile = async () => {
    if (!inspection || repairBusy || repairReason.trim().length < 5) return;
    setRepairBusy(true);
    setError(null);
    try {
      const roundPlayerId = health?.receiptMismatchSample.find((row) => row.id === inspection.member.id)?.roundPlayerId;
      if (!roundPlayerId) throw new Error('That member is not in the mismatch sample.');
      const result = await adminApi.reconcileCrewLoyalty(roundPlayerId, inspection.member.id, repairReason.trim(), inspection.member.loyaltyPoints);
      setResultMessage(`Reconciled ${result.memberId}: ${result.before} → ${result.verified} loyalty. Audit ${result.auditId}.`);
      setInspection(null);
      setRepairReason('');
      if (roundId) setHealth(await adminApi.crewReleaseHealth(roundId));
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : caught instanceof Error ? caught.message : 'Reconciliation failed.'); }
    finally { setRepairBusy(false); }
  };
  const repairLegacy = async () => {
    if (!roundId || repairBusy || legacyPlayerId.trim().length < 1 || repairReason.trim().length < 5) return;
    setRepairBusy(true);
    setError(null);
    try {
      const result = await adminApi.repairCrewRoster(legacyPlayerId.trim(), repairReason.trim());
      const outcome = result.outcome;
      setResultMessage(`Fail-closed crew sync completed; ${outcome?.created ?? 0} created, ${outcome?.moved ?? 0} moved, ${outcome?.released ?? 0} released. Audit ${result.auditId}.`);
      setLegacyPlayerId('');
      setRepairReason('');
      const [roster, release] = await Promise.all([adminApi.crewRoster(roundId), adminApi.crewReleaseHealth(roundId)]);
      setData(roster); setHealth(release);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not repair crew migration.'); }
    finally { setRepairBusy(false); }
  };

  return <GameLayout>
    <div className="se-pagehead se-admin-pagehead">
      <div><h1 className="se-title">Crew Roster</h1><p className="se-eyebrow">Admin · migration health, verified loyalty and audited recovery</p></div>
      <AdminRoundPicker rounds={rounds} roundId={roundId} onChange={setRoundId} />
    </div>
    {roundsError || error ? <Alert>{roundsError ?? error}</Alert> : null}
    {resultMessage ? <p role="status" className="se-hint">{resultMessage}</p> : null}
    {!data ? <p className="se-muted">Reading crew roster health...</p> : !data.enabled ? (
      <Panel title="No individual roster in this round"><p className="se-muted">{data.rulesetId} predates individual crew rosters.</p></Panel>
    ) : <>
      <Panel title={`${data.roundName} · ${data.roundStatus}`} aside={`updated ${adminWhen(data.generatedAt)}`} className="se-mb">
        <div className="se-stats">
          <Stat label="Players migrated" value={`${formatNumber(data.players.migrated)} / ${formatNumber(data.players.total)}`} />
          <Stat label="Migration pending" value={formatNumber(data.players.pending)} />
          <Stat label="Crew members" value={formatNumber(data.members.total)} />
          <Stat label="Active staffing orders" value={`${formatNumber(data.staffingOrders.active)} / ${formatNumber(data.staffingOrders.total)}`} />
          <Stat label="Career XP · min / avg / max" value={data.members.experienceMin === null ? '—' : `${formatNumber(data.members.experienceMin)} / ${formatNumber(data.members.experienceAverage ?? 0)} / ${formatNumber(data.members.experienceMax ?? 0)}`} />
        </div>
      </Panel>
      {health ? (
        <Panel title="Crew Loyalty & Legends · release health" aside={<Link to="/game/admin/audit?action=crew.">Review corrections</Link>} className="se-mb">
          <p className="se-hint">{health.archivalPolicy}. {health.loyaltyEnabled ? 'Loyalty receipts are enabled for this pinned round.' : 'This round predates loyalty; missing records are expected.'}</p>
          <div className="se-stats">
            <Stat label="Positive verified receipts" value={formatNumber(health.positiveReceipts)} />
            <Stat label="Capped / zero receipts" value={formatNumber(health.cappedReceipts)} />
            <Stat label="Crew bonds" value={formatNumber(health.bonds)} />
            <Stat label="Shared bond memories" value={formatNumber(health.bondMemories)} />
            <Stat label="Frozen crew legends" value={formatNumber(health.archivedLegends)} />
            <Stat label="Legacy rosters pending" value={formatNumber(health.pendingLegacy)} />
            <Stat label="Loyalty mismatches · sample" value={formatNumber(health.receiptMismatchSample.length)} />
          </div>
          {health.receiptMismatchSample.length > 0 ? (
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Member</th><th>Round player</th><th>Stored</th><th>Verified</th><th>Inspect</th></tr></thead>
                <tbody>{health.receiptMismatchSample.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Member">{row.id}</td>
                    <td data-label="Player"><Link to={`/game/admin/players/${row.roundPlayerId}`}>{row.roundPlayerId}</Link></td>
                    <td data-label="Stored">{row.stored}</td>
                    <td data-label="Verified">{row.earned}</td>
                    <td data-label="Inspect"><button type="button" className="se-btn se-btn--sm" disabled={repairBusy}
                      onClick={() => void inspect(row.roundPlayerId, row.id)}>Inspect receipts</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="se-muted">No stored-loyalty mismatches detected in the first 25 anomalies.</p>}
          {inspection ? (
            <section aria-label="Staff-only immutable loyalty ledger" className="se-admin-pad">
              <h3>Crew #{inspection.member.serial} · receipt provenance</h3>
              <p>{inspection.totalReceipts} receipts · {inspection.sampledReceipts} sampled · verified {inspection.earnedFromReceipts} / stored {inspection.member.loyaltyPoints}
                {inspection.hasMore ? ' · newest 100 only' : ''}</p>
              {inspection.sampleAnomalies.length ? <Alert>{inspection.sampleAnomalies.join('; ')}</Alert> : null}
              <div className="se-tablewrap"><table className="se-table se-table--cards">
                <thead><tr><th>Settlement source</th><th>Proof ID</th><th>Points</th><th>Date</th></tr></thead>
                <tbody>{inspection.recent.map((entry) => <tr key={entry.id}>
                  <td data-label="Source">{label(entry.source)}</td><td data-label="Proof ID"><code>{entry.sourceKey}</code></td>
                  <td data-label="Points">{entry.points}</td><td data-label="Date">{adminWhen(entry.at)}</td>
                </tr>)}</tbody>
              </table></div>
              <p className="se-hint">A repair restores the stored number to the immutable receipt total. It never creates receipts or rewrites frozen legends.</p>
              <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setInspection(null)}>Close inspection</button>
              {!inspection.storedPointsMatch && inspection.roundStatus !== 'ENDED' && inspection.roundStatus !== 'ARCHIVED'
                ? <button type="button" className="se-btn se-btn--sm" disabled={repairBusy || repairReason.trim().length < 5}
                  onClick={() => void reconcile()}>Reconcile to verified total</button> : null}
            </section>
          ) : null}
          <div className="se-admin-pad">
            <label>Staff correction reason
              <input type="text" className="se-input" value={repairReason} onChange={(event) => setRepairReason(event.target.value)}
                placeholder="Required audit reason (5–500 characters)" maxLength={500} />
            </label>
            {health.pendingLegacy > 0 && health.status !== 'ENDED' && health.status !== 'ARCHIVED' ? (
              <div>
                <p className="se-hint">Explicit legacy recovery runs the fail-closed roster reconciler; use a verified round-player ID. Never enter an account ID here.</p>
                <label>Round player ID
                  <input type="text" className="se-input" value={legacyPlayerId} onChange={(event) => setLegacyPlayerId(event.target.value)} maxLength={64} />
                </label>
                <button type="button" className="se-btn se-btn--sm" disabled={repairBusy || repairReason.trim().length < 5 || !legacyPlayerId.trim()}
                  onClick={() => void repairLegacy()}>Repair this player's roster</button>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}
      <Panel title="Roster distribution" className="se-mb">
        <div className="se-grid se-grid--2">
          {[['Roles', data.byRole], ['Specialties', data.bySpecialty], ['Status', data.byStatus], ['Assignments', data.byAssignment], ['Staffing orders', data.staffingOrders.byKind]].map(([title, rows]) => (
            <section key={String(title)} aria-label={String(title)}>
              <h2 className="se-eyebrow">{String(title)}</h2>
              <ul className="se-admin-list">{(rows as Array<{ count: number; role?: string; specialty?: string; status?: string; assignment?: string; kind?: string }>).map((row) => {
                const value = row.role ?? row.specialty ?? row.status ?? row.assignment ?? row.kind ?? '';
                return <li key={value}>{label(value)} <strong>{formatNumber(row.count)}</strong></li>;
              })}</ul>
            </section>
          ))}
        </div>
      </Panel>
      <Panel title="Career leaders" aside={<Link to={`/game/admin/audit?targetType=crew-member`}>Crew correction audit</Link>} flush>
        <div className="se-tablewrap">
          <table className="se-table se-table--cards">
            <thead><tr><th>Player</th><th>Member</th><th>Role</th><th>Specialty</th><th className="se-table__number">Career XP</th><th className="se-table__number">Specialty XP</th></tr></thead>
            <tbody>{data.topVeterans.length ? data.topVeterans.map((row) => (
              <tr key={row.memberId}>
                <td className="se-td--title"><Link to={`/game/admin/players/${row.roundPlayerId}`}>{row.displayName}</Link></td>
                <td data-label="Member">Crew #{row.serial}</td>
                <td data-label="Role">{label(row.role)}</td>
                <td data-label="Specialty">{label(row.specialty)}</td>
                <td data-label="Career XP" className="se-table__number se-num">{formatNumber(row.experiencePoints)}</td>
                <td data-label="Specialty XP" className="se-table__number se-num">{formatNumber(row.specialtyExperiencePoints)}</td>
              </tr>
            )) : <tr><td colSpan={6} className="se-muted">No crew careers have earned experience yet.</td></tr>}</tbody>
          </table>
        </div>
        <p className="se-admin-pad se-hint">Career corrections are available from a player inspector, require a reason, and are frozen after the round ends.</p>
      </Panel>
    </>}
  </GameLayout>;
}
