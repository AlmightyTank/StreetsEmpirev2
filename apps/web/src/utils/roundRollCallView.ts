/** Which reward is today's check-in, or null once today no longer earns a stamp. */
export function todayRewardTier(board: {
  stamps: number;
  requiredStamps: number;
  alreadyCheckedInToday: boolean;
  canCheckInToday: boolean;
}): number | null {
  if (board.requiredStamps <= 0) return null;
  if (board.alreadyCheckedInToday && board.stamps > 0) {
    return Math.min(board.stamps, board.requiredStamps);
  }
  if (board.canCheckInToday) return Math.min(board.stamps + 1, board.requiredStamps);
  return null;
}

/**
 * Six-card window that keeps today's reward on screen. Claimed history stays
 * put; this only chooses which slice is visible.
 */
export function rollCallWindowStart(
  length: number,
  focusIndex: number,
  todayTier: number | null,
  windowSize = 6,
): number {
  if (length <= windowSize) return 0;
  const todayIndex = todayTier != null && todayTier >= 1 ? todayTier - 1 : -1;
  const anchor = todayIndex >= 0 ? todayIndex : (focusIndex >= 0 ? focusIndex : length - 1);
  const centered = anchor - Math.floor((windowSize - 1) / 2);
  return Math.max(0, Math.min(length - windowSize, centered));
}

/**
 * Milliseconds until the next round day. A boundary that is already due waits
 * a minute so a fast client clock cannot check in again every second.
 */
export function nextRoundRollCallDelayMs(nextDayAt: string | null | undefined, now = Date.now()): number | null {
  if (!nextDayAt) return null;
  const at = new Date(nextDayAt).getTime();
  if (!Number.isFinite(at)) return null;
  const delay = at - now;
  if (delay <= 0) return 60_000;
  return delay;
}
