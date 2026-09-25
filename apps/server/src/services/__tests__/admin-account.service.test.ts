import { describe, expect, it } from 'vitest';
import { accountSnapshot, deletedAccountIdentity, deletionAuditSnapshot, deviceLabel } from '../admin-account.service.js';

describe('deviceLabel', () => {
  it('names the browser and platform without exposing the raw string', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36')).toBe('Chrome on Windows');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0')).toBe('Edge on Windows');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iOS');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36')).toBe('Chrome on Android');
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox on macOS');
    expect(deviceLabel('lightMyRequest')).toBe('Script');
    expect(deviceLabel(null)).toBe('Unknown device');
  });
});


describe('account deletion helpers', () => {
  const account = {
    id: 'acct_123',
    username: 'StreetBoss',
    usernameNormalized: 'streetboss',
    email: 'private@example.com',
    emailVerifiedAt: new Date('2026-09-01T00:00:00Z'),
    passwordHash: 'secret-hash',
    discordId: 'discord-123',
    discordUsername: 'PrivateDiscord',
    discordAvatar: 'avatar',
    discordLinkedAt: new Date('2026-09-01T00:00:00Z'),
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    lastLoginAt: new Date('2026-09-01T00:00:00Z'),
    isActive: true,
    isAdmin: false,
    betaApproved: true,
    suspendedUntil: null,
    suspendedReason: null,
    suspendedByUsername: null,
  } as const;

  it('creates a deterministic unique tombstone identity', () => {
    expect(deletedAccountIdentity('acct_123')).toEqual({
      username: 'deleted_acct_123',
      email: 'deleted+acct_123@deleted.streetsempire.invalid',
    });
  });

  it('keeps delete audit context without copying private identity fields', () => {
    const snapshot = deletionAuditSnapshot(account as never, 3);
    expect(snapshot).toEqual({
      id: 'acct_123',
      username: 'StreetBoss',
      isActive: true,
      isAdmin: false,
      betaApproved: true,
      roundsPlayed: 3,
    });
    expect(snapshot).not.toHaveProperty('email');
    expect(snapshot).not.toHaveProperty('discordUsername');
    expect(snapshot).not.toHaveProperty('passwordHash');
  });

  it('continues to include normal moderation fields outside delete audits', () => {
    expect(accountSnapshot(account as never)).toMatchObject({
      email: 'private@example.com',
      discordUsername: 'PrivateDiscord',
    });
  });
});
