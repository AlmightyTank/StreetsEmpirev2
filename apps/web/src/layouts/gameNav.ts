import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../stores/session.js';

/** One page in the game menu. `key` is what the phone tab bar stores. */
export interface NavPage {
  key: string;
  label: string;
  /** Shorter label for a phone tab. */
  short?: string;
  to: string;
  icon: IconName;
  /** Other paths that count as this page, e.g. every store for Stores. */
  prefix?: string;
}

export interface NavSection {
  id: string;
  title: string;
  pages: NavPage[];
}

export type IconName =
  | 'dashboard' | 'hideout' | 'scout' | 'produce' | 'raids' | 'stores' | 'cities'
  | 'rankings' | 'alliance' | 'contacts' | 'profile' | 'activity'
  | 'status' | 'rules' | 'news' | 'fame' | 'admin';

export const SECTIONS: NavSection[] = [
  {
    id: 'actions',
    title: 'Actions',
    pages: [
      { key: 'dashboard', label: 'Dashboard', short: 'Home', to: '/game', icon: 'dashboard' },
      { key: 'scout', label: 'Scout', to: '/game/scout', icon: 'scout' },
      { key: 'produce', label: 'Produce', to: '/game/produce', icon: 'produce' },
      { key: 'raids', label: 'Raids', to: '/game/combat', icon: 'raids' },
      { key: 'stores', label: 'Stores', to: '/game/stores', icon: 'stores', prefix: '/game/stores/' },
      { key: 'hideout', label: 'Hideout', to: '/game/hideout', icon: 'hideout' },
      { key: 'travel', label: 'Travel', to: '/game/travel', icon: 'cities' },
    ],
  },
  {
    id: 'players',
    title: 'Players',
    pages: [
      { key: 'rankings', label: 'Rankings', short: 'Ranks', to: '/game/rankings', icon: 'rankings' },
      { key: 'alliance', label: 'Alliance', to: '/game/alliance', icon: 'alliance', prefix: '/game/alliances' },
      { key: 'contacts', label: 'Contacts', to: '/game/contacts', icon: 'contacts' },
      { key: 'profile', label: 'Profile', to: '/game/profile', icon: 'profile' },
      { key: 'activity', label: 'Activity', to: '/game/activity', icon: 'activity' },
    ],
  },
  {
    id: 'game',
    title: 'Game',
    pages: [
      { key: 'status', label: 'Status', to: '/game/status', icon: 'status' },
      { key: 'rules', label: 'Rules', to: '/game/rules', icon: 'rules' },
      { key: 'news', label: 'News', to: '/game/news', icon: 'news' },
      { key: 'fame', label: 'Hall of Fame', short: 'Fame', to: '/game/hall-of-fame', icon: 'fame' },
    ],
  },
];

/** Only shown to game admins. The server enforces the same rule on every admin route. */
export const ADMIN_SECTION: NavSection = {
  id: 'admin',
  title: 'Admin',
  pages: [
    { key: 'admin-rounds', label: 'Rounds', to: '/game/admin', icon: 'admin', prefix: '/game/admin/rounds/' },
    { key: 'admin-news', label: 'News & banner', short: 'Banner', to: '/game/admin/news', icon: 'admin' },
    { key: 'admin-accounts', label: 'Accounts', to: '/game/admin/accounts', icon: 'admin', prefix: '/game/admin/accounts/' },
    { key: 'admin-integrations', label: 'Integrations', short: 'Integr.', to: '/game/admin/integrations', icon: 'admin' },
    { key: 'admin-rulesets', label: 'Rulesets', to: '/game/admin/rulesets', icon: 'admin' },
    { key: 'admin-signals', label: 'Signals', to: '/game/admin/signals', icon: 'admin' },
    { key: 'admin-audit', label: 'Audit log', short: 'Audit', to: '/game/admin/audit', icon: 'admin' },
  ],
};

export function useSections(): NavSection[] {
  const isAdmin = useSession((s) => s.account?.isAdmin ?? false);
  return useMemo(() => (isAdmin ? [...SECTIONS, ADMIN_SECTION] : SECTIONS), [isAdmin]);
}

export function isCurrent(page: NavPage, pathname: string): boolean {
  return pathname === page.to || (page.prefix !== undefined && pathname.startsWith(page.prefix));
}

/* ---------- Phone tab bar slots ---------- */

export const TAB_COUNT = 4;
export const DEFAULT_TABS = ['dashboard', 'scout', 'produce', 'raids'];
const TABS_STORAGE_KEY = 'streets.tabbar.v1';

function readTabs(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TABS_STORAGE_KEY) ?? 'null');
    return Array.isArray(parsed) && parsed.every((key) => typeof key === 'string') ? parsed.slice(0, TAB_COUNT) : DEFAULT_TABS;
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

/**
 * What each page wants you to know before you open it:
 * - Scout carries your turns, amber once they sit at the cap.
 * - Raids gets a red dot when someone hit you since you last looked at Raids or Activity.
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
  const latestHit = activity
    .filter((entry) => DEFENSE_TYPES.has(entry.type))
    .reduce<string | null>((latest, entry) => (latest === null || entry.createdAt > latest ? entry.createdAt : latest), null);
  // Every page mounts its own layout, so read the mark up front rather than flashing the dot on each navigation.
  const [seen, setSeen] = useState<string | null>(() => (playerId ? readSeen(playerId) : null));

  useEffect(() => {
    setSeen(playerId ? readSeen(playerId) : null);
  }, [playerId]);

  const looking = pathname === '/game/combat' || pathname === '/game/activity';
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
      label: `Locked up until ${new Date(me.heat.lockedUntil).toLocaleString()}`,
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
