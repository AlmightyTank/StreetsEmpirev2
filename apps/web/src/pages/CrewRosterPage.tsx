import { useEffect, useMemo, useState } from 'react';
import type { CrewMemberDto, CrewMemberStatusDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { crewApi, type CrewRosterFilters } from '../api/crew.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import '../styles/crew-roster.css';

const statusLabels: Record<CrewMemberStatusDto, string> = {
  AVAILABLE: 'Available', ASSIGNED: 'Assigned', IN_TRANSIT: 'Away on a run', RECOVERING: 'Recovering', RELEASED: 'Released',
};

function CrewMemberCard({ member }: { member: CrewMemberDto }) {
  return (
    <article className="se-crew-roster__member">
      <div className="se-crew-roster__member-head">
        <div>
          <span className="se-eyebrow">{member.role === 'THUG' ? 'Thug' : 'Worker'} · #{String(member.serial).padStart(3, '0')}</span>
          <h3>{member.name}</h3>
        </div>
        <span className={`se-crew-roster__status se-crew-roster__status--${member.status.toLowerCase()}`}>{statusLabels[member.status]}</span>
      </div>
      <div className="se-crew-roster__facts">
        <div><span>Current assignment</span><strong>{member.assignment?.label ?? (member.status === 'RELEASED' ? 'Outside the active crew' : 'Home crew')}</strong></div>
        <div><span>Experience</span><strong>{formatNumber(member.experiencePoints)} XP</strong></div>
        <div><span>Specialty</span><strong>{member.specialty === 'DEALER' ? 'Dealer' : 'Generalist'}</strong></div>
      </div>
      {member.unavailableReason ? <p className="se-crew-roster__reason">{member.unavailableReason}</p> : null}
      <div className="se-crew-roster__traits" aria-label="Crew traits">
        {member.traits.map((trait) => <span key={trait}>{trait}</span>)}
      </div>
      <details className="se-crew-roster__history">
        <summary>Career history <span>{member.history.length} recent entries</span></summary>
        {member.history.length ? (
          <ol>
            {member.history.map((entry, index) => (
              <li key={`${entry.at}-${entry.kind}-${index}`}>
                <span>{entry.label}</span>
                <time dateTime={entry.at}>{new Date(entry.at).toLocaleDateString()}</time>
              </li>
            ))}
          </ol>
        ) : <p className="se-muted">No career changes recorded yet.</p>}
      </details>
    </article>
  );
}

export function CrewRosterPage() {
  const [role, setRole] = useState<CrewRosterFilters['role']>();
  const [status, setStatus] = useState<CrewRosterFilters['status']>();
  const [assignment, setAssignment] = useState<CrewRosterFilters['assignment']>();
  const [specialty, setSpecialty] = useState<CrewRosterFilters['specialty']>();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof crewApi.roster>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const filters = useMemo(() => ({ role, status, assignment, specialty, limit: 50, offset }), [role, status, assignment, specialty, offset]);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    crewApi.roster(filters).then((next) => {
      if (active) setData(next);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load your crew roster.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filtersKey]);

  const allMembers = data?.totals.reduce((sum, row) => sum + row.members, 0) ?? 0;

  return (
    <GameLayout>
      <div className="se-crew-roster">
        <header className="se-crew-roster__hero">
          <span className="se-eyebrow">Your people · their careers</span>
          <h1>Crew Roster</h1>
          <p>See who is working, who is ready, and how each person has built a place in your operation.</p>
          <div className="se-crew-roster__hero-stats">
            <span><strong>{formatNumber(allMembers)}</strong> active crew</span>
            <span><strong>{formatNumber(data?.totals.reduce((sum, row) => sum + row.released, 0) ?? 0)}</strong> released careers</span>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}
        {!data?.enabled && !loading ? <Alert>This round does not use individual crew profiles.</Alert> : null}

        {data?.enabled ? (
          <Panel title="Crew at a glance" aside="Live roster">
            <div className="se-crew-roster__summary">
              {data.totals.map((row) => (
                <section key={row.role}>
                  <h3>{row.role === 'THUG' ? 'Thugs' : 'Workers'} <span>{formatNumber(row.members)}</span></h3>
                  <div className="se-crew-roster__summary-grid">
                    <span>Available <strong>{formatNumber(row.byStatus.AVAILABLE)}</strong></span>
                    <span>Assigned <strong>{formatNumber(row.byStatus.ASSIGNED)}</strong></span>
                    <span>On runs <strong>{formatNumber(row.byStatus.IN_TRANSIT)}</strong></span>
                    <span>Recovering <strong>{formatNumber(row.byStatus.RECOVERING)}</strong></span>
                  </div>
                </section>
              ))}
            </div>
          </Panel>
        ) : null}

        {data?.enabled ? (
          <Panel title="Find a crew member" aside={`${formatNumber(data.total)} matches`}>
            <div className="se-crew-roster__filters">
              <label>Role<select className="se-input" value={role ?? ''} onChange={(event) => { setRole((event.target.value || undefined) as CrewRosterFilters['role']); setOffset(0); }}>
                <option value="">All roles</option><option value="THUG">Thugs</option><option value="WORKER">Workers</option>
              </select></label>
              <label>Availability<select className="se-input" value={status ?? ''} onChange={(event) => { setStatus((event.target.value || undefined) as CrewRosterFilters['status']); setOffset(0); }}>
                <option value="">Active crew</option><option value="AVAILABLE">Available</option><option value="ASSIGNED">Assigned</option><option value="IN_TRANSIT">Away on a run</option><option value="RECOVERING">Recovering</option><option value="RELEASED">Released careers</option>
              </select></label>
              <label>Assignment<select className="se-input" value={assignment ?? ''} onChange={(event) => { setAssignment((event.target.value || undefined) as CrewRosterFilters['assignment']); setOffset(0); }}>
                <option value="">All assignments</option><option value="BUSINESS">Business</option><option value="DEALER">Dealer crew</option><option value="TURF">Turf</option>
              </select></label>
              <label>Specialty<select className="se-input" value={specialty ?? ''} onChange={(event) => { setSpecialty((event.target.value || undefined) as CrewRosterFilters['specialty']); setOffset(0); }}>
                <option value="">All specialties</option><option value="GENERALIST">Generalist</option><option value="DEALER">Dealer</option>
              </select></label>
            </div>
            <p className="se-crew-roster__note">Traits describe each member. They do not change game outcomes in this slice; specialty progression comes later.</p>
            {loading ? <p className="se-muted">Checking the roster…</p> : data.members.length ? (
              <>
                <div className="se-crew-roster__list">{data.members.map((member) => <CrewMemberCard key={member.id} member={member} />)}</div>
                <div className="se-crew-roster__pagination">
                  <span>Showing {formatNumber(offset + 1)}–{formatNumber(Math.min(offset + data.members.length, data.total))} of {formatNumber(data.total)}</span>
                  <div>
                    <button className="se-btn se-btn--sm" type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button>
                    <button className="se-btn se-btn--sm" type="button" disabled={offset + data.members.length >= data.total || loading} onClick={() => setOffset(offset + 50)}>Next</button>
                  </div>
                </div>
              </>
            ) : <p className="se-muted">No crew members match these filters.</p>}
          </Panel>
        ) : null}
      </div>
    </GameLayout>
  );
}
