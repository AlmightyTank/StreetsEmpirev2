import { useEffect, useMemo, useState } from 'react';
import type { CrewMemberDto } from '@streets/shared';
import { crewApi } from '../api/crew.js';
import '../styles/crew-team.css';

const labels = { ENFORCER: 'raid strength', SCOUT: 'scouting income' } as const;

/** Optional, explicit teams for one-transaction operations. No bonus stacks. */
export function CrewTeamPicker({ role, specialty, selectedIds, onChange, disabled = false, refreshKey }: {
  role: 'THUG' | 'WORKER';
  specialty: 'ENFORCER' | 'SCOUT';
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  refreshKey?: unknown;
}) {
  const [members, setMembers] = useState<CrewMemberDto[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([
      crewApi.roster({ role, status: 'AVAILABLE', specialty, limit: 200 }),
      ...(['ASSIGNED', 'IN_TRANSIT', 'RECOVERING'] as const).map((status) => crewApi.roster({ role, status, specialty, limit: 50 })),
    ])
      .then(([available, ...unavailable]) => { if (active) { setMembers([...available.members, ...unavailable.flatMap((roster) => roster.members)]); setEnabled(available.supportsSelectedTeams); } })
      .catch(() => { if (active) setMembers([]); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [role, specialty, refreshKey]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const eligible = members.filter((member) => member.status === 'AVAILABLE' && !member.dealerStaffId);
  const recommended = [...eligible].sort((left, right) => right.specialtyEffectPercent - left.specialtyEffectPercent || right.specialtyExperiencePoints - left.specialtyExperiencePoints || left.serial - right.serial)[0];
  if (!loaded || !enabled) return null;
  const effect = Math.min(5, Math.max(0, ...eligible.filter((member) => selected.has(member.id)).map((member) => member.specialtyEffectPercent)));
  return (
    <fieldset className="se-crew-team" disabled={disabled}>
      <legend>Optional team · {specialty === 'ENFORCER' ? 'Raid enforcers' : 'Scouts'}</legend>
      <p>Pick up to five available {role === 'THUG' ? 'thugs' : 'workers'}. Selected specialties provide up to {effect}% {labels[specialty]}; effects do not stack. The rest of the crew still works as usual.</p>
      <div className="se-crew-team__actions">
        <button type="button" className="se-btn se-btn--sm" disabled={!recommended} onClick={() => onChange(recommended ? [recommended.id] : [])}>Recommended lineup</button>
        <button type="button" className="se-btn se-btn--sm" disabled={!selectedIds.length} onClick={() => onChange([])}>Clear selection</button>
      </div>
      {eligible.length ? <div className="se-crew-team__members">
        {eligible.map((member) => (
          <label key={member.id} className="se-crew-team__member">
            <input type="checkbox" checked={selected.has(member.id)} onChange={(event) => {
              if (event.target.checked) { if (selectedIds.length < 5) onChange([...selectedIds, member.id]); }
              else onChange(selectedIds.filter((id) => id !== member.id));
            }} />
            <span><strong>{member.name}</strong><small>Tier {member.specialtyLevel} · {member.specialtyEffectPercent}% {labels[specialty]} · #{member.serial}</small></span>
          </label>
        ))}
      </div> : <p className="se-muted">No available specialists yet. You can still send the regular crew.</p>}
      {members.some((member) => member.status !== 'AVAILABLE') ? <details className="se-crew-team__conflicts">
        <summary>Unavailable specialists · {members.filter((member) => member.status !== 'AVAILABLE').length}</summary>
        <ul>{members.filter((member) => member.status !== 'AVAILABLE').map((member) => <li key={member.id}>
          <span>{member.name} · #{member.serial}</span>
          <small>{member.unavailableReason ?? member.assignment?.label ?? member.status.replaceAll('_', ' ').toLowerCase()}</small>
        </li>)}</ul>
      </details> : null}
    </fieldset>
  );
}
