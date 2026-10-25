import { describe, expect, it } from 'vitest';
import {
  hashForHideoutView,
  hideoutBuildStatus,
  hideoutRoomState,
  hideoutSuppliesOnPage,
  hideoutViewFromHash,
  pickNextHideoutRoom,
  resolveHideoutSection,
  resolveSupplyTab,
} from './hideout-view.js';

describe('hideoutViewFromHash', () => {
  it('opens the overview for an empty or unknown hash', () => {
    expect(hideoutViewFromHash('')).toEqual({ section: 'overview', supply: 'stash', roomKey: null });
    expect(hideoutViewFromHash('#somewhere-else').section).toBe('overview');
  });

  it('keeps the old anchor ids and supply links', () => {
    expect(hideoutViewFromHash('#hideout-upgrades').section).toBe('rooms');
    expect(hideoutViewFromHash('#hideout-security').section).toBe('security');
    expect(hideoutViewFromHash('#hideout-operations').section).toBe('operations');
    expect(hideoutViewFromHash('#hideout-look').section).toBe('look');
    expect(hideoutViewFromHash('#hideout-stash')).toEqual({ section: 'supplies', supply: 'stash', roomKey: null });
    expect(hideoutViewFromHash('#hideout-generator').supply).toBe('generator');
    expect(hideoutViewFromHash('#hideout-workshop').supply).toBe('workshop');
    expect(hideoutViewFromHash('#hideout-scavenging').supply).toBe('scavenging');
  });

  it('reads a room card hash', () => {
    expect(hideoutViewFromHash('#hideout-room-safe_room')).toEqual({
      section: 'rooms',
      supply: 'stash',
      roomKey: 'safe_room',
    });
  });
});

describe('hashForHideoutView', () => {
  it('writes a stable hash for each section', () => {
    expect(hashForHideoutView({ section: 'overview', supply: 'stash', roomKey: null })).toBe('#hideout-overview');
    expect(hashForHideoutView({ section: 'supplies', supply: 'workshop', roomKey: null })).toBe('#hideout-workshop');
    expect(hashForHideoutView({ section: 'rooms', supply: 'stash', roomKey: 'SAFE_ROOM' })).toBe('#hideout-room-safe_room');
  });
});

describe('resolveHideoutSection', () => {
  const open = { hasSecurity: true, hasOperations: true, hasSupplies: true, hasLook: true };

  it('drops a section this round does not have', () => {
    expect(resolveHideoutSection('security', { ...open, hasSecurity: false })).toBe('overview');
    expect(resolveHideoutSection('supplies', { ...open, hasSupplies: false })).toBe('overview');
    expect(resolveHideoutSection('rooms', open)).toBe('rooms');
  });
});

describe('hideoutSuppliesOnPage', () => {
  it('keeps supplies on the page when seasonal upgrades are off', () => {
    expect(hideoutSuppliesOnPage(false)).toBe(true);
    expect(hideoutSuppliesOnPage(true)).toBe(false);
  });
});

describe('resolveSupplyTab', () => {
  it('falls back to the first supply surface that loaded', () => {
    expect(resolveSupplyTab('generator', {
      stash: false,
      scavenging: true,
      workshop: false,
      generator: false,
    })).toBe('scavenging');
  });
});

describe('pickNextHideoutRoom', () => {
  it('prefers the cheapest room that can be upgraded now', () => {
    const next = pickNextHideoutRoom([
      { name: 'Lookouts', nextCostCents: 10_000, canUpgrade: false },
      { name: 'Garage', nextCostCents: 80_000, canUpgrade: true },
      { name: 'Safe Room', nextCostCents: 40_000, canUpgrade: true },
    ]);
    expect(next).toMatchObject({ name: 'Safe Room' });
  });

  it('falls back to the cheapest open room when nothing is ready', () => {
    const next = pickNextHideoutRoom([
      { name: 'Workshop', nextCostCents: 90_000, canUpgrade: false },
      { name: 'Back Office', nextCostCents: 25_000, canUpgrade: false },
      { name: 'Garage', nextCostCents: null, canUpgrade: false },
    ]);
    expect(next).toMatchObject({ name: 'Back Office' });
  });

  it('returns null when every room is maxed', () => {
    expect(pickNextHideoutRoom([{ nextCostCents: null, canUpgrade: false }])).toBeNull();
  });

  it('keeps the room under construction as the next target', () => {
    const next = pickNextHideoutRoom([
      { name: 'Safe Room', nextCostCents: 50_000, canUpgrade: false, build: { level: 1 } },
      { name: 'Lookouts', nextCostCents: 10_000, canUpgrade: true },
    ]);
    expect(next).toMatchObject({ name: 'Safe Room' });
  });
});

describe('hideout room status', () => {
  it('labels cash, locks, and a finished room', () => {
    expect(hideoutRoomState({ nextCostCents: 100, canUpgrade: false, cashCents: 500, building: true })).toBe('building');
    expect(hideoutRoomState({ nextCostCents: null, canUpgrade: false, cashCents: 0 })).toBe('maxed');
    expect(hideoutRoomState({ nextCostCents: 100, canUpgrade: true, cashCents: 50 })).toBe('ready');
    expect(hideoutRoomState({ nextCostCents: 100, canUpgrade: false, cashCents: 40 })).toBe('cash');
    expect(hideoutRoomState({ nextCostCents: 100, canUpgrade: false, cashCents: 400 })).toBe('locked');
    expect(hideoutRoomState({
      nextCostCents: 100,
      canUpgrade: false,
      cashCents: 40,
      nextRequirements: [{ met: false }],
    })).toBe('locked');
  });

  it('describes the season build for the overview chip', () => {
    expect(hideoutBuildStatus(0, 0)).toBe('Season complete');
    expect(hideoutBuildStatus(1, 3)).toBe('1 room ready');
    expect(hideoutBuildStatus(2, 4)).toBe('2 rooms ready');
    expect(hideoutBuildStatus(0, 2)).toBe('Build in progress');
  });
});
