import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../stores/session.js';
import { CONSOLE_UPDATED_EVENT, consoleApi } from '../api/console.js';
import { SURVEYS_CHANGED_EVENT, surveysApi } from '../api/surveys.js';
import { formatWhen } from '../utils/time.js';

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
}

export interface NavSection {
  id: string;
  title: string;
  pages: NavPage[];
}

export type IconName =
  | 'dashboard' | 'hideout' | 'scout' | 'produce' | 'raids' | 'stores' | 'cities'
  | 'rankings' | 'alliance' | 'contacts' | 'profile' | 'activity'
  | 'status' | 'rules' | 'news' | 'fame' | 'account' | 'admin' | 'pass';

export const SECTIONS: NavSection[] = [
  {
    id: 'play',
    title: 'Play',
    pages: [
      { key: 'dashboard', label: 'Dashboard', short: 'Home', to: '/game', icon: 'dashboard' },
      { key: 'scout', label: 'Street Work', short: 'Work', to: '/game/scout', icon: 'scout', aliases: ['/game/produce'] },
      { key: 'raids', label: 'Raids', to: '/game/combat', icon: 'raids' },
      { key: 'stores', label: 'Stores', to: '/game/stores', icon: 'stores', prefix: '/game/stores/' },
      { key: 'hideout', label: 'Hideout', to: '/game/hideout', icon: 'hideout' },
      { key: 'travel', label: 'Travel', to: '/game/travel', icon: 'cities' },
      { key: 'turf', label: 'City Blocks', short: 'Blocks', to: '/game/turf', icon: 'cities' },
    ],
  },
  {
    id: 'progress',
    title: 'Progress',
    pages: [
      {
        key: 'quests',
        label: 'Quests & Progress',
        short: 'Progress',
        to: '/game/quests',
        icon: 'activity',
        aliases: ['/game/street-pass', '/game/reputation'],
      },
    ],
  },
  {
    id: 'people',
    title: 'People',
    pages: [
      {
        key: 'players',
        label: 'People',
        to: '/game/players',
        icon: 'contacts',
        aliases: ['/game/rankings', '/game/contacts', '/game/profile', '/game/alliance', '/game/alliances'],
        prefix: '/game/players/',
        prefixes: ['/game/alliances/', '/game/forum/'],
      },
      { key: 'console', label: 'Console', to: '/game/console', icon: 'activity', aliases: ['/game/activity'] },
    ],
  },
  {
    id: 'community',
    title: 'Community',
    pages: [
      {
        key: 'news',
        label: 'Community',
        to: '/game/news',
        icon: 'news',
        aliases: ['/game/surveys', '/game/hall-of-fame'],
      },
    ],
  },
  {
    id: 'game',
    title: 'Game',
    pages: [
      {
        key: 'status',
        label: 'Game Info',
        to: '/game/status',
        icon: 'status',
        aliases: ['/game/rules', '/game/report-bug'],
      },
      { key: 'account', label: 'Account', to: '/account', icon: 'account' },
    ],
  },
];

/** Only shown to game admins. The server enforces the same rule on every admin route. */
export const ADMIN_SECTION: NavSection = {
  id: 'admin',
  title: 'Admin',
  pages: [
    { key: 'admin-rounds', label: 'Rounds', to: '/game/admin', icon: 'admin', prefix: '/game/admin/rounds/' },
    {
      key: 'admin-content',
      label: 'Content',
      to: '/game/admin/news',
      icon: 'admin',
      aliases: ['/game/admin/surveys', '/game/admin/quests', '/game/admin/rulesets'],
    },
    {
      key: 'admin-players',
      label: 'Players & Reports',
      short: 'Players',
      to: '/game/admin/accounts',
      icon: 'admin',
      aliases: ['/game/admin/reports', '/game/admin/bugs'],
      prefix: '/game/admin/accounts/',
      prefixes: ['/game/admin/players/'],
    },
    {
      key: 'admin-ops',
      label: 'Operations',
      short: 'Ops',
      to: '/game/admin/monitoring',
      icon: 'admin',
      aliases: ['/game/admin/integrations', '/game/admin/signals'],
    },
    {
      key: 'admin-balance',
      label: 'Balance',
      to: '/game/admin/economy',
      icon: 'admin',
      aliases: ['/game/admin/combat', '/game/admin/turf'],
    },
    { key: 'admin-audit', label: 'Audit log', short: 'Audit', to: '/game/admin/audit', icon: 'admin' },
  ],
};

export function useSections(): NavSection[] {
  const isAdmin = useSession((s) => s.account?.isAdmin ?? false);
  return useMemo(() => (isAdmin ? [...SECTIONS, ADMIN_SECTION] : SECTIONS), [isAdmin]);
}

function pathMatches(
  pathname: string,
  to: string,
  aliases: readonly string[] = [],
  prefix?: string,
  prefixes: readonly string[] = [],
): boolean {
  return pathname === to
    || aliases.includes(pathname)
    || (prefix !== undefined && pathname.startsWith(prefix))
    || prefixes.some((candidate) => pathname.startsWith(candidate));
}

export function isCurrent(page: NavPage, pathname: string): boolean {
  return pathMatches(pathname, page.to, page.aliases, page.prefix, page.prefixes);
}

export interface ContextTab {
  key: string;
  label: string;
  to: string;
  aliases?: string[];
  prefix?: string;
  prefixes?: string[];
  /** Reuse a top-level nav badge on the tab that actually owns the alert. */
  badgeKey?: string;
}

export interface ContextTabs {
  label: string;
  tabs: ContextTab[];
}

export function isContextTabCurrent(tab: ContextTab, pathname: string): boolean {
  return pathMatches(pathname, tab.to, tab.aliases, tab.prefix, tab.prefixes);
}

/**
 * Related routes stay separate for deep links, but share one top-level navigation
 * destination. This keeps the sidebar small while making each grouped page one tap away.
 */
export function contextTabsFor(pathname: string, hasStreetPass: boolean): ContextTabs | null {
  const groups: ContextTabs[] = [
    {
      label: 'Street Work',
      tabs: [
        { key: 'scout', label: 'Scout', to: '/game/scout' },
        { key: 'produce', label: 'Produce', to: '/game/produce' },
      ],
    },
    {
      label: 'Progress',
      tabs: [
        { key: 'quests', label: 'Quests', to: '/game/quests' },
        ...(hasStreetPass || pathname === '/game/street-pass'
          ? [{ key: 'street-pass', label: 'Street Pass', to: '/game/street-pass', badgeKey: 'quests' }]
          : []),
        { key: 'reputation', label: 'Contact Standing', to: '/game/reputation' },
      ],
    },
    {
      label: 'People',
      tabs: [
        { key: 'directory', label: 'Directory', to: '/game/players', prefix: '/game/players/' },
        { key: 'rankings', label: 'Rankings', to: '/game/rankings' },
        { key: 'contacts', label: 'Contacts', to: '/game/contacts' },
        { key: 'alliance', label: 'Alliance', to: '/game/alliance', aliases: ['/game/alliances'], prefix: '/game/alliances/' },
        { key: 'profile', label: 'My Profile', to: '/game/profile', prefix: '/game/forum/' },
      ],
    },
    {
      label: 'Console',
      tabs: [
        { key: 'console', label: 'Console', to: '/game/console' },
        { key: 'activity', label: 'Full Activity', to: '/game/activity' },
      ],
    },
    {
      label: 'Community',
      tabs: [
        { key: 'news', label: 'News', to: '/game/news' },
        { key: 'surveys', label: 'Surveys', to: '/game/surveys', badgeKey: 'news' },
        { key: 'hall-of-fame', label: 'Hall of Fame', to: '/game/hall-of-fame' },
      ],
    },
    {
      label: 'Game Info',
      tabs: [
        { key: 'status', label: 'Status', to: '/game/status' },
        { key: 'rules', label: 'Rules', to: '/game/rules' },
        { key: 'report-bug', label: 'Report a Bug', to: '/game/report-bug' },
      ],
    },
    {
      label: 'Admin Content',
      tabs: [
        { key: 'admin-news', label: 'News & Banner', to: '/game/admin/news' },
        { key: 'admin-surveys', label: 'Surveys', to: '/game/admin/surveys' },
        { key: 'admin-quests', label: 'Quest Content', to: '/game/admin/quests' },
        { key: 'admin-rulesets', label: 'Rulesets', to: '/game/admin/rulesets' },
      ],
    },
    {
      label: 'Admin Players & Reports',
      tabs: [
        { key: 'admin-accounts', label: 'Accounts', to: '/game/admin/accounts', prefix: '/game/admin/accounts/', prefixes: ['/game/admin/players/'] },
        { key: 'admin-reports', label: 'Reports', to: '/game/admin/reports' },
        { key: 'admin-bugs', label: 'Bug Reports', to: '/game/admin/bugs' },
      ],
    },
    {
      label: 'Admin Operations',
      tabs: [
        { key: 'admin-monitoring', label: 'Monitoring', to: '/game/admin/monitoring' },
        { key: 'admin-integrations', label: 'Integrations', to: '/game/admin/integrations' },
        { key: 'admin-signals', label: 'Signals', to: '/game/admin/signals' },
      ],
    },
    {
      label: 'Admin Balance',
      tabs: [
        { key: 'admin-economy', label: 'Economy', to: '/game/admin/economy' },
        { key: 'admin-combat', label: 'Combat & Exploits', to: '/game/admin/combat' },
        { key: 'admin-turf', label: 'Turf', to: '/game/admin/turf' },
      ],
    },
  ];
  return groups.find((group) => group.tabs.some((tab) => isContextTabCurrent(tab, pathname))) ?? null;
}

/* ---------- Phone tab bar slots ---------- */

export const TAB_COUNT = 4;
export const DEFAULT_TABS = ['dashboard', 'scout', 'raids', 'turf'];
const TABS_STORAGE_KEY = 'streets.tabbar.v1';

const TAB_KEY_MIGRATIONS: Record<string, string> = {
  produce: 'scout',
  'street-pass': 'quests',
  rankings: 'players',
  alliance: 'players',
  contacts: 'players',
  profile: 'players',
  activity: 'console',
  surveys: 'news',
  fame: 'news',
  rules: 'status',
  'report-bug': 'status',
  'admin-monitoring': 'admin-ops',
  'admin-news': 'admin-content',
  'admin-surveys': 'admin-content',
  'admin-quests': 'admin-content',
  'admin-integrations': 'admin-ops',
  'admin-rulesets': 'admin-content',
  'admin-reports': 'admin-players',
  'admin-bugs': 'admin-players',
  'admin-economy': 'admin-balance',
  'admin-combat': 'admin-balance',
  'admin-turf': 'admin-balance',
  'admin-signals': 'admin-ops',
  'admin-accounts': 'admin-players',
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
export function useNavBadges(pathname: string): Record<string, NavBadge> {
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

  const looking = pathname === '/game/combat' || pathname === '/game/console' || pathname === '/game/activity';
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
    badges.quests = {
      tone: 'info',
      text: badgeCount(claimable),
      label: `${claimable} Street Pass tier${claimable === 1 ? '' : 's'} ready to claim`,
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
