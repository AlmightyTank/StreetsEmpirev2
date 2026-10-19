import { describe, expect, it } from 'vitest';
import { rulesets, type QuestDefinition } from '@streets/rulesets';
import { ACCOUNT_TRUST_GATES, experienceRequiredForLevel, questExperience } from '@streets/shared';

/** Story quests that must be claimed before `questKey` opens, following QUEST_COMPLETED prerequisites. */
function storyChainBefore(quests: Record<string, QuestDefinition>, questKey: string): QuestDefinition[] {
  const chain: QuestDefinition[] = [];
  const seen = new Set<string>();
  let key = (quests[questKey]?.prerequisites ?? []).find((p) => p.kind === 'QUEST_COMPLETED')?.params?.questKey as string | undefined;
  while (key && !seen.has(key) && quests[key]) {
    seen.add(key);
    chain.push(quests[key]!);
    key = (quests[key]!.prerequisites ?? []).find((p) => p.kind === 'QUEST_COMPLETED')?.params?.questKey as string | undefined;
  }
  return chain;
}

describe('account level unlocks never block the tutorial', () => {
  it('reaches the runs level from quest XP alone before the tutorial asks for a run', () => {
    const needed = experienceRequiredForLevel(ACCOUNT_TRUST_GATES.runs.level);
    let checked = 0;
    for (const ruleset of Object.values(rulesets)) {
      const quests = (ruleset.questDefinitions ?? {}) as Record<string, QuestDefinition>;
      if (!quests.PACK_YOUR_BAGS) continue;
      const earned = storyChainBefore(quests, 'PACK_YOUR_BAGS').reduce((total, quest) => total + questExperience(quest.type), 0);
      expect(earned, ruleset.meta.id).toBeGreaterThanOrEqual(needed);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('opens the road in order: runs, then boss runs, then moving cities', () => {
    expect(ACCOUNT_TRUST_GATES.runs.level).toBeLessThan(ACCOUNT_TRUST_GATES.bossRuns.level);
    expect(ACCOUNT_TRUST_GATES.bossRuns.level).toBeLessThan(ACCOUNT_TRUST_GATES.travel.level);
  });
});
