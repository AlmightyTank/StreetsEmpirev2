import { describe, expect, it } from 'vitest';
import { classicOgV14B, classicOgV14B2, classicOgV14C } from '@streets/rulesets';
import { addStanding, contractStanding, factionTier, factionTierName, jobStanding, nextFactionTier, pickSponsors, standingFromRep } from '../calculations/factions.js';

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

  describe('1.4.0-C sponsors', () => {
    const offers = (count: number, candidates: Array<'OUTFIT' | 'KINGS'>) =>
      Array.from({ length: count }, (_, index) => ({ seed: `player:offer-${index}`, candidates }));

    it('keeps a single candidate and leaves unsponsored work unsponsored', () => {
      expect(pickSponsors([{ seed: 'a', candidates: ['KINGS'] }, { seed: 'b', candidates: [] }], {}, 1)).toEqual(['KINGS', null]);
    });

    it('is the same for the same player and offer', () => {
      const board = offers(20, ['OUTFIT', 'KINGS']);
      expect(pickSponsors(board, {}, 1)).toEqual(pickSponsors(board, {}, 1));
    });

    it('leans toward a faction the player is Known with, about two to one', () => {
      const board = offers(2000, ['OUTFIT', 'KINGS']);
      const share = (picks: Array<string | null>) => picks.filter((pick) => pick === 'KINGS').length / picks.length;
      const even = share(pickSponsors(board, {}, 1));
      const leaned = share(pickSponsors(board, { KINGS: 'KNOWN' }, 1));
      expect(even).toBeGreaterThan(0.45);
      expect(even).toBeLessThan(0.55);
      expect(leaned).toBeGreaterThan(0.62);
      expect(leaned).toBeLessThan(0.72);
      // Unknown is no lean, and no lean weight is no lean.
      expect(pickSponsors(board, { KINGS: 'UNKNOWN' }, 1)).toEqual(pickSponsors(board, {}, 1));
      expect(pickSponsors(board, { KINGS: 'INNER_CIRCLE' }, 0)).toEqual(pickSponsors(board, {}, 1));
    });

    it('never makes a board one faction’s work when an offer could go another way', () => {
      const board = [
        { seed: 'x', candidates: ['KINGS'] as const },
        { seed: 'y', candidates: ['KINGS'] as const },
        { seed: 'z', candidates: ['KINGS', 'OUTFIT'] as const },
      ];
      expect(pickSponsors(board, { KINGS: 'INNER_CIRCLE' }, 1000)).toEqual(['KINGS', 'KINGS', 'OUTFIT']);
      // With no other candidate anywhere, there is nothing to switch.
      expect(pickSponsors(board.slice(0, 2), {}, 1)).toEqual(['KINGS', 'KINGS']);
    });

    it('pays each board its pinned standing, and nothing before 1.4.0-C', () => {
      expect(contractStanding(classicOgV14C, 'DAILY')).toBe(2);
      expect(contractStanding(classicOgV14C, 'SEASON')).toBe(20);
      expect(contractStanding(classicOgV14C, null)).toBe(0);
      expect(contractStanding(classicOgV14B2, 'DAILY')).toBe(0);
    });

    it('never pays a board contract a Job’s standing, even a one-time Season contract', () => {
      const season = classicOgV14C.questDefinitions.SEASON_STREET_EMPIRE;
      expect(jobStanding(classicOgV14C, season, season.rewards).size).toBe(0);
    });
  });
});
