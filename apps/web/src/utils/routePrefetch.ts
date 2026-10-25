type RouteLoader = () => Promise<unknown>;

const routes: ReadonlyArray<{ matches: (pathname: string) => boolean; load: RouteLoader }> = [
  { matches: (path) => path === '/game', load: () => import('../pages/DashboardPage.js') },
  { matches: (path) => path === '/game/combat', load: () => import('../pages/CombatPage.js') },
  { matches: (path) => path === '/game/scout', load: () => import('../pages/ScoutPage.js') },
  { matches: (path) => path === '/game/quests', load: () => import('../pages/QuestPhonePage.js') },
  { matches: (path) => path.startsWith('/game/visit/'), load: () => import('../pages/ContactRoomPage.js') },
  { matches: (path) => path === '/game/hideout', load: () => import('../pages/HideoutPage.js') },
  { matches: (path) => path === '/game/produce', load: () => import('../pages/ProducePage.js') },
  { matches: (path) => path === '/game/street-pass', load: () => import('../pages/StreetPassPage.js') },
  { matches: (path) => path === '/game/roll-call', load: () => import('../pages/RoundRollCallPage.js') },
  { matches: (path) => path === '/game/stores' || path.startsWith('/game/stores/'), load: () => import('../pages/StorePage.js') },
  { matches: (path) => path === '/game/casino' || path.startsWith('/game/casino/'), load: () => import('../pages/CasinoPage.js') },
  { matches: (path) => path === '/game/travel', load: () => import('../pages/TravelPage.js') },
  { matches: (path) => path === '/game/turf', load: () => import('../pages/TurfPage.js') },
  { matches: (path) => path === '/game/alliance', load: () => import('../pages/AlliancePage.js') },
  { matches: (path) => path.startsWith('/game/alliances/'), load: () => import('../pages/AlliancesPage.js') },
  { matches: (path) => path === '/game/players', load: () => import('../pages/PlayersPage.js') },
  { matches: (path) => path === '/game/news', load: () => import('../pages/NewsPage.js') },
  { matches: (path) => path === '/game/events', load: () => import('../pages/EventsPage.js') },
  { matches: (path) => path === '/game/supporter', load: () => import('../pages/SupporterPage.js') },
  { matches: (path) => path === '/account', load: () => import('../pages/AccountSettingsPage.js') },
];

const started = new Set<RouteLoader>();

/** Starts a route chunk before navigation when the player hovers or focuses a link. */
export function prefetchRoute(href: string): void {
  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin) return;
  const route = routes.find((candidate) => candidate.matches(url.pathname));
  if (!route || started.has(route.load)) return;
  started.add(route.load);
  void route.load().catch(() => {
    // Navigation will retry the lazy import if the speculative request failed.
    started.delete(route.load);
  });
}
