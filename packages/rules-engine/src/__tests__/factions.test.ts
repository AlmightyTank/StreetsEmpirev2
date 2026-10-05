import { describe, expect, it } from 'vitest';
import { classicOgV14B, classicOgV14B2 } from '@streets/rulesets';
import { addStanding, factionTier, factionTierName, jobStanding, nextFactionTier, standingFromRep } from '../calculations/factions.js';

const rules = classicOgV14B.factionStanding;

describe('1.4.0-B faction standing', () => {
  it('reaches each tier exactly at its line', () => {
    expect([0, 24, 25, 74, 75, 149, 150, 299, 300, 500].map((points) => factionTier(points, rules))).toEqual([
      'UNKNOWN', 'UNKNOWN', 'KNOWN', 'KNOWN', 'TRUSTED', 'TRUSTED', 'CONNECTED', 'CONNECTED', 'INNER_CIRCLE', 'INNER_CIRCLE',
    ]);
    expect(factionTierName('INNER_CIRCLE')).toBe('Inner Circle');
  });

  it('names the next tier and where it starts, until the top', () => {
    expect(nextFactionTier(0, rules)).toEqual({ tier: 'KNOWN', startsAt: 25 });
    expect(nextFactionTier(160, rules)).toEqual({ tier: 'INNER_CIRCLE', startsAt: 300 });
    expect(nextFactionTier(300, rules)).toBeNull();
  });

  it('keeps standing between 0 and the max', () => {
    expect(addStanding(490, 40, rules)).toBe(500);
    expect(addStanding(10, -40, rules)).toBe(0);
  });

  it('pays standing only for reputation gained, at the ruleset rate', () => {
    expect(standingFromRep(15, rules)).toBe(15);
    expect(standingFromRep(0, rules)).toBe(0);
    expect(standingFromRep(-10, rules)).toBe(0);
  });

  describe('jobStanding', () => {
    const jobs = classicOgV14B.questDefinitions;
    const pay = (key: keyof typeof jobs, branch?: number) => {
      const job = jobs[key];
      const chosen = branch === undefined ? undefined : (job as { branches?: readonly never[] }).branches?.[branch];
      return Object.fromEntries(jobStanding(classicOgV14B, job, job.rewards, chosen));
    };

    it('pays a contact Job’s reputation to that contact’s faction', () => {
      expect(pay('PAYDAY')).toEqual({ KINGS: 15 });
      expect(pay('LEDGER_OPEN_FILE')).toEqual({});
    });

    it('pays a faction Job its standing reward, and a joint Job each faction it helps', () => {
      expect(pay('KINGS_NEIGHBORHOOD_WATCH')).toEqual({ KINGS: 15 });
      expect(pay('SAINTS_LONG_HAUL')).toEqual({ ROAD_SAINTS: 25, CARTEL_LINE: 10 });
      expect(pay('CIVIC_SHAKE_HANDS')).toEqual({ CIVIC_HANDSHAKE: 25 });
    });

    it('pays only the side a branch picks, and nothing for the side it costs', () => {
      expect(pay('TAKING_SIDES', 0)).toEqual({ CARTEL_LINE: 25 });
      expect(pay('TAKING_SIDES', 1)).toEqual({ OUTFIT: 25 });
    });

    it('pays nothing to a faction a Job does not help, or for a repeatable Job', () => {
      const payday = jobs.PAYDAY;
      const extra = [...payday.rewards, { kind: 'CONTACT_REP', key: 'TOMMY', amount: 10 }, { kind: 'FACTION_STANDING', key: 'CARTEL_LINE', amount: 10 }];
      expect(Object.fromEntries(jobStanding(classicOgV14B, payday, extra))).toEqual({ KINGS: 15 });
      expect(jobStanding(classicOgV14B, { ...payday, repeatability: 'DAILY' }, payday.rewards).size).toBe(0);
      expect(jobStanding({ ...classicOgV14B, factionStanding: undefined }, payday, payday.rewards).size).toBe(0);
      const seasonJob = classicOgV14B2.questDefinitions.SEASON_STREET_EMPIRE;
      expect(seasonJob.rewards).toContainEqual({ kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 25 });
      expect(jobStanding(classicOgV14B2, seasonJob, seasonJob.rewards).size).toBe(0);
    });
  });
});
