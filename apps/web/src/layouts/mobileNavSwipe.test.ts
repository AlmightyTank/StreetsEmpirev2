import { describe, expect, it } from 'vitest';
import { isMobileNavSwipe, shouldDismissSheetDrag } from './mobileNavSwipe.js';

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

describe('mobile sheet pull-to-dismiss', () => {
  it('closes on a sufficiently long downward drag', () => {
    expect(shouldDismissSheetDrag(105, 0.15, 640)).toBe(true);
    expect(shouldDismissSheetDrag(60, 0.1, 320)).toBe(true);
  });
  it('closes on a short fast flick, but not on a short slow pull', () => {
    expect(shouldDismissSheetDrag(40, 0.8, 640)).toBe(true);
    expect(shouldDismissSheetDrag(40, 0.05, 640)).toBe(false);
  });
  it('snaps back for taps, wrong-direction swipes, and invalid distances', () => {
    expect(shouldDismissSheetDrag(0, 1, 640)).toBe(false);
    expect(shouldDismissSheetDrag(20, 1, 640)).toBe(false);
    expect(shouldDismissSheetDrag(-20, 0.8, 640)).toBe(false);
    expect(shouldDismissSheetDrag(Number.NaN, 1, 640)).toBe(false);
  });
});
