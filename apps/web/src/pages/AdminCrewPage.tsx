import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminCrewRosterDto } from '@streets/shared';
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) return;
    setData(null);
    setError(null);
    adminApi.crewRoster(roundId).then(setData).catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load crew roster health.'));
  }, [roundId]);

  return <GameLayout>
    <div className="se-pagehead se-admin-pagehead">
      <div><h1 className="se-title">Crew Roster</h1><p className="se-eyebrow">Admin · migration health, assignments and career balance · read-only</p></div>
      <AdminRoundPicker rounds={rounds} roundId={roundId} onChange={setRoundId} />
    </div>
    {roundsError || error ? <Alert>{roundsError ?? error}</Alert> : null}
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
