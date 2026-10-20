import { describe, expect, it } from 'vitest';
import { STREET_SKILLS_V1, streetSkillPassiveModifiers, streetSkillPaysAtLaunch, streetSkillPerk, streetSkillPointsForXp, streetSkillSourceForAction, streetSkillTaperedXp, streetSkillXpForPoints } from '../street-skills.js';

describe('street skills slice A catalog', () => {
  it('uses a rising point curve capped at forty', () => {
    expect(streetSkillXpForPoints(1)).toBe(30);
    expect(streetSkillXpForPoints(2)).toBe(90);
    expect(streetSkillPointsForXp(90)).toBe(2);
    expect(streetSkillPointsForXp(999_999)).toBe(40);
  });

  it('lets a daily full-rate player reach forty in one skill within a 28-day round', () => {
    const fullRateDays = streetSkillXpForPoints(STREET_SKILLS_V1.skillPointCap) / STREET_SKILLS_V1.dailyFullXp;
    expect(fullRateDays).toBeLessThanOrEqual(28);
    // A milestone perk arrives early: ten points inside two days at the full rate.
    expect(streetSkillXpForPoints(10) / STREET_SKILLS_V1.dailyFullXp).toBeLessThan(2);
  });

  it('tapers a large action across the daily bands', () => {
    expect(streetSkillTaperedXp(1_000, 0)).toBe(1_000);
    expect(streetSkillTaperedXp(1_000, 1_000)).toBe(500);
    expect(streetSkillTaperedXp(1_000, 2_000)).toBe(250);
    expect(streetSkillTaperedXp(2_000, 500)).toBe(1_125);
  });

  it('maps only known settled action families', () => {
    expect(streetSkillSourceForAction(STREET_SKILLS_V1, 'RUN_LAUNCH')?.skill).toBe('WHEELS');
    expect(streetSkillSourceForAction(STREET_SKILLS_V1, 'TEST_NOOP')).toBeNull();
    expect(streetSkillSourceForAction(STREET_SKILLS_V1, 'RANDOM_ENCOUNTER')?.skill).toBe('LUCK');
  });

  it('scales live passives linearly and leaves out ones waiting on an unbuilt system', () => {
    expect(streetSkillPassiveModifiers('WHEELS', 20).map((passive) => [passive.effectId, passive.maxPercent])).toEqual([
      ['VEHICLE_DAMAGE', -5],
    ]);
  });

  it('enforces the shared total point cap on top of the per-skill cap', () => {
    expect(streetSkillPointsForXp(999_999, STREET_SKILLS_V1, 0)).toBe(40);
    expect(streetSkillPointsForXp(999_999, STREET_SKILLS_V1, 80)).toBe(20);
    expect(streetSkillPointsForXp(999_999, STREET_SKILLS_V1, 100)).toBe(0);
    expect(streetSkillPointsForXp(90, STREET_SKILLS_V1, 99)).toBe(1);
  });

  it('maps the real action names, including fights settled outside the action pipeline', () => {
    const skillOf = (action: string) => streetSkillSourceForAction(STREET_SKILLS_V1, action)?.skill ?? null;
    expect(['RAID', 'DRIVE_BY', 'SPECIAL_RAID', 'BOSS_HIT', 'TURF_PUSH'].map(skillOf)).toEqual(['MUSCLE', 'MUSCLE', 'MUSCLE', 'MUSCLE', 'MUSCLE']);
    expect(['TRIP_LAUNCH', 'TRIP_HEAD_HOME', 'RUN_LAUNCH'].map(skillOf)).toEqual(['WHEELS', 'WHEELS', 'WHEELS']);
    expect(['LAWYER_UP', 'LAWYER_RETAIN', 'OFFICIAL_HIRE', 'INFORMANT_TIP', 'HEAT_BRIBE'].map(skillOf)).toEqual(['FIXER', 'FIXER', 'FIXER', 'FIXER', 'FIXER']);
    expect(skillOf('PRODUCE_CRACK')).toBe('HUSTLE');
    expect(skillOf('SCOUT')).toBe('LUCK');
    expect(STREET_SKILLS_V1.sources.find((source) => source.skill === 'MUSCLE')?.lossMultiplier).toBe(0.5);
  });

  it('marks every perk that needs an unbuilt system, and gives every other perk an effect or a rule', () => {
    const rules = ['UNTAXED', 'WHEELMAN', 'SUPPLIERS_FRIEND', 'SECOND_CHANCE'];
    for (const milestones of Object.values(STREET_SKILLS_V1.milestones)) {
      for (const choice of (milestones ?? []).flatMap((milestone) => milestone.choices)) {
        expect(Boolean(choice.requires || choice.effect || rules.includes(choice.key)), choice.key).toBe(true);
      }
    }
    expect(streetSkillPerk(STREET_SKILLS_V1, 'GHOST')?.requires).toBe('Armory & Garage');
    expect(streetSkillPerk(STREET_SKILLS_V1, 'HIT_FIRST')?.offensive).toBe(true);
  });

  it('pays fights that resolve later when they resolve, and setup actions at launch', () => {
    for (const action of ['TURF_PUSH', 'BLOCK_WAR_ASSAULT', 'BLOCK_WAR_DEFEND', 'BOSS_HIT', 'CONVOY_TAIL', 'CONVOY_BACKUP']) {
      expect(streetSkillPaysAtLaunch(STREET_SKILLS_V1, action), action).toBe(false);
      expect(streetSkillSourceForAction(STREET_SKILLS_V1, action)?.skill).toBe('MUSCLE');
    }
    for (const action of ['TURF_CLAIM', 'TURF_POST', 'BLOCK_WAR_DECLARE', 'CONVOY_RECON', 'RUN_LAUNCH', 'SCOUT']) {
      expect(streetSkillPaysAtLaunch(STREET_SKILLS_V1, action), action).toBe(true);
    }
  });
});
