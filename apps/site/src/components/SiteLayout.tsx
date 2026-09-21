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


const pageMeta = (pathname: string): { title: string; description: string; noindex?: boolean } => {
  const segment = pathname.split('/').filter(Boolean)[0] ?? '';
  const map: Record<string, { title: string; description: string; noindex?: boolean }> = {
    game: { title: 'The Game', description: 'Learn how StreetsEmpire seasons, economy, combat, travel, turf and alliances fit together.' },
    guide: { title: 'How to Play', description: 'Player guides for StreetsEmpire systems from first turns through city control.' },
    cities: { title: 'Cities', description: 'Explore StreetsEmpire cities, districts, public economy and current turf control.' },
    turf: { title: 'Turf', description: 'Follow current district control and recent public turf captures in StreetsEmpire.' },
    games: { title: 'Games', description: 'Browse the current StreetsEmpire game and permanent completed-season archive.' },
    rankings: { title: 'Rankings', description: 'Current guest-readable StreetsEmpire national standings and public net worth rankings.' },
    'hall-of-fame': { title: 'Hall of Fame', description: 'StreetsEmpire season champions and all-time public career leaders.' },
    players: { title: 'Player Profile', description: 'A public StreetsEmpire player profile and cross-season career history.' },
    alliances: { title: 'Alliances', description: 'Current StreetsEmpire alliance standings, rosters and turf presence.' },
    stats: { title: 'Statistics', description: 'Current and all-time public StreetsEmpire game statistics.' },
    news: { title: 'News', description: 'Official StreetsEmpire announcements, season updates and release news.' },
    roadmap: { title: 'Roadmap', description: 'The public StreetsEmpire development roadmap toward 1.0 and beyond.' },
    community: { title: 'Community', description: 'Find the StreetsEmpire forum, public competition pages and community resources.' },
    beta: { title: 'Beta', description: 'Information about the separate StreetsEmpire beta testing environment.', noindex: true },
    status: { title: 'Status', description: 'Current StreetsEmpire public API and database service health.' },
    support: { title: 'Support', description: 'How StreetsEmpire plans to support hosting and development without pay-to-win.' },
    about: { title: 'About', description: 'About the StreetsEmpire project, its seasonal design and old-school browser-game inspiration.' },
    search: { title: 'Search', description: 'Search public StreetsEmpire players, alliances, seasons, news and cities.', noindex: true },
  };
  return map[segment] ?? {
    title: 'StreetsEmpire',
    description: 'Build a crew, run the streets, control turf and compete through seasonal browser strategy games.',
  };
};

function ensureMeta(name: string, attribute: 'name' | 'property' = 'name'): HTMLMetaElement {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, name);
    document.head.appendChild(tag);
  }
  return tag;
}

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

    const meta = pageMeta(location.pathname);
    const title = meta.title === 'StreetsEmpire' ? meta.title : meta.title + ' | StreetsEmpire';
    document.title = title;
    ensureMeta('description').content = meta.description;
    ensureMeta('og:title', 'property').content = title;
    ensureMeta('og:description', 'property').content = meta.description;
    ensureMeta('twitter:title').content = title;
    ensureMeta('twitter:description').content = meta.description;
    ensureMeta('robots').content = meta.noindex ? 'noindex,follow' : 'index,follow';

    const canonicalUrl = window.location.origin + location.pathname;
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
    ensureMeta('og:url', 'property').content = canonicalUrl;
  }, [location.pathname]);

  return (
    <div className="site-shell">
      <a className="site-skip-link" href="#main-content">Skip to main content</a>
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
              <Link className="btn btn-outline-light btn-sm" to="/search">Search</Link>
              <a className="btn btn-outline-light btn-sm" href="https://beta.streetsempire.dev">Beta</a>
              <a className="btn btn-primary btn-sm" href="https://play.streetsempire.dev">Play Now</a>
            </div>
          </nav>
        </div>
      </header>

      <main className="site-main" id="main-content">
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
