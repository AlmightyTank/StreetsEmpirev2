import { describe, expect, it } from 'vitest';
import { classicOgV11C, classicOgV11D, type Ruleset } from '@streets/rulesets';
import {
  alliedShare,
  allyCutCents,
  allyCutSteps,
  blockWarGate,
  blockWarRulesetProblems,
  blockWarsOn,
  controlAfterBreak,
  hoursToFullControl,
  runBlockWarSimulation,
  sackLootCents,
  siegeControlAfter,
  warEndsBy,
  warTruceHours,
} from '../index.js';

const ruleset = classicOgV11D as unknown as Ruleset;
const wars = classicOgV11D.business.wars;

describe('1.1.0-D block wars ruleset', () => {
  it('adds only the war switch and the Sack and torch settings on top of C', () => {
    const { meta: _meta, business: { wars: dWars, ...dRules }, ...dRest } = classicOgV11D;
    const { meta: _was, business: { wars: cWars, ...cRules }, ...cRest } = classicOgV11C;
    const { enabled: _on, sackLootShare: _share, sackLootCapCents: _cap, sackHeat: _heat, torchHeat: _torch, ...dWarNumbers } = dWars;
    expect(dWarNumbers).toEqual(cWars);
    expect(dRules).toEqual(cRules);
    expect(dRest).toEqual(cRest);
    expect(blockWarsOn(ruleset)).toBe(true);
    expect(blockWarsOn(classicOgV11C as unknown as Ruleset)).toBe(false);
    expect(blockWarRulesetProblems(ruleset)).toEqual([]);
  });

  it('keeps Sack loot inside the 0.6.0-D loot caps', () => {
    const tooRich = { ...classicOgV11D, business: { ...classicOgV11D.business, wars: { ...wars, sackLootCapCents: 99_000_000 } } } as unknown as Ruleset;
    expect(blockWarRulesetProblems(tooRich)).toContain('Sack loot must stay inside the 0.6.0-D loot caps.');
  });
});

describe('1.1.0-D sieges', () => {
  it('climbs from 0 to 100 Control in the siege hours, faster with the ally', () => {
    expect(siegeControlAfter(ruleset, 0, wars.siegeHours)).toBe(100);
    expect(siegeControlAfter(ruleset, 0, 6)).toBeCloseTo(50, 5);
    expect(hoursToFullControl(ruleset, 0, 1)).toBeCloseTo(wars.siegeHours / (1 + wars.allySiegeSpeedup), 5);
    expect(hoursToFullControl(ruleset, 60)).toBeCloseTo(wars.siegeHours * 0.4, 5);
    expect(siegeControlAfter(ruleset, 90, 10)).toBe(100);
  });

  it('a break knocks Control back, never below zero', () => {
    expect(controlAfterBreak(ruleset, 70)).toBe(70 - wars.breakSiegeControlLoss);
    expect(controlAfterBreak(ruleset, 10)).toBe(0);
  });

  it('measures the ally against the declarer, capped at 1', () => {
    expect(alliedShare(20, 10)).toBe(0.5);
    expect(alliedShare(20, 40)).toBe(1);
    expect(alliedShare(0, 10)).toBe(0);
  });

  it('runs out after the war\'s time limit, with a longer truce after a Sack', () => {
    const declared = new Date('2026-10-01T00:00:00Z');
    expect(warEndsBy(ruleset, declared).getTime() - declared.getTime()).toBe(wars.maxWarHours * 3_600_000);
    expect(warTruceHours(ruleset, 'TAKE')).toBe(wars.truceHours);
    expect(warTruceHours(ruleset, 'DEFENDED')).toBe(wars.truceHours);
    expect(warTruceHours(ruleset, 'SACK')).toBe(wars.sackTruceHours);
  });
});

describe('1.1.0-D winnings', () => {
  it('a Sack takes a share of the registers, capped', () => {
    expect(sackLootCents(ruleset, 1_000_000)).toBe(500_000);
    expect(sackLootCents(ruleset, 100_000_000)).toBe(wars.sackLootCapCents);
    expect(sackLootCents(ruleset, 0)).toBe(0);
  });

  it('the ally\'s cut never passes the caller\'s share or 50%, and is nothing for an ally who never fought', () => {
    expect(allyCutSteps(ruleset)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(allyCutCents(ruleset, 1_000_000, 0.3, true)).toBe(300_000);
    expect(allyCutCents(ruleset, 1_000_000, 0.9, true)).toBe(500_000);
    expect(allyCutCents(ruleset, 1_000_000, 0.3, false)).toBe(0);
    expect(allyCutCents(ruleset, 0, 0.3, true)).toBe(0);
  });
});

describe('1.1.0-D war simulation', () => {
  it('stays swingy in even matchups, ends every war by the limit, and passes the gate', () => {
    const summaries = runBlockWarSimulation(ruleset, 600);
    expect(summaries.map((summary) => summary.scenario.key)).toEqual(['SOLO_VS_SOLO', 'ALLIANCE_VS_SOLO', 'SOLO_VS_ALLIANCE', 'ALLIANCE_VS_ALLIANCE']);
    for (const summary of summaries) expect(summary.longestHours).toBeLessThanOrEqual(wars.maxWarHours);
    // An ally on your side always helps.
    const [solo, allianceAttack, allianceDefend] = summaries;
    expect(allianceAttack!.attackerWinRate).toBeGreaterThan(solo!.attackerWinRate);
    expect(allianceDefend!.attackerWinRate).toBeLessThan(solo!.attackerWinRate);
    expect(blockWarGate(ruleset, summaries)).toEqual([]);
    expect(runBlockWarSimulation(classicOgV11C as unknown as Ruleset)).toEqual([]);
  });
});
