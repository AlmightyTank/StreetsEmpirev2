import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Link, useLocation, useNavigationType } from 'react-router-dom';
import { Shell } from './Shell.js';
import { ConnectionBanner } from '../components/ConnectionBanner.js';
import { NavIcon } from '../components/NavIcon.js';
import { usePageFreshness } from '../hooks/usePageFreshness.js';
import { useSession } from '../stores/session.js';
import { formatDuration } from '../utils/time.js';
import {
  isCurrent,
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

  useEffect(() => {
    writeNavState(expanded);
  }, [expanded]);

  return (
    <nav className="se-nav" aria-label="Game">
      {sections.map((section) => {
        const sectionOpen = expanded[section.id] ?? true;
        const listId = `game-nav-${section.id}`;
        return (
          <div className={`se-nav__section${sectionOpen ? '' : ' se-nav__section--collapsed'}`} key={section.id}>
            <button
              type="button"
              className="se-nav__title"
              aria-expanded={sectionOpen}
              aria-controls={listId}
              onClick={() => setExpanded((current) => ({ ...current, [section.id]: !(current[section.id] ?? true) }))}
            >
              <span>{section.title}</span>
              <span className="se-nav__chevron" aria-hidden="true">{sectionOpen ? '−' : '+'}</span>
            </button>
            <ul id={listId} className="se-nav__list" hidden={!sectionOpen}>
              {section.pages.map((page) => {
                const current = isCurrent(page, pathname);
                return (
                  <li key={page.key}>
                    <Link to={page.to} aria-current={current ? 'page' : undefined}
                      className={`se-nav__link${current ? ' se-nav__link--active' : ''}`}>
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

const LONG_PRESS_MS = 500;

/**
 * Phone navigation: four tabs the player can rearrange and a More button for
 * everything else. Long-press a tab to swap what sits there.
 */
function TabBar({ slots, pathname, badges, moreOpen, onMore, onEditSlot, moreButton }: {
  slots: NavPage[];
  pathname: string;
  badges: Record<string, NavBadge>;
  moreOpen: boolean;
  onMore: () => void;
  onEditSlot: (index: number) => void;
  moreButton: RefObject<HTMLButtonElement | null>;
}) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);
  const onBar = new Set(slots.map((page) => page.key));
  const elsewhere = !slots.some((page) => isCurrent(page, pathname));
  const moreBadge = worstBadge(Object.entries(badges).filter(([key]) => !onBar.has(key)).map(([, badge]) => badge));

  function cancel() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  return (
    <nav className="se-tabbar" aria-label="Game tabs">
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
function MoreSheet({ sections, pathname, badges, slots, editSlot, isDefault, onEditSlot, onPick, onReset, onClose }: {
  sections: NavSection[];
  pathname: string;
  badges: Record<string, NavBadge>;
  slots: NavPage[];
  /** The tab slot being changed, or null when browsing. */
  editSlot: number | null;
  isDefault: boolean;
  onEditSlot: (index: number | null) => void;
  onPick: (key: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const editing = editSlot !== null;
  const slotOf = new Map(slots.map((page, index) => [page.key, index]));

  useEffect(() => {
    closeButton.current?.focus();
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = before; };
  }, []);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !sheet.current) return;
    // Keep focus inside the sheet while it is open.
    const focusable = [...sheet.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return (
    <div className="se-sheet" onKeyDown={onKeyDown}>
      <div className="se-sheet__backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={sheet} className="se-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="se-sheet-title">
        <div className="se-sheet__grip" aria-hidden="true" />
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
          {sections.map((section) => (
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

/**
 * New pages open at the top, and `#id` links land on that panel. Back and forward
 * leave the browser's own scroll restoration alone.
 */
function useRouteScroll(pathname: string, hash: string) {
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType === 'POP') return;
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    // The target may render a frame or two after the page, once its data is in.
    let frame = 0;
    let tries = 0;
    const seek = () => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView({ block: 'start' });
        target.focus?.({ preventScroll: true });
      } else if (tries++ < 60) {
        frame = window.requestAnimationFrame(seek);
      }
    };
    seek();
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, hash, navigationType]);
}

export function GameLayout({ children }: { children: ReactNode }) {
  usePageFreshness();
  const round = useSession((s) => s.round);
  const sections = useSections();
  const { pathname, hash } = useLocation();
  const badges = useNavBadges(pathname);
  const pages = sections.flatMap((section) => section.pages);
  const tabs = useTabSlots(pages);
  const [sheet, setSheet] = useState<{ editSlot: number | null } | null>(null);
  const moreButton = useRef<HTMLButtonElement>(null);
  useRouteScroll(pathname, hash);

  function closeSheet() {
    setSheet(null);
    moreButton.current?.focus();
  }

  return (
    <Shell tabbar={
      <>
        <TabBar slots={tabs.slots} pathname={pathname} badges={badges} moreOpen={sheet !== null} moreButton={moreButton}
          onMore={() => setSheet((open) => (open ? null : { editSlot: null }))}
          onEditSlot={(index) => setSheet({ editSlot: index })} />
        {sheet ? (
          <MoreSheet sections={sections} pathname={pathname} badges={badges} slots={tabs.slots}
            editSlot={sheet.editSlot} isDefault={tabs.isDefault}
            onEditSlot={(editSlot) => setSheet({ editSlot })}
            onPick={(key) => { if (sheet.editSlot !== null) tabs.setSlot(sheet.editSlot, key); }}
            onReset={tabs.reset}
            onClose={closeSheet} />
        ) : null}
      </>
    }>
      <ConnectionBanner />
      {round ? (
        <div className="se-gamebar">
          <span className="se-gamebar__name">{round.name}</span>
          <span className="se-gamebar__time se-num">
            {formatDuration(round.msRemaining)} left
          </span>
        </div>
      ) : null}

      <div className="se-gamegrid">
        <GameNav sections={sections} pathname={pathname} badges={badges} />
        <div className="se-gamemain">{children}</div>
      </div>
    </Shell>
  );
}
