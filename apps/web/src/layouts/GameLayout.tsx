import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type TouchEvent, type ReactNode, type RefObject } from 'react';
import { Link, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { Shell, useSidebarRail } from './Shell.js';
import { ConnectionBanner } from '../components/ConnectionBanner.js';
import { RoundRollCallNotice } from '../components/RoundRollCall.js';
import { TrackedQuests } from '../components/TrackedQuests.js';
import { IntroDialog } from '../components/onboarding/IntroDialog.js';
import { TourOverlay } from '../components/onboarding/TourOverlay.js';
import { PageGuide } from '../components/onboarding/PageGuide.js';
import { useOnboarding } from '../stores/onboarding.js';
import { NavIcon } from '../components/NavIcon.js';
import { usePageFreshness } from '../hooks/usePageFreshness.js';
import { useGamePresence } from '../hooks/useGamePresence.js';
import { useStaleGameReload } from '../hooks/useStaleGameReload.js';
import { isMobileNavSwipe, isSheetDismissSwipe } from './mobileNavSwipe.js';
import { useSession } from '../stores/session.js';
import { PlayerProfileHoverLayer } from '../components/PlayerProfileHoverLayer.js';
import { JokeDayBanner } from '../components/EasterEggs.js';
import { CaseStoryAlerts } from '../components/CaseStoryAlerts.js';
import { AdminWorkspace } from '../components/AdminWorkspace.js';
import { formatDuration } from '../utils/time.js';
import { isPageScrollLocked } from '../utils/pageScrollLock.js';
import { anchorScrollTop, isAnchorReady, preservedRouteScrollTarget, routeAnchorId, shouldPreserveRouteScroll } from '../utils/routeScroll.js';
import {
  isCurrent,
  filterNavSections,
  useNavBadges,
  useSections,
  useTabSlots,
  worstBadge,
  type NavBadge,
  type NavPage,
  type NavSection,
} from './gameNav.js';

const NAV_STORAGE_KEY = 'streets.gameNav.sections.v1';

function readNavState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(NAV_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (Object.fromEntries(
          Object.entries(parsed).filter(([, value]) => typeof value === 'boolean'),
        ) as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

function writeNavState(state: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Collapsing the nav is convenience only; private browsing storage failures should not block play.
  }
}

function Badge({ badge }: { badge: NavBadge | null | undefined }) {
  if (!badge) return null;
  return (
    <span className={`se-navbadge se-navbadge--${badge.tone}${badge.text ? '' : ' se-navbadge--dot'}`} title={badge.label}>
      {badge.text ?? null}
      <span className="se-sr">{badge.label}</span>
    </span>
  );
}

/** Desktop and tablet sidebar. Phones get the tab bar instead. */
function GameNav({ sections, pathname, badges }: { sections: NavSection[]; pathname: string; badges: Record<string, NavBadge> }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => readNavState());
  const [query, setQuery] = useState('');
  // An icon rail must always contain every destination: the search field is hidden there.
  const rail = useSidebarRail();
  const visible = filterNavSections(sections, rail ? '' : query);

  useEffect(() => {
    if (rail) setQuery('');
  }, [rail]);

  useEffect(() => {
    writeNavState(expanded);
  }, [expanded]);

  return (
    <nav className="se-nav" aria-label="Game">
      <div className="se-nav-search">
        <label className="se-sr" htmlFor="se-sidebar-search">Find a game page</label>
        <input id="se-sidebar-search" type="search" className="se-nav-search__input" placeholder="Find a page..."
          value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {visible.length === 0 ? <p className="se-nav-search__empty">No matching pages.</p> : null}
      {visible.map((section) => {
        const activeSection = section.pages.some((page) => isCurrent(page, pathname));
        const sectionOpen = query.trim() ? true : expanded[section.id] ?? (activeSection || Boolean(section.defaultOpen));
        const listId = `game-nav-${section.id}`;
        return (
          <div className={`se-nav__section${sectionOpen ? '' : ' se-nav__section--collapsed'}`} key={section.id}>
            <button
              type="button"
              className="se-nav__title"
              aria-expanded={sectionOpen}
              aria-controls={listId}
              onClick={() => setExpanded((current) => ({ ...current, [section.id]: !(current[section.id] ?? (activeSection || Boolean(section.defaultOpen))) }))}
            >
              <span>{section.title}</span>
              <span className="se-nav__chevron" aria-hidden="true">{sectionOpen ? '−' : '+'}</span>
            </button>
            <ul id={listId} className="se-nav__list" hidden={!sectionOpen && !rail}>
              {section.pages.map((page) => {
                const current = isCurrent(page, pathname);
                return (
                  <li key={page.key}>
                    <Link to={page.to} aria-current={current ? 'page' : undefined}
                      title={rail ? page.label : undefined}
                      className={`se-nav__link${current ? ' se-nav__link--active' : ''}`}>
                      <NavIcon name={page.icon} />
                      <span className="se-nav__label">{page.label}</span>
                      <Badge badge={badges[page.key]} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}


/** Season, clock and level. Top of the desktop sidebar; phones get the slim game bar. */
function SeasonCard() {
  const round = useSession((s) => s.round);
  const experience = useSession((s) => s.me?.experience ?? null);
  if (!round) return null;
  const clock = round.paused ? 'Paused' : `${formatDuration(round.msRemaining)} left`;
  return (
    <div className="se-seasoncard" title={`${round.name} · ${clock}`}>
      <div className="se-seasoncard__head">
        <span className="se-seasoncard__label">Season</span>
        <span className={`se-seasoncard__time se-num${round.paused ? ' se-seasoncard__time--paused' : ''}`}>
          {clock}
        </span>
      </div>
      <span className="se-seasoncard__name">{round.name}</span>
      {experience ? (
        <Link
          className="se-seasoncard__xp"
          to="/game/xp-progress"
          title={`${experience.totalXp.toLocaleString()} lifetime XP`}
          aria-label={`Level ${experience.level}, ${experience.xpIntoLevel} of ${experience.xpForLevel} XP to the next level. View your XP progress.`}
        >
          <span className="se-seasoncard__level">
            <strong>Level {experience.level}</strong>
            <strong className="se-seasoncard__lvl" aria-hidden="true">L{experience.level}</strong>
            <span className="se-num">{experience.xpIntoLevel.toLocaleString()} / {experience.xpForLevel.toLocaleString()} XP</span>
          </span>
          <span className="se-seasoncard__track" aria-hidden="true">
            <span style={{ width: `${experience.progressPercent}%` }} />
          </span>
        </Link>
      ) : null}
    </div>
  );
}

const LONG_PRESS_MS = 500;

/**
 * Phone navigation: four tabs the player can rearrange and a More button for
 * everything else. Long-press a tab to swap what sits there.
 */
function TabBar({ slots, pathname, badges, moreOpen, onMore, onSwipeUp, onEditSlot, moreButton }: {
  slots: NavPage[];
  pathname: string;
  badges: Record<string, NavBadge>;
  moreOpen: boolean;
  onMore: () => void;
  onSwipeUp: () => void;
  onEditSlot: (index: number) => void;
  moreButton: RefObject<HTMLButtonElement | null>;
}) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const touchStart = useRef<{ identifier: number; x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const onBar = new Set(slots.map((page) => page.key));
  const elsewhere = !slots.some((page) => isCurrent(page, pathname));
  const hiddenBadges = Object.entries(badges).filter(([key]) => !onBar.has(key));
  const moreBadge = worstBadge(hiddenBadges.map(([, badge]) => badge))
    ?? hiddenBadges.find(([key]) => key === 'console')?.[1]
    ?? null;

  function cancel() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    touchStart.current = null;
    if (moreOpen || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (touch) touchStart.current = { identifier: touch.identifier, x: touch.clientX, y: touch.clientY };
  }

  function handleTouchMove(event: TouchEvent<HTMLElement>) {
    const initial = touchStart.current;
    if (!initial) return;
    if (event.touches.length !== 1) {
      touchStart.current = null;
      cancel();
      return;
    }
    const touch = event.touches[0];
    if (!touch || touch.identifier !== initial.identifier) {
      touchStart.current = null;
      cancel();
      return;
    }
    // A swipe must cancel the long-press tab editor before the timer fires.
    if (Math.abs(touch.clientY - initial.y) > 12 || Math.abs(touch.clientX - initial.x) > 12) cancel();
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const initial = touchStart.current;
    touchStart.current = null;
    if (!initial || moreOpen || event.touches.length !== 0) return;
    const touch = Array.from(event.changedTouches).find((item) => item.identifier === initial.identifier);
    if (!touch || !isMobileNavSwipe(initial.x, initial.y, touch.clientX, touch.clientY, 'up')) return;
    // Don't let the touch-generated click navigate to the tab under the finger.
    suppressClickUntil.current = Date.now() + 500;
    cancel();
    onSwipeUp();
  }

  function handleClickCapture(event: MouseEvent<HTMLElement>) {
    if (Date.now() < suppressClickUntil.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil.current = 0;
    }
  }

  return (
    <nav className="se-tabbar" aria-label="Game tabs"
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStart.current = null; cancel(); }}
      onClickCapture={handleClickCapture}>
      {slots.map((page, index) => {
        const current = isCurrent(page, pathname);
        return (
          <Link key={page.key} to={page.to} aria-current={current ? 'page' : undefined}
            className={`se-tabbar__tab${current ? ' se-tabbar__tab--active' : ''}`}
            onPointerDown={() => {
              fired.current = false;
              cancel();
              timer.current = window.setTimeout(() => {
                fired.current = true;
                timer.current = null;
                navigator.vibrate?.(10);
                onEditSlot(index);
              }, LONG_PRESS_MS);
            }}
            onPointerUp={cancel}
            onPointerLeave={cancel}
            onPointerCancel={cancel}
            onContextMenu={(event) => event.preventDefault()}
            onClick={(event) => {
              // The long press already opened the editor; the release is not a tap.
              if (fired.current) {
                event.preventDefault();
                fired.current = false;
              }
            }}>
            <span className="se-tabbar__icon"><NavIcon name={page.icon} /><Badge badge={badges[page.key]} /></span>
            <span className="se-tabbar__label">{page.short ?? page.label}</span>
          </Link>
        );
      })}
      <button ref={moreButton} type="button" onClick={onMore}
        className={`se-tabbar__tab${elsewhere || moreOpen ? ' se-tabbar__tab--active' : ''}`}
        aria-haspopup="dialog" aria-expanded={moreOpen}>
        <span className="se-tabbar__icon">
          <svg className="se-navicon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">
            <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
          </svg>
          <Badge badge={moreBadge} />
        </span>
        <span className="se-tabbar__label">More</span>
      </button>
    </nav>
  );
}

/**
 * Every game page as a grid, from the More tab. In edit mode the same grid
 * picks what goes in a tab slot instead of navigating.
 */
function MoreSheet({ sections, pathname, badges, slots, editSlot, fromTop, isDefault, onEditSlot, onPick, onReset, onClose }: {
  sections: NavSection[];
  pathname: string;
  badges: Record<string, NavBadge>;
  slots: NavPage[];
  /** The tab slot being changed, or null when browsing. */
  editSlot: number | null;
  fromTop: boolean;
  isDefault: boolean;
  onEditSlot: (index: number | null) => void;
  onPick: (key: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const gripStart = useRef<{ identifier: number; x: number; y: number } | null>(null);
  const suppressGripClickUntil = useRef(0);
  const editing = editSlot !== null;
  const [query, setQuery] = useState('');
  const visible = filterNavSections(sections, query);
  const slotOf = new Map(slots.map((page, index) => [page.key, index]));

  useEffect(() => {
    // Isolate keyboard and wheel scrolling behind the modal, but never make
    // the document body position:fixed (which causes viewport jumps on Android).
    // Overflow hiding keeps the original scroll offset and layout intact.
    const root = document.documentElement;
    const body = document.body;
    const rootOverflow = root.style.overflow;
    const bodyOverflow = body.style.overflow;
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = rootOverflow;
      body.style.overflow = bodyOverflow;
    };
  }, []);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !sheet.current) return;
    // Keep focus inside the sheet while it is open.
    const focusable = [...sheet.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  function handleGripStart(event: TouchEvent<HTMLDivElement>) {
    gripStart.current = null;
    if (event.touches.length !== 1) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, input, select, textarea')
      && !target.closest('.se-sheet__grip')) return;
    const touch = event.touches[0];
    if (touch) gripStart.current = { identifier: touch.identifier, x: touch.clientX, y: touch.clientY };
  }

  function handleGripMove(event: TouchEvent<HTMLDivElement>) {
    const initial = gripStart.current;
    if (!initial) return;
    if (event.touches.length !== 1) { gripStart.current = null; return; }
    const touch = event.touches[0];
    if (!touch || touch.identifier !== initial.identifier) { gripStart.current = null; return; }
    if (Math.abs(touch.clientY - initial.y) > 9 || Math.abs(touch.clientX - initial.x) > 9) {
      suppressGripClickUntil.current = Date.now() + 500;
    }
  }

  function handleGripEnd(event: TouchEvent<HTMLDivElement>) {
    const initial = gripStart.current;
    gripStart.current = null;
    if (!initial || event.touches.length !== 0) return;
    const touch = Array.from(event.changedTouches).find((item) => item.identifier === initial.identifier);
    if (touch && isSheetDismissSwipe(initial.x, initial.y, touch.clientX, touch.clientY, fromTop ? 'up' : 'down')) onClose();
  }

  return (
    <div className={`se-sheet${fromTop ? ' se-sheet--from-top' : ''}`} onKeyDown={onKeyDown}>
      <div className="se-sheet__backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={sheet} className="se-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="se-sheet-title">
        <div className="se-sheet__drag-area" onTouchStart={handleGripStart}
          onTouchMove={handleGripMove} onTouchEnd={handleGripEnd}
          onTouchCancel={() => { gripStart.current = null; }}>
          <button type="button" className="se-sheet__grip"
            aria-label={fromTop ? 'Close All pages (swipe up or tap)' : 'Close All pages (swipe down or tap)'}
            onClick={(event) => {
              if (Date.now() < suppressGripClickUntil.current) {
                event.preventDefault();
                suppressGripClickUntil.current = 0;
                return;
              }
              onClose();
            }} />
          <header className="se-sheet__head">
          <h2 id="se-sheet-title" className="se-sheet__title">{editing ? 'Edit tabs' : 'All pages'}</h2>
          <div className="se-sheet__actions">
            {editing ? (
              <>
                {!isDefault ? <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={onReset}>Reset</button> : null}
                <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={() => onEditSlot(null)}>Done</button>
              </>
            ) : (
              <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => onEditSlot(0)}>Edit tabs</button>
            )}
            <button ref={closeButton} type="button" className="se-btn se-btn--ghost se-btn--sm se-sheet__close" aria-label="Close" onClick={onClose}>✕</button>
          </div>
          </header>
        </div>

        {editing ? (
          <div className="se-sheet__edit">
            <p className="se-hint">Pick a tab, then the page to put there. Tip: long-press a tab to jump straight here.</p>
            <div className="se-sheet__slots" role="radiogroup" aria-label="Tab to change">
              {slots.map((page, index) => (
                <button key={page.key} type="button" role="radio" aria-checked={index === editSlot}
                  className={`se-sheet__slot${index === editSlot ? ' se-sheet__slot--on' : ''}`}
                  onClick={() => onEditSlot(index)}>
                  <NavIcon name={page.icon} />
                  <span>{page.short ?? page.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="se-sheet__body">
          <div className="se-sheet__search">
            <label className="se-sr" htmlFor="se-sheet-search">Search game pages</label>
            <input id="se-sheet-search" type="search" className="se-input" placeholder="Search pages..."
              value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          {visible.length === 0 ? <p className="se-nav-search__empty">No matching pages. Try another search.</p> : null}
          {visible.map((section) => (
            <section key={section.id} className="se-sheet__section">
              <h3 className="se-sheet__heading">{section.title}</h3>
              <div className="se-sheet__grid">
                {section.pages.map((page) => {
                  const current = isCurrent(page, pathname);
                  const slot = slotOf.get(page.key);
                  const inner = (
                    <>
                      <span className="se-sheet__icon"><NavIcon name={page.icon} /><Badge badge={badges[page.key]} /></span>
                      <span className="se-sheet__label">{page.label}</span>
                      {editing && slot !== undefined ? <span className="se-sheet__pin" aria-label={`Tab ${slot + 1}`}>{slot + 1}</span> : null}
                    </>
                  );
                  return editing ? (
                    <button key={page.key} type="button" onClick={() => onPick(page.key)}
                      className={`se-sheet__tile${slot === editSlot ? ' se-sheet__tile--active' : ''}`}
                      aria-pressed={slot === editSlot}>
                      {inner}
                    </button>
                  ) : (
                    <Link key={page.key} to={page.to} onClick={onClose} aria-current={current ? 'page' : undefined}
                      className={`se-sheet__tile${current ? ' se-sheet__tile--active' : ''}`}>
                      {inner}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Navigate to the actual destination after async data and collapsed panels have rendered. */
function useRouteScroll(pathname: string, search: string, hash: string, locationKey: string) {
  const navigationType = useNavigationType();
  const lastTarget = useRef<{ pathname: string; anchorId: string | null; key: string; completed: boolean } | null>(null);
  const observedScrollY = useRef(typeof window === 'undefined' ? 0 : window.scrollY);

  useEffect(() => {
    const remember = () => { observedScrollY.current = window.scrollY; };
    window.addEventListener('scroll', remember, { passive: true });
    // Capture the position before a click swaps the view, even in the same task.
    document.addEventListener('click', remember, true);
    return () => {
      window.removeEventListener('scroll', remember);
      document.removeEventListener('click', remember, true);
    };
  }, []);

  useLayoutEffect(() => {
    const anchorId = routeAnchorId(pathname, search, hash);
    const previous = lastTarget.current;
    const current = { pathname, anchorId, key: locationKey, completed: !anchorId };
    lastTarget.current = current;
    // Re-clicking the same anchor should still navigate to it. Ordinary search
    // changes within a page must not reset scroll position. A cancelled seek
    // (e.g. React StrictMode's setup/cleanup replay) must retry on the next pass.
    if (previous && previous.pathname === pathname && previous.anchorId === anchorId
      && (!anchorId || (previous.key === locationKey && previous.completed))) return;
    if (navigationType === 'POP' && !anchorId) return;

    // Shared storefronts and casino games keep their scroll position without
    // repeatedly fighting a swipe. Restore once, then only retry when an async
    // view grows enough to reach the original position. Player input wins.
    if (!anchorId && shouldPreserveRouteScroll(previous?.pathname, pathname, hash)) {
      const desiredY = observedScrollY.current;
      let frame = 0;
      let timeout = 0;
      let observer: ResizeObserver | null = null;
      let stopped = false;
      const onScrollKey = (event: globalThis.KeyboardEvent) => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) stop();
      };
      const stop = () => {
        if (stopped) return;
        stopped = true;
        if (frame) window.cancelAnimationFrame(frame);
        if (timeout) window.clearTimeout(timeout);
        observer?.disconnect();
        document.removeEventListener('touchstart', stop, true);
        document.removeEventListener('pointerdown', stop, true);
        document.removeEventListener('wheel', stop, true);
        document.removeEventListener('keydown', onScrollKey, true);
      };
      const restore = () => {
        frame = 0;
        if (stopped || isPageScrollLocked()) return;
        const { top, settled } = preservedRouteScrollTarget(
          desiredY, document.documentElement.scrollHeight, window.innerHeight,
        );
        if (Math.abs(window.scrollY - top) > 1) window.scrollTo(0, top);
        if (settled) stop();
      };
      const schedule = () => {
        if (!stopped && !frame) frame = window.requestAnimationFrame(restore);
      };
      document.addEventListener('touchstart', stop, { capture: true, passive: true });
      document.addEventListener('pointerdown', stop, { capture: true, passive: true });
      document.addEventListener('wheel', stop, { capture: true, passive: true });
      document.addEventListener('keydown', onScrollKey, true);
      // ResizeObserver only fires when the new store/game actually changes size.
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(schedule);
        const content = document.querySelector<HTMLElement>('.se-gamemain');
        observer.observe(content ?? document.documentElement);
      }
      // Never keep scroll restoration alive indefinitely on a shorter store.
      timeout = window.setTimeout(stop, 3000);
      restore();
      return stop;
    }

    if (!anchorId) {
      window.scrollTo(0, 0);
      observedScrollY.current = 0;
      return;
    }

    // Avoid a stale position while changing pages, but don't jump to the top
    // when a player picks another link inside the page they're already on.
    if (previous?.pathname !== pathname) window.scrollTo(0, 0);

    let frame = 0;
    let timeout = 0;
    let finished = false;
    let observer: MutationObserver | null = null;
    const stop = () => {
      finished = true;
      if (frame) window.cancelAnimationFrame(frame);
      if (timeout) window.clearTimeout(timeout);
      observer?.disconnect();
    };
    const seek = () => {
      frame = 0;
      if (finished || isPageScrollLocked()) return;
      const target = document.getElementById(anchorId);
      if (!target || !isAnchorReady(target) || !target.getClientRects().length) return;
      const header = document.querySelector<HTMLElement>('.se-app--tabbar .se-topbar');
      const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
      window.scrollTo({
        top: anchorScrollTop(target.getBoundingClientRect().top, window.scrollY, headerBottom),
        left: window.scrollX,
        behavior: 'auto',
      });
      target.focus({ preventScroll: true });
      current.completed = true;
      stop();
    };
    const schedule = () => {
      if (!finished && !frame) frame = window.requestAnimationFrame(seek);
    };
    // Data-driven panels (Quests, News, rankings, etc.) can arrive long after
    // two animation frames. Watch their actual DOM rather than guessing timing.
    observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['open', 'hidden', 'class', 'style'],
    });
    // Closing a mobile More sheet or dialog restores its saved scroll position.
    // Retry once the body/root scroll lock has been removed.
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    timeout = window.setTimeout(stop, 15_000);
    schedule();
    return stop;
  }, [pathname, search, hash, locationKey, navigationType]);
}

const GameLayoutMountedContext = createContext(false);

function GameLayoutFrame({ children }: { children: ReactNode }) {
  useStaleGameReload();
  useGamePresence();
  usePageFreshness();
  const round = useSession((s) => s.round);
  const experience = useSession((s) => s.me?.experience ?? null);
  const isAdmin = useSession((s) => s.account?.isAdmin ?? false);
  const isBetaEnvironment = typeof window !== 'undefined' && window.location.hostname === 'beta.streetsempire.dev';
  const sections = useSections();
  const { pathname, search, hash, key } = useLocation();
  const badges = useNavBadges(pathname, search);
  const pages = sections.flatMap((section) => section.pages);
  const tabs = useTabSlots(pages);
  const [sheet, setSheet] = useState<{ editSlot: number | null; fromTop: boolean } | null>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  useRouteScroll(pathname, search, hash, key);
  // 1.0.0-B: tutorial progress, refreshed as the player acts so the goals tick off.
  const playerId = useSession((s) => s.me?.id ?? null);
  const activityHead = useSession((s) => s.recentActivity[0]?.id ?? null);
  const loadOnboarding = useOnboarding((s) => s.load);
  useEffect(() => {
    if (playerId) void loadOnboarding(playerId);
  }, [playerId, activityHead, loadOnboarding]);

  function closeSheet() {
    setSheet(null);
    moreButton.current?.focus({ preventScroll: true });
  }

  return (
    <GameLayoutMountedContext.Provider value>
      <Shell
        sidebar={<><SeasonCard /><GameNav sections={sections} pathname={pathname} badges={badges} /></>}
        tabbar={
      <>
        <TabBar slots={tabs.slots} pathname={pathname} badges={badges} moreOpen={sheet !== null} moreButton={moreButton}
          onMore={() => setSheet((open) => (open ? null : { editSlot: null, fromTop: false }))}
          onSwipeUp={() => setSheet((open) => open ?? { editSlot: null, fromTop: false })}
          onEditSlot={(index) => setSheet({ editSlot: index, fromTop: false })} />
        {sheet ? (
          <MoreSheet sections={sections} pathname={pathname} badges={badges} slots={tabs.slots}
            editSlot={sheet.editSlot} fromTop={sheet.fromTop} isDefault={tabs.isDefault}
            onEditSlot={(editSlot) => setSheet((current) => ({ editSlot, fromTop: current?.fromTop ?? false }))}
            onPick={(key) => { if (sheet.editSlot !== null) tabs.setSlot(sheet.editSlot, key); }}
            onReset={tabs.reset}
            onClose={closeSheet} />
        ) : null}
      </>
    }>
      <ConnectionBanner />
      <RoundRollCallNotice />
      <JokeDayBanner />
      {isBetaEnvironment ? (
        <div className="se-beta-banner" role="status">
          <strong>BETA ENVIRONMENT</strong>
          <span>Test server · data may be reset at any time · progress does not transfer to live.</span>
        </div>
      ) : null}
      {round ? (
        <div className="se-gamebar">
          <span className="se-gamebar__name">{round.name}</span>
          {experience ? (
            <Link
              className="se-gamebar__xp"
              to="/game/xp-progress"
              title={`${experience.totalXp.toLocaleString()} lifetime XP`}
              aria-label={`Level ${experience.level}, ${experience.xpIntoLevel} of ${experience.xpForLevel} XP to the next level. View your XP progress.`}
            >
              <strong>Level {experience.level}</strong>
            <strong className="se-seasoncard__lvl" aria-hidden="true">L{experience.level}</strong>
              <span className="se-gamebar__xp-track" aria-hidden="true">
                <span style={{ width: `${experience.progressPercent}%` }} />
              </span>
              <span>{experience.xpIntoLevel.toLocaleString()} / {experience.xpForLevel.toLocaleString()} XP</span>
            </Link>
          ) : null}
          <span className="se-gamebar__time se-num">
            {round.paused ? 'Paused' : `${formatDuration(round.msRemaining)} left`}
          </span>
        </div>
      ) : null}
      {round?.paused ? (
        <div className="se-beta-banner se-paused-banner" role="status">
          <strong>Season paused</strong>
          <span>{round.paused.reason ? `${round.paused.reason} ` : ''}Your crew and anything on the road are safe. Actions open again when the pause lifts.</span>
        </div>
      ) : null}
      <TrackedQuests />
      <CaseStoryAlerts />
      <IntroDialog />
      <TourOverlay />

      <div className="se-gamegrid">
        <div className="se-gamemain">
          {isAdmin && pathname.startsWith('/game/admin') ? <AdminWorkspace pathname={pathname} /> : null}
          <PageGuide />
          {children}
        </div>
      </div>
      </Shell>
    </GameLayoutMountedContext.Provider>
  );
}

/**
 * Backward-compatible wrapper for pages that still own a GameLayout.
 * Inside the persistent /game route shell it becomes a fragment, so those
 * pages can migrate gradually without nesting a second sidebar/top bar.
 */
export function GameLayout({ children }: { children: ReactNode }) {
  const alreadyMounted = useContext(GameLayoutMountedContext);
  return alreadyMounted ? <>{children}</> : <GameLayoutFrame>{children}</GameLayoutFrame>;
}

/**
 * Persistent shell for /game/* routes. Signed-out visitors to public game-info
 * routes stay transparent so InfoLayout can continue to render its public Shell.
 */
export function GameRouteLayout() {
  const me = useSession((state) => state.me);
  // An account that may not play yet gets no game frame (and none of its polling).
  const blocked = useSession((state) => Boolean(state.account?.verificationRequired || state.account?.rulesAcceptanceRequired || state.account?.birthDateRequired));
  return me && !blocked ? <><GameLayoutFrame><Outlet /></GameLayoutFrame><PlayerProfileHoverLayer /></> : <Outlet />;
}
