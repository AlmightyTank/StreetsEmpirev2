import { describe, expect, it } from 'vitest';
import { classicOgV18R, classicOgV18S } from '../index.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import { applyQuestProgress } from '../quest-progress.js';
import type { QuestDataObject, QuestDefinitionCatalog, QuestProgressMap } from '../types.js';
import { tourCampaignQuests } from '../tour-campaign.js';

const ORDER = [
  'TOUR_FIRST_JOB',
  'TOUR_SCOUT',
  'TOUR_SUPPLIES',
  'TOUR_CREW',
  'TOUR_COOK',
  'TOUR_HIDEOUT',
  'TOUR_RAID',
] as const;

const EVENTS: Record<(typeof ORDER)[number], Array<{ type: string; payload: QuestDataObject }>> = {
  TOUR_FIRST_JOB: [{ type: 'QUEST_ACCEPTED', payload: { questKey: 'TOUR_FIRST_JOB' } }],
  TOUR_SCOUT: [{ type: 'SCOUT', payload: { turns: 5 } }],
  TOUR_SUPPLIES: [
    { type: 'STORE_BUY', payload: { item: 'condoms' } },
    { type: 'STORE_BUY', payload: { item: 'beer' } },
  ],
  TOUR_CREW: [{ type: 'SCOUT', payload: { turns: 5, thugs: 1 } }],
  TOUR_COOK: [{ type: 'PRODUCE_CRACK', payload: { turns: 3 } }],
  TOUR_HIDEOUT: [{ type: 'HIDEOUT_UPGRADE', payload: { room: 'safe-room' } }],
  // A lost raid still resolves the attempt.
  TOUR_RAID: [{ type: 'RAID_ATTACK', payload: { won: false } }],
};

describe('guided walkthrough tour campaign', () => {
  it('ships seven ordered story jobs with claim-unlocks-next chaining', () => {
    expect(Object.keys(tourCampaignQuests)).toEqual([...ORDER]);
    for (const quest of Object.values(tourCampaignQuests)) {
      expect(quest.type).toBe('STORY');
      expect(quest.repeatability).toBe('ONCE');
      expect(quest.expiresAfterMinutes).toBeNull();
    }
    expect(tourCampaignQuests.TOUR_FIRST_JOB!.prerequisites).toEqual([]);
    for (let i = 1; i < ORDER.length; i += 1) {
      const prev = ORDER[i - 1]!;
      const key = ORDER[i]!;
      expect(tourCampaignQuests[key]!.prerequisites).toContainEqual({
        kind: 'QUEST_COMPLETED',
        params: { questKey: prev },
      });
      expect(tourCampaignQuests[prev]!.followUpKeys).toEqual([key]);
    }
    expect(tourCampaignQuests.TOUR_RAID!.followUpKeys).toEqual([]);
  });

  it('plays the full chain on real events, including a lost raid', () => {
    const completed = new Set<string>();
    for (const key of ORDER) {
      const quest = tourCampaignQuests[key]!;
      // Prerequisites are satisfiable: every earlier job is already claimed.
      for (const prerequisite of quest.prerequisites) {
        expect(prerequisite.kind).toBe('QUEST_COMPLETED');
        expect(completed.has(prerequisite.params?.questKey as string)).toBe(true);
      }
      let progress: QuestProgressMap = {};
      for (const event of EVENTS[key]) {
        progress = applyQuestProgress(quest.objectives, progress, event).progress;
      }
      expect(
        Object.values(progress).every((row) => row.completed),
        `${key} should complete on its tour events`,
      ).toBe(true);
      completed.add(key);
    }
  });

  it('keeps every reward round-scoped', () => {
    for (const quest of Object.values(tourCampaignQuests)) {
      expect(
        quest.rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK' || reward.kind === 'WEAPON_ACCESS' || reward.kind === 'FACTION_STANDING'),
        quest.key,
      ).toBe(false);
      expect(quest.rewards.length).toBeGreaterThan(0);
    }
  });

  it('ships only in the latest ruleset with a valid catalog', () => {
    const sCatalog = classicOgV18S.questDefinitions as QuestDefinitionCatalog;
    const rCatalog = classicOgV18R.questDefinitions as QuestDefinitionCatalog;
    for (const key of ORDER) {
      expect(sCatalog[key]).toBeDefined();
      expect(rCatalog[key as keyof typeof rCatalog]).toBeUndefined();
    }
    for (const key of Object.keys(rCatalog)) {
      expect(sCatalog[key], `latest ruleset keeps ${key}`).toBeDefined();
    }
    expect(questDefinitionProblems(sCatalog)).toEqual([]);
  });
});
