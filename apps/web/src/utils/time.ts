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
