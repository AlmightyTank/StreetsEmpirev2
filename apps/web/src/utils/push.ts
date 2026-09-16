/**
 * Web Push in the browser. The service worker is registered only when a player
 * turns phone alerts on; it shows notifications and nothing else (no caching).
 */

export type PushSupport = 'ok' | 'ios-needs-home-screen' | 'unsupported' | 'denied';

const SW_URL = '/sw.js';

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac with touch.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  // iPhone and iPad only offer push to web apps opened from the Home Screen.
  if (isIos() && !isStandalone()) return 'ios-needs-home-screen';
  if (!capable) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

function applicationServerKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The subscription this browser already holds, if any. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Matches PushDeviceDto.endpointHash. */
export async function endpointHash(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

/** A short, private-enough name for the device list. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1) ? 'iPad'
      : /Android/.test(ua) ? 'Android'
        : /Windows/.test(ua) ? 'Windows'
          : /Macintosh/.test(ua) ? 'Mac'
            : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = ua.includes('Edg/') ? 'Edge'
    : ua.includes('Firefox/') ? 'Firefox'
      : ua.includes('Chrome/') ? 'Chrome'
        : ua.includes('Safari/') ? 'Safari' : null;
  return isStandalone() ? `${device} app` : browser ? `${device} ${browser}` : device;
}

/** Must run from a tap or click: browsers only show the permission prompt for a user gesture. */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscriptionJSON> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked for StreetsEmpire. Allow them in your browser or phone settings, then try again.'
      : 'Allow notifications when your browser asks, so alerts can reach this device.');
  }
  const registration = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(vapidPublicKey),
  });
  return subscription.toJSON();
}

/** Stops this browser receiving pushes. Returns the endpoint it had, for the server to forget. */
export async function unsubscribeFromPush(): Promise<string | null> {
  const subscription = await currentSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe().catch(() => false);
  return endpoint;
}
