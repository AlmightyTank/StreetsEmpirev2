import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Shell } from './Shell.js';
import { ConnectionBanner } from '../components/ConnectionBanner.js';
import { usePageFreshness } from '../hooks/usePageFreshness.js';
import { useSession } from '../stores/session.js';
import { formatDuration } from '../utils/time.js';

interface NavItem {
  label: string;
  to?: string;
  href?: string;
  /** Milestone this arrives in. Present means it is not built yet. */
  soon?: string;
}

interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    id: 'actions',
    title: 'Actions',
    items: [
      { label: 'Hideout', to: '/game/hideout' },
      { label: 'Scout', to: '/game/scout' },
      { label: 'Produce Product', to: '/game/produce' },
      { label: 'Raids', to: '/game/combat' },
    ],
  },
  {
    id: 'stores',
    title: 'Stores',
    items: [
      { label: 'Corner Store', to: '/game/stores/corner' },
      { label: "Tek9 Tommy's", to: '/game/stores/tommy' },
      { label: "Charlie's", to: '/game/stores/charlie' },
      { label: "Pip's", to: '/game/stores/pip' },
    ],
  },
  {
    id: 'players',
    title: 'Players',
    items: [
      { label: 'Rankings', to: '/game/rankings' },
      { label: 'Alliance', to: '/game/alliance' },
      { label: 'Profile', to: '/game/profile' },
      { label: 'Activity', to: '/game/activity' },
    ],
  },
  {
    id: 'game',
    title: 'Game',
    items: [
      { label: 'Status', to: '/game/status' },
    ],
  },
];

/** Only shown to game admins. The server enforces the same rule on every admin route. */
const ADMIN_SECTION: NavSection = {
  id: 'admin',
  title: 'Admin',
  items: [
    { label: 'Rounds', to: '/game/admin' },
    { label: 'News & banner', to: '/game/admin/news' },
    { label: 'Accounts', to: '/game/admin/accounts' },
    { label: 'Integrations', to: '/game/admin/integrations' },
    { label: 'Rulesets', to: '/game/admin/rulesets' },
    { label: 'Signals', to: '/game/admin/signals' },
    { label: 'Audit log', to: '/game/admin/audit' },
  ],
};

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

function useSections(): NavSection[] {
  const isAdmin = useSession((s) => s.account?.isAdmin ?? false);
  return isAdmin ? [...SECTIONS, ADMIN_SECTION] : SECTIONS;
}

function GameNav({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const sections = useSections();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => readNavState());

  useEffect(() => {
    writeNavState(expanded);
  }, [expanded]);

  function isExpanded(section: NavSection): boolean {
    return expanded[section.id] ?? true;
  }

  function toggleSection(section: NavSection): void {
    setExpanded((current) => ({ ...current, [section.id]: !(current[section.id] ?? true) }));
  }

  return (
    <nav id="game-navigation" className={`se-nav${open ? ' se-nav--open' : ''}`} aria-label="Game">
      {sections.map((section) => {
        const sectionOpen = isExpanded(section);
        const listId = `game-nav-${section.id}`;
        return (
          <div className={`se-nav__section${sectionOpen ? '' : ' se-nav__section--collapsed'}`} key={section.id}>
            <button
              type="button"
              className="se-nav__title"
              aria-expanded={sectionOpen}
              aria-controls={listId}
              onClick={() => toggleSection(section)}
            >
              <span>{section.title}</span>
              <span className="se-nav__chevron" aria-hidden="true">{sectionOpen ? '−' : '+'}</span>
            </button>
            <ul id={listId} className="se-nav__list" hidden={!sectionOpen}>
              {section.items.map((item) =>
                item.to ? (
                  <li key={item.label}>
                    <NavLink
                      onClick={onNavigate}
                      to={item.to}
                      end
                      className={({ isActive }) =>
                        `se-nav__link${isActive ? ' se-nav__link--active' : ''}`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ) : item.href ? (
                  <li key={item.label}>
                    <a
                      className="se-nav__link"
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={onNavigate}
                    >
                      {item.label}
                    </a>
                  </li>
                ) : (
                  <li key={item.label}>
                    <span className="se-nav__link se-nav__link--soon">
                      {item.label}
                      <span className="se-nav__soon">0.1.0-{item.soon}</span>
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function GameLayout({ children }: { children: ReactNode }) {
  usePageFreshness();
  const round = useSession((s) => s.round);
  const sections = useSections();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const currentPage = sections.flatMap((section) => section.items)
    .find((item) => item.to === pathname)?.label ?? (pathname === '/game' ? 'Dashboard' : 'Player profile');

  return (
    <Shell>
      <ConnectionBanner />
      {round ? (
        <div className="se-gamebar">
          <span className="se-gamebar__name">{round.name}</span>
          <span className="se-gamebar__time se-num">
            {formatDuration(round.msRemaining)} left
          </span>
        </div>
      ) : null}

      <div className="se-gamegrid" onKeyDown={(event) => {
        if (event.key === 'Escape' && menuOpen) {
          setMenuOpen(false);
          menuButton.current?.focus();
        }
      }}>
        <button ref={menuButton} type="button" className="se-mobile-menu"
          aria-label={menuOpen ? 'Close game menu' : 'Open game menu'}
          aria-expanded={menuOpen} aria-controls="game-navigation"
          onClick={() => setMenuOpen((open) => !open)}>
          <span>Menu <span aria-hidden="true">{menuOpen ? '−' : '+'}</span></span>
          <span className="se-mobile-menu__current">{currentPage}</span>
        </button>
        <GameNav open={menuOpen} onNavigate={() => setMenuOpen(false)} />
        <div className="se-gamemain">{children}</div>
      </div>
    </Shell>
  );
}
