import type {
  BusinessBuildResult,
  BusinessCollectResult,
  BusinessStaffResult,
  CityTurfDto,
  GameActionResult,
  TurfBlockDto,
} from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { api } from '../api/client.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { Button } from './Button.js';

type LotResult = BusinessBuildResult | BusinessStaffResult;
type Lot = NonNullable<TurfBlockDto['businesses']>[number];

function staffWord(kind: Lot['staffKind'], count: number): string {
  const noun = kind === 'WHORES' ? 'girl' : 'thug';
  return `${formatNumber(count)} ${noun}${count === 1 ? '' : 's'}`;
}

const TIER_NAME = { FOOTHOLD: 'Foothold', ESTABLISHED: 'Established', STRONGHOLD: 'Stronghold' } as const;

/**
 * 1.1.0-A/B. A block's three lots. Anyone sees what the lots hold and how far they are
 * built; the crew holding the block builds, upgrades, opens and closes them here.
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
      district: block.district, lot: lot.lot, actionId,
    }));
    onChanged?.();
  }

  async function staff(lot: Lot, open: boolean) {
    await action.run((actionId) => api.post<GameActionResult<LotResult>>('/game/business/staff', {
      district: block.district, lot: lot.lot, open, actionId,
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
            : controls ? `Lv ${lot.level}/${lot.maxLevel} · ${lot.open ? 'open' : 'closed'}`
              : `Lv ${lot.level}/${lot.maxLevel}`;
          return (
            <li key={lot.lot} className={`se-turfboard__lot${lot.level ? ' se-turfboard__lot--built' : ''}${lot.open ? ' se-turfboard__lot--open' : ''}`}>
              <div className="se-turfboard__lot-head" title={lot.signature ? `${lot.name}: this city's signature business earns more here.` : undefined}>
                <span>{lot.name}{lot.signature ? <span className="se-turfboard__signature" aria-label="signature business"> ★</span> : null}</span>
                <small className="se-num">{status}</small>
              </div>
              {controls && lot.level > 0 ? (
                <small className="se-turfboard__lot-detail se-num">
                  {formatCents(lot.incomeCentsPerHour)}/h · {staffWord(lot.staffKind, lot.requiredStaff)}
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
                  {lot.level > 0 ? (
                    <Button
                      type="button"
                      className="se-btn se-btn--ghost se-btn--sm"
                      disabledReason={action.busy ? 'That business move is still going through.' : null}
                      onClick={() => void staff(lot, !lot.open)}
                    >
                      {lot.open ? 'Close' : `Open · ${staffWord(lot.staffKind, lot.requiredStaff)}`}
                    </Button>
                  ) : null}
                </div>
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
        'staffAdded' in action.result.result
          ? <span className="se-action-confirm">{action.result.result.level === 1 ? 'Built' : 'Upgraded'} the {action.result.result.name}.</span>
          : <span className="se-action-confirm">{action.result.result.open ? 'Opened' : 'Closed'} the {action.result.result.name}.</span>
      ) : null}
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
      {action.error ? <span className="se-error">{action.error}</span> : null}
      {action.result ? <span className="se-action-confirm">Collected {formatCents(action.result.result.collectedCents)}.</span> : null}
    </div>
  );
}
