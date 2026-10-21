const GAME_HOSTS = new Set(['beta.streetsempire.dev', 'play.streetsempire.dev']);

/** Resolve a signed OAuth return origin without accepting an open redirect. */
export function oauthReturnOrigin(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    const origin = new URL(value);
    if (origin.protocol === 'https:' && GAME_HOSTS.has(origin.hostname)) return origin.origin;
  } catch { /* fall back to the configured frontend */ }
  return fallback;
}

export function oauthPostLoginRedirect(fallback: string, returnOrigin?: string | null): string {
  return new URL('/game', oauthReturnOrigin(returnOrigin, fallback)).toString();
}

export function oauthTwoFactorRedirect(fallback: string, returnOrigin?: string | null): string {
  const url = new URL('/login', oauthReturnOrigin(returnOrigin, fallback));
  url.searchParams.set('twoFactor', '1');
  return url.toString();
}
