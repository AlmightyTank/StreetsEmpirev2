import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Shell } from './Shell.js';
import { useSession } from '../stores/session.js';
import { formatDuration } from '../utils/time.js';

interface NavItem {
  label: string;
  to?: string;
  /** Milestone this arrives in. Present means it is not built yet. */
  soon?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Section 22. The OG sidebar.
 *
 * Entries that do not exist yet are shown as plain dimmed text with the
 * milestone that brings them - signposting, not a button that does nothing.
 */
const SECTIONS: NavSection[] = [
  {
    title: 'Actions',
    items: [
      { label: 'Home', to: '/game' },
      { label: 'Scout', to: '/game/scout' },
      { label: 'Produce Crack', to: '/game/produce' },
    ],
  },
  {
    title: 'Stores',
    items: [
      // Short forms, as in the section 22 sidebar.
      { label: 'Corner Store', soon: 'D' },
      { label: "Tek9 Tommy's", soon: 'D' },
      { label: "Charlie's", soon: 'D' },
      { label: "Pip's", soon: 'D' },
    ],
  },
  {
    title: 'Players',
    items: [
      { label: 'Rankings', soon: 'E' },
      { label: 'Profile', soon: 'E' },
    ],
  },
  {
    title: 'Game',
    items: [
      { label: 'News', soon: 'E' },
      { label: 'Status', soon: 'E' },
      { label: 'Rules', soon: 'E' },
    ],
  },
];

function GameNav() {
  return (
    <nav className="se-nav" aria-label="Game">
      {SECTIONS.map((section) => (
        <div className="se-nav__section" key={section.title}>
          <p className="se-nav__title">{section.title}</p>
          <ul className="se-nav__list">
            {section.items.map((item) =>
              item.to ? (
                <li key={item.label}>
                  <NavLink
                    to={item.to}
                    end
                    className={({ isActive }) =>
                      `se-nav__link${isActive ? ' se-nav__link--active' : ''}`
                    }
                  >
                    {item.label}
                  </NavLink>
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
  const round = useSession((s) => s.round);

  return (
    <Shell>
      {round ? (
        <div className="se-gamebar">
          <span className="se-gamebar__name">{round.name}</span>
          <span className="se-gamebar__time se-num">
            {formatDuration(round.msRemaining)} left
          </span>
        </div>
      ) : null}

      <div className="se-gamegrid">
        <GameNav />
        <div className="se-gamemain">{children}</div>
      </div>
    </Shell>
  );
}
