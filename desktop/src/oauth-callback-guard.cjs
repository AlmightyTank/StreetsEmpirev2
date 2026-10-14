'use strict';

const { createHash } = require('node:crypto');

const MAX_RECENT_CODES = 100;
const REPLAY_WINDOW_MS = 2 * 60_000;

function callbackSignature(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' ||
        !['play.streetsempire.dev', 'beta.streetsempire.dev'].includes(url.hostname) ||
        url.pathname !== '/api/auth/discord/callback') return null;
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return null;
    // Never retain raw authorization codes, states or callback URLs in memory.
    const digest = createHash('sha256').update(url.origin).update('\0')
      .update(code).update('\0').update(state).digest('hex');
    return { digest, origin: url.origin };
  } catch {
    return null;
  }
}

/**
 * Electron's network-level callback gate. Each OAuth code is one-time-only.
 * A second request with the same callback goes straight to the game's join
 * page rather than consuming the code again and displaying a false error.
 * This is intentionally per desktop session; the server validates OAuth
 * state/cookies and remains responsible for authentication.
 */
class OAuthCallbackGuard {
  constructor() { this.recent = new Map(); }

  redirectForReplay(rawUrl, now = Date.now()) {
    const details = callbackSignature(rawUrl);
    if (!details) return null;
    for (const [digest, time] of this.recent) {
      if (now - time >= REPLAY_WINDOW_MS) this.recent.delete(digest);
    }
    if (this.recent.has(details.digest)) return `${details.origin}/join`;
    this.recent.set(details.digest, now);
    if (this.recent.size > MAX_RECENT_CODES) {
      const first = this.recent.keys().next().value;
      if (first) this.recent.delete(first);
    }
    return null;
  }
}

module.exports = { OAuthCallbackGuard };
