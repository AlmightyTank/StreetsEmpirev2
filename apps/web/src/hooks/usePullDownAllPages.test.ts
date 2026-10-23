import { describe, expect, it } from 'vitest';
import { isPullDownGesture } from './usePullDownAllPages.js';

describe('mobile All pages pull-down recognition', () => {
  it('opens on a deliberate straight downward drag', () => {
    expect(isPullDownGesture(120, 250, 126, 355)).toBe(true);
  });

  it('does not open for ordinary short scrolling or taps', () => {
    expect(isPullDownGesture(120, 250, 120, 326)).toBe(false);
    expect(isPullDownGesture(120, 250, 120, 250)).toBe(false);
  });

  it('does not open when swiping sideways through page content', () => {
    expect(isPullDownGesture(120, 250, 230, 360)).toBe(false);
  });

  it('does not open on an upward swipe', () => {
    expect(isPullDownGesture(120, 250, 120, 110)).toBe(false);
  });

  it('permits minor sideways movement while pulling down', () => {
    expect(isPullDownGesture(120, 250, 160, 355)).toBe(true);
  });
});
