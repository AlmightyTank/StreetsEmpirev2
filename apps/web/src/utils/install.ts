/**
 * Home Screen install. Android Chrome fires `beforeinstallprompt` once, often before
 * React mounts, so the listener is attached when this module is first imported.
 */

type InstallChoice = { outcome: 'accepted' | 'dismissed' };

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

export type InstallPlatform = 'ios' | 'android' | null;

/**
 * Native wrappers (Android WebView, Electron desktop) already *are* the app,
 * so the "Get the app" banner must stay hidden there. The Android shell tags
 * its user agent with `StreetsEmpireAndroid/<version>`.
 */
export function isNativeApp(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return ua.includes('StreetsEmpireAndroid/')
    || ua.includes('StreetsEmpireDesktop/')
    || ua.includes('Electron/');
}

export function isAndroidNativeApp(): boolean {
  if (typeof navigator === 'undefined') return false;
  const bridge = (window as Window & { StreetsEmpireAndroid?: { isNative?: () => boolean } }).StreetsEmpireAndroid;
  const queryMarked = new URLSearchParams(window.location.search).get('se_android') === '1';
  if (queryMarked) {
    try { window.sessionStorage.setItem('se_android', '1'); } catch { /* storage may be disabled */ }
  }
  let storedMarker = false;
  try { storedMarker = window.sessionStorage.getItem('se_android') === '1'; } catch { /* storage may be disabled */ }
  return queryMarked
    || storedMarker
    || bridge?.isNative?.() === true
    || (navigator.userAgent || '').includes('StreetsEmpireAndroid/');
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep Chrome's own mini-infobar away; the banner offers the same prompt.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function isInstalled(): boolean {
  if (isNativeApp()) return true;
  return installed
    || window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Phones and tablets only: desktop browsers have their own install button in the address bar. */
export function installPlatform(): InstallPlatform {
  if (isNativeApp()) return null;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac with touch.
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return null;
}

/** Shows the browser's own install dialog. Returns whether the player accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  // The event can only be used once.
  deferred = null;
  notify();
  await event.prompt();
  return (await event.userChoice).outcome === 'accepted';
}
