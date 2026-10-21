import { describe, expect, it } from 'vitest';
import { classicOgV18S } from '../classic-og-v1.8-s/index.js';
import { classicOgV24A } from '../classic-og-v2.4-a/index.js';
import { commissionerArcs } from '../classic-og-v2.4-a/commissioner-arcs.js';
import type { QuestDefinition } from '../types.js';

const current = classicOgV24A.questDefinitions as Record<string, QuestDefinition>;

describe('v2.4 Commissioner law arc', () => {
  it('connects the referral to a lore-rich, evidence-driven arc', () => {
    expect(current.BOARD_REFERRAL_COMMISSIONER?.followUpKeys).toContain('BOARD_COMMISSIONER_BADGE_IN_DARK');
    for (const quest of Object.values(commissionerArcs)) {
      expect(current[quest.key]).toBeDefined();
      expect(quest.contactKey).toBe('COMMISSIONER');
      expect(quest.description.length).toBeGreaterThan(60);
      expect(quest.story?.intro.length).toBeGreaterThan(20);
      expect(quest.story?.inProgress.length).toBeGreaterThan(20);
      expect(quest.story?.ready.length).toBeGreaterThan(20);
      expect(quest.story?.completed.length).toBeGreaterThan(20);
      expect(quest.story?.lesson.length).toBeGreaterThan(20);
      expect(quest.story?.actionHint.length).toBeGreaterThan(20);
    }
  });

  it('uses existing law evidence and protection events only', () => {
    const allowed = new Set([
      'CASE_STAGE_UP', 'CASE_COOLED', 'INFORMANT_TIP', 'COMBAT_RECON',
      'LAWYER_RETAINED', 'WARRANT_LAWYERED', 'WARRANT_QUASHED', 'CAPTAIN_TIP',
    ]);
    for (const quest of Object.values(commissionerArcs)) {
      for (const objective of quest.objectives) {
        for (const eventType of objective.params?.eventTypes ?? []) expect(allowed.has(eventType)).toBe(true);
      }
      for (const objective of quest.bonusObjectives) {
        for (const eventType of objective.params?.eventTypes ?? []) expect(allowed.has(eventType)).toBe(true);
      }
    }
  });

  it('is only added to the current v2.4 catalog', () => {
    expect(current.BOARD_COMMISSIONER_BADGE_IN_DARK).toBeDefined();
    expect((classicOgV18S.questDefinitions as Record<string, QuestDefinition>).BOARD_COMMISSIONER_BADGE_IN_DARK).toBeUndefined();
  });
});
