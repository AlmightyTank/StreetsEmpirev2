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

/** Header-only dismissal; never inspect page or directory scroll gestures. */
export function isSheetDismissSwipe(startX: number, startY: number, endX: number, endY: number, direction: 'up' | 'down'): boolean {
  const vertical = (endY - startY) * (direction === 'down' ? 1 : -1);
  return vertical >= 48 && vertical > Math.abs(endX - startX) * 1.5;
}
