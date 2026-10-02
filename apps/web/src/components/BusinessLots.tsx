import { useEffect, useState } from 'react';
import type {
  BlockWarActionResult,
  BusinessBuildResult,
  BusinessCollectResult,
  BusinessRacketResult,
  BusinessStaffResult,
  CityTurfDto,
  GameActionResult,
  TurfBlockDto,
} from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { api } from '../api/client.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { formatWhen } from '../utils/time.js';
import { Button } from './Button.js';

type LotResult = BusinessBuildResult | BusinessStaffResult | BusinessRacketResult | BlockWarActionResult;
type Lot = NonNullable<TurfBlockDto['businesses']>[number];

function staffWord(kind: Lot['staffKind'], count: number): string {
  const noun = kind === 'WHORES' ? 'girl' : 'thug';
  return `${formatNumber(count)} ${noun}${count === 1 ? '' : 's'}`;
}

const TIER_NAME = { FOOTHOLD: 'Foothold', ESTABLISHED: 'Established', STRONGHOLD: 'Stronghold' } as const;

/**
 * 1.1.0-A/B. A block's three lots. Anyone sees what the lots hold and how far they are
 * built; the crew holding the block builds, upgrades and staffs them here.
 */
export function BusinessLots({
  block,
  business,
  onChanged,
}: {
  block: TurfBlockDto;
  business: CityTurfDto['business'];
  onChanged?: () => void;
}) {
  const action = useGameAction<LotResult>();
  const lots = block.businesses ?? [];
  const controls = Boolean(business && block.isMine);

  async function build(lot: Lot) {
    await action.run((actionId) => api.post<GameActionResult<LotResult>>('/game/business/build', {
      city: block.city, district: block.district, lot: lot.lot, actionId,
    }));
    onChanged?.();
  }

  async function staff(lot: Lot, count: number, autoStaff: boolean) {
    await action.run((actionId) => api.post<GameActionResult<LotResult>>('/game/business/staff', {
      city: block.city, district: block.district, lot: lot.lot, staff: count, autoStaff, actionId,
    }));
    onChanged?.();
  }

  async function torch(lot: Lot) {
    await action.run((actionId) => api.post<GameActionResult<LotResult>>('/game/business/torch', {
      city: block.city, district: block.district, lot: lot.lot, actionId,
    }));
    onChanged?.();
  }

  async function racket(lot: Lot, key: string | null) {
    await action.run((actionId) => api.post<GameActionResult<LotResult>>('/game/business/racket', {
      city: block.city, district: block.district, lot: lot.lot, racket: key, actionId,
    }));
    onChanged?.();
  }

  return (
    <div className="se-turfboard__businesses">
      {controls && block.businessTier ? (
        <span className="se-hint">
          {TIER_NAME[block.businessTier.tier]} · {block.businessTier.lotsOpen} of {lots.length} lots open
        </span>
      ) : null}
      <ul className="se-turfboard__lots" aria-label="Business lots">
        {lots.map((lot) => {
          const status = !lot.level ? 'Empty lot'
            : controls ? `Lv ${lot.level}/${lot.maxLevel} · ${lot.open ? `${lot.staff}/${lot.requiredStaff} staff` : 'closed'}`
              : `Lv ${lot.level}/${lot.maxLevel}`;
          return (
            <li key={lot.lot} className={`se-turfboard__lot${lot.level ? ' se-turfboard__lot--built' : ''}${lot.open ? ' se-turfboard__lot--open' : ''}`}>
              <div className="se-turfboard__lot-head" title={lot.signature ? `${lot.name}: this city's signature business earns more here.` : undefined}>
                <span>{lot.name}{lot.signature ? <span className="se-turfboard__signature" aria-label="signature business"> ★</span> : null}</span>
                <small className="se-num">{status}</small>
              </div>
              {controls && lot.level > 0 ? (
                <small className="se-turfboard__lot-detail se-num">
                  {formatCents(lot.currentIncomeCentsPerHour)}/h of {formatCents(lot.incomeCentsPerHour)} fully staffed
                  {lot.open || lot.registerCents > 0 ? ` · register ${formatCents(lot.registerCents)} of ${formatCents(lot.registerCapCents)}` : ''}
                </small>
              ) : null}
              {controls ? (
                <div className="se-actions-row">
                  {lot.nextLevel ? (
                    <Button
                      type="button"
                      className="se-btn se-btn--sm"
                      disabledReason={action.busy ? 'That business move is still going through.' : lot.buildBlockedReason}
                      onClick={() => void build(lot)}
                    >
                      {lot.level === 0 ? 'Build' : `Lv ${lot.nextLevel.level}`} · {formatCents(lot.nextLevel.costCents)}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {controls && lot.level > 0 ? (
                <StaffControl lot={lot} busy={action.busy} turns={business!.staffTurnCost} onSet={(count, auto) => void staff(lot, count, auto)} />
              ) : null}
              {block.war?.role === 'defender' && lot.level > 0 && business?.wars ? (
                <div className="se-actions-row">
                  <Button type="button" className="se-btn se-btn--danger se-btn--sm"
                    disabledReason={action.busy ? 'That business move is still going through.'
                      : block.war.torches.some((entry) => entry.lot === lot.lot) ? 'It is already burning.' : block.war.actions.torch}
                    title={`Burn it rather than hand it over: it loses levels and pays back a salvage, and must finish within ${business.wars.torchMinutes} minutes, before Control reaches 100.`}
                    onClick={() => void torch(lot)}>
                    Torch · {formatNumber(business.wars.torchTurnCost)} turns
                  </Button>
                </div>
              ) : null}
              {controls && business?.rackets && lot.racketOptions ? (
                <RacketControl lot={lot} busy={action.busy} turns={business.rackets.switchTurnCost} onSet={(key) => void racket(lot, key)} />
              ) : null}
              {controls && lot.nextLevel && !lot.buildBlockedReason ? (
                <small className="se-hint">
                  {lot.level === 0 ? 'Opens' : 'Next level'} with {staffWord(lot.staffKind, lot.nextLevel.staff)} · {formatCents(lot.nextLevel.incomeCentsPerHour)}/h · {formatNumber(business!.buildTurnCost)} turns
                </small>
              ) : controls && lot.buildBlockedReason && lot.buildBlockedReason !== 'Top level.' ? (
                <small className="se-hint">{lot.buildBlockedReason}</small>
              ) : null}
            </li>
          );
        })}
      </ul>
      {action.error ? <span className="se-error">{action.error}</span> : null}
      {action.result ? (
        'message' in action.result.result
          ? <span className="se-action-confirm">{action.result.result.message}</span>
          : 'staffAdded' in action.result.result
          ? <span className="se-action-confirm">{action.result.result.level === 1 ? 'Built' : 'Upgraded'} the {action.result.result.name}.</span>
          : 'previous' in action.result.result
            ? <span className="se-action-confirm">
                {action.result.result.racketName
                  ? `The ${action.result.result.name} now runs ${action.result.result.racketName}.`
                  : `The ${action.result.result.name} runs its front alone.`}
              </span>
          : <span className="se-action-confirm">
              {action.result.result.open
                ? `The ${action.result.result.name} has ${staffWord(action.result.result.staffKind, action.result.result.staff)} of ${action.result.result.maxStaff}${action.result.result.autoStaff ? ', auto-staffed' : ''}.`
                : `Closed the ${action.result.result.name}; its staff are back with the crew.`}
            </span>
      ) : null}
    </div>
  );
}

/**
 * 1.1.0-B. How many staff a business keeps. Fewer staff, less income, more people at home.
 * Auto-staff replaces anyone who deserts or is lured, from the fit crew, up to this number.
 */
function StaffControl({ lot, busy, turns, onSet }: { lot: Lot; busy: boolean; turns: number; onSet: (count: number, auto: boolean) => void }) {
  const [count, setCount] = useState(lot.staff);
  useEffect(() => setCount(lot.staff), [lot.staff]);
  const max = lot.requiredStaff;
  const waiting = busy ? 'That business move is still going through.' : null;
  return (
    <div className="se-turfboard__staff">
      <div className="se-actions-row">
        <Button type="button" className="se-btn se-btn--ghost se-btn--sm" aria-label="One fewer staff"
          disabledReason={count <= 0 ? 'Nobody left to send home.' : null} onClick={() => setCount(count - 1)}>−</Button>
        <span className="se-num se-turfboard__staff-count" aria-live="polite">{staffWord(lot.staffKind, count)} of {max}</span>
        <Button type="button" className="se-btn se-btn--ghost se-btn--sm" aria-label="One more staff"
          disabledReason={count >= max ? 'That is as many as this level takes.' : null} onClick={() => setCount(count + 1)}>+</Button>
        {count !== lot.staff ? (
          <Button type="button" className="se-btn se-btn--sm" disabledReason={waiting} onClick={() => onSet(count, lot.autoStaff)}>
            {count === 0 ? 'Close' : 'Set staff'} · {formatNumber(turns)} turns
          </Button>
        ) : lot.staff < max ? (
          <Button type="button" className="se-btn se-btn--sm" disabledReason={waiting} onClick={() => onSet(max, lot.autoStaff)}>
            Staff fully · {formatNumber(turns)} turns
          </Button>
        ) : null}
      </div>
      <label className="se-turfboard__auto">
        <input type="checkbox" checked={lot.autoStaff} disabled={busy}
          onChange={(event) => onSet(lot.staff, event.target.checked)} />
        Auto-staff: replace anyone who deserts or is lured, from {lot.staffKind === 'WHORES' ? 'the girls on the street' : 'the fit crew'}
      </label>
    </div>
  );
}

/**
 * 1.1.0-C. The racket a business runs on top of its front: one of two, switched for turns and
 * then locked for a cooldown. Strength follows the business's level and staffing.
 */
function RacketControl({ lot, busy, turns, onSet }: { lot: Lot; busy: boolean; turns: number; onSet: (key: string | null) => void }) {
  const current = lot.racket;
  const locked = current && lot.racketSwitchAt ? `Locked until ${formatWhen(lot.racketSwitchAt)}.` : null;
  const waiting = busy ? 'That business move is still going through.' : locked;
  const heat = (value: number) => (value > 0 ? `${value.toFixed(1)} Heat/h` : 'no Heat');
  return (
    <div className="se-turfboard__racket">
      <small className="se-turfboard__lot-detail">
        {current ? (
          <>
            Racket: <b>{current.name}</b> at {Math.round(current.strength * 100)}% · {heat(current.heatPerHour)}
            {current.cashCentsPerHour > 0 ? ` · +${formatCents(current.cashCentsPerHour)}/h` : ''}
            <span className="se-hint"> · {current.description}</span>
          </>
        ) : 'No racket: the front runs clean.'}
      </small>
      <div className="se-actions-row">
        {(lot.racketOptions ?? []).filter((option) => option.key !== current?.key).map((option) => (
          <Button
            key={option.key}
            type="button"
            className="se-btn se-btn--ghost se-btn--sm"
            title={`${option.description} At full staff: ${heat(option.heatPerHour)}${option.cashCentsPerHour > 0 ? `, +${formatCents(option.cashCentsPerHour)}/h` : ''}.`}
            disabledReason={waiting}
            onClick={() => onSet(option.key)}
          >
            {current ? 'Switch to' : 'Run'} {option.name} · {formatNumber(turns)} turns
          </Button>
        ))}
        {current ? (
          <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={waiting} onClick={() => onSet(null)}>
            Shut racket · {formatNumber(turns)} turns
          </Button>
        ) : null}
      </div>
      {locked ? <small className="se-hint">{locked}</small> : null}
    </div>
  );
}

/** 1.1.0-B. Every register on the crew's blocks in this city, emptied in one trip. */
export function BusinessCollect({ business, onChanged }: { business: NonNullable<CityTurfDto['business']>; onChanged?: () => void }) {
  const action = useGameAction<BusinessCollectResult>();

  async function collect() {
    await action.run((actionId) => api.post<GameActionResult<BusinessCollectResult>>('/game/business/collect', { actionId }));
    onChanged?.();
  }

  return (
    <div className="se-turfboard__collect">
      <span>
        Registers: <b className="se-num">{formatCents(business.registerTotalCents)}</b> waiting
        <small className="se-hint"> · they fill hourly and stop when full</small>
      </span>
      <Button
        type="button"
        className="se-btn se-btn--sm"
        disabledReason={action.busy ? 'Already collecting.' : business.registerTotalCents <= 0 ? 'Every register is empty.' : null}
        onClick={() => void collect()}
      >
        Collect · {formatNumber(business.collectTurnCost)} turns
      </Button>
      {business.rackets ? (
        <small className="se-hint se-turfboard__racket-heat">
          Rackets draw <b className="se-num">{business.rackets.heatPerHour.toFixed(1)}</b> Heat/h (Heat cools {formatNumber(business.rackets.coolDownPerHour)}/h)
          · laundered {formatNumber(business.rackets.launderedToday)}/{formatNumber(business.rackets.dailyLaunderCap)} today,
          {' '}{formatNumber(business.rackets.launderedRound)}/{formatNumber(business.rackets.roundLaunderCap)} this round
        </small>
      ) : null}
      {action.error ? <span className="se-error">{action.error}</span> : null}
      {action.result ? <span className="se-action-confirm">Collected {formatCents(action.result.result.collectedCents)}.</span> : null}
    </div>
  );
}
