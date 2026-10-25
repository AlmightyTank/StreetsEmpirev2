export interface TourQuestRef {
  key: string;
  status: string;
  branchChoices?: readonly unknown[];
}

const ACCEPT = 'accept-quest';
const COMPLETE = 'complete-quest';

function matchesStep(step: typeof ACCEPT | typeof COMPLETE, quest: TourQuestRef): boolean {
  if (step === ACCEPT) return quest.status === 'AVAILABLE';
  return quest.status === 'READY_TO_TURN_IN' && !(quest.branchChoices?.length);
}

/**
 * The job the accept/collect spotlight is allowed to sit on.
 * The featured story wins; otherwise the first matching job in board order.
 */
export function questTourAnchor(
  step: string | null,
  featured: TourQuestRef | null,
  groups: readonly { quests: readonly TourQuestRef[] }[],
): { key: string } | null {
  if (step !== ACCEPT && step !== COMPLETE) return null;
  if (featured && matchesStep(step, featured)) return { key: featured.key };
  for (const group of groups) {
    const quest = group.quests.find((item) => matchesStep(step, item));
    if (quest) return { key: quest.key };
  }
  return null;
}

/**
 * Keep the spotlight on the job it started on. After accept or collect, the
 * board's next matching job must not become the new target.
 */
export function lockTourAnchor(
  current: { step: string; key: string } | null,
  step: string | null,
  candidate: { key: string } | null,
): { step: string; key: string } | null {
  if (step !== ACCEPT && step !== COMPLETE) return null;
  if (current?.step === step && current.key) return current;
  if (!candidate) return null;
  return { step, key: candidate.key };
}

/** True while the locked job is still the accept or collect action. */
export function tourAnchorIsLive(
  step: string | null,
  anchorKey: string | null,
  featured: TourQuestRef | null,
  groups: readonly { quests: readonly TourQuestRef[] }[],
): boolean {
  if (!anchorKey || (step !== ACCEPT && step !== COMPLETE)) return false;
  const quests = [...(featured ? [featured] : []), ...groups.flatMap((group) => group.quests)];
  const quest = quests.find((item) => item.key === anchorKey);
  return Boolean(quest && matchesStep(step, quest));
}

/**
 * Only the locked job is highlighted. Other matching actions stay blocked
 * until that job is accepted or collected, then the spotlight leaves instead
 * of jumping to the next one.
 */
export function questTourAttributes(input: {
  questKey: string;
  status: string;
  branchChoiceCount: number;
  tourStep: string | null;
  anchorKey: string | null;
  blockOthers: boolean;
}): { 'data-tour'?: 'accept-quest' | 'complete-quest'; 'data-tour-blocked'?: 'accept-quest' | 'complete-quest' } {
  const target = input.tourStep === ACCEPT && input.status === 'AVAILABLE'
    ? ACCEPT
    : input.tourStep === COMPLETE && input.status === 'READY_TO_TURN_IN' && input.branchChoiceCount === 0
      ? COMPLETE
      : null;
  if (!target) return {};
  if (input.questKey === input.anchorKey) return { 'data-tour': target };
  if (!input.blockOthers) return {};
  return { 'data-tour-blocked': target };
}
