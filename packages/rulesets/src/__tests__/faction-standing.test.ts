import { describe, expect, it } from 'vitest';
import { classicOgV14A } from '../classic-og-v1.4-a/index.js';
import { classicOgV14B } from '../classic-og-v1.4-b/index.js';
import { factionJobs } from '../classic-og-v1.4-b/faction-jobs.js';
import { factionProblems, jobFaction, jobHelpedFactions } from '../faction-definitions.js';
import type { QuestDefinition, Ruleset } from '../types.js';

const jobs = Object.values(classicOgV14B.questDefinitions) as QuestDefinition[];
const ownJobs = Object.values(factionJobs) as QuestDefinition[];
const tierOf = (job: QuestDefinition) => job.prerequisites.find((row) => row.kind === 'FACTION_STANDING_AT_LEAST')?.params?.tier ?? null;

describe('1.4.0-B faction standing ruleset', () => {
  it('adds standing rules and the factions’ own Jobs on top of 1.4.0-A, and changes nothing else', () => {
    expect(classicOgV14B.meta).toEqual({ id: 'classic-og-v1.4-b', version: '1.4.0-B', name: 'Classic OG - Faction Standing' });
    expect({ ...classicOgV14B, meta: null, factionStanding: null, questDefinitions: null })
      .toEqual({ ...classicOgV14A, meta: null, factionStanding: null, questDefinitions: null });
    expect(classicOgV14B.questDefinitions).toEqual({ ...classicOgV14A.questDefinitions, ...factionJobs });
    expect((classicOgV14A as Ruleset).factionStanding).toBeUndefined();
    expect(factionProblems(classicOgV14B)).toEqual([]);
  });

  it('pins ascending tiers inside the max, earned one for one from contact reputation', () => {
    const { tiers, max, perContactRep } = classicOgV14B.factionStanding;
    const lines = [tiers.known, tiers.trusted, tiers.connected, tiers.innerCircle];
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(new Set(lines).size).toBe(4);
    expect(tiers.innerCircle).toBeLessThanOrEqual(max);
    expect(perContactRep).toBe(1);
  });

  it('gives every faction two Jobs of its own, opened by standing, that pay standing and never contact reputation', () => {
    for (const key of Object.keys(classicOgV14B.factions)) {
      const own = ownJobs.filter((job) => jobFaction(classicOgV14B, job) === key);
      expect(own.map((job) => job.category)).toEqual(['FACTION', 'FACTION']);
      // Civic Handshake has no contact to get a player Known, so its first Job is open to anyone.
      expect(own.map(tierOf)).toEqual(key === 'CIVIC_HANDSHAKE' ? [null, 'KNOWN'] : ['KNOWN', 'TRUSTED']);
      for (const job of own) {
        expect(job.repeatability).toBe('ONCE');
        expect(job.rewards.some((reward) => reward.kind === 'CONTACT_REP')).toBe(false);
        expect(job.rewards.some((reward) => reward.kind === 'FACTION_STANDING' && reward.key === key)).toBe(true);
      }
    }
    // Civic Handshake's Jobs pay standing only: never a rebate on the payroll.
    for (const job of ownJobs.filter((row) => row.factionKey === 'CIVIC_HANDSHAKE')) {
      expect(job.rewards.map((reward) => reward.kind)).toEqual(['FACTION_STANDING']);
    }
  });

  it('pays standing only to the factions a Job helps', () => {
    for (const job of jobs) {
      const helped = jobHelpedFactions(classicOgV14B, job);
      for (const reward of job.rewards) {
        if (reward.kind === 'FACTION_STANDING') expect(helped.has(reward.key as never)).toBe(true);
        if (reward.kind === 'CONTACT_REP') {
          const faction = classicOgV14B.contacts[reward.key as keyof typeof classicOgV14B.contacts] as { factionKey?: string };
          if (faction.factionKey) expect(helped.has(faction.factionKey as never)).toBe(true);
        }
      }
    }
    // The one joint Job says who else it helps; the side a branch picks is the only side helped.
    expect([...jobHelpedFactions(classicOgV14B, factionJobs.SAINTS_LONG_HAUL)]).toEqual(['ROAD_SAINTS', 'CARTEL_LINE']);
    const sides = classicOgV14B.questDefinitions.TAKING_SIDES.branches;
    expect(sides.map((branch) => [...jobHelpedFactions(classicOgV14B, classicOgV14B.questDefinitions.TAKING_SIDES, branch)]))
      .toEqual([['CARTEL_LINE'], ['OUTFIT']]);
  });

  it('flags a Job that pays another faction’s contact or standing without helping them, or helps a rival', () => {
    const base = classicOgV14B.questDefinitions.FIRST_NIGHT_OUT as QuestDefinition;
    const check = (job: QuestDefinition) => factionProblems({ ...classicOgV14B, questDefinitions: { [job.key]: job } });
    expect(check({ ...base, rewards: [...base.rewards, { kind: 'CONTACT_REP', key: 'TOMMY', amount: 5 }] }))
      .toEqual(['FIRST_NIGHT_OUT pays TOMMY\'s reputation for OUTFIT, a faction it does not help.']);
    expect(check({ ...base, rewards: [{ kind: 'FACTION_STANDING', key: 'CARTEL_LINE', amount: 5 }] }))
      .toEqual(['FIRST_NIGHT_OUT pays standing for CARTEL_LINE, a faction it does not help.']);
    expect(check({ ...base, helps: ['CARTEL_LINE'], rewards: [{ kind: 'FACTION_STANDING', key: 'CARTEL_LINE', amount: 5 }] })).toEqual([]);
    expect(check({ ...base, helps: ['OUTFIT'] })).toEqual(['FIRST_NIGHT_OUT helps OUTFIT, a rival of KINGS.']);
    expect(check({ ...base, factionKey: 'OUTFIT' })).toContain('FIRST_NIGHT_OUT works for OUTFIT, but its giver works for KINGS.');
  });

  it('takes every faction past Known on one-time Jobs alone, leaving Inner Circle to more work', () => {
    const ladder = classicOgV14B.factionStanding;
    const earned = new Map<string, number>();
    const add = (key: string | undefined, amount: number) => { if (key) earned.set(key, (earned.get(key) ?? 0) + amount); };
    for (const job of jobs) {
      if (job.repeatability !== 'ONCE') continue;
      for (const reward of job.rewards) {
        if (reward.kind === 'CONTACT_REP') add((classicOgV14B.contacts as Ruleset['contacts'])?.[reward.key as keyof NonNullable<Ruleset['contacts']>]?.factionKey, (reward.amount ?? 0) * ladder.perContactRep);
        if (reward.kind === 'FACTION_STANDING') add(reward.key, reward.amount ?? 0);
      }
    }
    expect(Object.fromEntries(earned)).toEqual({ KINGS: 280, OUTFIT: 215, CARTEL_LINE: 180, ROAD_SAINTS: 150, CIVIC_HANDSHAKE: 50 });
    for (const key of Object.keys(classicOgV14B.factions)) {
      expect(earned.get(key) ?? 0).toBeGreaterThanOrEqual(ladder.tiers.known);
      // Inner Circle takes sponsored board work (C) and a capstone (E), not one season of Jobs.
      expect(earned.get(key) ?? 0).toBeLessThan(ladder.tiers.innerCircle);
    }
  });
});
