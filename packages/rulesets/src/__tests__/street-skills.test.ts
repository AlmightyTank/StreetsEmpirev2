import { describe, expect, it } from 'vitest';
import { STREET_SKILLS_V1, streetSkillPassiveModifiers, streetSkillPointsForXp, streetSkillSourceForAction, streetSkillTaperedXp, streetSkillXpForPoints } from '../street-skills.js';

describe('street skills slice A catalog', () => {
  it('uses a rising point curve capped at forty', () => {
    expect(streetSkillXpForPoints(1)).toBe(100);
    expect(streetSkillXpForPoints(2)).toBe(300);
    expect(streetSkillPointsForXp(300)).toBe(2);
    expect(streetSkillPointsForXp(999_999)).toBe(40);
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

  it('scales Slice B passives linearly without milestone choices', () => {
    expect(streetSkillPassiveModifiers('WHEELS', 20).map((passive) => [passive.effectId, passive.maxPercent])).toEqual([
      ['WHEELS_RUN_FEES', -7.5],
      ['WHEELS_VEHICLE_DAMAGE', -5],
    ]);
  });
});
