import { describe, expect, it } from 'vitest';
import { simulateStreetSkillSeason, STREET_SKILLS_V1 } from '../street-skills.js';

const day = (days: number) => new Date(Date.UTC(2026, 0, 1 + days));

describe('street skill season simulation', () => {
  it('keeps solo and alliance settlements identical and ignores retry farming', () => {
    const events = [
      { skill: 'MUSCLE' as const, sourceKey: 'combat:1', baseXp: 10, settledAt: day(10), joinedAt: day(0) },
      { skill: 'MUSCLE' as const, sourceKey: 'combat:1', baseXp: 10, settledAt: day(10), joinedAt: day(0) },
      { skill: 'MUSCLE' as const, sourceKey: 'combat:2', baseXp: 10, settledAt: day(10), joinedAt: day(0) },
    ];
    const solo = simulateStreetSkillSeason(events);
    const alliance = simulateStreetSkillSeason(events.map((event) => ({ ...event, sourceKey: `alliance:${event.sourceKey}` })));
    expect(solo.xp.MUSCLE).toBe(20);
    expect(solo.points).toEqual(alliance.points);
    expect(solo.ignoredDuplicateEvents).toBe(1);
  });

  it('applies late joiner catch-up without bypassing the daily taper', () => {
    const result = simulateStreetSkillSeason([
      { skill: 'HUSTLE', sourceKey: 'earn:1', baseXp: 1_500, settledAt: day(1), joinedAt: day(1) },
      { skill: 'HUSTLE', sourceKey: 'earn:2', baseXp: 1_500, settledAt: new Date(day(1).getTime() + 1_000), joinedAt: day(1) },
    ]);
    // Taper first: 1,250 then 375 XP, with the day-zero catch-up multiplier applied.
    expect(result.xp.HUSTLE).toBe(3_250);
    expect(result.points.HUSTLE).toBe(14);
  });

  it('supports a full season of heavy action while respecting the skill point cap', () => {
    const events = Array.from({ length: 365 }, (_, index) => ({
      skill: 'WHEELS' as const,
      sourceKey: `run:${index}`,
      baseXp: 10_000,
      settledAt: day(index),
      joinedAt: day(0),
    }));
    const result = simulateStreetSkillSeason(events, STREET_SKILLS_V1);
    expect(result.awardedEvents).toBe(365);
    expect(result.points.WHEELS).toBe(STREET_SKILLS_V1.skillPointCap);
    expect(result.xp.WHEELS).toBeGreaterThanOrEqual(14_000);
  });

  it('stops every skill at the shared total cap of 100 points', () => {
    const events = (['HUSTLE', 'MUSCLE', 'WHEELS', 'FIXER'] as const).flatMap((skill) => Array.from({ length: 200 }, (_, index) => ({
      skill,
      sourceKey: `${skill}:${index}`,
      baseXp: 10_000,
      settledAt: day(index),
      joinedAt: day(0),
    })));
    const result = simulateStreetSkillSeason(events, STREET_SKILLS_V1);
    const total = Object.values(result.points).reduce((sum, points) => sum + points, 0);
    expect(total).toBe(STREET_SKILLS_V1.totalPointCap);
    expect(Math.max(...Object.values(result.points))).toBeLessThanOrEqual(STREET_SKILLS_V1.skillPointCap);
  });
});
