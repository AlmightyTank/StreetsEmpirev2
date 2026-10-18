import { describe, expect, it } from 'vitest';
import { isMobileNavSwipe, isSheetDismissSwipe } from './mobileNavSwipe.js';

describe('mobile All pages sheet gestures', () => {
  it('opens the sheet on a deliberate upward swipe from the tab bar', () => {
    expect(isMobileNavSwipe(120, 600, 128, 510, 'up')).toBe(true);
    expect(isMobileNavSwipe(120, 600, 128, 510, 'down')).toBe(false);
  });

  it('dismisses the bottom sheet on a deliberate downward swipe on its handle', () => {
    expect(isMobileNavSwipe(120, 220, 128, 320, 'down')).toBe(true);
    expect(isMobileNavSwipe(120, 220, 128, 320, 'up')).toBe(false);
  });

  it('does not treat taps or short movement as drawer gestures', () => {
    expect(isMobileNavSwipe(120, 220, 120, 220, 'down')).toBe(false);
    expect(isMobileNavSwipe(120, 220, 120, 280, 'down')).toBe(false);
    expect(isMobileNavSwipe(120, 600, 120, 540, 'up')).toBe(false);
  });

  it('ignores mostly horizontal gestures', () => {
    expect(isMobileNavSwipe(100, 220, 205, 300, 'down')).toBe(false);
    expect(isMobileNavSwipe(100, 500, 205, 420, 'up')).toBe(false);
  });
});

describe('All pages dismiss gesture', () => {
  it('recognizes a deliberate header pull', () => {
    expect(isSheetDismissSwipe(120, 180, 124, 242, 'down')).toBe(true);
  });
  it('ignores small, sideways, and opposite-direction gestures', () => {
    expect(isSheetDismissSwipe(120, 180, 120, 202, 'down')).toBe(false);
    expect(isSheetDismissSwipe(120, 180, 210, 240, 'down')).toBe(false);
    expect(isSheetDismissSwipe(120, 180, 120, 110, 'down')).toBe(false);
  });
});
