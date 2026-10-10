import { describe, expect, it } from 'vitest';
import { discordTimeoutFor, type AdminCommunityDto } from '@streets/shared';
import { everywhereAvailable, everywhereSteps, everywhereSummary } from './community.js';

const linked: AdminCommunityDto = {
  forum: { linked: true, username: 'big', profileUrl: 'https://forum.example/u/1', moderationEnabled: true, problem: null, suspendedUntil: null },
  discord: { linked: true, discordId: '123456789012345678', moderationEnabled: true, problem: null, inServer: true, displayName: 'Big', timedOutUntil: null, canModerate: true },
  tickets: [],
};

describe('everywhereAvailable', () => {
  it('offers each platform only when it is linked, set up and in reach', () => {
    expect(everywhereAvailable(linked)).toEqual({ forum: true, discord: true });
    expect(everywhereAvailable(null)).toEqual({ forum: false, discord: false });
    expect(everywhereAvailable({ ...linked, forum: { linked: false }, discord: { linked: false } })).toEqual({ forum: false, discord: false });
    expect(everywhereAvailable({ ...linked, forum: { ...linked.forum, problem: 'Could not reach the forum.' } as AdminCommunityDto['forum'] }).forum).toBe(false);
    expect(everywhereAvailable({ ...linked, discord: { ...linked.discord, canModerate: false } as AdminCommunityDto['discord'] }).discord).toBe(false);
  });
});

describe('everywhereSteps', () => {
  it('matches a suspension, never outlasting it on Discord', () => {
    expect(everywhereSteps('suspend', '3d', { forum: true, discord: true })).toEqual([
      { platform: 'forum', length: '3d' },
      { platform: 'discord', length: '1d' },
    ]);
    expect(everywhereSteps('suspend', '7d', { forum: false, discord: true })).toEqual([{ platform: 'discord', length: '7d' }]);
    expect(everywhereSteps('suspend', '90d', { forum: false, discord: true })).toEqual([{ platform: 'discord', length: '28d' }]);
  });

  it('uses the longest of each for a ban, and nothing unticked', () => {
    expect(everywhereSteps('ban', '1d', { forum: true, discord: true })).toEqual([
      { platform: 'forum', length: '90d' },
      { platform: 'discord', length: '28d' },
    ]);
    expect(everywhereSteps('ban', '1d', { forum: false, discord: false })).toEqual([]);
  });
});

describe('everywhereSummary', () => {
  it('says what happened on each platform, including why one failed', () => {
    expect(everywhereSummary([
      { step: { platform: 'forum', length: '7d' }, error: null },
      { step: { platform: 'discord', length: '7d' }, error: "Their highest role is at or above the bot's." },
    ])).toBe("Forum: suspended for 7 days. Discord: not done (Their highest role is at or above the bot's.)");
  });
});

describe('discordTimeoutFor', () => {
  it('picks the longest timeout that fits, and at least an hour', () => {
    expect(discordTimeoutFor(24)).toBe('1d');
    expect(discordTimeoutFor(72)).toBe('1d');
    expect(discordTimeoutFor(24 * 14)).toBe('7d');
    expect(discordTimeoutFor(24 * 90)).toBe('28d');
    expect(discordTimeoutFor(0)).toBe('1h');
  });
});
