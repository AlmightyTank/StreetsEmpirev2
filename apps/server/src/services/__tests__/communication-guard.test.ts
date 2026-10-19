import { describe, expect, it } from 'vitest';
import { ACCOUNT_TRUST_GATES } from '@streets/shared';
import { assertTrustGate, commsMuted, foreignLinks, isNewAccount, meetsTrustGate, NEW_ACCOUNT_HOURS } from '../communication-guard.js';

const own = new Set(['streetsempire.com', 'forum.streetsempire.dev']);

describe('0.9.0-H link filtering', () => {
  it('finds web addresses, bare domains and invites', () => {
    expect(foreignLinks('go to https://evil.example.com/x now', own)).toEqual(['https://evil.example.com/x']);
    expect(foreignLinks('www.cheap-gold.biz', own)).toEqual(['www.cheap-gold.biz']);
    expect(foreignLinks('prices at cheapgold.ru today', own)).toEqual(['cheapgold.ru']);
    expect(foreignLinks('join discord.gg/abc123', own)).toEqual(['discord.gg/abc123']);
  });

  it('ignores the game\'s own sites and ordinary words', () => {
    expect(foreignLinks('see https://streetsempire.com/game/turf', own)).toEqual([]);
    expect(foreignLinks('post on forum.streetsempire.dev/t/1', own)).toEqual([]);
    expect(foreignLinks('Meet me at the Casino. 5.00 each, ok?', own)).toEqual([]);
    expect(foreignLinks('Detroit...Miami run tonight', own)).toEqual([]);
  });
});

describe('0.9.0-H account rules', () => {
  const now = new Date('2026-09-26T12:00:00Z');

  it('treats accounts younger than the window as new', () => {
    expect(isNewAccount(new Date(now.getTime() - (NEW_ACCOUNT_HOURS - 1) * 3_600_000), now)).toBe(true);
    expect(isNewAccount(new Date(now.getTime() - (NEW_ACCOUNT_HOURS + 1) * 3_600_000), now)).toBe(false);
  });

  it('honours timed and permanent communication mutes', () => {
    expect(commsMuted({ commsMutedUntil: null, commsMutedPermanent: false }, now)).toBe(false);
    expect(commsMuted({ commsMutedUntil: new Date(now.getTime() + 1_000), commsMutedPermanent: false }, now)).toBe(true);
    expect(commsMuted({ commsMutedUntil: new Date(now.getTime() - 1_000), commsMutedPermanent: false }, now)).toBe(false);
    expect(commsMuted({ commsMutedUntil: null, commsMutedPermanent: true }, now)).toBe(true);
  });
});

describe('account level trust gates', () => {
  const gate = ACCOUNT_TRUST_GATES.coldMessage.level;

  it('opens at the gate level and always for staff', () => {
    expect(meetsTrustGate({ level: gate - 1, isAdmin: false }, 'coldMessage')).toBe(false);
    expect(meetsTrustGate({ level: gate, isAdmin: false }, 'coldMessage')).toBe(true);
    expect(meetsTrustGate({ level: 1, isAdmin: true }, 'foundAlliance')).toBe(true);
  });

  it('explains the level needed when it refuses', () => {
    expect(() => assertTrustGate({ level: 1, isAdmin: false }, 'foundAlliance')).toThrow(
      expect.objectContaining({ code: 'ACCOUNT_LEVEL_REQUIRED', statusCode: 403 }),
    );
    expect(() => assertTrustGate({ level: 1, isAdmin: false }, 'foundAlliance')).toThrow(`level ${ACCOUNT_TRUST_GATES.foundAlliance.level}`);
  });
});
