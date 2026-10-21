import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSession } from '../stores/session.js';
import { useOnboarding } from '../stores/onboarding.js';
import { CONSOLE_UPDATED_EVENT, consoleApi } from '../api/console.js';
import { SURVEYS_CHANGED_EVENT, surveysApi } from '../api/surveys.js';
import { formatWhen } from '../utils/time.js';
import { roundAftermathPublicEnabled } from '../config/features.js';
import { dropApi } from '../api/drop.js';
import { staffCan, type StaffCapability, type StaffRole } from '@streets/shared';
import { useStaff } from '../utils/staff.js';

/** One page in the game menu. `key` is what the phone tab bar stores. */
export interface NavPage {
  key: string;
  label: string;
  /** Shorter label for a phone tab. */
  short?: string;
  to: string;
  icon: IconName;
  /** Other exact routes represented by this one top-level destination. */
  aliases?: string[];
  /** One legacy/detail prefix represented by this destination. */
  prefix?: string;
  /** Extra detail prefixes represented by this destination. */
  prefixes?: string[];
  /** Admin pages only: the staff capability that opens it. Unset means admin. */
  capability?: StaffCapability;
}

export interface NavSection {
  id: string;
  title: string;
  /** Initial sidebar state before the player changes it. */
  defaultOpen?: boolean;
  pages: NavPage[];
}

export type IconName =
  | 'dashboard' | 'hideout' | 'scout' | 'produce' | 'raids' | 'stores' | 'cities'
  | 'rankings' | 'alliance' | 'contacts' | 'profile' | 'activity'
  | 'status' | 'rules' | 'news' | 'fame' | 'account' | 'admin' | 'pass' | 'casino' | 'drop';

/**
 * One destination per gameplay feature, but just six readable groups.
 * Deep links remain the same; the menu hierarchy is presentation-only.
 * The first group is the everyday loop. Advanced systems stay one click away.
 */
export const SECTIONS: NavSection[] = [
  {
    id: 'command',
    title: 'Command',
    pages: [
      { key: 'dashboard', label: 'Dashboard', short: 'Home', to: '/game', icon: 'dashboard' },
      { key: 'quests', label: 'Quests', to: '/game/quests', icon: 'activity', aliases: ['/game/reputation'] },
      { key: 'scout', label: 'Scout', to: '/game/scout', icon: 'scout' },
      { key: 'produce', label: 'Produce', to: '/game/produce', icon: 'produce' },
      { key: 'raids', label: 'Raids', to: '/game/combat', icon: 'raids' },
      { key: 'operations', label: 'Operations', short: 'Ops', to: '/game/operations', icon: 'raids' },
      { key: 'black-book', label: 'Black Book', short: 'Intel', to: '/game/black-book', icon: 'contacts' },
    ],
  },
  {
    id: 'empire',
    title: 'Build Your Empire',
    defaultOpen: false,
    pages: [
      { key: 'hideout', label: 'Hideout', to: '/game/hideout', icon: 'hideout' },
      { key: 'armory', label: 'Armory & Garage', short: 'Armory', to: '/game/armory', icon: 'raids' },
      { key: 'crew-roster', label: 'Crew Assignments', short: 'Crew', to: '/game/crew', icon: 'contacts' },
      { key: 'dealers', label: 'Dealer Crews', short: 'Dealers', to: '/game/dealers', icon: 'contacts' },
      { key: 'stores', label: 'Stores', to: '/game/stores', icon: 'stores', prefix: '/game/stores/' },
      { key: 'supply', label: 'Bulk Orders', short: 'Supply', to: '/game/supply', icon: 'stores' },
      { key: 'loans', label: 'Loan Shark', short: 'Loans', to: '/game/loans', icon: 'stores' },
      { key: 'travel', label: 'Travel', to: '/game/travel', icon: 'cities' },
      { key: 'turf', label: 'Turf', to: '/game/turf', icon: 'cities' },
    ],
  },
  {
    id: 'competition',
    title: 'Competition',
    defaultOpen: false,
    pages: [
      { key: 'casino', label: 'Casino', to: '/game/casino', icon: 'casino', prefix: '/game/casino/' },
      { key: 'alliance', label: 'Alliance', to: '/game/alliance', icon: 'alliance', aliases: ['/game/alliances'], prefix: '/game/alliances/' },
      { key: 'players', label: 'Players', to: '/game/players', icon: 'contacts', aliases: ['/game/contacts'], prefix: '/game/players/', prefixes: ['/game/forum/'] },
      { key: 'rankings', label: 'Rankings', short: 'Ranks', to: '/game/rankings', icon: 'rankings', aliases: roundAftermathPublicEnabled ? ['/game/hall-of-fame', '/game/round-archive'] : ['/game/hall-of-fame'] },
    ],
  },
  {
    id: 'career',
    title: 'Progress & Rewards',
    defaultOpen: false,
    pages: [
      { key: 'xp-progress', label: 'XP Progress', short: 'XP', to: '/game/xp-progress', icon: 'profile' },
      { key: 'skills', label: 'Street Skills', short: 'Skills', to: '/game/skills', icon: 'profile' },
      { key: 'events', label: 'Events', to: '/game/events', icon: 'activity' },
      { key: 'street-pass', label: 'Street Pass', short: 'Pass', to: '/game/street-pass', icon: 'pass' },
      { key: 'roll-call', label: 'Roll Call', to: '/game/roll-call', icon: 'fame' },
      { key: 'drop', label: 'The Drop', short: 'Drop', to: '/game/drop', icon: 'drop', prefix: '/game/drop/' },
      { key: 'supporter', label: 'Supporter', to: '/game/supporter', icon: 'pass' },
      { key: 'profile', label: 'Profile', to: '/game/profile', icon: 'profile' },
    ],
  },
  {
    id: 'community',
    title: 'Messages & News',
    defaultOpen: false,
    pages: [
      { key: 'console', label: 'Console', to: '/game/console', icon: 'activity', aliases: ['/game/activity'] },
      { key: 'news', label: 'News & Surveys', short: 'News', to: '/game/news', icon: 'news', aliases: ['/game/surveys'] },
    ],
  },
  {
    id: 'support',
    title: 'Help & Settings',
    defaultOpen: false,
    pages: [
      { key: 'status', label: 'Status & Support', short: 'Status', to: '/game/status', icon: 'status', aliases: ['/game/report-bug'] },
      { key: 'rules', label: 'Rules', to: '/game/rules', icon: 'rules' },
      { key: 'account', label: 'Account', to: '/account', icon: 'account' },
    ],
  },
];

/** Admin-only tools grouped by the job an operator is trying to complete. */
export const ADMIN_SECTIONS: NavSection[] = [
  {
    id: 'admin-operations',
    title: 'Admin · Operations',
    pages: [
      { key: 'admin-rounds', label: 'Rounds', to: '/game/admin/rounds', icon: 'admin', prefix: '/game/admin/rounds/' },
      { key: 'admin-law', label: 'Law', to: '/game/admin/law', icon: 'admin' },
      { key: 'admin-factions', label: 'Factions', to: '/game/admin/factions', icon: 'admin' },
      { key: 'admin-crew', label: 'Crew Roster', to: '/game/admin/crew', icon: 'admin' },
      { key: 'admin-vehicles', label: 'Vehicles', to: '/game/admin/vehicles', icon: 'admin' },
      { key: 'admin-combat', label: 'Combat and Exploits', short: 'Combat', to: '/game/admin/combat', icon: 'admin' },
      { key: 'admin-turf', label: 'Turf', to: '/game/admin/turf', icon: 'admin' },
      { key: 'admin-events', label: 'Event Operations', short: 'Events', to: '/game/admin/events', icon: 'admin' },
    ],
  },
  {
    id: 'admin-players',
    title: 'Admin · Players',
    pages: [
      { key: 'admin-accounts', label: 'Accounts', to: '/game/admin/accounts', icon: 'admin', prefixes: ['/game/admin/accounts/', '/game/admin/players/'], capability: 'accounts.view' },
      { key: 'admin-staff', label: 'Staff', to: '/game/admin/staff', icon: 'admin', capability: 'staff.view' },
      { key: 'admin-supporters', label: 'Supporters', to: '/game/admin/supporters', icon: 'admin' },
      { key: 'admin-reports', label: 'Reports', to: '/game/admin/reports', icon: 'admin', capability: 'reports.handle' },
      { key: 'admin-bugs', label: 'Bug Reports', short: 'Bugs', to: '/game/admin/bugs', icon: 'admin', capability: 'bugs.triage' },
    ],
  },
  {
    id: 'admin-economy',
    title: 'Admin · Economy',
    pages: [
      { key: 'admin-economy', label: 'Economy', to: '/game/admin/economy', icon: 'admin' },
      { key: 'admin-supply', label: 'Supply Operations', to: '/game/admin/supply', icon: 'admin' },
      { key: 'admin-loans', label: 'Loan Shark', short: 'Loans', to: '/game/admin/loans', icon: 'admin' },
      { key: 'admin-casino', label: 'Casino', to: '/game/admin/casino', icon: 'admin' },
      { key: 'admin-drop', label: 'The Drop', to: '/game/admin/drop', icon: 'admin' },
    ],
  },
  {
    id: 'admin-content',
    title: 'Admin · Content',
    pages: [
      { key: 'admin-news', label: 'News and Banners', short: 'News', to: '/game/admin/news', icon: 'admin' },
      { key: 'admin-surveys', label: 'Surveys', to: '/game/admin/surveys', icon: 'admin' },
      { key: 'admin-quests', label: 'Quests', to: '/game/admin/quests', icon: 'admin' },
      { key: 'admin-rulesets', label: 'Rulesets', to: '/game/admin/rulesets', icon: 'admin' },
    ],
  },
  {
    id: 'admin-monitoring',
    title: 'Admin · Monitoring',
    pages: [
      { key: 'admin-monitoring', label: 'Monitoring', to: '/game/admin/monitoring', icon: 'admin' },
      { key: 'admin-integrations', label: 'Integrations', short: 'Integr.', to: '/game/admin/integrations', icon: 'admin' },
      { key: 'admin-signals', label: 'Signals', to: '/game/admin/signals', icon: 'admin' },
      { key: 'admin-audit', label: 'Audit log', short: 'Audit', to: '/game/admin/audit', icon: 'admin' },
    ],
  },
];

/** The admin pages a staff role may open, in sections that keep at least one page. */
export function adminSectionsFor(role: StaffRole | null): NavSection[] {
  if (!role) return [];
  return ADMIN_SECTIONS
    .map((section) => ({ ...section, pages: section.pages.filter((page) => staffCan(role, page.capability ?? 'admin')) }))
    .filter((section) => section.pages.length > 0);
}

/**
 * The admin sidebar is intentionally compact. The workspace above an admin
 * page still exposes every tool, while the persistent sidebar only needs one
 * destination per operator work area.
 */
export function adminOverviewSectionsFor(role: StaffRole | null): NavSection[] {
  return adminSectionsFor(role).map((section) => {
    const pages = section.pages;
    const first = pages[0];
    if (!first) return { ...section, pages: [] };
    return {
      ...section,
      pages: [{
        ...first,
        key: `${section.id}-overview`,
        label: section.title.replace('Admin · ', ''),
        short: undefined,
        aliases: pages.map((page) => page.to),
        prefixes: pages.flatMap((page) => [
          ...(page.prefix ? [`${page.prefix}`] : []),
          ...(page.prefixes ?? []),
          `${page.to}/`,
        ]),
      }],
    };
  }).filter((section) => section.pages.length > 0);
}

function pagesByKey(sections: readonly NavSection[]): Map<string, NavPage> {
  return new Map(sections.flatMap((section) => section.pages.map((page) => [page.key, page] as const)));
}

function pickPages(pages: ReadonlyMap<string, NavPage>, keys: readonly string[]): NavPage[] {
  return keys.map((key) => pages.get(key)).filter((page): page is NavPage => Boolean(page));
}

export function newPlayerSectionsFor(sections: readonly NavSection[]): NavSection[] {
  const pages = pagesByKey(sections);
  // Preserve one visible command loop; no duplicate routes or separate rookie-only pages.
  const groups = [
    ['new-player-core', 'Start Here', ['dashboard', 'quests', 'scout', 'produce', 'raids', 'operations', 'black-book', 'stores']],
    ['new-player-empire', 'Build Your Empire', ['hideout', 'armory', 'crew-roster', 'dealers', 'supply', 'loans', 'travel', 'turf']],
    ['new-player-competition', 'Competition', ['casino', 'alliance', 'players', 'rankings']],
    ['new-player-career', 'Progress & Rewards', ['xp-progress', 'skills', 'events', 'street-pass', 'roll-call', 'drop', 'supporter', 'profile']],
    ['new-player-community', 'Messages & News', ['console', 'news']],
    ['new-player-support', 'Help & Settings', ['status', 'rules', 'account']],
  ] as const;
  return groups.map(([id, title, keys], index) => ({
    id,
    title,
    defaultOpen: index === 0,
    pages: pickPages(pages, keys),
  })).filter((group) => group.pages.length > 0);
}

export function useNewPlayerNavModel(): boolean {
  const me = useSession((s) => s.me);
  const guide = useOnboarding((s) => s.state?.guide ?? null);
  return Boolean(me && guide && !guide.complete);
}

/** The Drop answers 404 while it is off by environment; ask once per page load. */
let dropAvailability: Promise<boolean> | null = null;
function dropAvailable(): Promise<boolean> {
  dropAvailability ??= dropApi.status().then((status) => status.enabled).catch(() => false);
  return dropAvailability;
}

export function useDropAvailable(): boolean {
  const signedIn = useSession((s) => Boolean(s.account));
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!signedIn) return undefined;
    let live = true;
    void dropAvailable().then((value) => { if (live) setAvailable(value); });
    return () => { live = false; };
  }, [signedIn]);
  return available;
}

export function useSections(): NavSection[] {
  const { role } = useStaff();
  const { pathname } = useLocation();
  const hasPass = useSession((s) => Boolean(s.me?.streetPass));
  const hasDrop = useDropAvailable();
  const newPlayerNav = useNewPlayerNavModel();
  return useMemo(() => {
    const hidden = new Set([...(hasPass ? [] : ['street-pass']), ...(hasDrop ? [] : ['drop'])]);
    const sections = hidden.size
      ? SECTIONS.map((section) => ({ ...section, pages: section.pages.filter((page) => !hidden.has(page.key)) }))
      : SECTIONS;
    const playerSections = newPlayerNav ? newPlayerSectionsFor(sections) : sections;
    const adminSections = pathname.startsWith('/game/admin')
      ? adminOverviewSectionsFor(role)
      : adminSectionsFor(role);
    return [...playerSections, ...adminSections];
  }, [role, hasPass, hasDrop, newPlayerNav, pathname]);
}

function pathMatches(pathname: string, to: string, aliases: readonly string[] = [], prefix?: string, prefixes: readonly string[] = []): boolean {
  return pathname === to
    || aliases.includes(pathname)
    || (prefix !== undefined && pathname.startsWith(prefix))
    || prefixes.some((candidate) => pathname.startsWith(candidate));
}

export function isCurrent(page: NavPage, pathname: string): boolean {
  return pathMatches(pathname, page.to, page.aliases, page.prefix, page.prefixes);
}

/** Shared desktop/sidebar and mobile-directory search without changing route access. */
export function filterNavSections(sections: readonly NavSection[], query: string): NavSection[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [...sections];
  return sections.map((section) => ({
    ...section,
    pages: section.pages.filter((page) =>
      page.label.toLocaleLowerCase().includes(term)
      || page.short?.toLocaleLowerCase().includes(term)
      || section.title.toLocaleLowerCase().includes(term)),
  })).filter((section) => section.pages.length > 0);
}

/* ---------- Phone tab bar slots ---------- */

export const TAB_COUNT = 4;
export const DEFAULT_TABS = ['dashboard', 'quests', 'scout', 'stores'];
const TABS_STORAGE_KEY = 'streets.tabbar.v1';

const TAB_KEY_MIGRATIONS: Record<string, string> = {
  contacts: 'players',
  activity: 'console',
  surveys: 'news',
  fame: 'rankings',
  'report-bug': 'status',
};

function readTabs(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TABS_STORAGE_KEY) ?? 'null');
    if (!Array.isArray(parsed) || !parsed.every((key) => typeof key === 'string')) return DEFAULT_TABS;
    return parsed.slice(0, TAB_COUNT).map((key) => TAB_KEY_MIGRATIONS[key] ?? key);
  } catch {
    return DEFAULT_TABS;
  }
}

/**
 * The four pages on the phone tab bar, as the player arranged them. Stored per
 * browser: it is a convenience, and a phone and a tablet can want different bars.
 * A stored page this account cannot open (an admin page after losing admin) falls
 * back to the default for that slot.
 */
export function useTabSlots(pages: NavPage[]): {
  slots: NavPage[];
  setSlot: (index: number, key: string) => void;
  reset: () => void;
  isDefault: boolean;
} {
  const [keys, setKeys] = useState<string[]>(readTabs);

  useEffect(() => {
    try {
      window.localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(keys));
    } catch {
      // Private browsing: the bar still works, it just forgets on reload.
    }
  }, [keys]);

  const slots = useMemo(() => {
    const byKey = new Map(pages.map((page) => [page.key, page]));
    const taken = new Set<string>();
    return Array.from({ length: TAB_COUNT }, (_, index) => {
      const wanted = keys[index];
      const pick = [wanted, DEFAULT_TABS[index], ...DEFAULT_TABS, ...pages.map((page) => page.key)]
        .find((key): key is string => key !== undefined && byKey.has(key) && !taken.has(key))!;
      taken.add(pick);
      return byKey.get(pick)!;
    });
  }, [keys, pages]);

  function setSlot(index: number, key: string) {
    setKeys(() => {
      const next = slots.map((page) => page.key);
      const already = next.indexOf(key);
      // Picking a page that is already on the bar swaps the two tabs.
      if (already >= 0) next[already] = next[index]!;
      next[index] = key;
      return next;
    });
  }

  return {
    slots,
    setSlot,
    reset: () => setKeys(DEFAULT_TABS),
    isDefault: slots.every((page, index) => page.key === DEFAULT_TABS[index]),
  };
}

/* ---------- Badges ---------- */

export interface NavBadge {
  tone: 'info' | 'warn' | 'bad';
  /** Shown in the badge. No text means a dot. */
  text?: string;
  /** What the badge means, for screen readers and the tooltip. */
  label: string;
}

const SEEN_STORAGE_KEY = 'streets.seen.defense.v1';
const DEFENSE_TYPES = new Set(['RAID_DEFENSE', 'DRIVE_BY_DEFENSE']);

function readSeen(playerId: string): string | null {
  try {
    const all = JSON.parse(window.localStorage.getItem(SEEN_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    return typeof all[playerId] === 'string' ? all[playerId] : null;
  } catch {
    return null;
  }
}

function writeSeen(playerId: string, at: string): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(SEEN_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    // One entry per round player; older rounds' entries are dead weight, so keep the latest few.
    const next = Object.fromEntries([...Object.entries(all).filter(([id]) => id !== playerId).slice(-4), [playerId, at]]);
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Without storage the dot clears for this visit only.
  }
}

/** "1.2k" once a count stops fitting a badge. */
function badgeCount(value: number): string {
  if (value < 1000) return String(value);
  return `${Math.floor(value / 100) / 10}k`.replace('.0k', 'k');
}

function useConsoleUnread(playerId: string | null): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!playerId) {
      setUnread(0);
      return;
    }

    let live = true;
    const refresh = () => {
      void consoleApi.summary()
        .then((counts) => { if (live) setUnread(counts.unread + counts.notifications); })
        .catch(() => { /* Navigation should keep working if the summary is temporarily unavailable. */ });
    };

    refresh();
    window.addEventListener(CONSOLE_UPDATED_EVENT, refresh);
    window.addEventListener('streets:notifications-changed', refresh);
    window.addEventListener('focus', refresh);
    const interval = window.setInterval(refresh, 60_000);

    return () => {
      live = false;
      window.removeEventListener(CONSOLE_UPDATED_EVENT, refresh);
      window.removeEventListener('streets:notifications-changed', refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(interval);
    };
  }, [playerId]);

  return unread;
}


function useSurveyAvailableCount(playerId: string | null): number {
  const [available, setAvailable] = useState(0);

  useEffect(() => {
    if (!playerId) {
      setAvailable(0);
      return;
    }

    let live = true;
    const refresh = () => {
      void surveysApi.page()
        .then((page) => { if (live) setAvailable(page.available.length); })
        .catch(() => { /* A survey badge must never break navigation. */ });
    };

    refresh();
    window.addEventListener(SURVEYS_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    const interval = window.setInterval(refresh, 120_000);

    return () => {
      live = false;
      window.removeEventListener(SURVEYS_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(interval);
    };
  }, [playerId]);

  return available;
}

/**
 * What each page wants you to know before you open it:
 * - Scout carries your turns, amber once they sit at the cap.
 * - Raids gets a red dot when someone hit you since you last looked at Raids or Console/Activity.
 * - Dashboard goes amber when Heat drags the take, red when bust/arrest risk is live,
 *   and red while an arrest has the player locked up.
 * - Travel goes amber while a run sits in town, trading only when you are there, and
 *   while the truck is on the road to a new home; (0.5.0-E) red while someone is on your
 *   run's tail, amber while an ally calls you for backup.
 */
export function useNavBadges(pathname: string, search = ''): Record<string, NavBadge> {
  const me = useSession((s) => s.me);
  const activity = useSession((s) => s.recentActivity);
  const playerId = me?.id ?? null;
  const consoleUnread = useConsoleUnread(playerId);
  const surveyAvailable = useSurveyAvailableCount(playerId);
  const latestHit = activity
    .filter((entry) => DEFENSE_TYPES.has(entry.type))
    .reduce<string | null>((latest, entry) => (latest === null || entry.createdAt > latest ? entry.createdAt : latest), null);
  // Every page mounts its own layout, so read the mark up front rather than flashing the dot on each navigation.
  const [seen, setSeen] = useState<string | null>(() => (playerId ? readSeen(playerId) : null));

  useEffect(() => {
    setSeen(playerId ? readSeen(playerId) : null);
  }, [playerId]);

  // Inbox/alerts in Console do not prove the player saw the attack. Raids,
  // the legacy full log, or an explicit Console attack/activity view does.
  const consoleView = pathname === '/game/console' ? new URLSearchParams(search).get('view') : null;
  const looking = pathname === '/game/combat'
    || pathname === '/game/activity'
    || consoleView === 'attacks'
    || consoleView === 'activity';
  useEffect(() => {
    if (!playerId || !latestHit) return;
    const stored = readSeen(playerId);
    // First sight on this browser: old hits are history, not news.
    if (looking || stored === null) {
      if (stored !== latestHit) writeSeen(playerId, latestHit);
      setSeen(latestHit);
    }
  }, [playerId, latestHit, looking]);

  const badges: Record<string, NavBadge> = {};
  if (!me) return badges;

  const { turns, turnCap } = me.turns;
  if (turns > 0) {
    const full = turns >= turnCap;
    badges.scout = {
      tone: full ? 'warn' : 'info',
      text: badgeCount(turns),
      label: full ? `${turns} turns, at the cap` : `${turns} turns to spend`,
    };
  }

  if (latestHit && seen !== null && latestHit > seen && !looking) {
    badges.raids = { tone: 'bad', label: 'You were hit since you last looked' };
  }

  const claimable = me.streetPass?.claimable ?? 0;
  if (claimable > 0) {
    badges['street-pass'] = {
      tone: 'info',
      text: badgeCount(claimable),
      label: `${claimable} Street Pass tier${claimable === 1 ? '' : 's'} ready to claim`,
    };
  }

  const rollCallReady = me.roundRollCall?.claimable ?? 0;
  if (rollCallReady > 0) {
    badges['roll-call'] = {
      tone: 'info',
      text: badgeCount(rollCallReady),
      label: `${rollCallReady} Roll Call reward${rollCallReady === 1 ? '' : 's'} ready to claim`,
    };
  }

  if (consoleUnread > 0) {
    badges.console = {
      tone: 'info',
      text: badgeCount(consoleUnread),
      label: `${consoleUnread} unread Console item${consoleUnread === 1 ? '' : 's'}`,
    };
  }

  if (surveyAvailable > 0) {
    badges.news = {
      tone: 'info',
      text: badgeCount(surveyAvailable),
      label: `${surveyAvailable} survey${surveyAvailable === 1 ? '' : 's'} ready for feedback`,
    };
  }

  if (me.convoyAlert?.kind === 'tailed') {
    badges.travel = { tone: 'bad', label: `Your run is being tailed near ${me.convoyAlert.cityName}` };
  } else if (me.convoyAlert?.kind === 'call') {
    badges.travel = { tone: 'warn', label: `An ally needs backup in ${me.convoyAlert.cityName}` };
  } else if (me.moving) {
    badges.travel = { tone: 'warn', label: `Moving house to ${me.moving.toName}` };
  } else if (me.run?.phase === 'town') {
    badges.travel = { tone: 'warn', label: `Your run is in ${me.run.cityName}, waiting on you` };
  }

  if (me.heat?.lockedUntil) {
    badges.dashboard = {
      tone: 'bad',
      label: `Locked up until ${formatWhen(me.heat.lockedUntil)}`,
    };
  } else if (me.heat && me.heat.heat >= me.heat.dragStartsAt) {
    const arresting = Boolean(me.heat.arrest && me.heat.heat >= me.heat.arrest.startsAt);
    const busting = me.heat.heat >= me.heat.bustStartsAt;
    badges.dashboard = {
      tone: arresting || busting ? 'bad' : 'warn',
      label: arresting && me.heat.arrest
        ? `Heat ${me.heat.heat}: arrests are live (${Math.round(me.heat.arrest.chance * 100)}% next-trip risk)`
        : busting
          ? `Heat ${me.heat.heat}: busts are live (${Math.round(me.heat.bustChance * 100)}% next-trip risk)`
          : `Heat ${me.heat.heat}: dragging the take`,
    };
  }

  return badges;
}

/** The worst of several badges, for the More button. */
export function worstBadge(badges: NavBadge[]): NavBadge | null {
  const rank = { info: 0, warn: 1, bad: 2 } as const;
  const alerts = badges.filter((badge) => badge.tone !== 'info');
  if (!alerts.length) return null;
  const worst = alerts.reduce((a, b) => (rank[b.tone] > rank[a.tone] ? b : a));
  return { tone: worst.tone, label: alerts.map((badge) => badge.label).join('. ') };
}
