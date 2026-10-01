import type { QuestRewardDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { ITEM_ART, rewardArtKey } from '../items/itemArt.js';
import { ItemTile } from './ItemTile.js';

/**
 * One reward from a job, contract or pass tier: the item's picture beside
 * its label. Rewards with no picture yet (unlocks, cosmetics) stay as a
 * plain text chip.
 */
type RewardLike = Pick<QuestRewardDto, 'kind' | 'key' | 'amount' | 'label'>;

/**
 * A reward in the game's words. The server labels item rewards with the
 * column name ("1 lowRiders") and cosmetics as "Permanent cosmetic · …";
 * anything with art reads as "Low-Rider ×1" or just its name.
 */
export function rewardText(reward: RewardLike): string {
  const art = rewardArtKey(reward);
  if (!art) return reward.label;
  if ((reward.kind === 'ITEM' || reward.kind === 'PRODUCT') && reward.amount !== null) {
    return `${ITEM_ART[art].name} ×${formatNumber(reward.amount)}`;
  }
  if (reward.kind === 'COSMETIC_UNLOCK') return ITEM_ART[art].name;
  return reward.label;
}

export function RewardChip({ reward }: { reward: RewardLike }) {
  const art = rewardArtKey(reward);
  if (!art) return <span className="se-quest-reward">{reward.label}</span>;
  const label = rewardText(reward);

  return (
    <span className="se-quest-reward se-quest-reward--art">
      <ItemTile item={art} size="sm" label={false} />
      <span className="se-quest-reward__label">{label}</span>
    </span>
  );
}
