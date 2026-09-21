import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';

const primaryNav = [
  { to: '/game', label: 'Game' },
  { to: '/cities', label: 'Cities' },
  { to: '/turf', label: 'Turf' },
  { to: '/rankings', label: 'Rankings' },
  { to: '/games', label: 'Games' },
  { to: '/news', label: 'News' },
  { to: '/guide', label: 'Guide' },
  { to: '/community', label: 'Community' },
] as const;

const exploreLinks = [
  { to: '/hall-of-fame', label: 'Hall of Fame' },
  { to: '/alliances', label: 'Alliances' },
  { to: '/stats', label: 'Statistics' },
  { to: '/roadmap', label: 'Roadmap' },
] as const;

const projectLinks = [
  { to: '/about', label: 'About' },
  { to: '/beta', label: 'Beta' },
  { to: '/status', label: 'Status' },
  { to: '/support', label: 'Support' },
] as const;

function SiteNavLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => 'site-nav__link' + (isActive ? ' site-nav__link--active' : '')}
    >
      {label}
    </NavLink>
  );
}

export function SiteLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="container site-header__bar">
          <Link className="site-brand" to="/" aria-label="StreetsEmpire home">
            <span className="site-brand__mark">SE</span>
            <span>STREETSEMPIRE</span>
          </Link>

          <button
            className="site-menu-button"
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>

          <nav className={'site-nav' + (menuOpen ? ' site-nav--open' : '')} aria-label="Main navigation">
            <div className="site-nav__links">
              {primaryNav.map((item) => <SiteNavLink key={item.to} {...item} />)}
            </div>

            <div className="site-nav__actions">
              <a className="btn btn-outline-light btn-sm" href="https://beta.streetsempire.dev">Beta</a>
              <a className="btn btn-primary btn-sm" href="https://play.streetsempire.dev">Play Now</a>
            </div>
          </nav>
        </div>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container site-footer__grid">
          <div className="site-footer__brand">
            <Link className="site-brand" to="/">
              <span className="site-brand__mark">SE</span>
              <span>STREETSEMPIRE</span>
            </Link>
            <p>Build a crew, run the streets, control turf and compete through seasonal games.</p>
          </div>

          <div>
            <h2>Explore</h2>
            <nav aria-label="Explore StreetsEmpire">
              {exploreLinks.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}
            </nav>
          </div>

          <div>
            <h2>Project</h2>
            <nav aria-label="Project links">
              {projectLinks.map((item) => <Link key={item.to} to={item.to}>{item.label}</Link>)}
            </nav>
          </div>

          <div>
            <h2>Play</h2>
            <nav aria-label="Game destinations">
              <a href="https://play.streetsempire.dev">Live Game</a>
              <a href="https://beta.streetsempire.dev">Beta Game</a>
              <a href="https://forum.streetsempire.dev">Forum</a>
            </nav>
          </div>
        </div>

        <div className="container site-footer__bottom">
          <span>StreetsEmpire</span>
          <span>Public website · website-platform</span>
        </div>
      </footer>
    </div>
  );
}
