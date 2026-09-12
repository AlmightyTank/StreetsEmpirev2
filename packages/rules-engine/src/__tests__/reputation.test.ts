import { describe, expect, it } from 'vitest';
import { classicOgV01, classicOgV02E } from '@streets/rulesets';
import type { QuestKey, TraderKey } from '@streets/rulesets';
import {
  calculateQuestCompletion,
  creditDailyTrade,
  emptyStandings,
  QuestError,
  questProgress,
  restockIntervalFor,
  restockSpeedup,
  tierFor,
  totalReputation,
  traderKeys,
  type QuestPlayer,
  type Standings,
} from '../calculations/reputation.js';
import { restockedItems } from '../calculations/restock.js';

const rules = classicOgV01;
const traders = traderKeys(rules);
const rep = rules.reputation;

const day = (iso: string) => new Date(iso);

/** A player holding everything every quest could ask for. */
function generous(overrides: Partial<QuestPlayer> = {}): QuestPlayer {
  return {
    crack: 10_000,
    thugs: 100,
    lowRiders: 5,
    cleanShiftStreak: 100,
    rocksSuppliedToPip: 10_000,
    driveBys: 10,
    ...overrides,
  };
}

describe('reputation', () => {
  it('starts every player a stranger to everybody', () => {
    const standings = emptyStandings(rules);

    expect(Object.keys(standings).sort()).toEqual([...traders].sort());
    expect(totalReputation(standings)).toBe(0);
    expect(tierFor(0, rules).name).toBe('Stranger');
  });

  describe('being a regular', () => {
    it('pays once a day, however many times you deal with them', () => {
      // The whole point: standing tracks showing up, not spending. If a second
      // trade paid again, cash would buy reputation at the buyback spread.
      const standing = { points: 0, creditedOn: null, questDone: false };

      const first = creditDailyTrade(standing, day('2026-09-09T09:00:00Z'), rules);
      expect(first.credited).toBe(true);
      expect(first.gained).toBe(rep.trade.pointsPerDay);

      const second = creditDailyTrade(
        { ...standing, points: first.points, creditedOn: first.creditedOn },
        day('2026-09-09T23:59:59Z'),
        rules,
      );
      expect(second.credited).toBe(false);
      expect(second.gained).toBe(0);
      expect(second.points).toBe(first.points);
    });

    it('pays again the next day', () => {
      const standing = { points: rep.trade.pointsPerDay, creditedOn: day('2026-09-09T23:00:00Z'), questDone: false };
      const next = creditDailyTrade(standing, day('2026-09-10T00:01:00Z'), rules);

      expect(next.credited).toBe(true);
      expect(next.points).toBe(rep.trade.pointsPerDay * 2);
    });

    it('stops at the trade cap, and the cap is below the top gun', () => {
      // Trading alone must never reach the AK-47, or the favours become
      // optional and the whole system is a timer.
      const maxed = { points: rep.trade.maxPoints, creditedOn: null, questDone: false };
      expect(creditDailyTrade(maxed, day('2026-09-10T09:00:00Z'), rules).gained).toBe(0);

      expect(rep.trade.maxPoints * traders.length).toBeLessThan(rules.weaponUnlocks.AK47.totalRep);
    });

    it('counts the quest bonus separately from the trade cap', () => {
      // A finished favour must not eat into the room left for showing up, or
      // doing the quest early would cost you points later.
      const afterQuest = { points: rep.questPoints, creditedOn: null, questDone: true };
      const credit = creditDailyTrade(afterQuest, day('2026-09-10T09:00:00Z'), rules);

      expect(credit.credited).toBe(true);
      expect(credit.points).toBe(rep.questPoints + rep.trade.pointsPerDay);
    });

    it('never exceeds the per-trader maximum', () => {
      const full = { points: rep.perTraderMax, creditedOn: null, questDone: true };
      expect(creditDailyTrade(full, day('2026-09-10T09:00:00Z'), rules).points).toBe(rep.perTraderMax);
    });
  });

  describe('what standing is worth', () => {
    it('climbs the tiers as points build', () => {
      const names = rep.tiers.map((tier) => tierFor(tier.at, rules).name);
      expect(names).toEqual(rep.tiers.map((tier) => tier.name));
      expect(tierFor(rep.perTraderMax, rules).name).toBe(rep.tiers[rep.tiers.length - 1]!.name);
    });

    it('shortens a shop’s wait and never touches its cap', () => {
      // The cap is the anti-hoarding brake. Raising it for regulars would
      // dissolve exactly the property the shelves exist to defend.
      const best = Math.max(...rep.tiers.map((tier) => tier.restockSpeedup));
      expect(best).toBeGreaterThan(0);
      expect(best).toBeLessThan(1);

      for (const [, { rule }] of restockedItems(rules)) {
        const shortened = restockIntervalFor(rule.intervalMinutes, rep.perTraderMax, rules);
        expect(shortened).toBeLessThan(rule.intervalMinutes);
        expect(shortened).toBeGreaterThan(0);
        // Nothing here may change how many a shelf holds.
        expect(rule.cap).toBe(restockedItems(rules).get(rule.stockField)!.rule.cap);
      }
    });

    it('leaves a stranger on the ruleset’s own interval', () => {
      expect(restockSpeedup(0, rules)).toBe(0);
      expect(restockIntervalFor(240, 0, rules)).toBe(240);
    });
  });

  describe('the favours', () => {
    it('asks every trader for something different', () => {
      // None of the four may be payable in the same resource, or a rich player
      // could buy through all of them the way they could buy through one.
      const kinds = traders.map((key) => rules.quests[key as QuestKey].goal.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    });

    it('gives one favour per trader and no more', () => {
      expect(Object.keys(rules.quests).sort()).toEqual([...traders].sort());
    });

    it('reports progress against the goal', () => {
      const standings = emptyStandings(rules);
      const short = generous({ cleanShiftStreak: 3 });
      const progress = questProgress('CORNER', short, standings, rules);

      expect(progress.have).toBe(3);
      expect(progress.need).toBe(10);
      expect(progress.canComplete).toBe(false);
      expect(progress.reward).toBe(rep.questPoints);
    });

    it('blocks Tommy on crew size even when the rock is there', () => {
      // His is the one favour with a condition beyond the counted goal.
      const standings = emptyStandings(rules);
      const noCrew = generous({ thugs: 0 });

      expect(questProgress('TOMMY', noCrew, standings, rules).blockedBy).toMatch(/thugs/);
      expect(() => calculateQuestCompletion('TOMMY', noCrew, standings, rules)).toThrow(QuestError);
    });

    it('takes the goods when the favour is a delivery', () => {
      const standings = emptyStandings(rules);

      const tommy = calculateQuestCompletion('TOMMY', generous(), standings, rules);
      expect(tommy.spend.crack).toBe(100);
      expect(tommy.spend.lowRiders).toBe(0);

      const charlie = calculateQuestCompletion('CHARLIE', generous(), standings, rules);
      expect(charlie.spend.lowRiders).toBe(1);
      expect(charlie.spend.crack).toBe(0);
    });

    it('takes nothing when the favour is a record of how you played', () => {
      // The clerk is watching your shifts and Pip is counting what you already
      // sold him. Neither can be handed over a second time.
      const standings = emptyStandings(rules);

      for (const key of ['CORNER', 'PIP'] as const) {
        const done = calculateQuestCompletion(key, generous(), standings, rules);
        expect(done.spend).toEqual({ crack: 0, lowRiders: 0 });
      }
      expect(calculateQuestCompletion('CORNER', generous(), standings, rules).clearsCleanShiftStreak).toBe(true);
    });

    it('pays each favour exactly once', () => {
      const standings: Standings = emptyStandings(rules);
      standings.TOMMY = { points: rep.questPoints, creditedOn: null, questDone: true };

      expect(() => calculateQuestCompletion('TOMMY', generous(), standings, rules)).toThrow(
        /already owes you/,
      );
    });

    it('refuses a favour nobody is asking for', () => {
      expect(() =>
        calculateQuestCompletion('MAYOR', generous(), emptyStandings(rules), rules),
      ).toThrow(/Nobody in this city is asking/);
    });

    it('adds up to more than the top gun needs, but only with every favour', () => {
      const ceiling = (rep.trade.maxPoints + rep.questPoints) * traders.length;
      const withoutFavours = rep.trade.maxPoints * traders.length;

      expect(ceiling).toBeGreaterThanOrEqual(rules.weaponUnlocks.AK47.totalRep);
      expect(withoutFavours).toBeLessThan(rules.weaponUnlocks.AK47.totalRep);
    });
  });

  describe('Charlie in drive-by rounds', () => {
    const e = classicOgV02E;

    it('asks for a drive-by instead of a car, and keeps the car', () => {
      const standings = emptyStandings(e);
      expect(e.quests.CHARLIE.goal.kind).toBe('DRIVE_BY');

      const before = questProgress('CHARLIE', generous({ lowRiders: 1, driveBys: 0 }), standings, e);
      expect(before.canComplete).toBe(false);
      expect([before.have, before.need]).toEqual([0, 1]);

      const done = calculateQuestCompletion('CHARLIE', generous({ driveBys: 1 }), standings, e);
      expect(done.spend).toEqual({ crack: 0, lowRiders: 0 });
    });

    it('tells Charlie shoppers to buy a Low-Rider before the drive-by', () => {
      const progress = questProgress('CHARLIE', generous({ lowRiders: 0, driveBys: 0 }), emptyStandings(e), e);
      expect(progress.blockedBy).toMatch(/buy a Low-Rider/i);
      expect(progress.canComplete).toBe(false);

      const survivedOrNot = calculateQuestCompletion('CHARLIE', generous({ lowRiders: 0, driveBys: 1 }), emptyStandings(e), e);
      expect(survivedOrNot.spend.lowRiders).toBe(0);
    });

    it('still asks every trader for something different', () => {
      const kinds = traderKeys(e).map((key) => e.quests[key as QuestKey].goal.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    });

    it('leaves economic rounds on the old favour, since they have no drive-bys', () => {
      expect('combat' in rules).toBe(false);
      expect(rules.quests.CHARLIE.goal.kind).toBe('HAND_OVER_LOW_RIDER');
      expect(e.combat.driveBy).toBeDefined();
    });
  });

  it('adds standing across traders rather than keeping four separate ladders', () => {
    const standings = emptyStandings(rules);
    for (const key of traders) standings[key as TraderKey]!.points = 25;

    expect(totalReputation(standings)).toBe(25 * traders.length);
  });
});
