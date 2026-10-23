import type { CareerStoryArcDefinition } from '@streets/shared';

export function careerStoryBranchBudget(arc: CareerStoryArcDefinition) {
  return arc.chapters.flatMap((chapter) => chapter.branches.map((branch) => ({ chapterKey: chapter.key, branchKey: branch.key, competitiveCents: 0, permanentPower: 0, cosmeticSlots: arc.rewardBudget.cosmeticSlots, rewardKind: branch.reward.kind })));
}

export function careerStoryBranchesAreEquivalent(arc: CareerStoryArcDefinition): boolean {
  return arc.chapters.every((chapter) => {
    const budgets = chapter.branches.map((branch) => ({ kind: branch.reward.kind, power: 0 }));
    return budgets.length > 1 && budgets.every((budget) => budget.kind === budgets[0]!.kind && budget.power === 0);
  });
}
