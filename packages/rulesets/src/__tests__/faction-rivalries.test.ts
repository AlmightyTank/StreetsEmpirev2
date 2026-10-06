import { describe, expect, it } from 'vitest';
import { classicOgV14D } from '../classic-og-v1.4-d/index.js';
import { classicOgV14E } from '../classic-og-v1.4-e/index.js';
import { factionProblems, jobFaction } from '../faction-definitions.js';
import type { FactionKey, QuestDefinition, Ruleset } from '../types.js';

/** The catalogs as plain records, for reading by string key. */
const loose = classicOgV14E as unknown as Ruleset;
const definitions = Object.values(loose.questDefinitions!) as QuestDefinition[];
const tierOf = (definition: QuestDefinition) => definition.prerequisites.find((row) => row.kind === 'FACTION_STANDING_AT_LEAST')?.params?.tier;

describe('1.4.0-E rivalries and Inner Circle ruleset', () => {
  it('is 1.4.0-D plus the lock, the arcs, the introductions and the capstone titles', () => {
    expect(classicOgV14E.meta).toEqual({ id: 'classic-og-v1.4-e', version: '1.4.0-E', name: 'Classic OG - Rivalries & Inner Circle' });
    const { meta: _m, questDefinitions: _q, cosmetics: _c, factionRivalry, ...rest } = classicOgV14E;
    const { meta: _bm, questDefinitions: baseJobs, cosmetics: baseCosmetics, ...base } = classicOgV14D;
    expect(rest).toEqual(base);
    expect(factionRivalry).toEqual({ innerCircleLock: true });
    for (const [key, job] of Object.entries(baseJobs)) expect(loose.questDefinitions![key]).toEqual(job);
    for (const [key, cosmetic] of Object.entries(baseCosmetics)) expect(loose.cosmetics![key]).toEqual(cosmetic);
    expect(factionProblems(classicOgV14E)).toEqual([]);
  });

  it('gives each faction one Connected Job and one Inner Circle capstone that follows it', () => {
    for (const faction of Object.keys(classicOgV14E.factions) as FactionKey[]) {
      const own = definitions.filter((definition) => definition.category === 'FACTION' && jobFaction(classicOgV14E, definition) === faction);
      const connected = own.filter((definition) => tierOf(definition) === 'CONNECTED');
      const capstones = own.filter((definition) => tierOf(definition) === 'INNER_CIRCLE');
      expect(connected, faction).toHaveLength(1);
      expect(capstones, faction).toHaveLength(1);
      expect(capstones[0]!.prerequisites).toContainEqual({ kind: 'QUEST_COMPLETED', params: { questKey: connected[0]!.key } });
    }
  });

  it('pays a capstone only standing and a title, once', () => {
    for (const capstone of definitions.filter((definition) => tierOf(definition) === 'INNER_CIRCLE')) {
      expect(capstone.repeatability).toBe('ONCE');
      expect(capstone.rewards.map((reward) => reward.kind).sort()).toEqual(['COSMETIC_UNLOCK', 'FACTION_STANDING']);
      const title = capstone.rewards.find((reward) => reward.kind === 'COSMETIC_UNLOCK')!.key!;
      expect(loose.cosmetics![title]).toMatchObject({ kind: 'TITLE_BADGE' });
    }
  });

  it('offers one paid introduction per faction from Vic, open only below Known', () => {
    const introductions = definitions.filter((definition) => definition.introduces);
    expect(introductions.map((definition) => definition.introduces).sort()).toEqual(Object.keys(classicOgV14E.factions).sort());
    for (const introduction of introductions) {
      expect(introduction.contactKey).toBe('VIC');
      expect(introduction.fee?.minCents).toBeGreaterThan(0);
      expect(introduction.rewards).toEqual([]);
      expect(introduction.prerequisites).toEqual([{ kind: 'FACTION_STANDING_BELOW', params: { factionKey: introduction.introduces, tier: 'KNOWN' } }]);
    }
  });

  it('keeps Inner Circle out of reach of one-time Jobs alone for every faction', () => {
    const supply: Partial<Record<FactionKey, number>> = {};
    for (const definition of definitions) {
      if (definition.repeatability !== 'ONCE' || tierOf(definition) === 'INNER_CIRCLE' || ['DAILY', 'WEEKLY', 'CITY_CONTRACT', 'SEASON', 'ALLIANCE'].includes(definition.type)) continue;
      for (const reward of definition.rewards) {
        const faction = reward.kind === 'FACTION_STANDING' ? reward.key as FactionKey
          : reward.kind === 'CONTACT_REP' ? loose.contacts?.[reward.key as keyof NonNullable<Ruleset['contacts']>]?.factionKey : undefined;
        if (faction) supply[faction] = (supply[faction] ?? 0) + (reward.amount ?? 0);
      }
    }
    for (const points of Object.values(supply)) expect(points).toBeLessThan(classicOgV14E.factionStanding.tiers.innerCircle);
  });

  it('rejects an introduction from a faction contact, a capstone that pays cash, and a bad fee', () => {
    const bad = {
      ...classicOgV14E,
      questDefinitions: {
        ...loose.questDefinitions,
        VIC_INTRO_KINGS: { ...loose.questDefinitions!.VIC_INTRO_KINGS, contactKey: 'TOMMY', fee: { netWorthShare: 2, minCents: 0 }, prerequisites: [] },
        KINGS_CROWN_OF_THE_BLOCK: { ...classicOgV14E.questDefinitions.KINGS_CROWN_OF_THE_BLOCK, rewards: [{ kind: 'CASH', amount: 100 }, { kind: 'FACTION_STANDING', key: 'KINGS', amount: 20 }] },
      },
    } as unknown as Ruleset;
    const problems = factionProblems(bad);
    expect(problems).toContain('VIC_INTRO_KINGS introduces KINGS, so it has to come from an independent broker who works for no one.');
    expect(problems).toContain('VIC_INTRO_KINGS introduces KINGS, so it needs FACTION_STANDING_BELOW Known with it.');
    expect(problems).toContain('VIC_INTRO_KINGS has a fee that is not a share of net worth below 1 with a positive whole floor.');
    expect(problems).toContain('KINGS_CROWN_OF_THE_BLOCK is an Inner Circle capstone, so it pays only standing and cosmetics, not CASH.');
  });
});
