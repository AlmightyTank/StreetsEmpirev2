import type { CSSProperties } from 'react';
import { ITEM_ART, itemArtUrl, type ItemArtKey } from '../items/itemArt.js';

/**
 * One inventory slot: the item's picture centred on a gridded cell tinted by
 * rarity, its short name in the corner and an optional count underneath —
 * the way a looter-shooter stash reads at a glance.
 */
export function ItemTile({
  item,
  quantity,
  size = 'md',
  label = true,
  className,
}: {
  item: ItemArtKey;
  quantity?: number;
  size?: 'sm' | 'md' | 'lg';
  label?: boolean;
  className?: string;
}) {
  const art = ITEM_ART[item];
  const [w, h] = art.cells;
  const classes = ['se-item-tile', `se-item-tile--${art.rarity.toLowerCase()}`, `se-item-tile--${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <figure
      className={classes}
      style={{ '--se-item-w': w, '--se-item-h': h } as CSSProperties}
      title={quantity === undefined ? art.name : `${art.name} ×${quantity.toLocaleString()}`}
    >
      <img src={itemArtUrl(item)} alt={art.name} loading="lazy" decoding="async" draggable={false} />
      {label && <figcaption className="se-item-tile__name">{art.shortName}</figcaption>}
      {quantity !== undefined && <span className="se-item-tile__qty">{formatQuantity(quantity)}</span>}
    </figure>
  );
}

function formatQuantity(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${+(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
