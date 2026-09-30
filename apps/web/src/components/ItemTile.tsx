import type { CSSProperties, ReactNode } from 'react';
import { hasItemArt, ITEM_ART, itemArtUrl, type ItemArtKey } from '../items/itemArt.js';

/**
 * A small picture ahead of a list row's label. `slot` reserves room for a
 * two-cell item so labels line up in a list that mixes sizes (the Armory).
 */
export function ItemLabel({ itemKey, children, slot = false }: { itemKey: string; children: ReactNode; slot?: boolean }) {
  if (!hasItemArt(itemKey)) return <>{children}</>;
  return (
    <span className="se-item-label">
      <span className={`se-item-label__art${slot ? ' se-item-label__art--slot' : ''}`}>
        <ItemTile item={itemKey} size="sm" label={false} />
      </span>
      <span className="se-item-label__text">{children}</span>
    </span>
  );
}

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
  const classes = ['se-item-tile', `se-item-tile--${art.rarity.toLowerCase()}`, `se-item-tile--${size}`, w > 1 ? 'se-item-tile--wide' : null, className]
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
