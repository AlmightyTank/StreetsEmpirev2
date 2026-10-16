/**
 * StreetsEmpire shell theme — single source of truth for web + native.
 *
 * Web CSS (`apps/web/src/styles/theme.css`) remains the visual
 * authority in the browser, and Android (`StreetsEmpireTheme.kt` + `SeShell.kt`)
 * mirrors these exact tokens in Compose. Keep the hex values in sync when the
 * house palette changes; `theme.test.ts` guards the contract.
 *
 * These values mirror the authoritative `:root` token block in theme.css.
 */
export const STREETSEMPIRE_COLORS = {
  bg: '#07090c',
  panel: '#12161c',
  panelHi: '#181d25',
  line: '#303743',
  lineSoft: '#202630',
  text: '#e4e9f1',
  textDim: '#a9b3c0',
  muted: '#8a96a5',
  accent: '#ef4657',
  accentDim: '#b72e3d',
  accentHover: '#ff7784',
  accent2: '#d6dee8',
  good: '#4ade80',
  bad: '#f33f63',
  warn: '#ff791a',
} as const;

export const STREETSEMPIRE_RADII = {
  sm: 4,
  md: 6,
} as const;

export const STREETSEMPIRE_SHELL = {
  sidebarWidth: 232,
  topbarHeight: 58,
  tabbarHeight: 60,
  contentMaxWidth: 1320,
  /** Matches the compact/expanded breakpoint in app-shell.css (900px). */
  expandedBreakpoint: 900,
} as const;

export interface ThemeNavPage {
  key: string;
  label: string;
  short?: string;
  to: string;
}

export interface ThemeNavSection {
  id: string;
  title: string;
  pages: ThemeNavPage[];
}

/**
 * Presentation-only menu hierarchy mirrored from `apps/web/src/layouts/gameNav.ts`.
 * Deep links stay canonical; Android renders these same sections in its drawer.
 */
export const STREETSEMPIRE_NAV_SECTIONS: ThemeNavSection[] = [
  {
    id: 'command',
    title: 'Command',
    pages: [
      { key: 'dashboard', label: 'Dashboard', short: 'Home', to: '/game' },
      { key: 'quests', label: 'Quests', to: '/game/quests' },
      { key: 'scout', label: 'Scout', to: '/game/scout' },
      { key: 'produce', label: 'Produce', to: '/game/produce' },
      { key: 'raids', label: 'Raids', to: '/game/combat' },
      { key: 'operations', label: 'Operations', short: 'Ops', to: '/game/operations' },
      { key: 'black-book', label: 'Black Book', short: 'Intel', to: '/game/black-book' },
    ],
  },
  {
    id: 'empire',
    title: 'Build Your Empire',
    pages: [
      { key: 'hideout', label: 'Hideout', to: '/game/hideout' },
      { key: 'crew-roster', label: 'Crew Assignments', short: 'Crew', to: '/game/crew' },
      { key: 'dealers', label: 'Dealer Crews', short: 'Dealers', to: '/game/dealers' },
      { key: 'stores', label: 'Stores', to: '/game/stores' },
      { key: 'supply', label: 'Bulk Orders', short: 'Supply', to: '/game/supply' },
      { key: 'loans', label: 'Loan Shark', short: 'Loans', to: '/game/loans' },
      { key: 'travel', label: 'Travel', to: '/game/travel' },
      { key: 'turf', label: 'Turf', to: '/game/turf' },
    ],
  },
  {
    id: 'competition',
    title: 'Competition',
    pages: [
      { key: 'casino', label: 'Casino', to: '/game/casino' },
      { key: 'alliance', label: 'Alliance', to: '/game/alliance' },
      { key: 'players', label: 'Players', to: '/game/players' },
      { key: 'rankings', label: 'Rankings', short: 'Ranks', to: '/game/rankings' },
    ],
  },
  {
    id: 'career',
    title: 'Progress & Rewards',
    pages: [
      { key: 'xp-progress', label: 'XP Progress', short: 'XP', to: '/game/xp-progress' },
      { key: 'events', label: 'Events', to: '/game/events' },
      { key: 'street-pass', label: 'Street Pass', short: 'Pass', to: '/game/street-pass' },
      { key: 'collection', label: 'Collection', short: 'Looks', to: '/game/collection' },
      { key: 'supporter', label: 'Supporter', to: '/game/supporter' },
      { key: 'profile', label: 'Profile', to: '/game/profile' },
    ],
  },
  {
    id: 'community',
    title: 'Messages & News',
    pages: [
      { key: 'console', label: 'Console', to: '/game/console' },
      { key: 'news', label: 'News & Surveys', short: 'News', to: '/game/news' },
    ],
  },
  {
    id: 'support',
    title: 'Help & Settings',
    pages: [
      { key: 'status', label: 'Status & Support', short: 'Status', to: '/game/status' },
      { key: 'rules', label: 'Rules', to: '/game/rules' },
      { key: 'account', label: 'Account', to: '/account' },
    ],
  },
];
