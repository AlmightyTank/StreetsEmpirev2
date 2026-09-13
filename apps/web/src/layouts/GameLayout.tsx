import { useRef, useState, type ReactNode } from 'react';
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
  title: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: 'Actions',
    items: [
      { label: 'Home', to: '/game' },
      { label: 'Scout', to: '/game/scout' },
      { label: 'Produce Crack', to: '/game/produce' },
      { label: 'Raids', to: '/game/combat' },
    ],
  },
  {
    title: 'Stores',
    items: [
      { label: 'Corner Store', to: '/game/stores/corner' },
      { label: "Tek9 Tommy's", to: '/game/stores/tommy' },
      { label: "Charlie's", to: '/game/stores/charlie' },
      { label: "Pip's", to: '/game/stores/pip' },
    ],
  },
  {
    title: 'Players',
    items: [
      { label: 'Rankings', to: '/game/rankings' },
      { label: 'Profile', to: '/game/profile' },
      { label: 'Activity', to: '/game/activity' },
    ],
  },
  {
    title: 'Game',
    items: [
      { label: 'News', to: '/game/news' },
      { label: 'Status', to: '/game/status' },
      { label: 'Rules', to: '/game/rules' },
      { label: 'Community', href: 'https://forum.streetsempire.dev' },
    ],
  },
];

function GameNav({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  return (
    <nav id="game-navigation" className={`se-nav${open ? ' se-nav--open' : ''}`} aria-label="Game">
      {SECTIONS.map((section) => (
        <div className="se-nav__section" key={section.title}>
          <p className="se-nav__title">{section.title}</p>
          <ul className="se-nav__list">
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
      ))}
    </nav>
  );
}

export function GameLayout({ children }: { children: ReactNode }) {
  usePageFreshness();
  const round = useSession((s) => s.round);
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const currentPage = SECTIONS.flatMap((section) => section.items)
    .find((item) => item.to === pathname)?.label ?? 'Player profile';

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
