import type { CSSProperties } from 'react';
import { hasItemArt, ITEM_ART, itemArtUrl, type ItemArtKey } from '../items/itemArt.js';

/**
 * The picture at the top of a store shelf card. Greyed out while the
 * player can't buy it yet, dimmed while it is sold out, and absent for
 * any item that has no art so a new ruleset item still renders.
 */
export function ShelfArt({ itemKey, locked, soldOut }: { itemKey: string; locked: boolean; soldOut: boolean }) {
  if (!hasItemArt(itemKey)) return null;
  const state = locked ? 'se-item-tile--locked' : soldOut ? 'se-item-tile--out' : undefined;
  return <ItemTile item={itemKey} label={false} className={state} />;
}

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
