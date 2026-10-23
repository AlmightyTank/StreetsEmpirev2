import { describe, expect, it } from 'vitest';
import { renderStatsTemplate, rotatingStatsNames } from '../channel-stats.js';

const stats = {
  playerCount: 42,
  peakPlayers: 67,
  gameName: 'Game-21',
  tradedCents: 120_000_000,
  raidsToday: 12,
  daysLeft: 3,
  serverStatus: 'online' as const,
};

describe('rotating stats channel names', () => {
  it('renders the requested live stat cards', () => {
    expect(rotatingStatsNames(stats)).toEqual([
      '🔥・peak-67-today',
      '💰・$1.2m-traded',
      '⚔️・12-raids-today',
      '⏱️・3d-left',
    ]);
  });

  it('supports custom templates and unavailable states', () => {
    expect(renderStatsTemplate('{status}-{players}-{game}-{days}', { ...stats, playerCount: null, gameName: null, daysLeft: null, serverStatus: 'maintenance' })).toBe('maintenance-offline-no-game-no-round');
  });

  it('caps names at Discord’s channel-name limit', () => {
    expect(renderStatsTemplate('x'.repeat(150), stats)).toHaveLength(100);
  });
});
