import { describe, expect, it } from 'vitest';
import { classicOgV24A } from '../classic-og-v2.4-a/index.js';
import { starterContactArcs } from '../classic-og-v2.4-a/contact-arcs.js';
import { referralArcs } from '../classic-og-v2.4-a/referral-arcs.js';
import type { QuestDefinition } from '../types.js';

const pairs = [
  ['BOARD_MAMA_FIRST_LOOK', 'BOARD_MAMA_NIGHT_PULSE'],
  ['BOARD_TOMMY_MUSCLE', 'BOARD_TOMMY_FIRST_ARMORY'],
  ['BOARD_PIP_FIRST_BATCH', 'BOARD_PIP_FIRST_SALE'],
  ['BOARD_WHEELS_FIRST_RUN', 'BOARD_WHEELS_RETURN_TICKET'],
  ['BOARD_BLOCKS_MARK_CORNER', 'BOARD_BLOCKS_HOLD_THE_LINE'],
] as const;

describe('v2.4 starter contact arcs', () => {
  it('chains one lore-rich follow-up from every starter lead', () => {
    for (const [leadKey, arcKey] of pairs) {
      const lead = (classicOgV24A.questDefinitions as Record<string, QuestDefinition>)[leadKey];
      const arc = starterContactArcs[arcKey];
      expect(lead?.followUpKeys).toContain(arcKey);
      expect(arc.prerequisites).toEqual([{ kind: 'QUEST_COMPLETED', params: { questKey: leadKey } }]);
      expect(arc.contactKey).toBe(lead?.contactKey);
      expect(arc.description.length).toBeGreaterThan(40);
      expect(arc.story?.intro.length).toBeGreaterThan(20);
      expect(arc.story?.inProgress.length).toBeGreaterThan(20);
      expect(arc.story?.ready.length).toBeGreaterThan(20);
      expect(arc.story?.completed.length).toBeGreaterThan(20);
      expect(arc.story?.lesson.length).toBeGreaterThan(20);
      expect(arc.story?.actionHint.length).toBeGreaterThan(20);
      expect(arc.objectives.length).toBeGreaterThan(0);
    }
  });

  it('keeps all five follow-ups available in the current catalog', () => {
    for (const [, arcKey] of pairs) expect((classicOgV24A.questDefinitions as Record<string, QuestDefinition>)[arcKey]).toBeDefined();
  });

  it('opens exactly one referral contact from each starter arc', () => {
    const referrals = [
      ['BOARD_MAMA_NIGHT_PULSE', 'BOARD_REFERRAL_BLOCKS', 'BLOCKS'],
      ['BOARD_TOMMY_FIRST_ARMORY', 'BOARD_REFERRAL_VIC', 'VIC'],
      ['BOARD_PIP_FIRST_SALE', 'BOARD_REFERRAL_LEDGER', 'LEDGER'],
      ['BOARD_WHEELS_RETURN_TICKET', 'BOARD_REFERRAL_ACE', 'ACE'],
      ['BOARD_BLOCKS_HOLD_THE_LINE', 'BOARD_REFERRAL_COMMISSIONER', 'COMMISSIONER'],
    ] as const;
    for (const [arcKey, referralKey, contactKey] of referrals) {
      const arc = (classicOgV24A.questDefinitions as Record<string, QuestDefinition>)[arcKey]!;
      const referral = referralArcs[referralKey]!;
      expect(arc.followUpKeys).toContain(referralKey);
      expect(referral.prerequisites).toEqual([{ kind: 'QUEST_COMPLETED', params: { questKey: arcKey } }]);
      expect(referral.contactKey).toBe(contactKey);
      expect(referral.objectives[0]?.params).toMatchObject({ eventTypes: ['QUEST_ACCEPTED'] });
      expect((classicOgV24A.contacts ?? {})[contactKey]).toBeDefined();
    }
  });
});
