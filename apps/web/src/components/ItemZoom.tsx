import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ITEM_COSMETIC_STYLES, type ItemCosmeticStyleKey } from '@streets/shared';
import { ITEM_ART, type ItemArtKey } from '../items/itemArt.js';
import { itemCosmeticArtUrl } from '../items/itemCosmeticArt.js';

/** A tile's on-screen box when it was clicked, so the art can grow out of it. */
export interface ZoomOrigin {
  left: number;
  top: number;
  width: number;
  height: number;
}

const OPEN_MS = 280;
const CLOSE_MS = 200;
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Transform that lays `stage` exactly over `origin`, for a grow-from-tile (FLIP) animation. */
function fromOrigin(stage: HTMLElement, origin: ZoomOrigin): string {
  const box = stage.getBoundingClientRect();
  if (!box.width || !box.height) return 'scale(0.9)';
  const dx = origin.left + origin.width / 2 - (box.left + box.width / 2);
  const dy = origin.top + origin.height / 2 - (box.top + box.height / 2);
  const scale = Math.max(origin.width / box.width, origin.height / box.height);
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

/**
 * Full-size look at one item in one skin, opened by clicking any ItemTile.
 * The art grows out of the tile that was clicked and shrinks back into it on
 * close; the backdrop and details fade around it. Rendered into <body> so it
 * sits above hover cards and clipped panels.
 * Keyboard: focus moves to Close, Escape closes, focus returns afterwards.
 */
export function ItemZoom({
  item,
  skin,
  origin,
  onClose,
}: {
  item: ItemArtKey;
  skin: ItemCosmeticStyleKey;
  origin?: ZoomOrigin;
  onClose: () => void;
}) {
  const art = ITEM_ART[item];
  const backdrop = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);
  const [w, h] = art.cells;
  const style = ITEM_COSMETIC_STYLES.find((option) => option.key === skin);
  const skinName = style?.label ?? 'Classic';
  const rarity = art.rarity.charAt(0) + art.rarity.slice(1).toLowerCase();

  // Opening: runs before paint so the art never flashes at full size first.
  useLayoutEffect(() => {
    if (prefersReducedMotion() || !backdrop.current || !box.current || !stage.current) return;
    const timing = { duration: OPEN_MS, easing: EASE_OUT, fill: 'backwards' as const };
    backdrop.current.animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, duration: OPEN_MS * 0.8 });
    if (origin) {
      // The panel fades in behind the art while the art itself flies out of the tile.
      box.current.animate([{ backgroundColor: 'transparent', borderColor: 'transparent', boxShadow: 'none' }, {}], timing);
      for (const part of box.current.querySelectorAll<HTMLElement>('[data-zoom-fade]')) {
        part.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { ...timing, delay: OPEN_MS * 0.35 });
      }
      stage.current.animate([{ transform: fromOrigin(stage.current, origin) }, { transform: 'none' }], timing);
    } else {
      box.current.animate([{ opacity: 0, transform: 'scale(0.94)' }, { opacity: 1, transform: 'none' }], timing);
    }
  }, [origin]);

  // Closing: play the opening backwards, then unmount.
  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    if (prefersReducedMotion() || !backdrop.current || !box.current || !stage.current) {
      onClose();
      return;
    }
    const timing = { duration: CLOSE_MS, easing: EASE_IN, fill: 'forwards' as const };
    backdrop.current.animate([{ opacity: 1 }, { opacity: 0 }], timing);
    let done: Animation;
    if (origin) {
      box.current.animate([{}, { backgroundColor: 'transparent', borderColor: 'transparent', boxShadow: 'none' }], timing);
      for (const part of box.current.querySelectorAll<HTMLElement>('[data-zoom-fade]')) {
        part.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, duration: CLOSE_MS * 0.6 });
      }
      done = stage.current.animate([{ transform: 'none' }, { transform: fromOrigin(stage.current, origin), opacity: 0.6 }], timing);
    } else {
      done = box.current.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], timing);
    }
    done.finished.then(onClose, onClose);
  }, [origin, onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, [requestClose]);

  return createPortal(
    // React events bubble out of portals to the tile's ancestors (a radio card, a link),
    // so stop them here; otherwise a click in the popup would also select or navigate.
    <div
      ref={backdrop}
      className="se-item-zoom"
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) requestClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Tab') {
          event.preventDefault();
          close.current?.focus();
        }
      }}
    >
      <div ref={box} className="se-item-zoom__box" role="dialog" aria-modal="true" aria-labelledby="se-item-zoom-title">
        <header className="se-item-zoom__head" data-zoom-fade>
          <div>
            <h2 id="se-item-zoom-title">{art.name}</h2>
            <p className="se-item-zoom__meta">
              <span className={`se-item-zoom__rarity se-item-tile--${art.rarity.toLowerCase()}`}>{rarity}</span>
              <span>{skinName} skin</span>
            </p>
          </div>
          <button ref={close} type="button" className="se-item-zoom__close" aria-label="Close" onClick={requestClose}>×</button>
        </header>
        <figure
          ref={stage}
          className={`se-item-zoom__stage se-item-tile--${art.rarity.toLowerCase()}`}
          style={{ '--se-item-w': w, '--se-item-h': h } as CSSProperties}
        >
          <img src={itemCosmeticArtUrl(item, skin)} alt={`${art.name}, ${skinName} skin`} decoding="async" draggable={false} />
        </figure>
        {style && style.key !== 'classic' ? <p className="se-item-zoom__desc" data-zoom-fade>{style.description}</p> : null}
      </div>
    </div>,
    document.body,
  );
}
