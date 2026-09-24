import { describe, expect, it } from 'vitest';
import type { QuestRewardDefinition } from '../types.js';
import { classicOgV07S } from '../classic-og-v0.7-s/index.js';
import { communityEvents } from '../classic-og-v0.7-t/community-events.js';
import { classicOgV07T } from '../classic-og-v0.7-t/index.js';
import { hideoutV2For, hideoutV2Problems } from '../hideout-v2.js';

describe('quest roadmap Phase U community events', () => {
  it('preserves T and adds four seasonal community events', () => {
    expect(Object.keys(classicOgV07S.questDefinitions ?? {})).toHaveLength(60);
    expect(Object.keys(communityEvents)).toHaveLength(4);
    expect(Object.keys(classicOgV07T.questDefinitions ?? {})).toHaveLength(64);

    for (const definition of Object.values(communityEvents)) {
      expect(definition.type).toBe('EVENT');
      expect(definition.repeatability).toBe('ONCE');
      expect(definition.availability.communityEvent).toBe(true);
      expect(Number(definition.availability.personalContributionTarget)).toBeGreaterThan(0);
    }
  });

  it('covers the full round in four non-overlapping quarter windows', () => {
    const windows = Object.values(communityEvents)
      .map((definition) => [
        Number(definition.availability.roundStartFraction),
        Number(definition.availability.roundEndFraction),
      ])
      .sort((left, right) => left[0]! - right[0]!);

    expect(windows).toEqual([
      [0, 0.25],
      [0.25, 0.5],
      [0.5, 0.75],
      [0.75, 1],
    ]);
  });

  it('uses existing authoritative activity sources', () => {
    expect(communityEvents.EVENT_OPENING_RUSH.objectives[0]).toMatchObject({
      kind: 'EVENT_COUNT',
      target: 100,
      params: { eventTypes: ['SCOUT'] },
    });
    expect(communityEvents.EVENT_MONEY_IN_MOTION.objectives[0]).toMatchObject({
      kind: 'EVENT_SUM',
      target: 100_000_000,
      params: { eventTypes: ['STORE_SELL'], field: 'totalCents', display: 'CURRENCY' },
    });
    expect(communityEvents.EVENT_INTERSTATE_PUSH.objectives[0]).toMatchObject({
      kind: 'EVENT_COUNT',
      target: 25,
      params: { eventTypes: ['RUN_RETURNED'] },
    });
    expect(communityEvents.EVENT_LAST_CALL.objectives[0]).toMatchObject({
      kind: 'EVENT_COUNT',
      target: 40,
      params: { eventTypes: ['RAID_ATTACK', 'TURF_PUSH_ATTACK'] },
    });
  });

  it('keeps rewards seasonal and bounded', () => {
    const rewards: QuestRewardDefinition[] = Object.values(communityEvents)
      .flatMap((quest) => [...quest.rewards]);

    expect(rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK')).toBe(false);
    expect(rewards.some((reward) => reward.kind === 'WEAPON_ACCESS')).toBe(false);
    expect(rewards.some((reward) => reward.kind === 'CONTACT_REP')).toBe(false);

    const cash = rewards.filter((reward) => reward.kind === 'CASH').map((reward) => reward.amount ?? 0);
    expect(Math.min(...cash)).toBeGreaterThanOrEqual(1_500_000);
    expect(Math.max(...cash)).toBeLessThanOrEqual(2_500_000);
  });

  it('inherits all Phase T behavior unchanged', () => {
    for (const definition of Object.values(classicOgV07S.questDefinitions ?? {})) {
      expect(classicOgV07T.questDefinitions?.[definition.key]).toEqual(definition);
    }
    expect(classicOgV07T.favors).toEqual(classicOgV07S.favors);
    expect(classicOgV07T.permanentUnlocks).toEqual(classicOgV07S.permanentUnlocks);
    expect(hideoutV2For(classicOgV07T)).toEqual(hideoutV2For(classicOgV07S));
    expect(hideoutV2Problems(classicOgV07T)).toEqual([]);
  });
});
