import { describe, expect, it } from 'vitest';
import { buildQuestBoard, legacyQuestGroup, type QuestBoardItem } from '../questBoard.js';

const quest = (key: string, type: QuestBoardItem['type'], status: QuestBoardItem['status'], tracked = false): QuestBoardItem =>
  ({ key, type, category: type, status, isTracked: tracked });

describe('single-page quest board', () => {
  it('always features the current story ahead of ready non-story jobs', () => {
    const jobs = [quest('daily', 'DAILY', 'READY_TO_TURN_IN'), quest('story-next', 'STORY', 'AVAILABLE'), quest('story-active', 'STORY', 'ACTIVE')];
    const board = buildQuestBoard(jobs);
    expect(board.featuredStory?.key).toBe('story-active');
    expect(board.groups.find((group) => group.key === 'ready')?.quests.map((q) => q.key)).toEqual(['daily']);
    expect(board.groups.find((group) => group.key === 'story')?.quests.map((q) => q.key)).toEqual(['story-next']);
  });

  it('shows only the next locked story step when no playable story is present', () => {
    const board = buildQuestBoard([
      quest('finished', 'STORY', 'COMPLETED'),
      quest('next', 'STORY', 'LOCKED'),
      quest('future', 'STORY', 'LOCKED'),
      quest('bonus', 'SIDE', 'LOCKED'),
    ]);
    expect(board.featuredStory?.key).toBe('next');
    expect(board.groups.find((group) => group.key === 'story')).toBeUndefined();
    expect(board.groups.find((group) => group.key === 'history')?.quests.map((q) => q.key)).toEqual(['finished']);
  });

  it('keeps every visible job exactly once and separates contract boards from history', () => {
    const jobs = [
      quest('story', 'STORY', 'ACTIVE'),
      quest('tracked', 'SIDE', 'ACTIVE', true),
      quest('ready', 'EVENT', 'READY_TO_TURN_IN'),
      quest('week', 'WEEKLY', 'AVAILABLE'),
      quest('city', 'CITY_CONTRACT', 'AVAILABLE'),
      quest('done', 'DAILY', 'EXPIRED'),
    ];
    const board = buildQuestBoard(jobs);
    const keys = [board.featuredStory!.key, ...board.groups.flatMap((group) => group.quests.map((q) => q.key))];
    expect(keys).toEqual(['story', 'ready', 'tracked', 'week', 'city', 'done']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('shows a deep-linked locked job without flooding the board with locked quests', () => {
    const board = buildQuestBoard([quest('a', 'SIDE', 'LOCKED'), quest('b', 'SIDE', 'LOCKED')], 'b');
    expect(board.groups.flatMap((group) => group.quests.map((q) => q.key))).toEqual(['b']);
  });

  it('preserves old tab links as group hints without adding a tab bar', () => {
    expect(legacyQuestGroup('?tab=tracked')).toBe('active');
    expect(legacyQuestGroup('?tab=completed')).toBe('history');
    expect(legacyQuestGroup('?tab=weekly')).toBe('weekly');
    expect(legacyQuestGroup('')).toBeNull();
  });
});
