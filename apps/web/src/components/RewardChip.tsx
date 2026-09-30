import type { QuestRewardDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { ITEM_ART, rewardArtKey } from '../items/itemArt.js';
import { ItemTile } from './ItemTile.js';

/**
 * One reward from a job, contract or pass tier: the item's picture beside
 * its label. Rewards with no picture yet (unlocks, cosmetics) stay as a
 * plain text chip.
 */
export function RewardChip({ reward }: { reward: Pick<QuestRewardDto, 'kind' | 'key' | 'amount' | 'label'> }) {
  const art = rewardArtKey(reward);
  if (!art) return <span className="se-quest-reward">{reward.label}</span>;

  // The server labels item rewards with the column name ("1 lowRiders").
  const label = (reward.kind === 'ITEM' || reward.kind === 'PRODUCT') && reward.amount !== null
    ? `${ITEM_ART[art].name} ×${formatNumber(reward.amount)}`
    : reward.label;

  return (
    <span className="se-quest-reward se-quest-reward--art">
      <ItemTile item={art} size="sm" label={false} />
      <span className="se-quest-reward__label">{label}</span>
    </span>
  );
}
