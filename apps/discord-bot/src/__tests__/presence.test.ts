import { describe, expect, it, vi } from 'vitest';
import { ActivityType } from 'discord.js';
import { buildPresenceList, daysLeftFromMs, startBotPresence } from '../presence.js';

describe('buildPresenceList', () => {
  it('uses one linked stream and plain custom statuses for the rest', () => {
    const list = buildPresenceList({ playHost: 'streetsempire.com' });
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list.filter((activity) => activity.type === ActivityType.Streaming)).toHaveLength(1);
    expect(list.slice(1).every((activity) => activity.type === ActivityType.Custom)).toBe(true);
    expect(list.some((activity) => [ActivityType.Playing, ActivityType.Watching, ActivityType.Listening].includes(activity.type))).toBe(false);
  });

  it('promotes features, cosmetics, and the Supporter page', () => {
    const list = buildPresenceList({ playHost: 'streetsempire.com' });
    const messages = list.map((activity) => activity.state).join(' ');
    expect(messages).toContain('features');
    expect(messages).toContain('cosmetics');
    expect(messages).toContain('Supporter page');
    expect(messages).toContain('Never pay-to-win');
    expect(messages).toContain('jackpot in the Casino');
    expect(messages).toContain('picks in the Sportsbook');
    expect(messages).toContain('next big raid');
    expect(messages).toContain('Scout the streets');
  });

  it('includes a clickable Twitch streaming card', () => {
    const list = buildPresenceList({
      playHost: 'streetsempire.com',
      streamUrl: 'https://twitch.tv/amightytank',
    });
    expect(list).toContainEqual(expect.objectContaining({
      name: 'StreetsEmpire LIVE',
      type: ActivityType.Streaming,
      url: 'https://twitch.tv/amightytank',
    }));
  });

  it('uses the live player count and round name when the API answers', () => {
    const list = buildPresenceList({ playHost: 'streetsempire.com', playerCount: 42, roundName: 'Round 7', daysLeft: 2 });
    expect(list.some((a) => a.state?.includes('42 hustlers'))).toBe(true);
    expect(list.some((a) => a.state?.includes('Round 7'))).toBe(true);
  });

  it('replaces game prompts with anonymous live highlights', () => {
    const list = buildPresenceList({
      playHost: 'streetsempire.com',
      highlights: [
        { kind: 'jackpot', message: '🎰 A $125K jackpot just hit' },
        { kind: 'raid', message: '💥 A recent raid scored $88K in loot' },
      ],
    });
    const messages = list.map((activity) => activity.state);
    expect(messages).toContain('🎰 A $125K jackpot just hit');
    expect(messages).toContain('💥 A recent raid scored $88K in loot');
    expect(messages).toContain('🏆 Make your picks in the Sportsbook');
    expect(messages).not.toContain('🎰 Chase the jackpot in the Casino');
  });

  it('falls back to static custom statuses when the API is down', () => {
    const list = buildPresenceList({ playHost: 'streetsempire.com' });
    expect(list.some((activity) => activity.state?.includes('Build your empire at streetsempire.com'))).toBe(true);
    expect(list.some((activity) => activity.state?.includes('keeps growing'))).toBe(true);
  });

  it('uses only testing-focused custom statuses in beta mode', () => {
    const list = buildPresenceList({
      playHost: 'beta.streetsempire.dev',
      streamUrl: 'https://twitch.tv/amightytank',
      betaMode: true,
      playerCount: 12,
      roundName: 'Test Round 4',
      daysLeft: 2,
      highlights: [{ kind: 'jackpot', message: '🎰 A $125K jackpot just hit' }],
    });
    const messages = list.map((activity) => activity.state).join(' ');
    expect(list).toHaveLength(8);
    expect(list.every((activity) => activity.type === ActivityType.Custom)).toBe(true);
    expect(messages).toContain('StreetsEmpire Beta');
    expect(messages).toContain('Testing new features');
    expect(messages).toContain('12 hustlers building empires');
    expect(messages).toContain('🏁 Test Round 4 · 2d left');
    expect(messages).not.toContain('jackpot');
    expect(messages).not.toContain('Supporter');
    expect(messages).not.toContain('LIVE');
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

  it('advances through every card without sticking, even when the API is down', async () => {
    vi.useFakeTimers();
    try {
      const expected = buildPresenceList({ playHost: 'streetsempire.com' }).map((a) => a.name);
      const seen: string[] = [];
      const setActivity = vi.fn((activity: { name: string }) => { seen.push(activity.name); });
      const silence = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const stop = startBotPresence({ user: { setActivity } } as never, {
        playHost: 'streetsempire.com',
        minutes: 5,
        getRound: async () => { throw new Error('game is down'); },
      });
      // Immediate tick + one interval per card covers the list and wraps once.
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(expected.length * 5 * 60_000);
      stop?.();
      silence.mockRestore();
      expect(seen.slice(0, expected.length)).toEqual(expected);
      // It wraps around instead of stopping at the end.
      expect(seen.length).toBeGreaterThan(expected.length);
      expect(seen[expected.length]).toBe(expected[0]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps round data when only the highlight endpoint is down', async () => {
    vi.useFakeTimers();
    try {
      const setActivity = vi.fn();
      const silence = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const stop = startBotPresence({ user: { setActivity } } as never, {
        playHost: 'streetsempire.com',
        minutes: 5,
        getRound: async () => ({ round: { name: 'R1', msRemaining: 86_400_000, playerCount: 7 } }),
        getHighlights: async () => { throw new Error('highlights unavailable'); },
      });
      await vi.advanceTimersByTimeAsync(12 * 5 * 60_000);
      stop?.();
      silence.mockRestore();
      const states = setActivity.mock.calls.map(([activity]) => activity.state);
      expect(states).toContain('🔥 7 hustlers building empires');
      expect(states).toContain('🏁 R1 · 1d left');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not request production highlights in beta mode', async () => {
    vi.useFakeTimers();
    try {
      const setActivity = vi.fn();
      const getHighlights = vi.fn(async () => ({ highlights: [] }));
      const silence = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const stop = startBotPresence({ user: { setActivity } } as never, {
        playHost: 'beta.streetsempire.dev',
        betaMode: true,
        minutes: 5,
        getRound: async () => ({ round: null }),
        getHighlights,
      });
      await vi.advanceTimersByTimeAsync(0);
      stop?.();
      silence.mockRestore();
      expect(getHighlights).not.toHaveBeenCalled();
      expect(setActivity).toHaveBeenCalledWith(expect.objectContaining({
        type: ActivityType.Custom,
        state: '🧪 StreetsEmpire Beta',
      }));
    } finally {
      vi.useRealTimers();
    }
  });
});
