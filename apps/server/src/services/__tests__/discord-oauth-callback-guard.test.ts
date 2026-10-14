import { describe, expect, it, beforeEach } from 'vitest';
import { beginDiscordOAuthCallback, existingDiscordOAuthCallback, resetDiscordOAuthGuardForTests } from '../discord-oauth-callback-guard.js';

describe('Discord callback replay protection', () => {
  beforeEach(() => resetDiscordOAuthGuardForTests());

  it('only the first matching code/state is allowed to exchange', async () => {
    const first = beginDiscordOAuthCallback('one-time-code', 'same-state', 1_000);
    expect(first.duplicate).toBe(false);
    if (first.duplicate) return;
    const second = beginDiscordOAuthCallback('one-time-code', 'same-state', 1_001);
    expect(second.duplicate).toBe(true);
    if (!second.duplicate) return;
    first.finish('https://beta.streetsempire.dev/join');
    await expect(second.redirect).resolves.toBe('https://beta.streetsempire.dev/join');
  });

  it('recognizes a verified callback even when the browser no longer has the state cookie', async () => {
    // The first request must be validated by the route before being claimed.
    // A follow-up request can arrive after that response clears the state cookie.
    const unclaimed = existingDiscordOAuthCallback('code', 'state', 10_000);
    expect(unclaimed).toBeNull();
    const first = beginDiscordOAuthCallback('code', 'state', 10_000);
    expect(first.duplicate).toBe(false);
    if (first.duplicate) return;
    const replay = existingDiscordOAuthCallback('code', 'state', 10_200);
    expect(replay).not.toBeNull();
    first.finish('https://beta.streetsempire.dev/join');
    await expect(replay).resolves.toBe('https://beta.streetsempire.dev/join');
    expect(existingDiscordOAuthCallback('code', 'wrong-state', 10_201)).toBeNull();
    expect(existingDiscordOAuthCallback('code', 'state', 10_000 + 120_000)).toBeNull();
  });

  it('keeps independent logins separate and forgets expired codes', () => {
    const a = beginDiscordOAuthCallback('code-a', 'state', 100);
    const b = beginDiscordOAuthCallback('code-b', 'state', 100);
    const c = beginDiscordOAuthCallback('code-a', 'other-state', 100);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(false);
    expect(c.duplicate).toBe(false);
    const fresh = beginDiscordOAuthCallback('code-a', 'state', 100 + 120_000);
    expect(fresh.duplicate).toBe(false);
  });

  it('duplicates also receive the original failure navigation, never a fabricated success', async () => {
    const original = beginDiscordOAuthCallback('bad-code', 'state', 500);
    expect(original.duplicate).toBe(false);
    if (original.duplicate) return;
    const replay = beginDiscordOAuthCallback('bad-code', 'state', 501);
    expect(replay.duplicate).toBe(true);
    if (!replay.duplicate) return;
    original.finish('https://beta.streetsempire.dev/login?authError=failed');
    await expect(replay.redirect).resolves.toContain('/login?authError=failed');
  });
});
