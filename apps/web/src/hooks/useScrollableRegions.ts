import { useEffect } from 'react';

const SELECTOR = '.se-tablewrap';

/** The name a screen reader gives a scrolling table: its caption, else its panel's title. */
function regionName(wrap: HTMLElement): string {
  const caption = wrap.querySelector('caption')?.textContent?.trim();
  if (caption) return caption;
  const panelTitle = wrap.closest('.se-panel')?.querySelector('.se-panel__title, .se-panel__head h2, .se-panel__head h3')?.textContent?.trim();
  return panelTitle ? `${panelTitle} (table)` : 'Table';
}

/**
 * 1.0.0-G. A table wider than a phone scrolls sideways inside its wrapper. Keyboard
 * users can only scroll what they can focus, so every wrapper that actually scrolls
 * becomes a named, focusable region (arrow keys then scroll it); one that fits stays
 * out of the Tab order. Re-checked as pages render and the window resizes.
 */
export function useScrollableRegions(): void {
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      for (const wrap of Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))) {
        const scrolls = wrap.scrollWidth > wrap.clientWidth + 1;
        if (scrolls && wrap.tabIndex !== 0) {
          wrap.tabIndex = 0;
          wrap.setAttribute('role', 'region');
          wrap.setAttribute('aria-label', regionName(wrap));
        } else if (!scrolls && wrap.hasAttribute('tabindex')) {
          wrap.removeAttribute('tabindex');
          wrap.removeAttribute('role');
          wrap.removeAttribute('aria-label');
        }
      }
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
}
