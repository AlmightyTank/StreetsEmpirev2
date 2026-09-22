import { describe, expect, it } from 'vitest';
import { classicOgV07Q } from '@streets/rulesets';
import { questPrerequisitesMet } from '../handcrafted-quest.service.js';

describe('branching Job prerequisites', () => {
  const completed = new Set(['TAKING_SIDES']);
  const pipFollowUp = classicOgV07Q.questDefinitions!.PIP_AFTER_HOURS!;
  const tommyFollowUp = classicOgV07Q.questDefinitions!.TOMMY_BACK_ROOM!;

  it('unlocks only the follow-up matching the committed branch', () => {
    expect(questPrerequisitesMet(
      pipFollowUp,
      completed,
      {},
      { TAKING_SIDES: 'PIP' },
    )).toBe(true);
    expect(questPrerequisitesMet(
      tommyFollowUp,
      completed,
      {},
      { TAKING_SIDES: 'PIP' },
    )).toBe(false);

    expect(questPrerequisitesMet(
      pipFollowUp,
      completed,
      {},
      { TAKING_SIDES: 'TOMMY' },
    )).toBe(false);
    expect(questPrerequisitesMet(
      tommyFollowUp,
      completed,
      {},
      { TAKING_SIDES: 'TOMMY' },
    )).toBe(true);
  });

  it('keeps both follow-ups locked before a branch is committed', () => {
    expect(questPrerequisitesMet(pipFollowUp, completed, {}, {})).toBe(false);
    expect(questPrerequisitesMet(tommyFollowUp, completed, {}, {})).toBe(false);
  });
});
