import { describe, expect, it } from 'vitest';
import { oauthPostLoginRedirect, oauthTwoFactorRedirect } from '../oauth-return.js';

describe('OAuth return redirects', () => {
  const frontend = 'https://streetsempire.dev';

  it('returns Google and Facebook sign-ins to the beta game that started OAuth', () => {
    expect(oauthPostLoginRedirect(frontend, 'https://beta.streetsempire.dev')).toBe('https://beta.streetsempire.dev/game');
  });

  it('keeps trusted live game origins and the two-factor step on the same host', () => {
    expect(oauthPostLoginRedirect(frontend, 'https://play.streetsempire.dev')).toBe('https://play.streetsempire.dev/game');
    expect(oauthTwoFactorRedirect(frontend, 'https://beta.streetsempire.dev')).toBe('https://beta.streetsempire.dev/login?twoFactor=1');
  });

  it('falls back to the configured frontend for untrusted or insecure origins', () => {
    expect(oauthPostLoginRedirect(frontend, 'https://evil.example')).toBe('https://streetsempire.dev/game');
    expect(oauthPostLoginRedirect(frontend, 'http://beta.streetsempire.dev')).toBe('https://streetsempire.dev/game');
  });

  it('can fall back to the trusted OAuth callback host', () => {
    expect(oauthPostLoginRedirect('https://play.streetsempire.dev', 'https://evil.example')).toBe('https://play.streetsempire.dev/game');
  });
});
