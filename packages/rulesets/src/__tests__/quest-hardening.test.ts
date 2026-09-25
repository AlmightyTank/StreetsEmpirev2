import { describe, expect, it } from 'vitest';
import { classicOgV07T } from '../classic-og-v0.7-t/index.js';
import { classicOgV07U } from '../classic-og-v0.7-u/index.js';
import { hardenedAllianceContracts } from '../classic-og-v0.7-u/alliance-contracts.js';

describe('quest roadmap Phase W balance and anti-abuse', () => {
  it('creates a new pinned ruleset without changing the quest catalog size', () => {
    expect(classicOgV07T.meta.id).toBe('classic-og-v0.7-t');
    expect(classicOgV07U.meta.id).toBe('classic-og-v0.7-u');
    expect(classicOgV07U.meta.version).toBe('0.7.0-U');
    expect(Object.keys(classicOgV07T.questDefinitions ?? {})).toHaveLength(64);
    expect(Object.keys(classicOgV07U.questDefinitions ?? {})).toHaveLength(64);

    for (const definition of Object.values(classicOgV07T.questDefinitions ?? {})) {
      if (definition.key.startsWith('ALLIANCE_')) continue;
      expect(classicOgV07U.questDefinitions?.[definition.key]).toEqual(definition);
    }
  });

  it('requires a small personal contribution before each shared alliance payout', () => {
    expect(hardenedAllianceContracts.ALLIANCE_HOLD_THE_CITY.availability.personalContribution)
      .toMatchObject({ kind: 'EVENT_COUNT', target: 1 });

    expect(hardenedAllianceContracts.ALLIANCE_WAR_CHEST.availability.personalContribution)
      .toMatchObject({
        kind: 'EVENT_SUM',
        target: 2_500_000,
        params: { eventTypes: ['STORE_SELL'], field: 'totalCents', display: 'CURRENCY' },
      });

    expect(hardenedAllianceContracts.ALLIANCE_REINFORCEMENTS.availability.personalContribution)
      .toMatchObject({
        kind: 'EVENT_SUM',
        target: 10,
        params: { field: 'thugs', where: { kind: 'ALLY' } },
      });

    expect(hardenedAllianceContracts.ALLIANCE_INTERSTATE_EMPIRE.availability.personalContribution)
      .toMatchObject({ kind: 'EVENT_COUNT', target: 1, params: { eventTypes: ['RUN_RETURNED'] } });
  });

  it('keeps repeatable jobs away from permanent competitive unlock rewards', () => {
    const repeatable = Object.values(classicOgV07U.questDefinitions ?? {})
      .filter((definition) => definition.repeatability !== 'ONCE');
    const rewardKinds = repeatable.flatMap((definition) =>
      definition.rewards.map((reward) => reward.kind)
    );

    expect(rewardKinds).not.toContain('PERMANENT_UNLOCK');
    expect(rewardKinds).not.toContain('WEAPON_ACCESS');
  });

  it('does not rebalance the shared alliance targets or rewards', () => {
    for (const key of Object.keys(hardenedAllianceContracts) as Array<keyof typeof hardenedAllianceContracts>) {
      expect(hardenedAllianceContracts[key].objectives).toEqual(
        classicOgV07T.questDefinitions?.[key]?.objectives,
      );
      expect(hardenedAllianceContracts[key].rewards).toEqual(
        classicOgV07T.questDefinitions?.[key]?.rewards,
      );
    }
  });
});
