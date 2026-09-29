import { describe, expect, it } from 'vitest';
import { classicOgV08H as base, type Ruleset } from '@streets/rulesets';
import { evaluateSeasonBands, runSeasonBands, SEASON_ROSTER, SEASON_STRATEGIES, simulateSeason } from '../index.js';

/** 1.0.0-D. Whole seasons where every strategy plays at once. */
describe('1.0.0-D whole-season balance', () => {
  it('covers every strategy the roadmap asks for, and late joiners', () => {
    expect(SEASON_STRATEGIES.map((row) => row.key)).toEqual(['street', 'producer', 'trader', 'raider', 'turf', 'traveler', 'convoy', 'alliance', 'hideout', 'arbitrage', 'mixed']);
    for (const strategy of SEASON_STRATEGIES) expect(SEASON_ROSTER.some((spec) => spec.strategy === strategy.key), strategy.key).toBe(true);
    expect(SEASON_ROSTER.filter((spec) => spec.joinDay > 0).map((spec) => spec.joinDay)).toEqual(expect.arrayContaining([7, 14, 21]));
  });

  it('is deterministic for a seed, and every crew acts and interacts', () => {
    const first = simulateSeason(base, { seed: 7 });
    const second = simulateSeason(base, { seed: 7 });
    expect(second.agents.map((agent) => agent.netWorthCents)).toEqual(first.agents.map((agent) => agent.netWorthCents));
    const total = (key: keyof (typeof first.agents)[number]['tally']) => first.agents.reduce((sum, agent) => sum + agent.tally[key], 0);
    // The season is a season, not eleven solo runs: crews raid, push, run and tail each other.
    expect(total('raidWins')).toBeGreaterThan(0);
    expect(total('pushWins')).toBeGreaterThan(0);
    expect(total('runs')).toBeGreaterThan(0);
    expect(total('tailWins')).toBeGreaterThan(0);
    expect(total('raided')).toBe(total('raids'));
    for (const agent of first.agents) {
      expect(Number.isFinite(agent.netWorthCents), agent.name).toBe(true);
      expect(agent.daily.length, agent.name).toBe(first.days - agent.joinDay);
    }
  });

  it('the shipping ruleset passes every balance band', () => {
    const { report } = runSeasonBands(base, [1, 2, 3]);
    const failed = report.bands.filter((band) => !band.pass).map((band) => `${band.key}: ${band.value} (${band.line}) ${band.detail}`);
    expect(failed).toEqual([]);
    expect(report.bands).toHaveLength(11);
  });

  it('the bands have teeth: broken economies fail the questions they break', () => {
    const failing = (ruleset: Ruleset) => evaluateSeasonBands([simulateSeason(ruleset, { seed: 1 }), simulateSeason(ruleset, { seed: 2 })])
      .bands.filter((band) => !band.pass).map((band) => band.key);
    const combat = base.combat!;
    const greedyRaids = { ...base, combat: { ...combat, protectionHours: 0, cooldownMinutes: 10, minimumTargetStrengthRatio: 0,
      loot: { ...combat.loot, protectedCashCents: 0, perFitAttackerCents: 10_000_000, exposedCashPercent: 100, weightedPercent: undefined } } } as Ruleset;
    expect(failing(greedyRaids)).toEqual(expect.arrayContaining(['no-dominant-system', 'combat-optional']));

    const hideout = base.hideout!;
    const pricyHideout = { ...base, hideout: { ...hideout, rooms: Object.fromEntries(Object.entries(hideout.rooms)
      .map(([key, room]) => [key, { ...room, costsCents: room.costsCents.map((cents) => cents * 20) }])) } } as unknown as Ruleset;
    expect(failing(pricyHideout)).toContain('hideout-pays');

    const turf = base.turf!;
    const richTurf = { ...base, turf: { ...turf, caps: { ...turf.caps, dailyTaxCapCentsPerPayer: 500_000_000 },
      districts: Object.fromEntries(Object.entries(turf.districts).map(([key, district]) => [key, { ...district, holdBonus: 3, taxMint: 0.6 }])) } } as unknown as Ruleset;
    expect(failing(richTurf)).toEqual(expect.arrayContaining(['no-lockout']));
  }, 60_000);
});
