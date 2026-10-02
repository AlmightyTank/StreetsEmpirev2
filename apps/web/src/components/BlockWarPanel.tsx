import { useState } from 'react';
import type { BlockWarActionResult, BlockWarDto, CityTurfDto, GameActionResult, TurfBlockDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { api } from '../api/client.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { useSession } from '../stores/session.js';
import { formatClockTime, formatWhen } from '../utils/time.js';
import { Button } from './Button.js';

type Wars = NonNullable<NonNullable<CityTurfDto['business']>['wars']>;

const STATUS: Record<BlockWarDto['status'], string> = {
  OPENING: 'Opening fight coming',
  SIEGE: 'Under siege',
  BETWEEN: 'Squad beaten back',
};
const FIGHT: Record<NonNullable<BlockWarDto['pendingFight']>['kind'], string> = {
  OPENING: 'Opening fight',
  ASSAULT: 'Assault',
  BREAK: 'Break attempt',
};
const ROLE: Record<BlockWarDto['role'], string> = {
  attacker: 'Your war',
  defender: 'War on your block',
  attackerAlly: 'You ride with the attacker',
  defenderAlly: 'You ride with the holder',
  observer: 'Block war',
};

function ThugsField({ label, value, onChange, disabled }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <label className="se-field se-blockwar__field">
      <span className="se-field__label">{label}</span>
      <input className="se-input" type="number" inputMode="numeric" min={1} step={1} value={value} disabled={disabled}
        onChange={(event) => onChange(Math.max(1, Math.floor(Number(event.target.value) || 1)))} />
    </label>
  );
}

/**
 * 1.1.0-D. A block war on City Blocks: declaring one on a rival's block, and once it is on,
 * the siege's Control, the coming fight, the allies and their cut, and what you can do.
 */
export function BlockWarPanel({ block, wars, isHome, onChanged }: { block: TurfBlockDto; wars: Wars; isHome: boolean; onChanged?: () => void }) {
  const action = useGameAction<BlockWarActionResult>();
  const me = useSession((s) => s.me);
  const armed = me?.resources.armedThugs ?? 0;
  const [goal, setGoal] = useState<'TAKE' | 'SACK'>('TAKE');
  const [squad, setSquad] = useState(Math.max(1, block.cornerMinimumThugs));
  const [thugs, setThugs] = useState(Math.max(1, Math.min(armed || 1, block.war?.allyCap || 10)));
  const [cut, setCut] = useState(block.war?.allies[block.war.role === 'attacker' ? 'attacker' : 'defender']?.cutPercent ?? 20);
  const busy = action.busy ? 'That war move is still going through.' : null;

  async function post(path: string, body: Record<string, unknown>) {
    await action.run((actionId) => api.post<GameActionResult<BlockWarActionResult>>(path, { ...body, actionId }));
    onChanged?.();
  }
  async function end(path: string) {
    await post(path, { warId: block.war!.id });
  }

  const war = block.war;
  if (!war) {
    if (!isHome || !block.holder || block.isMine) return null;
    return (
      <div className="se-blockwar se-blockwar--declare">
        <div className="se-blockwar__goals" role="radiogroup" aria-label="War goal">
          {(['TAKE', 'SACK'] as const).map((key) => (
            <label key={key} className={`se-choice${goal === key ? ' se-choice--active' : ''}`}>
              <input type="radio" name={`goal-${block.district}`} checked={goal === key} onChange={() => setGoal(key)} />
              {key === 'TAKE' ? 'Take: the block and its businesses' : 'Sack: loot the registers, a level off each business'}
            </label>
          ))}
        </div>
        <ThugsField label="Squad" value={squad} onChange={setSquad} />
        <div className="se-actions-row">
          <Button type="button" className="se-btn se-btn--danger se-btn--sm"
            disabledReason={busy ?? block.warBlockedReason ?? (armed > 0 && squad > armed ? `You only have ${formatNumber(armed)} fit, armed thugs at home.` : null)}
            onClick={() => void post('/game/block-war/declare', { district: block.district, goal, squad })}>
            Declare war · {formatNumber(wars.declareTurnCost)} turns
          </Button>
        </div>
        <small className="se-hint">
          The opening fight lands {formatNumber(wars.warningMinutes)} minutes after you declare. Win it and your squad besieges the
          block for up to {formatNumber(wars.siegeHours)} hours; the war ends within {formatNumber(wars.maxWarHours)} hours either way.
        </small>
        {block.warBlockedReason ? <small className="se-hint">{block.warBlockedReason}</small> : null}
        {action.error ? <span className="se-error" role="alert">{action.error}</span> : null}
        {action.result ? <span className="se-action-confirm">{action.result.result.message}</span> : null}
      </div>
    );
  }

  const mySide = war.role === 'attacker' || war.role === 'attackerAlly' ? 'attacker' : war.role === 'defender' || war.role === 'defenderAlly' ? 'defender' : null;
  const sendLabel = war.actions.defend === null ? 'Send backup' : war.actions.breakSiege === null ? 'Break the siege' : war.actions.assault === null ? 'Go again' : null;
  const sendPath = war.actions.defend === null ? '/game/block-war/defend' : war.actions.breakSiege === null ? '/game/block-war/break' : '/game/block-war/assault';
  const answerSide = war.actions.answerAttacker === null ? 'ATTACKER' : war.actions.answerDefender === null ? 'DEFENDER' : null;
  const answerCall = answerSide === 'ATTACKER' ? war.calls.attacker : answerSide === 'DEFENDER' ? war.calls.defender : null;
  const myCall = mySide ? war.calls[mySide] : null;

  return (
    <div className={`se-blockwar se-blockwar--${war.status.toLowerCase()}`}>
      <div className="se-blockwar__head">
        <strong>{ROLE[war.role]} · {war.goal === 'TAKE' ? 'Take' : 'Sack'}</strong>
        <small>{war.attacker.displayName} vs. {war.defender.displayName}</small>
      </div>
      <div className="se-blockwar__status">
        <span>{STATUS[war.status]}</span>
        {war.status === 'SIEGE' ? (
          <div className="se-blockwar__control" role="meter" aria-label="Control" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(war.control)}>
            <span style={{ width: `${Math.min(100, war.control)}%` }} />
            <b className="se-num">{Math.round(war.control)}%</b>
          </div>
        ) : null}
      </div>
      <small className="se-hint se-num">
        {war.pendingFight ? `${FIGHT[war.pendingFight.kind]} lands ${formatClockTime(war.pendingFight.landsAt)} · ` : ''}
        {war.status === 'SIEGE' && war.fullControlAt ? `Control +${war.controlPerHour}/h, full at ${formatClockTime(war.fullControlAt)} · ` : ''}
        {war.nextAssaultAt ? `They can go again at ${formatClockTime(war.nextAssaultAt)} · ` : ''}
        ends by {formatWhen(war.endsBy)}
      </small>
      <small className="se-hint se-num">
        Committed: {formatNumber(war.committed.attacker)} attacking, {formatNumber(war.committed.defender)} holding
        {war.mine > 0 ? ` · ${formatNumber(war.mine)} of yours` : ''}
      </small>
      {(['attacker', 'defender'] as const).map((side) => war.allies[side] ? (
        <small key={side} className="se-hint">
          {side === 'attacker' ? 'Attacker' : 'Holder'}'s ally: {war.allies[side]!.displayName} for {war.allies[side]!.cutPercent}%
          {war.allies[side]!.fought ? ' (fought)' : ''}
        </small>
      ) : war.calls[side] ? (
        <small key={side} className="se-hint">{side === 'attacker' ? 'Attacker' : 'Holder'} is calling for help: {war.calls[side]!.cutPercent}% cut, open until {formatClockTime(war.calls[side]!.until)}</small>
      ) : null)}
      {war.torches.map((torch) => <small key={torch.lot} className="se-hint se-bad">The {torch.name} is burning; gone at {formatClockTime(torch.until)}.</small>)}

      {sendLabel || answerSide ? (
        <ThugsField label={answerSide && !sendLabel ? `Ride with them (up to ${formatNumber(war.allyCap)})` : 'Thugs'} value={thugs} onChange={setThugs} />
      ) : null}
      <div className="se-actions-row">
        {sendLabel ? (
          <Button type="button" className="se-btn se-btn--sm" disabledReason={busy}
            onClick={() => void post(sendPath, { warId: war.id, thugs })}>
            {sendLabel} · {formatNumber(thugs)}
          </Button>
        ) : null}
        {answerSide ? (
          <Button type="button" className="se-btn se-btn--sm" disabledReason={busy}
            onClick={() => void post('/game/block-war/answer', { warId: war.id, side: answerSide, thugs })}>
            Answer for {answerCall?.cutPercent ?? 0}% · {formatNumber(thugs)}
          </Button>
        ) : null}
        {war.actions.concede === null ? (
          <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={busy} onClick={() => void end('/game/block-war/concede')}>
            Concede
          </Button>
        ) : null}
        {war.actions.withdraw === null ? (
          <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={busy} onClick={() => void end('/game/block-war/withdraw')}>
            Withdraw
          </Button>
        ) : null}
      </div>
      {war.role === 'attacker' || war.role === 'defender' ? (
        <div className="se-actions-row se-blockwar__call">
          <label className="se-field se-blockwar__field">
            <span className="se-field__label">Ally's cut</span>
            <select className="se-input" value={cut} onChange={(event) => setCut(Number(event.target.value))}>
              {[0, 10, 20, 30, 40, 50].map((value) => <option key={value} value={value}>{value}%</option>)}
            </select>
          </label>
          <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={busy ?? war.actions.callAlly}
            onClick={() => void post('/game/block-war/call', { warId: war.id, cutPercent: cut })}>
            {myCall ? 'Raise the cut' : 'Call an ally'}
          </Button>
        </div>
      ) : null}
      {action.error ? <span className="se-error" role="alert">{action.error}</span> : null}
      {action.result ? <span className="se-action-confirm">{action.result.result.message}</span> : null}
    </div>
  );
}
