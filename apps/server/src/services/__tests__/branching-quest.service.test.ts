import { describe, expect, it } from 'vitest';
import { classicOgV07Q } from '@streets/rulesets';
import { questPrerequisitesMet, resolveQuestBranchForClaim } from '../handcrafted-quest.service.js';

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

  it('requires and validates a branch only on branching Jobs', () => {
    const parent = classicOgV07Q.questDefinitions!.TAKING_SIDES!;
    expect(() => resolveQuestBranchForClaim(parent, undefined, null)).toThrow('Choose a side');
    expect(() => resolveQuestBranchForClaim(parent, 'NOPE', null)).toThrow('not available');
    expect(resolveQuestBranchForClaim(parent, 'PIP', null)?.key).toBe('PIP');
    expect(() => resolveQuestBranchForClaim(parent, 'TOMMY', 'PIP')).toThrow('already has a different committed choice');

    const linear = classicOgV07Q.questDefinitions!.PIP_AFTER_HOURS!;
    expect(resolveQuestBranchForClaim(linear, undefined, null)).toBeNull();
    expect(() => resolveQuestBranchForClaim(linear, 'PIP', null)).toThrow('does not have a branch choice');
  });

  it('keeps both follow-ups locked before a branch is committed', () => {
    expect(questPrerequisitesMet(pipFollowUp, completed, {}, {})).toBe(false);
    expect(questPrerequisitesMet(tommyFollowUp, completed, {}, {})).toBe(false);
  });
});
