import { describe, expect, it } from 'vitest';
import { classicOgV07P } from '../classic-og-v0.7-p/index.js';
import { branchingQuests } from '../classic-og-v0.7-q/branching-quests.js';
import { classicOgV07Q } from '../classic-og-v0.7-q/index.js';
import { hideoutV2For, hideoutV2Problems } from '../hideout-v2.js';

describe('quest roadmap Phase R branching Jobs', () => {
  it('preserves Q and adds one fork with two exclusive follow-ups', () => {
    expect(Object.keys(classicOgV07P.questDefinitions ?? {})).toHaveLength(51);
    expect(Object.keys(branchingQuests)).toHaveLength(3);
    expect(Object.keys(classicOgV07Q.questDefinitions ?? {})).toHaveLength(54);
    expect(branchingQuests.TAKING_SIDES.branches).toHaveLength(2);
    expect(branchingQuests.TAKING_SIDES.branches.map((branch) => branch.key)).toEqual(['PIP', 'TOMMY']);
  });

  it('makes each follow-up require its exact committed branch', () => {
    expect(branchingQuests.PIP_AFTER_HOURS.prerequisites).toEqual([{
      kind: 'BRANCH_CHOSEN',
      params: { questKey: 'TAKING_SIDES', branchKey: 'PIP' },
    }]);
    expect(branchingQuests.TOMMY_BACK_ROOM.prerequisites).toEqual([{
      kind: 'BRANCH_CHOSEN',
      params: { questKey: 'TAKING_SIDES', branchKey: 'TOMMY' },
    }]);
  });

  it('gives opposite reputation consequences and meaningful early access', () => {
    const pip = branchingQuests.TAKING_SIDES.branches[0]!;
    const tommy = branchingQuests.TAKING_SIDES.branches[1]!;

    expect(pip.reputationDeltas).toEqual([
      { contactKey: 'PIP', amount: 25 },
      { contactKey: 'TOMMY', amount: -10 },
    ]);
    expect(tommy.reputationDeltas).toEqual([
      { contactKey: 'TOMMY', amount: 25 },
      { contactKey: 'PIP', amount: -10 },
    ]);
    expect(pip.rewards).toContainEqual({ kind: 'PERMANENT_UNLOCK', key: 'PRODUCT_HEROIN_ACCESS' });
    expect(tommy.rewards).toContainEqual({ kind: 'PERMANENT_UNLOCK', key: 'WEAPON_TEK9_ACCESS' });
  });

  it('inherits secret/daily/weekly/favor/unlock/Hideout behavior unchanged', () => {
    for (const key of Object.keys(classicOgV07P.questDefinitions ?? {})) {
      expect(classicOgV07Q.questDefinitions?.[key]).toEqual(classicOgV07P.questDefinitions?.[key]);
    }
    expect(classicOgV07Q.favors).toEqual(classicOgV07P.favors);
    expect(classicOgV07Q.permanentUnlocks).toEqual(classicOgV07P.permanentUnlocks);
    expect(hideoutV2For(classicOgV07Q)).toEqual(hideoutV2For(classicOgV07P));
    expect(hideoutV2Problems(classicOgV07Q)).toEqual([]);
  });
});
