import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CitiesDto, CrewMemberDto, CrewMemberStatusDto, CrewMentorBondDto, CrewPutToWorkResult, CrewRosterDto, DealerPageDto, GameActionResult, TurfBlockDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { crewApi, type CrewRosterFilters } from '../api/crew.js';
import { authApi } from '../api/auth.js';
import { dealersApi } from '../api/dealers.js';
import { api, ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { EmpireInspector, EmpireManagementLayout, EmpireMetricStrip, EmpirePageHeader, EmpireRosterCard } from '../components/EmpireManagement.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { crewProgressSnapshot, nextCrewCelebration, type CrewProgressSnapshot, type CrewCelebration } from '../utils/crew-celebrations.js';
import { awayThugGroups } from '../utils/crewWhereabouts.js';
import '../styles/crew-roster.css';

const statusLabels: Record<CrewMemberStatusDto, string> = {
  AVAILABLE: 'Available', ASSIGNED: 'Assigned', IN_TRANSIT: 'Away on a run', RECOVERING: 'Recovering', RELEASED: 'Released',
};
const specialtyLabels: Record<CrewMemberDto['specialty'], string> = {
  GENERALIST: 'Generalist', ENFORCER: 'Enforcer', WHEELMAN: 'Wheelman', SCOUT: 'Scout', DEALER: 'Dealer', SERVICE: 'Service specialist',
};
const effectLabels: Record<CrewMemberDto['specialty'], string> = {
  GENERALIST: 'no specialty effect', ENFORCER: 'raid strength', WHEELMAN: 'road-stop risk reduction', SCOUT: 'scouting income', DEALER: 'dealer pace and cut', SERVICE: 'worker service performance',
};

type AssignmentTarget =
  | { key: string; kind: 'DEALER'; id: string; title: string; meta: string; count: number; capacity: number }
  | { key: string; kind: 'RUNNER'; id: string; title: string; meta: string; count: number }
  | { key: string; kind: 'TURF'; id: string; district: TurfBlockDto['district']; title: string; meta: string; count: number; guns: number; postTurnCost: number; pullTurnCost: number };

function shortMember(member: CrewMemberDto): string {
  return `#${String(member.serial).padStart(3, '0')} · ${member.name}`;
}

const assignmentPlaceLabels: Record<NonNullable<CrewMemberDto['assignment']>['kind'], string> = {
  BUSINESS: 'On a business',
  DEALER: 'With a dealer crew',
  TURF: 'Posted on a corner',
  CORNER_ENFORCER: 'Corner enforcers',
  CORNER_LOOKOUT: 'Lookouts',
  STASH_GUARD: 'Stash guards',
  RUNNER: 'Running product',
  BODYGUARD: 'Bodyguarding',
  ESCORT: 'Escorting a run',
};

function MemberPick({ member, checked, onToggle }: { member: CrewMemberDto; checked: boolean; onToggle: () => void }) {
  return (
    <label className="se-crew-board__member">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span>
        <strong>{shortMember(member)}</strong>
        <small>{specialtyLabels[member.specialty]} · {formatNumber(member.specialtyExperiencePoints)} XP</small>
      </span>
    </label>
  );
}

function CrewJobsBoard({
  roster,
  dealers,
  cities,
  onDone,
}: {
  roster: CrewRosterDto;
  dealers: DealerPageDto | null;
  cities: CitiesDto | null;
  onDone: () => Promise<void>;
}) {
  const me = useSession((state) => state.me);
  const action = useGameAction<CrewPutToWorkResult>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [poolLimit, setPoolLimit] = useState(30);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const members = roster.members;
  const byId = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const selected = selectedIds.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
  const available = members.filter((member) => member.role === 'THUG' && member.status === 'AVAILABLE');
  const awayGroups = awayThugGroups(members);
  const awayCount = awayGroups.reduce((sum, group) => sum + group.members.length, 0);
  const thugTotals = roster.totals.find((row) => row.role === 'THUG');
  const awayOnRecord = thugTotals ? thugTotals.members - thugTotals.byStatus.AVAILABLE : awayCount;
  const selectedAvailable = selected.filter((member) => member.role === 'THUG' && member.status === 'AVAILABLE');
  const guns = me ? me.resources.pistols + me.resources.shotguns + me.resources.tek9s + me.resources.ak47s : 0;
  const turns = me?.turns.turns ?? 0;

  const dealerTargets: AssignmentTarget[] = dealers?.enabled && dealers.rules ? dealers.crews.map((crew) => ({
    key: `dealer:${crew.id}`,
    kind: 'DEALER',
    id: crew.id,
    title: `${crew.districtName} · ${crew.cityName}`,
    meta: `${crew.status === 'PAUSED' ? 'Paused' : 'Working'} · holds ${formatNumber(crew.inventoryUnits)} of ${formatNumber(crew.capacityUnits)}`,
    count: crew.dealers.length,
    capacity: dealers.rules!.maxDealersPerCrew,
  })) : [];
  const runnerTargets: AssignmentTarget[] = dealers?.enabled && dealers.rules ? dealers.crews.map((crew) => ({
    key: `runner:${crew.id}`,
    kind: 'RUNNER' as const,
    id: crew.id,
    title: `${crew.districtName} · ${crew.cityName}`,
    meta: `Moves ${formatNumber(crew.runnerUnitsPerHour)} units/hour · keeps ${formatNumber(crew.runnerReserveUnits)} stored`,
    count: crew.runnerCount,
  })) : [];
  const turfTargets: AssignmentTarget[] = (cities?.enabled ? cities.cities : [])
    .filter((city) => city.isHome)
    .flatMap((city) => city.turf?.blocks.filter((block) => block.isMine).map((block) => ({
      key: `turf:${block.id}`,
      kind: 'TURF' as const,
      id: block.id,
      district: block.district,
      title: `${block.districtName} · ${city.name}`,
      meta: `${formatNumber(block.cornerMinimumThugs)} minimum · ${block.push ? 'push visible' : 'quiet'}`,
      count: block.cornerThugs,
      guns: block.cornerGuns.total,
      postTurnCost: city.turf!.postTurnCost,
      pullTurnCost: city.turf!.pullTurnCost,
    })) ?? []);
  const targets = [...dealerTargets, ...runnerTargets, ...turfTargets];
  const activeTarget = targets.find((target) => target.key === selectedTargetKey) ?? targets[0] ?? null;

  const toggle = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  const clear = () => setSelectedIds([]);
  const run = async (call: (actionId: string) => Promise<GameActionResult<CrewPutToWorkResult>>) => {
    await action.run(call);
    setSelectedIds([]);
    await onDone();
  };
  const assignedTo = (target: AssignmentTarget) => members.filter((member) => member.assignment?.kind === target.kind && member.assignment.ref === target.id);

  return (
    <Panel title="Crew jobs board" aside={`${formatNumber(available.length)} fit thugs shown`}>
      {action.error ? <Alert>{action.error}</Alert> : null}
      <div className="se-crew-board__metrics">
        <span><strong>{formatNumber(me?.resources.fitThugs ?? available.length)}</strong><small>fit at home</small></span>
        <span><strong>{formatNumber(guns)}</strong><small>home guns</small></span>
        <span><strong>{formatNumber(turns)}</strong><small>turns ready</small></span>
        <span><strong>{formatNumber(selectedIds.length)}</strong><small>selected</small></span>
      </div>
      <div className="se-crew-board">
        <section className="se-crew-board__pool" aria-label="Available thugs">
          <div className="se-crew-board__sectionhead">
            <h3>Home thugs</h3>
            <button type="button" className="se-linkbtn" onClick={clear} disabled={!selectedIds.length}>Clear</button>
          </div>
          {available.length ? (
            <div className="se-crew-board__members">
              {available.slice(0, poolLimit).map((member) => (
                <MemberPick key={member.id} member={member} checked={selectedIds.includes(member.id)} onToggle={() => toggle(member.id)} />
              ))}
            </div>
          ) : <p className="se-muted">{awayCount ? 'Nobody is at home. The thugs who left are listed below, with where they are.' : 'No available thugs in this roster page.'}</p>}
          {available.length > poolLimit ? <button className="se-btn se-btn--ghost se-btn--sm" type="button" onClick={() => setPoolLimit((limit) => limit + 30)}>Show 30 more · {formatNumber(available.length - poolLimit)} remaining</button> : null}
          <div className="se-crew-board__away">
            <div className="se-crew-board__sectionhead">
              <h3>Away</h3>
              <span>{formatNumber(awayCount)}</span>
            </div>
            {awayGroups.length ? (
              <div className="se-crew-board__places">
                {awayGroups.map((group) => (
                  <div key={group.place} className="se-crew-board__place">
                    <h4>{group.place} <span>{formatNumber(group.members.length)}</span></h4>
                    {group.members.map((member) => (
                      <MemberPick key={member.id} member={member} checked={selectedIds.includes(member.id)} onToggle={() => toggle(member.id)} />
                    ))}
                  </div>
                ))}
              </div>
            ) : <p className="se-muted">No thugs are away.</p>}
            {awayOnRecord > awayCount ? <p className="se-crew-roster__note">Showing {formatNumber(awayCount)} of {formatNumber(awayOnRecord)} away thugs loaded on this board.</p> : null}
          </div>
        </section>

        <section className="se-crew-board__targets" aria-label="Assignment slots">
          {activeTarget ? (() => {
            const target = activeTarget;
            const here = assignedTo(target);
            const selectedHere = selected.filter((member) => member.assignment?.kind === target.kind && member.assignment.ref === target.id);
            const selectedElsewhere = selected.filter((member) => member.assignment?.kind === target.kind && member.assignment.ref && member.assignment.ref !== target.id);
            const room = target.kind === 'DEALER' ? Math.max(0, target.capacity - target.count) : Number.MAX_SAFE_INTEGER;
            const assignBlock = action.busy ? 'Working.' : !selectedAvailable.length ? 'Choose home thugs first.' : target.kind === 'DEALER' && selectedAvailable.length > room ? `This crew has room for ${formatNumber(room)}.` : target.kind === 'TURF' && selectedAvailable.length > guns ? `You have ${formatNumber(guns)} home guns.` : target.kind === 'TURF' && selectedAvailable.length > (me?.resources.fitThugs ?? selectedAvailable.length) ? `You have ${formatNumber(me?.resources.fitThugs ?? 0)} fit thugs.` : target.kind === 'TURF' && turns < target.postTurnCost ? `Posting costs ${target.postTurnCost} turns.` : null;
            const moveBlock = action.busy ? 'Working.' : !selectedElsewhere.length ? `Choose ${target.kind === 'DEALER' ? 'dealers' : target.kind === 'RUNNER' ? 'runners' : 'corner thugs'} from another slot.` : target.kind === 'DEALER' && selectedElsewhere.length > room ? `This crew has room for ${formatNumber(room)}.` : target.kind === 'TURF' && turns < target.postTurnCost ? `Moving costs ${target.postTurnCost} turns.` : null;
            const returnBlock = action.busy ? 'Working.' : !selectedHere.length ? 'Choose people from this slot.' : target.kind === 'TURF' && turns < target.pullTurnCost ? `Pulling costs ${target.pullTurnCost} turns.` : null;
            return <EmpireManagementLayout
              listLabel="Assignment targets"
              list={targets.map((entry) => <EmpireRosterCard key={entry.key} eyebrow={entry.kind === 'DEALER' ? 'Dealer crew' : entry.kind === 'RUNNER' ? 'Runners' : 'Corner'} title={entry.title} detail={entry.meta} status={entry.kind === 'DEALER' ? `${entry.count}/${entry.capacity}` : formatNumber(entry.count)} statusTone={entry.count ? 'accent' : 'muted'} selected={entry.key === target.key} onSelect={() => setSelectedTargetKey(entry.key)} selectLabel={`Manage ${entry.title} ${entry.kind.toLowerCase()} assignments`} />)}
              inspector={<EmpireInspector eyebrow={target.kind === 'DEALER' ? 'Dealer crew' : target.kind === 'RUNNER' ? 'Runner route' : 'Held corner'} title={target.title} status={`${formatNumber(target.count)} posted`} statusTone={target.count ? 'accent' : 'muted'} label={`${target.title} assignments`}>
                <p className="se-hint">{target.meta}</p>
                {here.length ? <div className="se-crew-board__members se-crew-board__members--compact">{here.map((member) => <MemberPick key={member.id} member={member} checked={selectedIds.includes(member.id)} onToggle={() => toggle(member.id)} />)}</div> : <p className="se-muted">No named members are posted here.</p>}
                {here.length < target.count ? <p className="se-hint">{formatNumber(target.count - here.length)} posted here {here.length ? 'are not tied to a named thug' : 'have no named thug recorded'}.</p> : null}
                <div className="se-crew-board__actions">
                  <Button className="se-btn se-btn--sm" disabledReason={assignBlock} onClick={() => void run((actionId) => target.kind === 'DEALER' ? crewApi.assignDealers(target.id, selectedAvailable.map((member) => member.id), actionId) : target.kind === 'RUNNER' ? crewApi.assignRunners(target.id, selectedAvailable.map((member) => member.id), actionId) : crewApi.postTurf(target.district, selectedAvailable.map((member) => member.id), actionId))}>Send selected</Button>
                  <Button className="se-btn se-btn--ghost se-btn--sm" disabledReason={moveBlock} onClick={() => void run((actionId) => target.kind === 'DEALER' ? crewApi.moveDealers(target.id, selectedElsewhere.map((member) => member.id), actionId) : target.kind === 'RUNNER' ? crewApi.moveRunners(target.id, selectedElsewhere.map((member) => member.id), actionId) : crewApi.moveTurf(target.district, selectedElsewhere.map((member) => member.id), actionId))}>Move selected</Button>
                  <Button className="se-btn se-btn--ghost se-btn--sm" disabledReason={returnBlock} onClick={() => void run((actionId) => target.kind === 'DEALER' ? crewApi.releaseDealers(selectedHere.map((member) => member.id), actionId) : target.kind === 'RUNNER' ? crewApi.releaseRunners(selectedHere.map((member) => member.id), actionId) : crewApi.pullTurf(target.district, selectedHere.map((member) => member.id), actionId))}>Bring home</Button>
                </div>
              </EmpireInspector>}
            />;
          })() : <p className="se-muted">No dealer crews or held home corners are open for assignments yet.</p>}
        </section>
      </div>
      {roster.total > roster.members.length ? <p className="se-crew-roster__note">Showing the first {formatNumber(roster.members.length)} active roster members on the board.</p> : null}
    </Panel>
  );
}

function CrewMemberCard({ member, peers, bonds, busy, onExchange, onTrain, onNickname }: { member: CrewMemberDto; peers: CrewMemberDto[]; bonds: CrewMentorBondDto[]; busy: boolean; onExchange: (memberId: string, replaceMemberId: string) => void; onTrain: (memberId: string) => void; onNickname: (memberId: string, key: string | null) => void }) {
  const [replaceId, setReplaceId] = useState('');
  const candidates = peers.filter((peer) => peer.id !== member.id && peer.role === member.role && !peer.dealerStaffId && !member.dealerStaffId && (
    (member.status === 'AVAILABLE' && ['ASSIGNED', 'RELEASED'].includes(peer.status))
    || (peer.status === 'AVAILABLE' && ['ASSIGNED', 'RELEASED'].includes(member.status))
    || (member.status === 'ASSIGNED' && peer.status === 'RELEASED')
    || (member.status === 'ASSIGNED' && peer.status === 'ASSIGNED')
  ));
  return (
    <article className="se-crew-roster__member">
      <div className="se-crew-roster__member-head">
        <div>
          <span className="se-eyebrow">{member.role === 'THUG' ? 'Thug' : 'Worker'} · #{String(member.serial).padStart(3, '0')}</span>
          <h3>{member.name}{member.legend?.nickname && !member.legend.moderated ? <span className="se-crew-legend__nickname"> · {member.legend.nickname.label}</span> : null}</h3>
        </div>
        <span className={`se-crew-roster__status se-crew-roster__status--${member.status.toLowerCase()}`}>{statusLabels[member.status]}</span>
      </div>
      <div className="se-crew-roster__facts">
        <div><span>Current assignment</span><strong>{member.assignment?.label ?? (member.status === 'RELEASED' ? 'Outside the active crew' : 'Home crew')}</strong></div>
        <div><span>Experience</span><strong>{formatNumber(member.experiencePoints)} XP</strong></div>
        {member.loyalty.enabled ? <div><span>Crew loyalty</span><strong>{member.loyalty.points}/100 · {member.loyalty.tier}</strong></div> : null}
        <div><span>Specialty</span><strong>{specialtyLabels[member.specialty]}</strong></div>
      </div>
      <p className="se-crew-roster__note">
        {member.specialty === 'GENERALIST'
          ? `${formatNumber(member.specialtyExperiencePoints)} career XP · ${member.nextSpecialtyMilestone ? `${formatNumber(Math.max(0, member.nextSpecialtyMilestone - member.specialtyExperiencePoints))} XP to a specialty` : 'No specialty progression this round'}`
          : member.specialty === 'DEALER'
            ? `Dealer career · ${formatNumber(member.specialtyExperiencePoints)} XP · pace and cut follow dealer tiers`
            : `Tier ${member.specialtyLevel} · ${member.specialtyEffectPercent}% ${effectLabels[member.specialty]} · ${member.nextSpecialtyMilestone ? `${formatNumber(Math.max(0, member.nextSpecialtyMilestone - member.specialtyExperiencePoints))} XP to next tier` : 'career capped'}`}
      </p>
      {member.lastMajorMoment ? (
        <div className="se-crew-explorer__last" aria-label="Most recent verified crew achievement">
          <strong>Latest verified moment</strong>
          <p>{member.lastMajorMoment.label}</p>
          <time dateTime={member.lastMajorMoment.at}>{new Date(member.lastMajorMoment.at).toLocaleDateString()}</time>
        </div>
      ) : member.loyalty.enabled ? <p className="se-crew-roster__note">No credited work milestones yet. Assignments and paid training do not generate one.</p> : null}
      {member.unavailableReason ? <p className="se-crew-roster__reason">{member.unavailableReason}</p> : null}
      {bonds.filter((bond) => bond.mentorId === member.id || bond.apprenticeId === member.id).length > 0 ? (
        <div className="se-crew-explorer__bonds">
          <strong>Relationships</strong>
          {bonds.filter((bond) => bond.mentorId === member.id || bond.apprenticeId === member.id).map((bond) => (
            <p key={bond.id}>{bond.mentorId === member.id ? `Mentoring ${bond.apprenticeName}` : `Mentored by ${bond.mentorName}`} · {bond.milestone} · {bond.lessons}/{bond.maxLessons} memories{bond.endedAt ? ' · Ended' : ''}</p>
          ))}
        </div>
      ) : null}
      {candidates.length ? <div className="se-crew-roster__actions">
        <label>Swap with <select className="se-input" value={replaceId} onChange={(event) => setReplaceId(event.target.value)}>
          <option value="">Choose a member</option>{candidates.map((peer) => <option key={peer.id} value={peer.id}>#{peer.serial} · {peer.status === 'RELEASED' ? 'released veteran' : peer.assignment?.label ?? peer.status.toLowerCase()}</option>)}
        </select></label>
        <button className="se-btn se-btn--sm" type="button" disabled={busy || !replaceId} onClick={() => onExchange(member.id, replaceId)}>Confirm swap</button>
      </div> : null}
      {member.status === 'AVAILABLE' && member.specialty !== 'GENERALIST' && member.specialty !== 'DEALER' && member.specialtyLevel === 1 ? <div className="se-crew-roster__actions">
        <button className="se-btn se-btn--sm" type="button" disabled={busy} onClick={() => onTrain(member.id)}>Train · 1 turn + $5,000 · up to 5 XP</button>
      </div> : null}
      {member.legend && (member.legend.options.length > 0 || member.legend.moderated) ? (
        <div className="se-crew-legend__select">
          <label>Earned nickname
            <select className="se-input" value={member.legend.nickname?.key ?? ''} disabled={busy || member.legend.moderated || member.status === 'RELEASED'}
              onChange={(event) => onNickname(member.id, event.target.value || null)}>
              <option value="">Use first earned name</option>
              {member.legend.options.map((option) => <option key={option.key} value={option.key}>{option.label} — {option.proof}</option>)}
            </select>
          </label>
          {member.legend.moderated ? <small>Staff moderation has disabled nicknames for this member.</small> : <small>Presets are unlocked through real work. No combat or income benefits.</small>}
        </div>
      ) : null}
      <div className="se-crew-roster__traits" aria-label="Crew traits">
        {member.traits.map((trait) => <span key={trait}>{trait}</span>)}
      </div>
      {member.moments.length ? <details className="se-crew-roster__history se-crew-roster__moments">
        <summary>Crew stories <span>{member.moments.length} verified moments</span></summary>
        <p className="se-crew-roster__note">Interpretive flavor inspired by genuine crew actions, not verified dialogue or extra gameplay bonuses.</p>
        <ol>{member.moments.map((moment, index) => (
          <li key={`${moment.source}-${moment.at}-${index}`}>
            <span><strong>{moment.title}</strong> · {moment.description}</span>
            <time dateTime={moment.at}>{new Date(moment.at).toLocaleDateString()}</time>
          </li>
        ))}</ol>
      </details> : null}
      {member.loyalty.enabled ? <details className="se-crew-roster__history">
        <summary>Loyalty ledger <span>{member.loyalty.history.length} recent receipts</span></summary>
        <p className="se-crew-roster__note">Earned through completed work, defended corners, and finished shifts or travel. Maximum 8/day, 32/week, 100/round; assignments and paid training do not count. {member.loyalty.nextMilestone !== null ? `Next milestone: ${member.loyalty.nextMilestone}.` : 'All milestones earned.'}</p>
        {member.loyalty.history.length ? <ol>{member.loyalty.history.map((entry, index) =>
          <li key={`${entry.at}-${entry.source}-${index}`}>
            <span>{entry.label}</span><time dateTime={entry.at}>{new Date(entry.at).toLocaleDateString()}</time>
          </li>)}</ol> : <p className="se-crew-roster__note">Complete eligible work to earn your first loyalty receipt.</p>}
      </details> : null}
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
  const me = useSession((state) => state.me);
  const showCrewMoments = useSession((state) => state.profileSettings.showCrewMoments ?? false);
  const showCrewCelebrations = useSession((state) => state.profileSettings.showCrewCelebrations ?? false);
  const reducedMotion = useSession((state) => state.profileSettings.reducedMotion);
  const setProfileSettings = useSession((state) => state.setProfileSettings);
  const [momentsSaving, setMomentsSaving] = useState(false);
  const [celebrationsSaving, setCelebrationsSaving] = useState(false);
  const [celebration, setCelebration] = useState<CrewCelebration | null>(null);
  const snapshotRef = useRef<Map<string, CrewProgressSnapshot> | null>(null);
  // Both controls save the *entire* profile: serialize to prevent stale cross-toggle overwrites.
  const settingsSaveRef = useRef(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [pageSearch, setPageSearch] = useState('');
  const [mentorId, setMentorId] = useState('');
  const [apprenticeId, setApprenticeId] = useState('');
  const [bondBusy, setBondBusy] = useState(false);
  const [role, setRole] = useState<CrewRosterFilters['role']>();
  const [status, setStatus] = useState<CrewRosterFilters['status']>();
  const [assignment, setAssignment] = useState<CrewRosterFilters['assignment']>();
  const [specialty, setSpecialty] = useState<CrewRosterFilters['specialty']>();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof crewApi.roster>> | null>(null);
  const [boardData, setBoardData] = useState<CrewRosterDto | null>(null);
  const [dealers, setDealers] = useState<DealerPageDto | null>(null);
  const [cities, setCities] = useState<CitiesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const filters = useMemo(() => ({ role, status, assignment, specialty, limit: 50, offset }), [role, status, assignment, specialty, offset]);
  const filtersKey = JSON.stringify(filters);
  const loadBoard = useCallback(async () => {
    setBoardLoading(true);
    setBoardError(null);
    try {
      const [roster, dealerPage, cityPage] = await Promise.all([
        crewApi.roster({ limit: 200, offset: 0 }),
        dealersApi.page().catch(() => null),
        api.get<CitiesDto>('/game/cities').catch(() => null),
      ]);
      setBoardData(roster);
      setDealers(dealerPage);
      setCities(cityPage);
    } catch (caught) {
      setBoardError(caught instanceof ApiError ? caught.message : 'Could not load the crew jobs board.');
    } finally {
      setBoardLoading(false);
    }
  }, []);

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
  useEffect(() => { void loadBoard(); }, [loadBoard, me?.id]);

  // Preserve one detail inspector on desktop and mobile; 50 rows are paginated
  // server-side, and only one expensive career panel is mounted at a time.
  const visibleMembers = useMemo(() => {
    const search = pageSearch.trim().toLocaleLowerCase();
    if (!search) return data?.members ?? [];
    return (data?.members ?? []).filter((member) =>
      [member.name, String(member.serial), member.legend?.nickname?.label ?? '',
        member.assignment?.label ?? '', specialtyLabels[member.specialty]]
        .some((value) => value.toLocaleLowerCase().includes(search)));
  }, [data, pageSearch]);
  const selectedMember = visibleMembers.find((member) => member.id === selectedMemberId) ?? visibleMembers[0] ?? null;
  // Snapshot only observed verified progress. Initial data sets a baseline;
  // navigation/reloads never replay old milestones as a fresh reward.
  useEffect(() => {
    if (!data?.enabled) { snapshotRef.current = null; return; }
    const current = crewProgressSnapshot(data.members, data.bonds ?? []);
    if (snapshotRef.current && showCrewCelebrations) {
      const event = nextCrewCelebration(snapshotRef.current, current, data.members, data.bonds ?? []);
      if (event) setCelebration(event);
    }
    snapshotRef.current = current;
  }, [data, showCrewCelebrations]);
  const allMembers = data?.totals.reduce((sum, row) => sum + row.members, 0) ?? 0;
  const candidateMembers = boardData?.members ?? data?.members ?? [];
  const mentorChoice = candidateMembers.find((member) => member.id === mentorId);
  const activeBonds = data?.bonds?.filter((bond) => !bond.endedAt) ?? [];
  const availableMentors = candidateMembers.filter((member) =>
    member.status !== 'RELEASED' && (member.experiencePoints >= 100 || member.loyalty.points >= 25)
    && !activeBonds.some((bond) => bond.apprenticeId === member.id)
    && activeBonds.filter((bond) => bond.mentorId === member.id).length < 2
  );
  const availableApprentices = candidateMembers.filter((member) =>
    member.status !== 'RELEASED' && member.loyalty.points < 25
    && mentorChoice && member.id !== mentorId
    && member.role === mentorChoice.role && member.experiencePoints < mentorChoice.experiencePoints
    && !activeBonds.some((bond) => bond.mentorId === member.id)
    && !(data?.bonds ?? []).some((bond) => bond.apprenticeId === member.id)
    && !(data?.mentoredMemberIds ?? []).includes(member.id)
    && !(boardData?.mentoredMemberIds ?? []).includes(member.id)
  );

  const refreshRoster = useCallback(async () => {
    const next = await crewApi.roster(filters);
    setData(next);
  }, [filters]);
  const refresh = async () => {
    const [next] = await Promise.all([crewApi.roster(filters), loadBoard()]);
    setData(next);
  };
  const exchange = async (memberId: string, replaceMemberId: string) => {
    setActionBusy(true); setError(null);
    try { await crewApi.exchange(memberId, replaceMemberId, crypto.randomUUID()); await refresh(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not update the crew assignment.'); }
    finally { setActionBusy(false); }
  };
  const toggleMoments = async (checked: boolean) => {
    if (settingsSaveRef.current) return;
    settingsSaveRef.current = true;
    setMomentsSaving(true);
    setError(null);
    try {
      // Save against the server's latest profile, not a potentially stale
      // cosmetic/settings draft. Reuse the authenticated settings endpoint.
      const { settings } = await authApi.profileSettings();
      const updated = await authApi.updateProfileSettings({
        ...settings,
        itemCosmetics: settings.itemCosmetics ?? {},
        crewCosmetics: settings.crewCosmetics ?? { THUG: 'classic', HOE: 'classic' },
        showThemeOnProfile: settings.showThemeOnProfile ?? true,
        showLookOnProfile: settings.showLookOnProfile ?? true,
        showCrewMoments: checked,
      });
      setProfileSettings(updated.settings);
      // Re-read from the server: opted-out users receive an empty stories array.
      const refreshed = await crewApi.roster(filters);
      setData(refreshed);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save the crew stories preference.');
    } finally {
      settingsSaveRef.current = false;
      setMomentsSaving(false);
    }
  };
  const toggleCelebrations = async (checked: boolean) => {
    if (settingsSaveRef.current) return;
    settingsSaveRef.current = true;
    setCelebrationsSaving(true);
    setError(null);
    try {
      const { settings } = await authApi.profileSettings();
      const updated = await authApi.updateProfileSettings({
        ...settings,
        itemCosmetics: settings.itemCosmetics ?? {},
        crewCosmetics: settings.crewCosmetics ?? { THUG: 'classic', HOE: 'classic' },
        showThemeOnProfile: settings.showThemeOnProfile ?? true,
        showLookOnProfile: settings.showLookOnProfile ?? true,
        showCrewCelebrations: checked,
      });
      setProfileSettings(updated.settings);
      if (!checked) setCelebration(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save the celebration preference.');
    } finally {
      settingsSaveRef.current = false;
      setCelebrationsSaving(false);
    }
  };
  const linkMentor = async () => {
    if (bondBusy || !mentorId || !apprenticeId) return;
    setBondBusy(true);
    setError(null);
    try {
      await crewApi.linkMentor(mentorId, apprenticeId);
      setMentorId('');
      setApprenticeId('');
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not form that crew bond.');
    } finally {
      setBondBusy(false);
    }
  };
  const endMentor = async (bondId: string) => {
    if (bondBusy) return;
    setBondBusy(true);
    setError(null);
    try {
      await crewApi.endMentor(bondId);
      await refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not end that crew bond.');
    } finally {
      setBondBusy(false);
    }
  };
  const nickname = async (memberId: string, key: string | null) => {
    setActionBusy(true); setError(null);
    try { await crewApi.chooseNickname(memberId, key); await refresh(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not choose that nickname.'); }
    finally { setActionBusy(false); }
  };
  const train = async (memberId: string) => {
    setActionBusy(true); setError(null);
    try { await crewApi.train(memberId, crypto.randomUUID()); await refresh(); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not complete crew training.'); }
    finally { setActionBusy(false); }
  };

  return (
    <GameLayout>
      <div className="se-crew-roster">
        <EmpirePageHeader eyebrow="Your people · their careers" title="Crew Assignments" description="Pick people first, choose an open job, and move thugs between home, dealer crews, routes, and corners from one board." />
        <EmpireMetricStrip label="Crew roster summary" items={[
          { key: 'active', label: 'Active crew', value: formatNumber(allMembers), tone: 'accent' },
          { key: 'released', label: 'Released careers', value: formatNumber(data?.totals.reduce((sum, row) => sum + row.released, 0) ?? 0) },
          { key: 'available', label: 'Fit at home', value: formatNumber(me?.resources.fitThugs ?? 0), tone: (me?.resources.fitThugs ?? 0) ? 'good' : 'warn' },
        ]} />

        {error ? <Alert>{error}</Alert> : null}
        {showCrewCelebrations && celebration ? (
          <div className={`se-crew-celebration${reducedMotion ? ' se-crew-celebration--still' : ''}`} role="status" aria-live="polite" aria-atomic="true">
            <div className="se-crew-celebration__medallion" aria-hidden="true">★</div>
            <div>
              <span className="se-eyebrow">Crew achievement · cosmetic recognition</span>
              <strong>{celebration.heading}</strong>
              <p>{celebration.message}</p>
            </div>
            <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setCelebration(null)} aria-label="Dismiss crew achievement">Dismiss</button>
          </div>
        ) : null}
        {boardError ? <Alert>{boardError}</Alert> : null}
        {data && !data.enabled && !loading ? <Alert>This round does not use individual crew profiles.</Alert> : null}

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
                  {row.role === 'THUG' && Object.values(row.byAssignment).some((count) => count > 0) ? (
                    <div className="se-crew-roster__places">
                      {Object.entries(row.byAssignment).filter(([, count]) => count > 0).map(([kind, count]) => (
                        <span key={kind}>{assignmentPlaceLabels[kind as keyof typeof assignmentPlaceLabels] ?? kind} <strong>{formatNumber(count)}</strong></span>
                      ))}
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </Panel>
        ) : null}

        {data?.bondsEnabled ? (
          <Panel title="Mentors & crew bonds" aside="Optional · round-only">
            <p className="se-crew-roster__note">Let an experienced member guide a newer one. A mentor needs 100 earned XP or 25 loyalty; both people must have the same role. They gain a shared memory only after both receive credit for the same genuine operation, not by moving members or paying for training. Maximum five memories, one per UTC day. No combat bonuses.</p>
            <div className="se-crew-bonds__form">
              <label>Mentor
                <select className="se-input" value={mentorId} onChange={(e) => setMentorId(e.target.value)} disabled={bondBusy}>
                  <option value="">Choose a veteran</option>
                  {availableMentors.map(m => <option key={m.id} value={m.id}>{shortMember(m)} · {m.experiencePoints} XP · {m.loyalty.points} loyalty</option>)}
                </select>
              </label>
              <label>Apprentice
                <select className="se-input" value={apprenticeId} onChange={(e) => setApprenticeId(e.target.value)} disabled={bondBusy || !mentorChoice}>
                  <option value="">Choose a newer member</option>
                  {availableApprentices.map(m => <option key={m.id} value={m.id}>{shortMember(m)} · {m.experiencePoints} XP</option>)}
                </select>
              </label>
              <Button onClick={() => void linkMentor()} disabledReason={bondBusy ? 'Saving this bond.' : !mentorChoice || !availableApprentices.some((m) => m.id === apprenticeId) ? 'Choose an eligible mentor and apprentice.' : null}>Start mentorship</Button>
            </div>
            {(data.bonds ?? []).length ? (
              <div className="se-crew-bonds__list">
                {(data.bonds ?? []).map(bond => (
                  <article className="se-crew-bonds__entry" key={bond.id}>
                    <div className="se-crew-bonds__entry-heading">
                      <div><strong>{bond.mentorName} → {bond.apprenticeName}</strong><small>{bond.milestone} · {bond.lessons}/{bond.maxLessons} shared memories{bond.endedAt ? ' · Ended' : ''}</small></div>
                      {!bond.endedAt ? <button type="button" className="se-btn se-btn--ghost se-btn--sm" disabled={bondBusy} onClick={() => void endMentor(bond.id)}>End bond</button> : null}
                    </div>
                    {bond.memories.length ? <ol>{bond.memories.map((memory, index) => <li key={`${memory.source}-${memory.at}-${index}`}>
                      <span>{memory.label}</span>
                      <time dateTime={memory.at}>{new Date(memory.at).toLocaleDateString()}</time>
                    </li>)}</ol> : <p className="se-muted">No shared work memories yet. Normal work together builds the bond naturally.</p>}
                  </article>
                ))}
              </div>
            ) : <p className="se-muted">Your crew has no mentor bonds yet.</p>}
            <p className="se-crew-roster__note">One mentor per apprentice per round; ending a bond keeps its history and does not grant a new mentorship slot to the same apprentice.</p>
          </Panel>
        ) : null}

        {boardData?.enabled ? (
          <CrewJobsBoard roster={boardData} dealers={dealers} cities={cities} onDone={refresh} />
        ) : boardLoading ? (
          <Panel title="Crew jobs board"><p className="se-muted">Checking open assignments...</p></Panel>
        ) : null}

        {data?.enabled ? (
          <Panel title="Roster search" aside={`${formatNumber(data.total)} matches`}>
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
                <option value="">All specialties</option><option value="GENERALIST">Generalist</option><option value="ENFORCER">Enforcer</option><option value="WHEELMAN">Wheelman</option><option value="SCOUT">Scout</option><option value="DEALER">Dealer</option><option value="SERVICE">Service</option>
              </select></label>
            </div>
            {data.members.some((member) => member.loyalty.enabled) ? (
              <label className="se-crew-roster__moments-opt-in">
                <input type="checkbox" checked={showCrewMoments} disabled={momentsSaving || celebrationsSaving} onChange={(event) => void toggleMoments(event.target.checked)} />
                <span><strong>Show crew stories</strong><small>Private personality moments based on real work and injuries. Optional, no daily chore, and no gameplay power.</small></span>
              </label>
            ) : null}
            {data.members.some((member) => member.loyalty.enabled) ? (
              <label className="se-crew-roster__moments-opt-in">
                <input type="checkbox" checked={showCrewCelebrations} disabled={momentsSaving || celebrationsSaving} onChange={(event) => void toggleCelebrations(event.target.checked)} />
                <span><strong>Celebrate new crew milestones</strong><small>Optional, off by default. A small dismissible recognition appears only when this roster observes newly earned, server-verified progress. No sound, currency, bonuses, or retroactive popups.</small></span>
              </label>
            ) : null}
            <p className="se-crew-roster__note">Completed raids, scouting trips, and returned runs earn specialty XP. Bonuses cap at 5% and apply only to that job. Training costs 1 turn and $5,000, adds up to 5 XP toward an earned specialty tier, and is capped by completed-work experience.</p>
            <div className="se-crew-explorer__tools">
              <label htmlFor="se-crew-search-page">Find on this page
                <input id="se-crew-search-page" className="se-input" type="search" value={pageSearch} onChange={(event) => setPageSearch(event.target.value)}
                  placeholder="Name, #, specialty, job…" />
              </label>
              <button className="se-btn se-btn--ghost se-btn--sm" type="button" disabled={loading} onClick={() => void refreshRoster().catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not refresh the roster.'))}>Refresh milestones</button>
            </div>
            {loading ? <p className="se-muted">Checking the roster…</p> : data.members.length ? (
              <>
                <div className="se-crew-explorer">
                  <nav className="se-crew-explorer__directory" aria-label="Crew member directory">
                    <p className="se-muted">Select a member to inspect their full career. {formatNumber(visibleMembers.length)} shown from this page.</p>
                    <ul>{visibleMembers.map((member) => (
                      <li key={member.id}>
                        <button type="button" className="se-crew-explorer__row"
                          aria-pressed={selectedMember?.id === member.id}
                          onClick={() => setSelectedMemberId(member.id)}>
                          <span className="se-crew-explorer__identity"><strong>{shortMember(member)}</strong>
                            <small>{member.legend?.nickname?.label ?? specialtyLabels[member.specialty]} · {member.assignment?.label ?? statusLabels[member.status]}</small></span>
                          <span className="se-crew-explorer__points">{member.loyalty.enabled ? `${member.loyalty.points}/100 loyalty` : `${formatNumber(member.experiencePoints)} XP`}</span>
                        </button>
                      </li>
                    ))}</ul>
                    {visibleMembers.length === 0 ? <p className="se-muted">No matches on this page. Clear your search or change the roster filters.</p> : null}
                  </nav>
                  <section className="se-crew-explorer__inspector" aria-label="Selected crew member career">
                    {selectedMember ? <CrewMemberCard key={selectedMember.id} member={selectedMember} peers={data.members} bonds={data.bonds ?? []} busy={actionBusy}
                      onExchange={(id, replaceId) => void exchange(id, replaceId)}
                      onTrain={(id) => void train(id)}
                      onNickname={(id, key) => void nickname(id, key)} /> : <p className="se-muted">Choose a member to see their career.</p>}
                  </section>
                </div>
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
