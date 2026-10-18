/**
 * Mobile navigation gestures must be deliberate and directional. Only call this
 * from the fixed tab bar or the sheet handle, never the scrolling game/page grid.
 */
export function isMobileNavSwipe(
  startX: number, startY: number, endX: number, endY: number, direction: 'up' | 'down',
): boolean {
  const vertical = (endY - startY) * (direction === 'down' ? 1 : -1);
  const horizontal = Math.abs(endX - startX);
  return vertical >= 72 && vertical > horizontal * 1.5;
}

/**
 * Distance or a purposeful flick dismisses the sheet. Never make a tiny
 * scroll/tap close navigation; the list itself does not use this gesture.
 * velocity is in pixels per millisecond in the closing direction.
 */
export function shouldDismissSheetDrag(distance: number, velocity: number, sheetHeight: number): boolean {
  if (!Number.isFinite(distance) || !Number.isFinite(velocity) || !Number.isFinite(sheetHeight)
      || distance < 0 || sheetHeight <= 0) return false;
  const threshold = Math.min(96, Math.max(56, sheetHeight * 0.16));
  return distance >= threshold || (distance >= 32 && velocity >= 0.55);
}

/** Dim the sheet backdrop using the cached panel height, without layout reads during a drag. */
export function sheetDragOpacity(distance: number, sheetHeight: number): number {
  if (!Number.isFinite(distance) || !Number.isFinite(sheetHeight) || sheetHeight <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - Math.max(0, distance) / Math.max(240, sheetHeight)));
}
