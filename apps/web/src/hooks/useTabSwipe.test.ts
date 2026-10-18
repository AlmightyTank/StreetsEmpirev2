import { describe, expect, it } from 'vitest';
import { classifySwipe, neighborTabIndex } from './useTabSwipe.js';

describe('classifySwipe', () => {
  it('reads the direction of a straight swipe', () => {
    expect(classifySwipe(-120, 10, 200)).toBe('left');
    expect(classifySwipe(120, -10, 200)).toBe('right');
    expect(classifySwipe(5, -90, 200)).toBe('up');
    expect(classifySwipe(-5, 90, 200)).toBe('down');
  });

  it('honours a shorter minimum distance', () => {
    expect(classifySwipe(0, -30, 150)).toBeNull();
    expect(classifySwipe(0, -30, 150, 24)).toBe('up');
  });

  it('ignores short, diagonal and slow drags', () => {
    expect(classifySwipe(-40, 0, 200)).toBeNull();
    expect(classifySwipe(-120, 100, 200)).toBeNull();
    expect(classifySwipe(80, -100, 200)).toBeNull();
    expect(classifySwipe(-120, 0, 1500)).toBeNull();
  });
});

describe('neighborTabIndex', () => {
  const tab = (selected = false, disabled = false) => ({ selected, disabled });

  it('steps to the adjacent tab', () => {
    const tabs = [tab(), tab(true), tab()];
    expect(neighborTabIndex(tabs, 'next')).toBe(2);
    expect(neighborTabIndex(tabs, 'previous')).toBe(0);
  });

  it('stops at either end instead of wrapping', () => {
    expect(neighborTabIndex([tab(true), tab()], 'previous')).toBeNull();
    expect(neighborTabIndex([tab(), tab(true)], 'next')).toBeNull();
  });

  it('skips disabled tabs', () => {
    expect(neighborTabIndex([tab(true), tab(false, true), tab()], 'next')).toBe(2);
    expect(neighborTabIndex([tab(true), tab(false, true)], 'next')).toBeNull();
  });

  it('does nothing when no tab is selected', () => {
    expect(neighborTabIndex([tab(), tab()], 'next')).toBeNull();
  });
});
