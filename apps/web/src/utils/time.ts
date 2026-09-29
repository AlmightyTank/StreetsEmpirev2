/** 18d 04h - round countdowns. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return 'ended';

  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${String(hours).padStart(2, '0')}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

type When = string | number | Date;
const toDate = (value: When) => (value instanceof Date ? value : new Date(value));

/**
 * 1.0.0-G. Every date and time in the game goes through these, in the player's own
 * locale and time zone, never with seconds. A bare toLocaleString() prints
 * "9/27/2026, 1:05:23 AM" on one screen and something else on the next.
 */

/** Sep 27, 1:05 AM (the year only when it is not this year). */
export function formatWhen(value: When): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), hour: 'numeric', minute: '2-digit' });
}

/** Sat 1:05 AM: for things coming up within the week (landings, returns, windows). */
export function formatWeekdayTime(value: When): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

/** 1:05 AM */
export function formatClockTime(value: When): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Time since `iso`, short: "just now", "12m", "5h", "3d". */
export function formatElapsed(value: When, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - toDate(value).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

/** "12m ago", "5h ago", "just now". */
export function formatAgo(value: When, now = Date.now()): string {
  const elapsed = formatElapsed(value, now);
  return elapsed === 'just now' ? elapsed : `${elapsed} ago`;
}

/** A live countdown: 04:18 under an hour, 1:04:18 over it. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

/** 7 Sep 2026 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}


/**
 * Estimate server/client wall-clock offset from one request.
 *
 * The response's server timestamp is compared with the midpoint of the local
 * request interval, which compensates for ordinary round-trip latency while
 * preventing a skewed browser wall clock from controlling server expiries.
 */
export function serverClockOffsetMs(
  serverTime: string,
  requestStartedAtMs: number,
  responseReceivedAtMs: number,
): number {
  const serverMs = Date.parse(serverTime);
  if (!Number.isFinite(serverMs)) return 0;
  const midpoint = requestStartedAtMs + Math.max(0, responseReceivedAtMs - requestStartedAtMs) / 2;
  return serverMs - midpoint;
}

export function serverAdjustedNowMs(clientNowMs: number, offsetMs: number): number {
  return clientNowMs + offsetMs;
}
