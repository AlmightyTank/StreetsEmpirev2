import { describe, expect, it } from 'vitest';
import { nearestAnchorAbove, nextQuestViewportTop, pinStillHolding, shouldScrollFocusedQuest } from '../questViewport.js';

describe('quest viewport anchor', () => {
  const candidates = [
    { id: 'topbar', top: 0, containsCard: false, fixedOrSticky: true, visible: true },
    { id: 'quest-board-ready', top: 420, containsCard: true, fixedOrSticky: false, visible: true },
    { id: 'quest-earlier', top: 460, containsCard: false, fixedOrSticky: false, visible: true },
    { id: 'quest-acted-title', top: 820, containsCard: true, fixedOrSticky: false, visible: true },
    { id: 'quest-later', top: 1100, containsCard: false, fixedOrSticky: false, visible: true },
    { id: 'hidden', top: 400, containsCard: false, fixedOrSticky: false, visible: false },
  ];

  it('holds the closest real element above the job that was just updated', () => {
    expect(nearestAnchorAbove(800, candidates)).toEqual({ id: 'quest-earlier', top: 460 });
  });

  it('keeps that element on the same pixel when content above it changes', () => {
    expect(nextQuestViewportTop({ scrollY: 900, aboveTop: 460 }, 520)).toBe(960);
    expect(nextQuestViewportTop({ scrollY: 900, aboveTop: 460 }, null)).toBe(900);
    expect(nextQuestViewportTop({ scrollY: 40, aboveTop: 10 }, -80)).toBe(0);
  });

  it('scrolls a deep link once, not again when the board refreshes', () => {
    expect(shouldScrollFocusedQuest({
      focusKey: 'FIRST', requestId: 1, handledRequestId: 0, questIndex: 4,
    })).toBe(true);
    expect(shouldScrollFocusedQuest({
      focusKey: 'FIRST', requestId: 1, handledRequestId: 1, questIndex: 4,
    })).toBe(false);
    expect(shouldScrollFocusedQuest({
      focusKey: 'FIRST', requestId: 1, handledRequestId: 0, questIndex: -1,
    })).toBe(false);
    expect(shouldScrollFocusedQuest({
      focusKey: null, requestId: 2, handledRequestId: 0, questIndex: 0,
    })).toBe(false);
  });

  it('holds through a slow request and lets go only after the update is marked settled', () => {
    expect(pinStillHolding(5_000, null)).toBe(true);
    expect(pinStillHolding(1_000, 1_800)).toBe(true);
    expect(pinStillHolding(1_800, 1_800)).toBe(false);
  });
});
