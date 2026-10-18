import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ITEM_COSMETIC_STYLES, type ItemCosmeticStyleKey } from '@streets/shared';
import { ITEM_ART, type ItemArtKey } from '../items/itemArt.js';
import { itemCosmeticArtUrl } from '../items/itemCosmeticArt.js';

/**
 * Full-size look at one item in one skin, opened by clicking any ItemTile.
 * Rendered into <body> so it sits above hover cards and clipped panels.
 * Keyboard: focus moves to Close, Escape closes, focus returns afterwards.
 */
export function ItemZoom({ item, skin, onClose }: { item: ItemArtKey; skin: ItemCosmeticStyleKey; onClose: () => void }) {
  const art = ITEM_ART[item];
  const close = useRef<HTMLButtonElement>(null);
  const [w, h] = art.cells;
  const style = ITEM_COSMETIC_STYLES.find((option) => option.key === skin);
  const rarity = art.rarity.charAt(0) + art.rarity.slice(1).toLowerCase();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    // React events bubble out of portals to the tile's ancestors (a radio card, a link),
    // so stop them here; otherwise a click in the popup would also select or navigate.
    <div
      className="se-item-zoom"
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Tab') {
          event.preventDefault();
          close.current?.focus();
        }
      }}
    >
      <div className="se-item-zoom__box" role="dialog" aria-modal="true" aria-labelledby="se-item-zoom-title">
        <header className="se-item-zoom__head">
          <div>
            <h2 id="se-item-zoom-title">{art.name}</h2>
            <p className="se-item-zoom__meta">
              <span className={`se-item-zoom__rarity se-item-tile--${art.rarity.toLowerCase()}`}>{rarity}</span>
              <span>{style?.label ?? 'Classic'} skin</span>
            </p>
          </div>
          <button ref={close} type="button" className="se-item-zoom__close" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <figure
          className={`se-item-zoom__stage se-item-tile--${art.rarity.toLowerCase()}`}
          style={{ '--se-item-w': w, '--se-item-h': h } as CSSProperties}
        >
          <img src={itemCosmeticArtUrl(item, skin)} alt={`${art.name}, ${style?.label ?? 'Classic'} skin`} draggable={false} />
        </figure>
        {style && style.key !== 'classic' ? <p className="se-item-zoom__desc">{style.description}</p> : null}
      </div>
    </div>,
    document.body,
  );
}
