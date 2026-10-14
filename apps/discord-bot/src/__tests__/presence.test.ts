import { describe, expect, it, vi } from 'vitest';
import { ActivityType } from 'discord.js';
import { buildPresenceList, daysLeftFromMs, startBotPresence } from '../presence.js';

describe('buildPresenceList', () => {
  it('anchors on Playing StreetsEmpire cards that carry the play host', () => {
    const list = buildPresenceList({ playHost: 'streetsempire.com' });
    expect(list.length).toBeGreaterThanOrEqual(8);
    const playing = list.filter((a) => a.type === ActivityType.Playing && a.name === 'StreetsEmpire');
    // Every other rotation funnels toward the game.
    expect(playing.length).toBeGreaterThanOrEqual(4);
    for (const activity of playing) {
      expect(activity.state).toContain('play at streetsempire.com');
    }
  });

  it('mixes in street flavor and command discovery', () => {
    const list = buildPresenceList({ playHost: 'streetsempire.com' });
    const names = list.map((a) => a.name);
    expect(names).toContain('the block');
    expect(names).toContain('turf wars');
    expect(names).toContain('/help');
  });

  it('uses the live player count and round name when the API answers', () => {
    const list = buildPresenceList({ playHost: 'streetsempire.com', playerCount: 42, roundName: 'Round 7', daysLeft: 2 });
    expect(list.some((a) => a.name.includes('42 hustlers'))).toBe(true);
    expect(list.some((a) => a.state?.includes('Round 7'))).toBe(true);
  });

  it('falls back to static flavor when the API is down', () => {
    const list = buildPresenceList({ playHost: 'streetsempire.com' });
    expect(list[1]).toMatchObject({ name: 'the block', state: 'Wiping the block out' });
  });
});

describe('daysLeftFromMs', () => {
  it('floors to whole days and rejects unknown values', () => {
    expect(daysLeftFromMs(3 * 86_400_000 + 1_000)).toBe(3);
    expect(daysLeftFromMs(null)).toBeNull();
    expect(daysLeftFromMs(undefined)).toBeNull();
    expect(daysLeftFromMs(-1)).toBeNull();
  });
});

describe('startBotPresence', () => {
  it('returns null when disabled, otherwise sets an activity immediately', async () => {
    expect(startBotPresence({} as never, { playHost: 'x', minutes: 0, getRound: async () => ({ round: null }) })).toBeNull();

    const setActivity = vi.fn();
    const stop = startBotPresence({ user: { setActivity } } as never, {
      playHost: 'streetsempire.com',
      minutes: 5,
      getRound: async () => ({ round: { name: 'R1', msRemaining: 1_000, playerCount: 7 } }),
    });
    expect(stop).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(setActivity).toHaveBeenCalled();
    stop?.();
  });
});
