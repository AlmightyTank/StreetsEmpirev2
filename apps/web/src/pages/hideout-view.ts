/** Which Hideout surface is on screen. Hash links from the old anchor nav still resolve. */
export type HideoutSectionId = 'overview' | 'rooms' | 'supplies' | 'security' | 'operations' | 'look';

export type HideoutSupplyTab = 'stash' | 'scavenging' | 'workshop' | 'generator';

export interface HideoutView {
  section: HideoutSectionId;
  supply: HideoutSupplyTab;
  /** Lowercase room key when a room card should be brought into view. */
  roomKey: string | null;
}

const SUPPLY_HASH: Record<string, HideoutSupplyTab> = {
  'hideout-stash': 'stash',
  'hideout-resources': 'stash',
  'hideout-scavenging': 'scavenging',
  'hideout-caches': 'scavenging',
  'hideout-workshop': 'workshop',
  'hideout-crafting': 'workshop',
  'hideout-generator': 'generator',
};

const SECTION_HASH: Record<HideoutSectionId, string> = {
  overview: '#hideout-overview',
  rooms: '#hideout-upgrades',
  supplies: '#hideout-stash',
  security: '#hideout-security',
  operations: '#hideout-operations',
  look: '#hideout-look',
};

const SUPPLY_HASH_ID: Record<HideoutSupplyTab, string> = {
  stash: '#hideout-stash',
  scavenging: '#hideout-scavenging',
  workshop: '#hideout-workshop',
  generator: '#hideout-generator',
};

/** Reads a location hash into a hideout section. Unknown hashes open the overview. */
export function hideoutViewFromHash(hash: string): HideoutView {
  const id = hash.replace(/^#/, '').toLowerCase();
  if (id === 'hideout-upgrades' || id === 'hideout-rooms') {
    return { section: 'rooms', supply: 'stash', roomKey: null };
  }
  if (id.startsWith('hideout-room-')) {
    const roomKey = id.slice('hideout-room-'.length);
    return { section: 'rooms', supply: 'stash', roomKey: roomKey || null };
  }
  if (id === 'hideout-look') return { section: 'look', supply: 'stash', roomKey: null };
  if (id === 'hideout-security') return { section: 'security', supply: 'stash', roomKey: null };
  if (id === 'hideout-operations') return { section: 'operations', supply: 'stash', roomKey: null };
  if (id === 'hideout-overview') return { section: 'overview', supply: 'stash', roomKey: null };
  const supply = SUPPLY_HASH[id];
  if (supply) return { section: 'supplies', supply, roomKey: null };
  return { section: 'overview', supply: 'stash', roomKey: null };
}

/** Hash for a section the player just chose. A room key keeps that card in reach. */
export function hashForHideoutView(view: HideoutView): string {
  if (view.section === 'rooms' && view.roomKey) return `#hideout-room-${view.roomKey.toLowerCase()}`;
  if (view.section === 'supplies') return SUPPLY_HASH_ID[view.supply];
  return SECTION_HASH[view.section];
}

export function resolveHideoutSection(
  section: HideoutSectionId,
  available: { hasSecurity: boolean; hasOperations: boolean; hasSupplies: boolean; hasLook: boolean },
): HideoutSectionId {
  if (section === 'security' && !available.hasSecurity) return 'overview';
  if (section === 'operations' && !available.hasOperations) return 'overview';
  if (section === 'supplies' && !available.hasSupplies) return 'overview';
  if (section === 'look' && !available.hasLook) return 'overview';
  return section;
}

/**
 * Seasonal room tabs own the stash, caches, bench, and generator. A round that
 * does not use those upgrades still loads that data, so the controls stay on
 * the page instead of disappearing behind a tab that is not rendered.
 */
export function hideoutSuppliesOnPage(hideoutEnabled: boolean): boolean {
  return !hideoutEnabled;
}

export function resolveSupplyTab(
  tab: HideoutSupplyTab,
  available: Record<HideoutSupplyTab, boolean>,
): HideoutSupplyTab {
  if (available[tab]) return tab;
  const order: HideoutSupplyTab[] = ['stash', 'scavenging', 'workshop', 'generator'];
  return order.find((key) => available[key]) ?? 'stash';
}

export type HideoutRoomState = 'building' | 'maxed' | 'ready' | 'cash' | 'locked';

/** What the room card and the overview roster should say about one room. */
export function hideoutRoomState(room: {
  nextCostCents: number | null;
  canUpgrade: boolean;
  cashCents: number;
  building?: boolean;
  nextRequirements?: ReadonlyArray<{ met: boolean }>;
  nextCostComponents?: ReadonlyArray<{ met: boolean }>;
}): HideoutRoomState {
  if (room.building) return 'building';
  if (room.nextCostCents === null) return 'maxed';
  if (room.canUpgrade) return 'ready';
  const unmet = (room.nextRequirements ?? []).some((item) => !item.met)
    || (room.nextCostComponents ?? []).some((item) => !item.met);
  if (!unmet && room.cashCents < room.nextCostCents) return 'cash';
  return 'locked';
}

export function hideoutRoomStateLabel(state: HideoutRoomState): string {
  if (state === 'building') return 'Building';
  if (state === 'maxed') return 'Max level';
  if (state === 'ready') return 'Ready';
  if (state === 'cash') return 'Need cash';
  return 'Locked';
}

/**
 * The build target on the overview. A room the player can upgrade now beats a
 * cheaper room that is still locked.
 */
export function pickNextHideoutRoom<T extends { nextCostCents: number | null; canUpgrade: boolean; build?: unknown }>(
  rooms: readonly T[],
): T | null {
  const building = rooms.find((room) => room.build);
  if (building) return building;
  const open = rooms.filter((room): room is T & { nextCostCents: number } => room.nextCostCents !== null);
  const ready = open.filter((room) => room.canUpgrade);
  const pool = ready.length ? ready : open;
  return [...pool].sort((a, b) => a.nextCostCents - b.nextCostCents)[0] ?? null;
}

export function hideoutBuildStatus(readyCount: number, openCount: number): string {
  if (openCount === 0) return 'Season complete';
  if (readyCount === 1) return '1 room ready';
  if (readyCount > 1) return `${readyCount} rooms ready`;
  return 'Build in progress';
}
