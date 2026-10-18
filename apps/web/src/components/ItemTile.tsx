import { useCallback, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import type { CustomizableItemKey, ItemCosmeticStyleKey } from '@streets/shared';
import { hasItemArt, ITEM_ART, type ItemArtKey } from '../items/itemArt.js';
import { itemCosmeticArtUrl } from '../items/itemCosmeticArt.js';
import { useSession } from '../stores/session.js';
import { ItemZoom, type ZoomOrigin } from './ItemZoom.js';

/**
 * A small picture ahead of a list row's label. `slot` reserves room for a
 * two-cell item so labels line up in a list that mixes sizes (the Armory).
 */
export function ItemLabel({
  itemKey,
  children,
  slot = false,
  cosmeticStyle,
}: {
  itemKey: string;
  children: ReactNode;
  slot?: boolean;
  /** Draw the item in this style instead of the viewer's own (e.g. an opponent's in a battle report). */
  cosmeticStyle?: ItemCosmeticStyleKey;
}) {
  if (!hasItemArt(itemKey)) return <>{children}</>;
  return (
    <span className="se-item-label">
      <span className={`se-item-label__art${slot ? ' se-item-label__art--slot' : ''}`}>
        <ItemTile item={itemKey} size="sm" label={false} cosmeticStyle={cosmeticStyle} />
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
  quantityText,
  size = 'md',
  label = true,
  className,
  title,
  cosmeticStyle,
  zoomable = true,
}: {
  item: ItemArtKey;
  quantity?: number;
  /** A count that isn't a plain number, e.g. "$10K"; shown instead of `quantity`. */
  quantityText?: string;
  size?: 'sm' | 'md' | 'lg';
  label?: boolean;
  className?: string;
  /** Tooltip; defaults to the item name and count. */
  title?: string;
  /** Settings preview or authored override. Otherwise the signed-in player's loadout is used. */
  cosmeticStyle?: ItemCosmeticStyleKey;
  /** Click (or Enter/Space) opens a full-size view so players can inspect the skin. */
  zoomable?: boolean;
}) {
  const art = ITEM_ART[item];
  // The tile's on-screen box at click time; the popup grows out of it. Null while closed.
  const [zoomFrom, setZoomFrom] = useState<ZoomOrigin | null>(null);
  const closeZoom = useCallback(() => setZoomFrom(null), []);
  const profileSettings = useSession((state) => state.profileSettings);
  const accountStyle = item === 'THUG' || item === 'HOE'
    ? profileSettings.crewCosmetics?.[item] ?? 'classic'
    : profileSettings.itemCosmetics?.[item as CustomizableItemKey] ?? 'classic';
  const skin = cosmeticStyle ?? accountStyle;
  const [w, h] = art.cells;
  const classes = ['se-item-tile', `se-item-tile--${art.rarity.toLowerCase()}`, `se-item-tile--${size}`, w > 1 ? 'se-item-tile--wide' : null, zoomable ? 'se-item-tile--zoomable' : null, className]
    .filter(Boolean)
    .join(' ');

  // The tile can sit inside a radio card, a link or a button: the art opens the
  // zoom instead of triggering that control, while the rest of the control still works.
  const openZoom = (event: MouseEvent | KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const { left, top, width, height } = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setZoomFrom({ left, top, width, height });
  };
  const tip = title ?? (quantity === undefined ? art.name : `${art.name} ×${quantity.toLocaleString()}`);

  return (
    <>
    <figure
      className={classes}
      style={{ '--se-item-w': w, '--se-item-h': h } as CSSProperties}
      title={zoomable ? `${tip} · click to enlarge` : tip}
      role={zoomable ? 'button' : undefined}
      tabIndex={zoomable ? 0 : undefined}
      aria-label={zoomable ? `View ${art.name} larger` : undefined}
      onClick={zoomable ? openZoom : undefined}
      onKeyDown={zoomable ? (event) => { if (event.key === 'Enter' || event.key === ' ') openZoom(event); } : undefined}
    >
      <img src={itemCosmeticArtUrl(item, skin)} alt={art.name} loading="lazy" decoding="async" draggable={false} />
      {label && <figcaption className="se-item-tile__name">{art.shortName}</figcaption>}
      {quantityText !== undefined || quantity !== undefined
        ? <span className="se-item-tile__qty">{quantityText ?? formatQuantity(quantity!)}</span>
        : null}
    </figure>
    {zoomFrom ? <ItemZoom item={item} skin={skin} origin={zoomFrom} onClose={closeZoom} /> : null}
    </>
  );
}

function formatQuantity(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${+(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
