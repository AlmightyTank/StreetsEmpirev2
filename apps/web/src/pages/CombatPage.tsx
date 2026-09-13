import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { formatCents, formatNumber, type BattleReportDto, type CombatPageDto, type CombatSpecialRaidDto, type CombatTargetDto, type SpecialRaidKindDto } from '@streets/shared';
import { combatApi } from '../api/combat.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import { browserSessionStorage } from '../utils/pendingAction.js';
import { loadPendingRaid, savePendingRaid, type PendingRaid } from '../utils/pendingRaid.js';

const date = (value: string) => new Date(value).toLocaleString();
const weaponName = (key: string) => key === 'TEK9' ? 'Tek-9' : key === 'AK47' ? 'AK-47' : key.toLowerCase();
const weaponsText = (weapons: Record<string, number>) => Object.entries(weapons).filter(([, count]) => count > 0).map(([key, count]) => `${formatNumber(count)} ${weaponName(key)}`).join(', ') || 'unarmed';
const reportAnimationMs = 180;

type Mode = 'RAID' | 'DRIVE_BY' | SpecialRaidKindDto;
type CombatRulesDto = NonNullable<CombatPageDto['rules']>;
type CombatDriveByState = NonNullable<CombatPageDto['driveBy']>;

function HitRulesPanel({ mode, rules, driveBy, specialRaid }: { mode: Mode; rules: CombatRulesDto; driveBy?: CombatDriveByState; specialRaid?: CombatSpecialRaidDto }) {
  if (mode === 'DRIVE_BY' && driveBy) return <Panel title="Drive-by">
    <p>Roll past their block and make a mess before the real score. It costs {driveBy.rules.turnCost} turns and nobody grabs cash on the way out.</p>
    <p>A clean pass wounds {driveBy.rules.minThugWoundPercent}%–{driveBy.rules.maxThugWoundPercent}% of their fit thugs and drops {driveBy.rules.minWhoreKillPercent}%–{driveBy.rules.maxWhoreKillPercent}% of their hoes for good. Most passes are smaller; once in a while the block gets torn up.</p>
    <p>Each Low-Rider holds {driveBy.rules.thugsPerLowRider} shooters. About {driveBy.rules.defenderFieldedPercent}% of their fit crew is outside and ready to shoot back.</p>
    <p>If everyone in a car gets dropped, that ride is gone. If even one shooter makes it home, the car comes home too.</p>
    <p>The cars need {driveBy.rules.cooldownMinutes} minutes before the next drive-by. A block you shoot up gets {driveBy.rules.protectionHours} hours before another drive-by can hit it.</p>
  </Panel>;

  if (mode === 'DRUG_HOES' && specialRaid) return <Panel title="Drug their hoes">
    <p>Send the crew in with your crack and poison a rival&apos;s night. It costs {specialRaid.turnCost} turns and runs on the raid clock.</p>
    <p>If your crew gets through, their hoes burn your crack and chew up extra crack and condoms from their stash. Their next nights get weaker if the shelves run dry.</p>
    <p>Survivors matter. The more thugs make it home, the more of their hoes you can reach. Their crew fights back, and both sides can take wounds.</p>
    <p>Afterward, their block gets {rules.protectionHours} hours to breathe and your crew needs {rules.cooldownMinutes} minutes before another raid move.</p>
  </Panel>;

  if (mode === 'STEAL_RIDE' && specialRaid) return <Panel title="Steal a ride">
    <p>Hit the chop spot and take one of their Low-Riders. It costs {specialRaid.turnCost} turns and runs on the raid clock.</p>
    <p>Win the fight and get at least one thug home, and the ride is yours. If nobody comes back, nobody brings keys.</p>
    <p>Their crew fights for it. Expect wounds on either side when the block catches you near the car.</p>
    <p>Afterward, their block gets {rules.protectionHours} hours to breathe and your crew needs {rules.cooldownMinutes} minutes before another raid move.</p>
  </Panel>;

  if (mode === 'LURE_CREW' && specialRaid) return <Panel title="Lure their crew">
    <p>Work a miserable block and make their people an offer. It costs {specialRaid.turnCost} turns and runs on the raid clock.</p>
    <p>Crack talks to unhappy hoes. Beer talks to unhappy fit thugs. If their people are still loyal, they stay put and your stash does nothing.</p>
    <p>Win the fight and your survivors bring the convinced ones home. They leave the rival&apos;s crew and join yours.</p>
    <p>Afterward, their block gets {rules.protectionHours} hours to breathe and your crew needs {rules.cooldownMinutes} minutes before another raid move.</p>
  </Panel>;

  return <Panel title="Cash raid">
    <p>Kick in the door and take the money they left exposed. A raid costs {rules.turnCost} turns whether your crew wins or gets chased off.</p>
    {rules.minLootPercent !== undefined && rules.maxLootPercent !== undefined
      ? <p>On a win, the take is {rules.minLootPercent}%–{rules.maxLootPercent}% of cash above {formatCents(rules.protectedCashCents)}. Big scores can happen, but most crews come home with a smaller cut. Each fit thug can carry {formatCents(rules.perThugLootCents)}.</p>
      : <p>On a win, the take is up to {rules.lootPercent}% of cash above {formatCents(rules.protectedCashCents)}, capped at {formatCents(rules.perThugLootCents)} per thug you send.</p>}
    {rules.drugLootPercent ? <p>If they have crack exposed, your crew can grab up to {formatNumber(rules.perThugCrackLoot ?? 0)} rocks per fit thug who makes it home.</p> : null}
    {rules.repeatLootPenaltyPercent ? <p>Keep farming the same mark and the score dries up: each repeat cuts the roll by {rules.repeatLootPenaltyPercent}%, down to {rules.repeatLootFloorPercent ?? 0}% of normal. Hit somebody else to cool it off.</p> : null}
    <p>{rules.newcomerHours > 0 ? `New crews get ${rules.newcomerHours} hours before the street opens on them. ` : 'New crews can be hit right away in this round. '}After a raid, that block gets {rules.protectionHours} hours of breathing room.</p>
    <p>Your crew needs {rules.cooldownMinutes} minutes between raids. You cannot move while your own block is protected, and crews far below your strength are off limits.</p>
    {rules.reconTurnCost ? <p>Scout a mark for {rules.reconTurnCost} turns to see the useful dirt for {rules.intelExpiresMinutes} minutes. If somebody hits you, payback stays open for {rules.retaliationHours} hours.</p> : null}
    <p className="se-hint">Wounded thugs sit out until they heal. Medicine gets them back on the street now.</p>
  </Panel>;
}

/** How a report reads in the list and as its heading. */
function reportLabel(report: BattleReportDto): string {
  if (report.kind === 'DRIVE_BY') return report.role === 'ATTACKER' ? 'Drive-by' : 'Drive-by on you';
  if (report.kind === 'DRUG_HOES') return report.role === 'ATTACKER' ? 'Drug run' : 'Drug run on you';
  if (report.kind === 'STEAL_RIDE') return report.role === 'ATTACKER' ? 'Ride theft' : 'Ride theft on you';
  if (report.kind === 'LURE_CREW') return report.role === 'ATTACKER' ? 'Lure run' : 'Lure run on you';
  return report.role === 'ATTACKER' ? 'Raid' : 'Defense';
}

function DriveByReport({ report, onClose }: { report: BattleReportDto; onClose?: () => void }) {
  const d = report.driveBy!;
  const attacking = report.role === 'ATTACKER';
  const landed = attacking === report.won;
  return <Panel title={`${landed ? (attacking ? 'It landed' : 'They hit you') : (attacking ? 'They shot back' : 'Seen off')} · ${reportLabel(report)}`}>
    <p>{attacking ? 'On' : 'By'} <b>{report.opponent.displayName}</b> (#{report.opponent.publicPimpId}) · {date(report.createdAt)}</p>
    <div className="se-rows">
      <Row label={attacking ? 'Shooters — yours / out front' : 'Out front — yours / shooters'} value={`${report.yourSquad} / ${report.opponentSquad}`} />
      <Row label="Firepower — yours / theirs" value={`${report.yourStrength.toFixed(1)} / ${report.opponentStrength.toFixed(1)}`} />
      <Row label="Wounded — yours / theirs" value={`${formatNumber(report.yourWounds)} / ${formatNumber(report.opponentWounds)}`} />
      <Row label={attacking ? 'Their whores killed' : 'Your whores killed'} value={d.whoresAfter !== undefined ? `${formatNumber(d.whoresKilled)} · ${formatNumber(d.whoresAfter)} left` : formatNumber(d.whoresKilled)} strong />
      {attacking ? <Row label="Low-Riders — sent / lost / left" value={`${formatNumber(d.carsSent ?? 0)} / ${formatNumber(d.lowRidersLost ?? 0)} / ${formatNumber(d.lowRidersAfter ?? 0)}`} strong={(d.lowRidersLost ?? 0) > 0} /> : null}
      {attacking ? <Row label="Turns spent / remaining" value={`${report.turnsSpent} / ${report.turnsAfter}`} /> : null}
      <Row label="National rank — before / after" value={`#${report.nationalRankBefore} / #${report.nationalRankAfter}`} />
    </div>
    {attacking ? <p className="se-hint">Your weapons: {weaponsText(report.yourEquipment)}.</p> : null}
    {(d.lowRidersLost ?? 0) > 0 ? <p className="se-hint se-bad">Nobody made it back in {formatNumber(d.lowRidersLost!)} of your cars, so {d.lowRidersLost === 1 ? 'it is' : 'they are'} gone.</p> : null}
    {report.yourWounds > 0 ? <p className="se-hint">{formatNumber(report.yourWounds)} thugs are recovering{report.nextRecoveryAt ? ` until ${date(report.nextRecoveryAt)}` : ''}.</p> : null}
    {report.retaliation ? <p className="se-hint">This was retaliation for a hit on you.</p> : null}
    {report.protectedUntil ? <p className="se-hint">Your block is left alone by drive-bys until {date(report.protectedUntil)}. A drive-by does not stop a raid.</p> : null}
    {attacking && report.cooldownUntil ? <p className="se-hint">Next drive-by after {date(report.cooldownUntil)}.</p> : null}
    {onClose ? <button type="button" className="se-btn se-btn--ghost se-btn--sm se-raid-report-close" onClick={onClose}>Close report</button> : null}
  </Panel>;
}


function RaidFormReport({ report, onClose }: { report: BattleReportDto; onClose?: () => void }) {
  const form = report.raidForm!;
  const attacking = report.role === 'ATTACKER';
  const landed = attacking === report.won;
  const crewLured = (form.whoresLured ?? 0) + (form.thugsLured ?? 0);
  const lureCopy = report.kind === 'LURE_CREW' && landed
    ? attacking
      ? crewLured > 0
        ? `${formatNumber(crewLured)} people crossed the street and joined you.`
        : 'You won the move, but nobody was unhappy enough or stocked enough to come over.'
      : crewLured > 0
        ? `${formatNumber(crewLured)} people left your block for their stash.`
        : 'They won the fight, but nobody left your block.'
    : null;
  return <Panel title={`${landed ? (attacking ? 'It landed' : 'They got through') : (attacking ? 'They held you off' : 'You held them off')} · ${reportLabel(report)}`}>
    <p>{attacking ? 'Against' : 'By'} <b>{report.opponent.displayName}</b> (#{report.opponent.publicPimpId}) · {date(report.createdAt)}</p>
    {lureCopy ? <p className={crewLured > 0 ? 'se-good' : 'se-hint'}>{lureCopy}</p> : null}
    <div className="se-rows">
      <Row label="Crew — yours / theirs" value={`${report.yourSquad} / ${report.opponentSquad}`} />
      <Row label="Fighting strength — yours / theirs" value={`${report.yourStrength.toFixed(1)} / ${report.opponentStrength.toFixed(1)}`} />
      <Row label="Wounded — yours / theirs" value={`${formatNumber(report.yourWounds ?? 0)} / ${formatNumber(report.opponentWounds ?? 0)}`} />
      {form.whoresDrugged !== undefined ? <Row label={attacking ? 'Their hoes drugged' : 'Your hoes drugged'} value={formatNumber(form.whoresDrugged)} strong={form.whoresDrugged > 0} /> : null}
      {form.whoresLured !== undefined ? <Row label={attacking ? 'Hoes joined / now' : 'Hoes lost / left'} value={form.whoresAfter !== undefined ? `${formatNumber(form.whoresLured)} / ${formatNumber(form.whoresAfter)}` : formatNumber(form.whoresLured)} strong={form.whoresLured > 0} /> : null}
      {form.thugsLured !== undefined ? <Row label={attacking ? 'Thugs joined / now' : 'Thugs lost / left'} value={form.thugsAfter !== undefined ? `${formatNumber(form.thugsLured)} / ${formatNumber(form.thugsAfter)}` : formatNumber(form.thugsLured)} strong={form.thugsLured > 0} /> : null}
      {form.crackSpent !== undefined && attacking ? <Row label="Crack spent" value={formatNumber(form.crackSpent)} /> : null}
      {form.beerSpent !== undefined && attacking ? <Row label="Beer spent" value={formatNumber(form.beerSpent)} /> : null}
      {form.defenderCrackBurned !== undefined ? <Row label={attacking ? 'Their crack burned' : 'Your crack burned'} value={formatNumber(form.defenderCrackBurned)} strong={form.defenderCrackBurned > 0} /> : null}
      {form.defenderCondomsBurned !== undefined ? <Row label={attacking ? 'Their condoms burned' : 'Your condoms burned'} value={formatNumber(form.defenderCondomsBurned)} strong={form.defenderCondomsBurned > 0} /> : null}
      {form.lowRidersStolen !== undefined ? <Row label={attacking ? 'Low-Riders stolen' : 'Low-Riders lost'} value={`${formatNumber(form.lowRidersStolen)} · ${formatNumber(form.lowRidersAfter ?? 0)} left`} strong={form.lowRidersStolen > 0} /> : null}
      {attacking ? <Row label="Turns spent / remaining" value={`${report.turnsSpent} / ${report.turnsAfter}`} /> : null}
      <Row label="National rank — before / after" value={`#${report.nationalRankBefore} / #${report.nationalRankAfter}`} />
    </div>
    {attacking ? <p className="se-hint">Your weapons: {weaponsText(report.yourEquipment)}.</p> : null}
    {(report.yourWounds ?? 0) > 0 ? <p className="se-hint">{formatNumber(report.yourWounds)} thugs are recovering{report.nextRecoveryAt ? ` until ${date(report.nextRecoveryAt)}` : ''}.</p> : null}
    {report.retaliation ? <p className="se-hint">This was payback. Revenge let you answer the crew that hit you.</p> : null}
    {report.protectedUntil ? <p className="se-hint">Your block is protected until {date(report.protectedUntil)}. You also need your crew back before the next raid.</p> : null}
    {report.cooldownUntil ? <p className="se-hint">Next move after {date(report.cooldownUntil)}.</p> : null}
    {onClose ? <button type="button" className="se-btn se-btn--ghost se-btn--sm se-raid-report-close" onClick={onClose}>Close report</button> : null}
  </Panel>;
}

function BattleReport({ report, onClose }: { report: BattleReportDto; onClose?: () => void }) {
  if (report.kind === 'DRIVE_BY' && report.driveBy) return <DriveByReport report={report} onClose={onClose} />;
  if ((report.kind === 'DRUG_HOES' || report.kind === 'STEAL_RIDE' || report.kind === 'LURE_CREW') && report.raidForm) return <RaidFormReport report={report} onClose={onClose} />;
  return <Panel title={`${report.won ? 'Victory' : 'Defeat'} · ${reportLabel(report)}`}>
    <p>Against <b>{report.opponent.displayName}</b> (#{report.opponent.publicPimpId}) · {date(report.createdAt)}</p>
    <div className="se-rows">
      <Row label="Squads — yours / theirs" value={`${report.yourSquad} / ${report.opponentSquad}`} />
      <Row label="Fighting strength — yours / theirs" value={`${report.yourStrength.toFixed(1)} / ${report.opponentStrength.toFixed(1)}`} />
      <Row label="Wounded — yours / theirs" value={`${formatNumber(report.yourWounds ?? 0)} / ${formatNumber(report.opponentWounds ?? 0)}`} />
      <Row label="Cash change / remaining" value={`${report.cashChangeCents >= 0 ? '+' : '−'}${formatCents(Math.abs(report.cashChangeCents))} / ${formatCents(report.cashAfterCents)}`} strong />
      {report.crackChange !== undefined && report.crackAfter !== undefined ? <Row label="Crack change / remaining" value={`${report.crackChange >= 0 ? '+' : '−'}${formatNumber(Math.abs(report.crackChange))} / ${formatNumber(report.crackAfter)}`} strong /> : null}

      <Row label="Turns spent / remaining" value={`${report.turnsSpent} / ${report.turnsAfter}`} />
      <Row label="National rank — before / after" value={`#${report.nationalRankBefore} / #${report.nationalRankAfter}`} />
    </div>
    <p className="se-hint">Your weapons: {weaponsText(report.yourEquipment)}.</p>
    {(report.yourWounds ?? 0) > 0 ? <p className="se-hint">{formatNumber(report.yourWounds)} thugs are recovering{report.nextRecoveryAt ? ` until ${date(report.nextRecoveryAt)}` : ''}.</p> : null}
    {report.retaliation ? <p className="se-hint">This was payback. Revenge let you answer the crew that hit you.</p> : null}
    {report.protectedUntil ? <p className="se-hint">Your block is protected until {date(report.protectedUntil)}. You also need your crew back before the next raid.</p> : null}
    {report.cooldownUntil ? <p className="se-hint">Next raid after {date(report.cooldownUntil)}.</p> : null}
    {onClose ? <button type="button" className="se-btn se-btn--ghost se-btn--sm se-raid-report-close" onClick={onClose}>Close report</button> : null}
  </Panel>;
}

function RaidPage({ playerId, roundId }: { playerId: string; roundId: string }) {
  const me = useSession((s) => s.me)!;
  const [page, setPage] = useState<CombatPageDto | null>(null);
  const [after, setAfter] = useState(0);
  const [reports, setReports] = useState<BattleReportDto[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [report, setReport] = useState<BattleReportDto | null>(null);
  const [closingReportId, setClosingReportId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRaid | null>(() => loadPendingRaid(browserSessionStorage(), playerId));
  const [targetId, setTargetId] = useState('');
  const [mode, setMode] = useState<Mode>('RAID');
  const [squad, setSquad] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const refreshSequence = useRef(0);
  const reportDetailRef = useRef<HTMLDivElement | null>(null);
  const closeReportTimer = useRef<number | null>(null);

  const refresh = useCallback(async (background = false) => {
    const sequence = ++refreshSequence.current;
    try {
      const [next, battles] = await Promise.all([combatApi.page(after, background), combatApi.reports(roundId)]);
      if (sequence !== refreshSequence.current) return;
      setPage(next);
      setReports(battles.reports);
      setNextBefore(battles.nextBefore);
    } catch (err) {
      if (sequence === refreshSequence.current) setError(err instanceof Error ? err.message : 'Could not get the latest word from the street.');
    }
  }, [after, roundId]);

  useEffect(() => {
    void refresh();
    const onReturn = () => { if (!document.hidden) void refresh(); };
    const interval = window.setInterval(() => { if (!document.hidden) void refresh(true); }, 30_000);
    window.addEventListener('focus', onReturn);
    window.addEventListener('online', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      refreshSequence.current++;
      window.clearInterval(interval);
      window.removeEventListener('focus', onReturn);
      window.removeEventListener('online', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [refresh]);

  useEffect(() => {
    if (!report) return;
    reportDetailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [report]);

  useEffect(() => () => {
    if (closeReportTimer.current !== null) window.clearTimeout(closeReportTimer.current);
  }, []);

  const closeReport = useCallback(() => {
    if (!report) return;
    if (closeReportTimer.current !== null) window.clearTimeout(closeReportTimer.current);
    const reportId = report.id;
    setClosingReportId(reportId);
    closeReportTimer.current = window.setTimeout(() => {
      setReport((current) => current?.id === reportId ? null : current);
      setClosingReportId((current) => current === reportId ? null : current);
      closeReportTimer.current = null;
    }, reportAnimationMs);
  }, [report]);

  const toggleReport = useCallback((battle: BattleReportDto) => {
    if (report?.id === battle.id) {
      closeReport();
      return;
    }
    if (closeReportTimer.current !== null) window.clearTimeout(closeReportTimer.current);
    closeReportTimer.current = null;
    setClosingReportId(null);
    setReport(battle);
  }, [closeReport, report?.id]);

  const driveBy = page?.driveBy;
  const specialRaids = page?.specialRaids ?? [];
  const specialRaid = specialRaids.find((action) => action.kind === mode);
  const driving = mode === 'DRIVE_BY' && !!driveBy;
  const doingSpecialRaid = !!specialRaid;
  /** Drive-bys have their own clock. The other forms share the raid clock. */
  const targetBlock = useCallback((target: CombatTargetDto) => {
    if (driving) return target.driveByBlockedReason ?? null;
    if (mode === 'DRUG_HOES' || mode === 'STEAL_RIDE' || mode === 'LURE_CREW') return target.specialRaidBlockedReasons?.[mode] ?? null;
    return target.blockedReason;
  }, [driving, mode]);

  useEffect(() => {
    if (!page?.targets.length) return;
    if (targetId && page.targets.some((target) => String(target.publicPimpId) === targetId)) return;
    setTargetId(String(page.targets.find((target) => !targetBlock(target))?.publicPimpId ?? page.targets[0]!.publicPimpId));
  }, [page, targetId, targetBlock]);

  const setSaved = (value: PendingRaid | null) => {
    setPending(value);
    savePendingRaid(browserSessionStorage(), playerId, value);
  };
  const selected = page?.targets.find((target) => String(target.publicPimpId) === targetId);
  const selectedBlock = selected ? targetBlock(selected) : null;
  const rules = page?.rules;
  const recovery = page?.recovery;
  const maxSquad = driving ? driveBy!.maxShooters : Math.min(recovery?.fitThugs ?? me.resources.fitThugs, rules?.squadCap ?? 0);
  const modeBlock = driving ? driveBy!.blockedReason : doingSpecialRaid ? specialRaid.blockedReason : page?.blockedReason ?? null;
  const modeCooldown = driving ? driveBy!.cooldownUntil : doingSpecialRaid ? specialRaid.cooldownUntil : page?.cooldownUntil ?? null;
  const turnCost = driving ? driveBy!.rules.turnCost : doingSpecialRaid ? specialRaid.turnCost : rules?.turnCost ?? 0;
  const squadNumber = Number(squad);
  const disabled = busy || !rules || !!modeBlock || !selected || !!selectedBlock || !Number.isInteger(squadNumber) || squadNumber < 1 || squadNumber > maxSquad;
  const attackName = (kind: Mode | undefined) => kind === 'DRIVE_BY' ? 'drive-by' : kind === 'DRUG_HOES' ? 'drug run' : kind === 'STEAL_RIDE' ? 'ride theft' : kind === 'LURE_CREW' ? 'lure run' : 'raid';

  useEffect(() => {
    if (!rules || maxSquad < 1) return;
    if (!Number.isInteger(squadNumber) || squadNumber < 1) setSquad('1');
    else if (squadNumber > maxSquad) setSquad(String(maxSquad));
  }, [maxSquad, rules, squadNumber]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (inFlight.current || (!pending && disabled)) return;
    const request: PendingRaid = pending ?? { input: { roundId, targetPublicPimpId: selected!.publicPimpId, attackingThugs: squadNumber, actionId: newActionId() }, targetName: selected!.displayName, kind: driving ? 'DRIVE_BY' : doingSpecialRaid ? specialRaid.kind : 'RAID' };
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setSaved(request);
    try {
      const result = request.kind === 'DRIVE_BY'
        ? await combatApi.driveBy(request.input)
        : request.kind === 'DRUG_HOES' || request.kind === 'STEAL_RIDE' || request.kind === 'LURE_CREW'
          ? await combatApi.specialRaid({ ...request.input, kind: request.kind })
          : await combatApi.raid(request.input);
      if (closeReportTimer.current !== null) window.clearTimeout(closeReportTimer.current);
      closeReportTimer.current = null;
      setClosingReportId(null);
      setReport(result);
      setSaved(null);
      setTargetId('');
      await refresh(true);
      try { await useSession.getState().refreshSnapshot(); }
      catch { setError(`The ${attackName(request.kind)} is settled. Your top bar could not catch up yet.`); }
    } catch (err) {
      if (err instanceof ApiError && !err.isRetryable && !err.isUnauthenticated) setSaved(null);
      setError(err instanceof Error ? err.message : `The street went quiet before the report came back. Retry the saved ${attackName(request.kind)} to get the result.`);
      void refresh(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function olderReports() {
    if (!nextBefore || busy) return;
    setBusy(true);
    try {
      const next = await combatApi.reports(roundId, nextBefore);
      setReports((current) => [...current, ...next.reports.filter((entry) => !current.some((r) => r.id === entry.id))]);
      setNextBefore(next.nextBefore);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not pull older reports.'); }
    finally { setBusy(false); }
  }

  async function reconTarget() {
    if (!selected || !page?.rules?.reconTurnCost || busy || pending) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await combatApi.recon({ roundId, targetPublicPimpId: selected.publicPimpId, actionId: newActionId() });
      setNotice(`Word on ${result.intel.displayName}: ${formatNumber(result.intel.fitThugs)} fit thugs, ${weaponsText(result.intel.weapons)}, up to ${formatCents(result.intel.estimatedMaxLootCents)} cash${result.intel.estimatedMaxCrackLoot != null ? ` and ${formatNumber(result.intel.estimatedMaxCrackLoot)} crack` : ''} exposed.`);
      await refresh(true);
      await useSession.getState().refreshSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get eyes on that crew.');
    } finally {
      setBusy(false);
    }
  }

  async function treatWounded() {
    if (!page?.recovery || page.recovery.maxTreatableThugs <= 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const amount = page.recovery.maxTreatableThugs;
      const result = await combatApi.treat({ roundId, thugs: amount, actionId: newActionId() });
      setNotice(`Treated ${formatNumber(result.treatedThugs)} thugs with ${formatNumber(result.medicineUsed)} medicine.`);
      await refresh(true);
      await useSession.getState().refreshSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not patch up the wounded.');
    } finally {
      setBusy(false);
    }
  }

  return <GameLayout>
    <div className="se-pagehead"><div><h1 className="se-title">Raids</h1><p className="se-eyebrow">{page?.driveBy ? 'Pick the mark. Send the crew. Settle the score.' : 'Pick the mark. Send the crew. Take the haul.'}</p></div>
      <button type="button" className="se-btn" disabled={busy} onClick={() => { setError(null); setNotice(null); void refresh(); }}>Refresh</button>
    </div>
    {error ? <Alert>{error}</Alert> : null}
    {notice ? <Alert tone="info">{notice}</Alert> : null}
    {pending ? <Panel title={`Unsettled ${attackName(pending.kind)}`}>
      <p>{pending.input.attackingThugs} thugs went at {pending.targetName}. Get that report before you start another hit.</p>
      <button type="button" className="se-btn se-btn--primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Checking…' : `Retry saved ${attackName(pending.kind)}`}</button>
    </Panel> : null}
    {!page ? <p className="se-muted" role="status">Checking the streets…</p> : !page.enabled ? <Alert>{page.blockedReason}</Alert> : <div className="se-grid se-grid--sidebar">
      <div className="se-grid">
        <Panel title="Choose your mark">
          {(driveBy || specialRaids.length) ? <div className="se-seg" role="group" aria-label="Kind of hit">
            {([{ kind: 'RAID' as const, label: 'Raid' }, ...(driveBy ? [{ kind: 'DRIVE_BY' as const, label: 'Drive-by' }] : []), ...specialRaids.map((action: CombatSpecialRaidDto) => ({ kind: action.kind, label: action.buttonLabel }))]).map((action) => <button key={action.kind} type="button"
              className={`se-seg__btn${mode === action.kind ? ' se-seg__btn--on' : ''}`} aria-pressed={mode === action.kind}
              disabled={busy || !!pending} onClick={() => setMode(action.kind)}>
              {action.label}
            </button>)}
          </div> : null}
          {modeBlock ? <p role="status">{modeBlock}</p> : null}
          {page.protectedUntil ? <p className="se-hint">Your block is protected until {date(page.protectedUntil)}.</p> : null}
          {modeCooldown ? <p className="se-hint">Your crew is ready after {date(modeCooldown)}.</p> : null}
          {page.targets.length ? <form onSubmit={(e) => void submit(e)}>
            <fieldset disabled={busy || !!pending} className="se-raid-form">
              <label htmlFor="raid-target">Mark in your city</label>
              <select id="raid-target" className="se-input" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                <option value="">Choose a mark</option>
                {page.targets.map((target) => <option key={target.publicPimpId} value={target.publicPimpId}>
                  {target.displayName} (#{target.publicPimpId}) · {target.strength}{target.revengeAvailable ? ' · payback' : ''}{targetBlock(target) ? ` · ${targetBlock(target)}` : ''}
                </option>)}
              </select>
              {selected ? <p className="se-hint" title="Net worth is street reputation. Scouting reveals the details: fit thugs, wounds, weapons, cash range, crack and max haul.">Net worth {formatCents(selected.netWorthCents)} · {selected.strength} crew. {selected.revengeAvailable ? 'Payback is open.' : selectedBlock ?? (driving ? 'Only part of their crew is on the street.' : 'They have home turf.')}</p> : null}
              {selected && rules?.reconTurnCost ? <div className="se-intel">
                <button type="button" className="se-btn" disabled={busy || !!pending || me.turns.turns < rules.reconTurnCost} onClick={() => void reconTarget()}>
                  Scout {selected.displayName} · {rules.reconTurnCost} turns
                </button>
                {selected.intel ? <div className="se-rows se-mt">
                  <Row label="Intel age" value={`${date(selected.intel.createdAt)} until ${date(selected.intel.expiresAt)}`} />
                  <Row label="Fit / wounded" value={`${formatNumber(selected.intel.fitThugs)} / ${formatNumber(selected.intel.woundedThugs)}`} strong />
                  <Row label="Full strength" value={selected.intel.strength.toFixed(1)} />
                  <Row label="Weapons spotted" value={weaponsText(selected.intel.weapons)} />
                  <Row label="Cash band" value={selected.intel.cashBand.label} />
                  <Row label="Max cash loot" value={formatCents(selected.intel.estimatedMaxLootCents)} />
                  {selected.intel.crack != null ? <Row label="Crack stash" value={formatNumber(selected.intel.crack)} /> : null}
                  {selected.intel.estimatedMaxCrackLoot != null ? <Row label="Max crack loot" value={formatNumber(selected.intel.estimatedMaxCrackLoot)} /> : null}
                </div> : <p className="se-hint">Scout them first to see fit thugs, guns, cash range, crack stash and the biggest haul they might expose.</p>}
              </div> : null}
              <label htmlFor="raid-squad">{driving
                ? `Shooters to send (up to ${formatNumber(maxSquad)} · ${formatNumber(driveBy!.lowRiders)} Low-Rider${driveBy!.lowRiders === 1 ? '' : 's'}, ${driveBy!.rules.thugsPerLowRider} to a car)`
                : `Thugs to send (up to ${formatNumber(maxSquad)})`}</label>
              <input id="raid-squad" className="se-input" type="number" inputMode="numeric" min="1" max={maxSquad} value={squad} onChange={(event) => setSquad(event.target.value)} />
              <p className="se-hint">{driving
                ? `Cars fill ${driveBy!.rules.thugsPerLowRider} at a time. A car comes home if anyone in it does, so a half-empty car is the one you are most likely to lose.`
                : mode === 'DRUG_HOES'
                  ? 'Your crew carries your crack in and burns through their supplies if the move lands.'
                  : mode === 'STEAL_RIDE'
                    ? 'If your crew wins and one thug makes it back, they bring one of their Low-Riders home.'
                    : mode === 'LURE_CREW'
                      ? 'Unhappy people can be pulled off their block: crack talks to hoes, beer talks to thugs.'
                      : 'Your best guns go with the crew automatically. One weapon per fighter.'}</p>
              <button type="submit" className="se-btn se-btn--primary" disabled={disabled}>{driving
                ? (selectedBlock ? 'Drive-by blocked' : 'Drive-by')
                : doingSpecialRaid
                  ? (selectedBlock ? `${specialRaid.buttonLabel} blocked` : specialRaid.buttonLabel)
                  : (selectedBlock ? 'Raid blocked' : 'Raid')}{selected ? ` ${selected.displayName}` : ''} · {turnCost} turns</button>
            </fieldset>
          </form> : <p className="se-muted">No marks are exposed in your city right now. Check back when another crew is active or protection drops.</p>}
          <div className="se-raid-pagination">
            {after > 0 ? <button className="se-btn" disabled={busy || !!pending} onClick={() => { setAfter(0); setTargetId(''); }}>First marks</button> : null}
            {page.nextTarget !== null ? <button className="se-btn" disabled={busy || !!pending} onClick={() => { setAfter(page.nextTarget!); setTargetId(''); }}>More marks</button> : null}
          </div>
        </Panel>
        <Panel title="Street reports">
          {!reports.length ? <p className="se-muted">Your hits and defenses land here.</p> : <ul className="se-raid-reports">
            {reports.map((battle) => {
              const selectedReport = report?.id === battle.id;
              return <li key={battle.id}><button
                className={`se-btn se-raid-report-link${selectedReport ? ' se-raid-report-link--active' : ''}`}
                type="button"
                aria-current={selectedReport ? 'true' : undefined}
                onClick={() => toggleReport(battle)}
              >
                <span>{reportLabel(battle)} · {battle.won ? 'Won' : 'Lost'} vs {battle.opponent.displayName}</span>
                <span className="se-raid-report-link__meta">{date(battle.createdAt)}</span>
              </button></li>;
            })}
          </ul>}
          {nextBefore ? <button type="button" className="se-btn" disabled={busy} onClick={() => void olderReports()}>Older reports</button> : null}
          {report ? <div ref={reportDetailRef} className={`se-raid-report-detail${closingReportId === report.id ? ' se-raid-report-detail--closing' : ''}`}><BattleReport report={report} onClose={closeReport} /></div> : null}
        </Panel>
      </div>
      <div className="se-grid">
        {page.recovery ? <Panel title="Crew recovery">
          <div className="se-rows">
            <Row label="Fit thugs" value={formatNumber(page.recovery.fitThugs)} strong />
            <Row label="Wounded thugs" value={formatNumber(page.recovery.woundedThugs)} />
            <Row label="Next recovery" value={page.recovery.nextRecoveryAt ? date(page.recovery.nextRecoveryAt) : 'None'} />
            <Row label="Medicine" value={`${formatNumber(me.resources.medicine)} on hand`} />
          </div>
          {page.recovery.woundedThugs > 0 ? <button type="button" className="se-btn se-btn--primary" disabled={busy || page.recovery.maxTreatableThugs <= 0} onClick={() => void treatWounded()}>
            Patch up {formatNumber(page.recovery.maxTreatableThugs)} with medicine
          </button> : <p className="se-hint">Everybody is standing.</p>}
        </Panel> : null}
        <HitRulesPanel mode={mode} rules={rules!} driveBy={driveBy} specialRaid={specialRaid} />
      </div>
    </div>}
  </GameLayout>;
}

export function CombatPage() {
  const me = useSession((s) => s.me);
  const round = useSession((s) => s.round);
  if (!me || !round) return <Navigate to="/join" replace />;
  return <RaidPage key={me.id} playerId={me.id} roundId={round.id} />;
}
