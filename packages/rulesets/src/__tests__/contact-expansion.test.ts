import { describe, expect, it } from 'vitest';
import { advanceQuestObjective } from '../quest-progress.js';
import { hideoutV2For, hideoutV2Problems } from '../hideout-v2.js';
import { classicOgV07K } from '../classic-og-v0.7-k/index.js';
import { classicOgV07L } from '../classic-og-v0.7-l/index.js';
import { contactExpansionQuests } from '../classic-og-v0.7-l/contact-quests.js';

describe('quest roadmap Phase M contact expansion', () => {
  it('adds nine side jobs across Wheels, Vic and Blocks', () => {
    expect(Object.keys(contactExpansionQuests)).toEqual([
      'WHEELS_ROAD_TEST',
      'WHEELS_HEAVY_HAUL',
      'WHEELS_HOME_SAFE',
      'VIC_GREASE_THE_WHEEL',
      'VIC_PRICE_OF_SILENCE',
      'VIC_CLEAN_SLATE',
      'BLOCKS_FORTIFY',
      'BLOCKS_TAKE_SOMETHING',
      'BLOCKS_OUT_OF_TOWN',
    ]);

    const counts = Object.values(contactExpansionQuests).reduce<Record<string, number>>((out, quest) => {
      out[quest.contactKey] = (out[quest.contactKey] ?? 0) + 1;
      return out;
    }, {});

    expect(counts).toEqual({ WHEELS: 3, VIC: 3, BLOCKS: 3 });
    expect(Object.values(contactExpansionQuests).every((quest) => quest.type === 'SIDE')).toBe(true);
  });

  it('raises the handcrafted catalog from 19 to 28 without changing 0.7-K', () => {
    expect(Object.keys(classicOgV07K.questDefinitions ?? {})).toHaveLength(19);
    expect(Object.keys(classicOgV07L.questDefinitions ?? {})).toHaveLength(28);

    expect(classicOgV07L.favors).toEqual(classicOgV07K.favors);
    expect(classicOgV07L.permanentUnlocks).toEqual(classicOgV07K.permanentUnlocks);
    expect(hideoutV2For(classicOgV07L)).toEqual(hideoutV2For(classicOgV07K));
    expect(hideoutV2Problems(classicOgV07L)).toEqual([]);
  });

  it('uses earned contact reputation to open the deeper chains', () => {
    expect(contactExpansionQuests.WHEELS_HEAVY_HAUL.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'WHEELS', points: 30 },
    });
    expect(contactExpansionQuests.WHEELS_HOME_SAFE.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'WHEELS', points: 50 },
    });

    expect(contactExpansionQuests.VIC_PRICE_OF_SILENCE.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'VIC', points: 15 },
    });
    expect(contactExpansionQuests.VIC_CLEAN_SLATE.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'VIC', points: 35 },
    });

    expect(contactExpansionQuests.BLOCKS_TAKE_SOMETHING.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'BLOCKS', points: 35 },
    });
    expect(contactExpansionQuests.BLOCKS_OUT_OF_TOWN.prerequisites).toContainEqual({
      kind: 'CONTACT_REP_AT_LEAST',
      params: { contactKey: 'BLOCKS', points: 55 },
    });
  });

  it('tracks a clean Wheels return separately from a troubled return', () => {
    const objective = contactExpansionQuests.WHEELS_HOME_SAFE.bonusObjectives[0]!;
    expect(advanceQuestObjective(objective, {
      type: 'RUN_RETURNED',
      payload: { incidents: [] },
    }).amount).toBe(1);

    expect(advanceQuestObjective(objective, {
      type: 'RUN_RETURNED',
      payload: { incidents: ['BUST'] },
    }).amount).toBe(0);
  });

  it('only gives Vic clean-slate credit when a bribe actually reaches zero Heat', () => {
    const objective = contactExpansionQuests.VIC_CLEAN_SLATE.objectives[1]!;
    expect(advanceQuestObjective(objective, {
      type: 'HEAT_BRIBE',
      payload: { points: 8, heatBefore: 8, heatAfter: 0, costCents: 100000 },
    }).amount).toBe(1);

    expect(advanceQuestObjective(objective, {
      type: 'HEAT_BRIBE',
      payload: { points: 8, heatBefore: 12, heatAfter: 4, costCents: 100000 },
    }).amount).toBe(0);
  });

  it('credits Blocks only for settled wins and successful outpost establishment', () => {
    const push = contactExpansionQuests.BLOCKS_TAKE_SOMETHING.objectives[0]!;
    expect(advanceQuestObjective(push, {
      type: 'TURF_PUSH_ATTACK',
      payload: { won: true, posted: 12 },
    }).amount).toBe(1);
    expect(advanceQuestObjective(push, {
      type: 'TURF_PUSH_ATTACK',
      payload: { won: false, posted: 0 },
    }).amount).toBe(0);

    const outpost = contactExpansionQuests.BLOCKS_OUT_OF_TOWN.objectives[0]!;
    expect(advanceQuestObjective(outpost, {
      type: 'TURF_OUTPOST_ESTABLISH',
      payload: { won: true, city: 'chicago', cashCents: 1000000 },
    }).amount).toBe(1);
    expect(advanceQuestObjective(outpost, {
      type: 'TURF_OUTPOST_ESTABLISH',
      payload: { won: false, city: 'chicago', cashCents: 0 },
    }).amount).toBe(0);
  });

  it('does not introduce a new reward mechanic in Phase M', () => {
    const kinds = new Set(
      Object.values(contactExpansionQuests).flatMap((quest) => quest.rewards.map((reward) => reward.kind)),
    );
    expect([...kinds].sort()).toEqual(['CASH', 'CONTACT_REP', 'ITEM']);
  });
});
