import { describe, expect, it } from 'vitest';
import { nearestAnchorAbove, nextQuestViewportTop, shouldScrollFocusedQuest } from '../questViewport.js';
import { lockTourAnchor, questTourAnchor, questTourAttributes, tourAnchorIsLive } from '../questTourAnchor.js';

const quest = (key: string, status: string, branches = 0) => ({
  key,
  status,
  branchChoices: Array.from({ length: branches }, (_, index) => index),
});

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
});

describe('quest tour anchor', () => {
  const groups = [
    { quests: [quest('ready-side', 'READY_TO_TURN_IN'), quest('branch', 'READY_TO_TURN_IN', 2)] },
    { quests: [quest('side-open', 'AVAILABLE'), quest('other-open', 'AVAILABLE')] },
  ];

  it('spotlights the featured story instead of the first job in the virtual list', () => {
    expect(questTourAnchor('accept-quest', quest('tour', 'AVAILABLE'), groups)).toEqual({ key: 'tour' });
    expect(questTourAnchor('complete-quest', quest('tour', 'READY_TO_TURN_IN'), groups)).toEqual({ key: 'tour' });
  });

  it('skips permanent choices and falls through the board in order', () => {
    expect(questTourAnchor('complete-quest', quest('tour', 'ACTIVE'), groups)).toEqual({ key: 'ready-side' });
    expect(questTourAnchor('accept-quest', quest('tour', 'ACTIVE'), groups)).toEqual({ key: 'side-open' });
    expect(questTourAnchor('scout', quest('tour', 'AVAILABLE'), groups)).toBeNull();
  });

  it('does not move onto the next job after the anchored one is accepted or collected', () => {
    const locked = lockTourAnchor(null, 'accept-quest', { key: 'tour' });
    expect(lockTourAnchor(locked, 'accept-quest', { key: 'side-open' })).toBe(locked);
    expect(lockTourAnchor(locked, 'complete-quest', { key: 'tour' })).toEqual({ step: 'complete-quest', key: 'tour' });
    expect(lockTourAnchor(locked, 'scout', { key: 'side-open' })).toBeNull();
  });

  it('puts the spotlight on the locked action and blocks the other copies', () => {
    expect(questTourAttributes({
      questKey: 'tour', status: 'AVAILABLE', branchChoiceCount: 0, tourStep: 'accept-quest', anchorKey: 'tour', blockOthers: true,
    })).toEqual({ 'data-tour': 'accept-quest' });
    expect(questTourAttributes({
      questKey: 'side-open', status: 'AVAILABLE', branchChoiceCount: 0, tourStep: 'accept-quest', anchorKey: 'tour', blockOthers: true,
    })).toEqual({ 'data-tour-blocked': 'accept-quest' });
    expect(questTourAttributes({
      questKey: 'side-open', status: 'AVAILABLE', branchChoiceCount: 0, tourStep: 'accept-quest', anchorKey: 'tour', blockOthers: false,
    })).toEqual({});
    expect(questTourAttributes({
      questKey: 'branch', status: 'READY_TO_TURN_IN', branchChoiceCount: 2, tourStep: 'complete-quest', anchorKey: 'tour', blockOthers: true,
    })).toEqual({});
    expect(questTourAttributes({
      questKey: 'tour', status: 'READY_TO_TURN_IN', branchChoiceCount: 0, tourStep: 'complete-quest', anchorKey: 'tour', blockOthers: true,
    })).toEqual({ 'data-tour': 'complete-quest' });
  });

  it('stops blocking the rest of the board once the anchored job is no longer actionable', () => {
    expect(tourAnchorIsLive('accept-quest', 'tour', quest('tour', 'ACTIVE'), groups)).toBe(false);
    expect(tourAnchorIsLive('accept-quest', 'tour', quest('tour', 'AVAILABLE'), groups)).toBe(true);
    expect(tourAnchorIsLive('complete-quest', 'ready-side', quest('tour', 'ACTIVE'), groups)).toBe(true);
  });
});
