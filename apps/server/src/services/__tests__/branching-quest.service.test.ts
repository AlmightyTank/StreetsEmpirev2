import { describe, expect, it } from 'vitest';
import { branchingQuests } from '@streets/rulesets/classic-og-v0.7-q/branching-quests.js';
import { questPrerequisitesMet } from '../handcrafted-quest.service.js';

describe('branching Job prerequisites', () => {
  const completed = new Set(['TAKING_SIDES']);

  it('unlocks only the follow-up matching the committed branch', () => {
    expect(questPrerequisitesMet(
      branchingQuests.PIP_AFTER_HOURS,
      completed,
      {},
      { TAKING_SIDES: 'PIP' },
    )).toBe(true);
    expect(questPrerequisitesMet(
      branchingQuests.TOMMY_BACK_ROOM,
      completed,
      {},
      { TAKING_SIDES: 'PIP' },
    )).toBe(false);

    expect(questPrerequisitesMet(
      branchingQuests.PIP_AFTER_HOURS,
      completed,
      {},
      { TAKING_SIDES: 'TOMMY' },
    )).toBe(false);
    expect(questPrerequisitesMet(
      branchingQuests.TOMMY_BACK_ROOM,
      completed,
      {},
      { TAKING_SIDES: 'TOMMY' },
    )).toBe(true);
  });

  it('keeps both follow-ups locked before a branch is committed', () => {
    expect(questPrerequisitesMet(branchingQuests.PIP_AFTER_HOURS, completed, {}, {})).toBe(false);
    expect(questPrerequisitesMet(branchingQuests.TOMMY_BACK_ROOM, completed, {}, {})).toBe(false);
  });
});
