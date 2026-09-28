import { describe, expect, it } from 'vitest';
import { classicOgV08H } from '@streets/rulesets';
import { crewNameSchema } from '@streets/shared';
import { isPermanentAward, selectProfileBadges } from '../profile-badges.js';
import { profileTitleForKey } from '../profile-titles.js';
import { SEASON_FEATS, seasonFeatAwards } from '../season-feats.js';
import { emptySeasonTotals, routeDriveHours, SEALED_TOTALS, toStatSheet, type SeasonTotals } from '../season-stats.service.js';
import { legacyAchievements } from '../community.service.js';

function totals(overrides: Partial<SeasonTotals> = {}): SeasonTotals {
  return { ...emptySeasonTotals(), ...overrides };
}

function everyTotal(value: number): SeasonTotals {
  return Object.fromEntries(Object.keys(emptySeasonTotals()).map((key) => [key, value])) as unknown as SeasonTotals;
}

describe('0.9.0-F stat sheets', () => {
  it('shows every number to the owner and on finished seasons', () => {
    const sheet = toStatSheet(everyTotal(7), false);
    expect(sheet.sealed).toBe(false);
    for (const section of [sheet.street, sheet.combat, sheet.turf, sheet.travel, sheet.economy]) {
      for (const value of Object.values(section)) expect(value).not.toBeNull();
    }
  });

  it('seals exactly the cash, crew and product-flow totals for other viewers of a live season', () => {
    const sheet = toStatSheet(everyTotal(7), true);
    expect(sheet.sealed).toBe(true);
    const nulls = [sheet.street, sheet.combat, sheet.turf, sheet.travel, sheet.economy]
      .flatMap((section) => Object.entries(section).filter(([, value]) => value === null).map(([key]) => key))
      .sort();
    // The sheet and the feat progress hiding must agree on what is sealed.
    expect(nulls).toEqual([...SEALED_TOTALS].sort());
    expect(sheet.combat.raidsWon).toBe(7);
    expect(sheet.turf.blocksCaptured).toBe(7);
  });

  it('reports block time in hours and drive time to one decimal', () => {
    const sheet = toStatSheet(totals({ blockSeconds: 5_400, driveHours: 10.54 }), false);
    expect(sheet.turf.blockHours).toBe(1.5);
    expect(sheet.travel.driveHours).toBe(10.5);
  });

  it('adds real interstate hours along a route, through cities, in either direction', () => {
    expect(routeDriveHours(classicOgV08H, ['new-york-city', 'detroit'])).toBe(10);
    expect(routeDriveHours(classicOgV08H, ['detroit', 'new-york-city'])).toBe(10);
    expect(routeDriveHours(classicOgV08H, ['new-york-city', 'detroit', 'las-vegas', 'los-angeles'])).toBe(10 + 29 + 4);
    expect(routeDriveHours(classicOgV08H, ['new-york-city'])).toBe(0);
    expect(routeDriveHours(classicOgV08H, 'not-a-route')).toBe(0);
    expect(routeDriveHours({ travel: undefined }, ['new-york-city', 'detroit'])).toBe(0);
  });
});

describe('0.9.0-F season feats', () => {
  const past = (name: string, endedAt: string, overrides: Partial<SeasonTotals>) =>
    ({ name, endedAt: new Date(endedAt), totals: totals(overrides) });

  it('covers every roadmap title with a profile label and no mechanical fields', () => {
    const keys = SEASON_FEATS.map((feat) => feat.key);
    expect(keys).toEqual(expect.arrayContaining([
      'block-boss', 'road-warrior', 'stick-up-king', 'street-pharmacist', 'most-wanted', 'high-roller', 'turf-veteran',
    ]));
    for (const key of [...keys, 'kingpin']) expect(profileTitleForKey(key)).not.toMatch(/^The /);
    expect(profileTitleForKey('block-boss')).toBe('Block Boss');
  });

  it('earns a feat in the live season and measures progress against it', () => {
    const awards = seasonFeatAwards({ name: 'Game #021', totals: totals({ blocksCaptured: 5, runsCompleted: 3 }) }, []);
    const blockBoss = awards.find((award) => award.key === 'block-boss')!;
    expect(blockBoss).toMatchObject({ unlocked: true, earnedSeason: 'Game #021', category: 'turf' });
    const roadWarrior = awards.find((award) => award.key === 'road-warrior')!;
    expect(roadWarrior).toMatchObject({ unlocked: false, earnedSeason: null, progress: { current: 3, target: 10 } });
  });

  it('keeps a feat earned in any finished season, crediting the oldest one', () => {
    const awards = seasonFeatAwards({ name: 'Game #021', totals: totals() }, [
      past('Game #020', '2026-08-01', { runsCompleted: 12 }),
      past('Game #018', '2026-06-01', { runsCompleted: 10 }),
      past('Game #019', '2026-07-01', { runsCompleted: 2 }),
    ]);
    const roadWarrior = awards.find((award) => award.key === 'road-warrior')!;
    expect(roadWarrior).toMatchObject({ unlocked: true, earnedSeason: 'Game #018', progress: { current: 0 } });
    expect(isPermanentAward(roadWarrior)).toBe(true);
  });

  it('hides progress only on feats whose stat is sealed, and marks money progress', () => {
    const awards = seasonFeatAwards(
      { name: 'Game #021', totals: totals({ cashStolenCents: 100_00, defensesLost: 4, defensesHeld: 2 }) },
      [],
      true,
    );
    expect(awards.find((award) => award.key === 'stick-up-king')!.progress).toBeNull();
    expect(awards.find((award) => award.key === 'high-roller')!.progress).toBeNull();
    expect(awards.find((award) => award.key === 'most-wanted')!.progress).toMatchObject({ current: 6, target: 15 });
    const open = seasonFeatAwards({ name: 'Game #021', totals: totals({ cashStolenCents: 100_00 }) }, []);
    expect(open.find((award) => award.key === 'stick-up-king')!.progress).toMatchObject({ current: 100_00, unit: 'cents' });
  });

  it('counts turf veteran in whole block-hours', () => {
    const almost = seasonFeatAwards({ name: 'S', totals: totals({ blockSeconds: 500 * 3600 - 1 }) }, []);
    expect(almost.find((award) => award.key === 'turf-veteran')).toMatchObject({ unlocked: false, progress: { current: 499 } });
    const made = seasonFeatAwards({ name: 'S', totals: totals({ blockSeconds: 500 * 3600 }) }, []);
    expect(made.find((award) => award.key === 'turf-veteran')!.unlocked).toBe(true);
  });

  it('shows past-season feats as permanent badges ahead of this round', () => {
    const [feat] = seasonFeatAwards(null, [past('Game #018', '2026-06-01', { turnsWorked: 6_000 })]);
    expect(feat).toMatchObject({ key: 'street-grinder', unlocked: true, earnedSeason: 'Game #018' });
    const badges = selectProfileBadges([
      { key: 'enforcer', title: 'Enforcer', description: '', category: 'combat', rarity: 'legendary', unlocked: true, earnedAt: null, progress: null },
      feat!,
    ]);
    expect(badges.map((badge) => [badge.key, badge.permanent])).toEqual([['street-grinder', true], ['enforcer', false]]);
  });

  it('awards Kingpin for a finished podium season', () => {
    const base = { roundsPlayed: 2, roundWins: 0, topTenFinishes: 1, bestNationalRank: 4, bestLocalRank: 2, totalFinalNetWorthCents: 0 };
    expect(legacyAchievements({ ...base, podiumFinishes: 0 }).find((award) => award.key === 'kingpin')!.unlocked).toBe(false);
    expect(legacyAchievements({ ...base, podiumFinishes: 1 }).find((award) => award.key === 'kingpin')!.unlocked).toBe(true);
  });
});

describe('0.9.0-F crew names', () => {
  it('normalizes, clears on blank, and rejects markup or overlong names', () => {
    expect(crewNameSchema.parse('  The   Night Shift ')).toBe('The Night Shift');
    expect(crewNameSchema.parse('   ')).toBeNull();
    expect(crewNameSchema.safeParse('<b>crew</b>').success).toBe(false);
    expect(crewNameSchema.safeParse('ab').success).toBe(false);
    expect(crewNameSchema.safeParse('x'.repeat(33)).success).toBe(false);
  });
});
