/**
 * 1.0.0-G. Keeping an installed app current, and giving it an offline page.
 *
 * The service worker (public/sw.js) is registered for every visitor of a production
 * build: browsers only offer "Install app" once one is present, and it is what shows
 * the offline page. It never caches the game, so a new build is live on the next
 * page load. A tab or home-screen app that stays open for days does not reload on
 * its own, though, so the app checks whether the build it is running is still the
 * one being served and, when it is not, offers a reload.
 */

const SW_URL = '/sw.js';
const CHECK_EVERY_MS = 10 * 60_000;
const ENTRY_SCRIPT = /\/assets\/index-[A-Za-z0-9_-]+\.js/;

/** The hashed entry script a build's index.html loads, e.g. /assets/index-3f9a1c.js. */
export function buildIdFrom(html: string): string | null {
  return ENTRY_SCRIPT.exec(html)?.[0] ?? null;
}

/** The build this page is running, or null in development (no hashed bundle). */
export function runningBuildId(doc: Document = document): string | null {
  for (const script of Array.from(doc.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))) {
    const id = buildIdFrom(new URL(script.src, doc.baseURI).pathname);
    if (id) return id;
  }
  return null;
}

/** The build the server hands out now, or null when it cannot be told (offline, error). */
export async function servedBuildId(): Promise<string | null> {
  try {
    const response = await fetch('/game', { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'text/html' } });
    if (!response.ok) return null;
    return buildIdFrom(await response.text());
  } catch {
    return null;
  }
}

export function registerAppServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () => void navigator.serviceWorker.register(SW_URL, { scope: '/' }).catch(() => undefined);
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/**
 * Calls `onUpdate` once when a newer build is being served than the one running.
 * Checks when the app comes back into view or online, and every ten minutes.
 */
export function watchForUpdate(onUpdate: () => void): () => void {
  const running = runningBuildId();
  if (!running) return () => undefined;
  let done = false;
  let checking = false;
  const check = async () => {
    if (done || checking || document.hidden || !navigator.onLine) return;
    checking = true;
    const served = await servedBuildId();
    checking = false;
    if (!done && served && served !== running) {
      done = true;
      onUpdate();
    }
  };
  const onVisible = () => { if (!document.hidden) void check(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onVisible);
  const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
  return () => {
    done = true;
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onVisible);
    window.clearInterval(timer);
  };
}
