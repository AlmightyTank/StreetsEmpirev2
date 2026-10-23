import { describe, expect, it } from 'vitest';
import { STREET_SKILLS_V1, STREET_SKILLS_V2 } from '@streets/rulesets';
import { buildSkillEffects, coolHeat, NO_SKILL_EFFECTS } from '../player-skill.service.js';
import { withSkillHeat } from '../action.service.js';
import { skillSellCents } from '../store.service.js';
import { luckyEffects } from '../random-encounter.service.js';

const rules = STREET_SKILLS_V1;
const row = (skill: string, points: number, choices: Record<string, string> = {}) => ({ skill, points, choices });

describe('street skill effects', () => {
  it('scales passives with points and leaves out passives waiting on an unbuilt system', () => {
    const skills = buildSkillEffects([row('FIXER', 20), row('WHEELS', 40)], rules);
    expect(skills.percent('HEAT_GAIN')).toBe(-7.5);
    expect(skills.percent('HEAT_COOLING')).toBe(7.5);
    expect(skills.percent('VEHICLE_DAMAGE')).toBe(-10);
    expect(skills.percent('RUN_FEES')).toBe(0);
  });

  it('applies a chosen perk only while its milestone points are held', () => {
    expect(buildSkillEffects([row('WHEELS', 10, { 10: 'PACKED_TIGHT' })], rules).percent('CARGO')).toBe(10);
    expect(buildSkillEffects([row('WHEELS', 9, { 10: 'PACKED_TIGHT' })], rules).percent('CARGO')).toBe(0);
    expect(buildSkillEffects([row('WHEELS', 40, { 40: 'WHEELMAN' })], rules).has('WHEELMAN')).toBe(true);
    // A perk that needs an unbuilt system never applies, even if a stale row names it.
    expect(buildSkillEffects([row('FIXER', 40, { 40: 'GHOST' })], rules).has('GHOST')).toBe(false);
  });

  it('activates Steady Hands with independent jam and wear modifiers in the armory ruleset', () => {
    const skills = buildSkillEffects([row('MUSCLE', 25, { 25: 'STEADY_HANDS' })], STREET_SKILLS_V2);
    expect(skills.scale('GUN_JAM_CHANCE', 10)).toBe(8);
    expect(skills.percent('GUN_WEAR')).toBe(-20);
    expect(buildSkillEffects([row('MUSCLE', 25, { 25: 'STEADY_HANDS' })], STREET_SKILLS_V1).percent('GUN_WEAR')).toBe(0);
  });

  it('activates ammo, run-fee and live territory bonuses in the beta ruleset', () => {
    const skills = buildSkillEffects([
      row('MUSCLE', 40),
      row('WHEELS', 40),
      row('CONNECTIONS', 40),
      row('HUSTLE', 40, { 40: 'KINGPINS_CUT' }),
    ], STREET_SKILLS_V2);
    expect(skills.percent('AMMO_PER_FIGHT')).toBe(-10);
    expect(skills.percent('RUN_FEES')).toBe(-15);
    expect(skills.percent('TOLLS')).toBe(-20);
    expect(skills.percent('TERRITORY_CACHE_CASH')).toBe(10);
  });

  it('drops offensive perks against a weak target but keeps defensive ones', () => {
    const skills = buildSkillEffects([row('MUSCLE', 10, { 10: 'HIT_FIRST' })], rules);
    expect(skills.percent('ATTACK_STRENGTH')).toBe(4);
    expect(skills.percent('ATTACK_STRENGTH', { weakTarget: true })).toBe(0);
    expect(buildSkillEffects([row('MUSCLE', 10, { 10: 'HOLD_THE_LINE' })], rules).percent('DEFENSE_STRENGTH', { weakTarget: true })).toBe(4);
  });

  it('puts only the effects an action used on its receipt', () => {
    const skills = buildSkillEffects([row('FIXER', 40), row('HUSTLE', 40, { 40: 'UNTAXED' })], rules);
    expect(skills.receipts()).toEqual([]);
    skills.percent('HEAT_GAIN');
    skills.has('UNTAXED');
    expect(skills.receipts().map((line) => line.effectId)).toEqual(['HEAT_GAIN', 'UNTAXED']);
  });

  it('cuts the Heat an action adds and cools Heat faster', () => {
    const skills = buildSkillEffects([row('FIXER', 40)], rules);
    expect(withSkillHeat({ heat: 10 }, { heat: 30 }, skills).heat).toBe(27);
    expect(withSkillHeat({ heat: 30 }, { heat: 10 }, skills).heat).toBe(10);
    expect(withSkillHeat({ heat: 10 }, { heat: 30 }, NO_SKILL_EFFECTS).heat).toBe(30);
    const heatRules = { max: 100, decayPerInterval: 2 } as Parameters<typeof coolHeat>[2];
    expect(coolHeat(50, 10, heatRules)).toBe(30);
    expect(coolHeat(50, 10, heatRules, skills)).toBe(27);
  });

  it('raises store sale prices, halves sell-back losses with Untaxed, and never reaches the buy price', () => {
    expect(skillSellCents(1_000, 2_000, buildSkillEffects([row('HUSTLE', 40)], rules))).toBe(1_060);
    expect(skillSellCents(1_000, 2_000, buildSkillEffects([row('HUSTLE', 40, { 40: 'UNTAXED' })], rules))).toBe(1_500);
    expect(skillSellCents(1_990, 2_000, buildSkillEffects([row('HUSTLE', 40)], rules))).toBe(1_999);
    expect(skillSellCents(1_000, 2_000, NO_SKILL_EFFECTS)).toBe(1_000);
  });

  it('grows encounter windfalls and shrinks encounter losses', () => {
    const skills = buildSkillEffects([row('LUCK', 40, { 25: 'FORTUNES_FAVOR', 40: 'SERENDIPITY' })], rules);
    expect(luckyEffects({ cashCents: 10_000, heat: 4, thugs: -4 }, 'good', skills)).toEqual({ cashCents: 12_500, heat: 3, thugs: -3 });
    expect(luckyEffects({ cashCents: 10_000 }, 'bad', skills)).toEqual({ cashCents: 11_000 });
    expect(luckyEffects({ cashCents: -10_000, heat: -2 }, 'bad', skills)).toEqual({ cashCents: -7_500, heat: -2 });
  });
});
