import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { formatCents, formatNumber, type BattleReportDto, type CombatPageDto } from '@streets/shared';
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

function BattleReport({ report }: { report: BattleReportDto }) {
  return <Panel title={`${report.won ? 'Victory' : 'Defeat'} · ${report.role === 'ATTACKER' ? 'Raid' : 'Defense'}`}>
    <p>Against <b>{report.opponent.displayName}</b> (#{report.opponent.publicPimpId}) · {date(report.createdAt)}</p>
    <div className="se-rows">
      <Row label="Squads — yours / theirs" value={`${report.yourSquad} / ${report.opponentSquad}`} />
      <Row label="Fighting strength — yours / theirs" value={`${report.yourStrength.toFixed(1)} / ${report.opponentStrength.toFixed(1)}`} />
      <Row label="Wounded — yours / theirs" value={`${formatNumber(report.yourWounds ?? 0)} / ${formatNumber(report.opponentWounds ?? 0)}`} />
      <Row label="Cash change / remaining" value={`${report.cashChangeCents >= 0 ? '+' : '−'}${formatCents(Math.abs(report.cashChangeCents))} / ${formatCents(report.cashAfterCents)}`} strong />
      <Row label="Turns spent / remaining" value={`${report.turnsSpent} / ${report.turnsAfter}`} />
      <Row label="National rank — before / after" value={`#${report.nationalRankBefore} / #${report.nationalRankAfter}`} />
    </div>
    <p className="se-hint">Your weapons: {weaponsText(report.yourEquipment)}.</p>
    {(report.yourWounds ?? 0) > 0 ? <p className="se-hint">{formatNumber(report.yourWounds)} thugs are recovering{report.nextRecoveryAt ? ` until ${date(report.nextRecoveryAt)}` : ''}.</p> : null}
    {report.retaliation ? <p className="se-hint">This was retaliation. Revenge let you answer your attacker through the normal target filters.</p> : null}
    {report.protectedUntil ? <p className="se-hint">Protected until {date(report.protectedUntil)}. Your return is also required before another raid.</p> : null}
    {report.cooldownUntil ? <p className="se-hint">Next raid after {date(report.cooldownUntil)}.</p> : null}
  </Panel>;
}

function RaidPage({ playerId, roundId }: { playerId: string; roundId: string }) {
  const me = useSession((s) => s.me)!;
  const [page, setPage] = useState<CombatPageDto | null>(null);
  const [after, setAfter] = useState(0);
  const [reports, setReports] = useState<BattleReportDto[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [report, setReport] = useState<BattleReportDto | null>(null);
  const [pending, setPending] = useState<PendingRaid | null>(() => loadPendingRaid(browserSessionStorage(), playerId));
  const [targetId, setTargetId] = useState('');
  const [squad, setSquad] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const refreshSequence = useRef(0);

  const refresh = useCallback(async (background = false) => {
    const sequence = ++refreshSequence.current;
    try {
      const [next, battles] = await Promise.all([combatApi.page(after, background), combatApi.reports(roundId)]);
      if (sequence !== refreshSequence.current) return;
      setPage(next);
      setReports(battles.reports);
      setNextBefore(battles.nextBefore);
    } catch (err) {
      if (sequence === refreshSequence.current) setError(err instanceof Error ? err.message : 'Could not refresh raids.');
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
    if (!page?.targets.length) return;
    if (targetId && page.targets.some((target) => String(target.publicPimpId) === targetId)) return;
    setTargetId(String(page.targets.find((target) => !target.blockedReason)?.publicPimpId ?? page.targets[0]!.publicPimpId));
  }, [page, targetId]);

  const setSaved = (value: PendingRaid | null) => {
    setPending(value);
    savePendingRaid(browserSessionStorage(), playerId, value);
  };
  const selected = page?.targets.find((target) => String(target.publicPimpId) === targetId);
  const rules = page?.rules;
  const recovery = page?.recovery;
  const maxSquad = Math.min(recovery?.fitThugs ?? me.resources.fitThugs, rules?.squadCap ?? 0);
  const squadNumber = Number(squad);
  const disabled = busy || !rules || !!page?.blockedReason || !selected || !!selected.blockedReason || !Number.isInteger(squadNumber) || squadNumber < 1 || squadNumber > maxSquad;

  useEffect(() => {
    if (!rules || maxSquad < 1) return;
    if (!Number.isInteger(squadNumber) || squadNumber < 1) setSquad('1');
    else if (squadNumber > maxSquad) setSquad(String(maxSquad));
  }, [maxSquad, rules, squadNumber]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (inFlight.current || (!pending && disabled)) return;
    const request: PendingRaid = pending ?? { input: { roundId, targetPublicPimpId: selected!.publicPimpId, attackingThugs: squadNumber, actionId: newActionId() }, targetName: selected!.displayName };
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    setSaved(request);
    try {
      const result = await combatApi.raid(request.input);
      setReport(result);
      setSaved(null);
      setTargetId('');
      await refresh(true);
      try { await useSession.getState().refreshSnapshot(); }
      catch { setError('The raid is confirmed. Your resource bar could not refresh yet.'); }
    } catch (err) {
      if (err instanceof ApiError && !err.isRetryable && !err.isUnauthenticated) setSaved(null);
      setError(err instanceof Error ? err.message : 'The raid reply was lost. Retry the saved raid to retrieve its result.');
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
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load older reports.'); }
    finally { setBusy(false); }
  }

  async function reconTarget() {
    if (!selected || !page?.rules?.reconTurnCost || busy || pending) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await combatApi.recon({ roundId, targetPublicPimpId: selected.publicPimpId, actionId: newActionId() });
      setNotice(`Recon on ${result.intel.displayName}: ${formatNumber(result.intel.fitThugs)} fit thugs, ${weaponsText(result.intel.weapons)}, up to ${formatCents(result.intel.estimatedMaxLootCents)} exposed by cash.`);
      await refresh(true);
      await useSession.getState().refreshSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not recon that target.');
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
      setError(err instanceof Error ? err.message : 'Could not treat wounded thugs.');
    } finally {
      setBusy(false);
    }
  }

  return <GameLayout>
    <div className="se-pagehead"><div><h1 className="se-title">Raids</h1><p className="se-eyebrow">Your crew. Their cash.</p></div>
      <button type="button" className="se-btn" disabled={busy} onClick={() => { setError(null); setNotice(null); void refresh(); }}>Refresh</button>
    </div>
    {error ? <Alert>{error}</Alert> : null}
    {notice ? <Alert tone="info">{notice}</Alert> : null}
    {pending ? <Panel title="Saved raid awaiting confirmation">
      <p>{pending.input.attackingThugs} thugs against {pending.targetName}. Retry to retrieve this raid’s result before starting another.</p>
      <button type="button" className="se-btn se-btn--primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Checking…' : 'Retry saved raid'}</button>
    </Panel> : null}
    {!page ? <p className="se-muted" role="status">Checking the streets…</p> : !page.enabled ? <Alert>{page.blockedReason}</Alert> : <div className="se-grid se-grid--sidebar">
      <div className="se-grid">
        <Panel title="Pick a target">
          {page.blockedReason ? <p role="status">{page.blockedReason}</p> : null}
          {page.protectedUntil ? <p className="se-hint">Your protection ends {date(page.protectedUntil)}.</p> : null}
          {page.cooldownUntil ? <p className="se-hint">Your cooldown ends {date(page.cooldownUntil)}.</p> : null}
          {page.targets.length ? <form onSubmit={(e) => void submit(e)}>
            <fieldset disabled={busy || !!pending} className="se-raid-form">
              <label htmlFor="raid-target">Target in your city</label>
              <select id="raid-target" className="se-input" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                <option value="">Select a player</option>
                {page.targets.map((target) => <option key={target.publicPimpId} value={target.publicPimpId}>
                  {target.displayName} (#{target.publicPimpId}) · {target.strength}{target.revengeAvailable ? ' · revenge' : ''}{target.blockedReason ? ` · ${target.blockedReason}` : ''}
                </option>)}
              </select>
              {selected ? <p className="se-hint" title="Net worth is public rank status. Recon reveals private raid intel: fit thugs, wounds, weapons, cash band and max exposed cash.">Net worth {formatCents(selected.netWorthCents)} · {selected.strength} crew. {selected.revengeAvailable ? 'Revenge window open.' : selected.blockedReason ?? 'The defender gets a home advantage.'}</p> : null}
              {selected && rules?.reconTurnCost ? <div className="se-intel">
                <button type="button" className="se-btn" disabled={busy || !!pending || me.turns.turns < rules.reconTurnCost} onClick={() => void reconTarget()}>
                  Recon {selected.displayName} · {rules.reconTurnCost} turns
                </button>
                {selected.intel ? <div className="se-rows se-mt">
                  <Row label="Intel age" value={`${date(selected.intel.createdAt)} until ${date(selected.intel.expiresAt)}`} />
                  <Row label="Fit / wounded" value={`${formatNumber(selected.intel.fitThugs)} / ${formatNumber(selected.intel.woundedThugs)}`} strong />
                  <Row label="Full strength" value={selected.intel.strength.toFixed(1)} />
                  <Row label="Weapons spotted" value={weaponsText(selected.intel.weapons)} />
                  <Row label="Cash band" value={selected.intel.cashBand.label} />
                  <Row label="Max cash exposed" value={formatCents(selected.intel.estimatedMaxLootCents)} />
                </div> : <p className="se-hint">Spend recon turns to reveal fit thugs, weapons, cash band and the largest cash haul this crew could expose.</p>}
              </div> : null}
              <label htmlFor="raid-squad">Fit thugs to send (up to {formatNumber(maxSquad)})</label>
              <input id="raid-squad" className="se-input" type="number" inputMode="numeric" min="1" max={maxSquad} value={squad} onChange={(event) => setSquad(event.target.value)} />
              <p className="se-hint">Your best available guns are assigned automatically. Each fighter carries one weapon.</p>
              <button type="submit" className="se-btn se-btn--primary" disabled={disabled}>{selected?.blockedReason ? 'Raid blocked' : 'Raid'}{selected ? ` ${selected.displayName}` : ''} · {rules!.turnCost} turns</button>
            </fieldset>
          </form> : <p className="se-muted">No targets are available on this page. The 0.2.0-E onboarding seed adds three New York rivals for local testing; run npm run db:seed, then join the current round.</p>}
          <div className="se-raid-pagination">
            {after > 0 ? <button className="se-btn" disabled={busy || !!pending} onClick={() => { setAfter(0); setTargetId(''); }}>First targets</button> : null}
            {page.nextTarget !== null ? <button className="se-btn" disabled={busy || !!pending} onClick={() => { setAfter(page.nextTarget!); setTargetId(''); }}>More targets</button> : null}
          </div>
        </Panel>
        {report ? <BattleReport report={report} /> : null}
      </div>
      {page.recovery ? <Panel title="Recovery">
        <div className="se-rows">
          <Row label="Fit thugs" value={formatNumber(page.recovery.fitThugs)} strong />
          <Row label="Wounded thugs" value={formatNumber(page.recovery.woundedThugs)} />
          <Row label="Next recovery" value={page.recovery.nextRecoveryAt ? date(page.recovery.nextRecoveryAt) : 'None'} />
          <Row label="Medicine" value={`${formatNumber(me.resources.medicine)} on hand`} />
        </div>
        {page.recovery.woundedThugs > 0 ? <button type="button" className="se-btn se-btn--primary" disabled={busy || page.recovery.maxTreatableThugs <= 0} onClick={() => void treatWounded()}>
          Treat {formatNumber(page.recovery.maxTreatableThugs)} with medicine
        </button> : <p className="se-hint">Everybody is fit.</p>}
      </Panel> : null}
      <Panel title="How raids work">
        <p>Raids cost {rules!.turnCost} turns, win or lose. Defense is automatic and costs no turns.</p>
        <p>Win up to {rules!.lootPercent}% of cash above {formatCents(rules!.protectedCashCents)}, limited to {formatCents(rules!.perThugLootCents)} per thug you send.</p>
        <p>{rules!.newcomerHours > 0 ? `New players have ${rules!.newcomerHours} hours of protection. ` : 'New players can raid immediately in this strategy round. '}Each raid protects its defender for {rules!.protectionHours} hours from everyone. Offline defenders must return before another raid.</p>
        <p>Your crew waits {rules!.cooldownMinutes} minutes between attacks. You cannot raid while protected or target a crew below half your full strength.</p>
        {rules!.reconTurnCost ? <p>Recon costs {rules!.reconTurnCost} turns and holds target intel for {rules!.intelExpiresMinutes} minutes. Revenge windows last {rules!.retaliationHours} hours against players who hit you.</p> : null}
        <p className="se-hint">Wounded thugs recover on the clock. Medicine brings them back immediately.</p>
      </Panel>
    </div>}
    <div className="se-mt"><Panel title="Battle reports">
      {!reports.length ? <p className="se-muted">Your attacks and defenses will appear here.</p> : <ul className="se-raid-reports">
        {reports.map((battle) => <li key={battle.id}><button className="se-btn" type="button" onClick={() => setReport(battle)}>
          {battle.role === 'ATTACKER' ? 'Raid' : 'Defense'} · {battle.won ? 'Won' : 'Lost'} vs {battle.opponent.displayName} · {date(battle.createdAt)}
        </button></li>)}
      </ul>}
      {nextBefore ? <button type="button" className="se-btn" disabled={busy} onClick={() => void olderReports()}>Older reports</button> : null}
    </Panel></div>
    {!page?.enabled && report ? <BattleReport report={report} /> : null}
  </GameLayout>;
}

export function CombatPage() {
  const me = useSession((s) => s.me);
  const round = useSession((s) => s.round);
  if (!me || !round) return <Navigate to="/join" replace />;
  return <RaidPage key={me.id} playerId={me.id} roundId={round.id} />;
}
