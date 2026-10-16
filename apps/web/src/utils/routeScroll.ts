function isStorefront(pathname: string | undefined): boolean {
  return pathname === '/game/stores' || Boolean(pathname?.startsWith('/game/stores/'));
}

function isCasinoGame(pathname: string | undefined): boolean {
  return Boolean(pathname?.startsWith('/game/casino/'));
}

/** Shared shells swap their active content in place instead of jumping to top. */
export function shouldPreserveRouteScroll(previousPath: string | undefined, nextPath: string, hash = ''): boolean {
  if (hash) return false;
  return (isStorefront(previousPath) && isStorefront(nextPath))
    || (isCasinoGame(previousPath) && isCasinoGame(nextPath));
}
