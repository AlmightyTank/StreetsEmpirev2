/**
 * 2.2.0 operation catalog. Budgets live here so a round can pin them.
 * Exact cents are ruleset content; receipts enforce whatever snapshot was copied at start.
 */

export interface UnderworldRoleRule {
  readonly key: string;
  readonly allianceOnly?: boolean;
}

export interface UnderworldWindowRule {
  readonly key: 'intel' | 'prep' | 'action';
  readonly optional: boolean;
  readonly sourceKinds: readonly string[];
}

export interface UnderworldBandRule {
  readonly payoutCents: number;
  readonly label: string;
}

export interface UnderworldOperationTemplate {
  readonly key: 'STASH_RECOVERY' | 'CONVOY_PROTECTION' | 'BLOCK_DEFENSE' | 'BIG_SCORE';
  readonly label: string;
  readonly roles: readonly UnderworldRoleRule[];
  readonly minSeats: number;
  readonly soloCapable: boolean;
  readonly startCostCents: number;
  readonly deadlineHours: number;
  readonly inviteTtlHours: number;
  readonly cooldownHours: number;
  readonly inviteLimitPerHour: number;
  readonly collusionPairLimit: number;
  readonly rewardCapCents: number;
  readonly units: number;
  readonly productKey: string;
  readonly bands: {
    readonly success: UnderworldBandRule;
    readonly partial: UnderworldBandRule;
    readonly failure: UnderworldBandRule;
  };
  readonly windows: readonly UnderworldWindowRule[];
  readonly milestone: { readonly kind: string; readonly title: string } | null;
}

export interface UnderworldOperationCatalog {
  readonly version: string;
  readonly templates: readonly UnderworldOperationTemplate[];
}

const bands = (success: number, partial: number, successLabel: string, partialLabel: string, failureLabel: string) => ({
  success: { payoutCents: success, label: successLabel },
  partial: { payoutCents: partial, label: partialLabel },
  failure: { payoutCents: 0, label: failureLabel },
});

export const UNDERWORLD_OPERATIONS_V1: UnderworldOperationCatalog = {
  version: '2.2.0-A',
  templates: [
    {
      key: 'STASH_RECOVERY',
      label: 'Stash Recovery',
      roles: [{ key: 'runner' }],
      minSeats: 1,
      soloCapable: true,
      startCostCents: 0,
      deadlineHours: 24,
      inviteTtlHours: 12,
      cooldownHours: 12,
      inviteLimitPerHour: 8,
      collusionPairLimit: 4,
      rewardCapCents: 30_000,
      units: 5,
      productKey: 'CRACK',
      bands: bands(30_000, 15_000, 'The stash comes home', 'You got some of it out', 'The stash is still sitting there'),
      windows: [{ key: 'action', optional: false, sourceKinds: ['supply-stock'] }],
      milestone: null,
    },
    {
      key: 'CONVOY_PROTECTION',
      label: 'Convoy Protection',
      roles: [{ key: 'driver' }, { key: 'escort' }],
      minSeats: 1,
      soloCapable: true,
      startCostCents: 0,
      deadlineHours: 24,
      inviteTtlHours: 12,
      cooldownHours: 12,
      inviteLimitPerHour: 8,
      collusionPairLimit: 4,
      rewardCapCents: 40_000,
      units: 0,
      productKey: 'CRACK',
      bands: bands(40_000, 20_000, 'The shipment lands', 'The escort held part of the road', 'The shipment was on its own'),
      windows: [{ key: 'prep', optional: false, sourceKinds: ['run'] }],
      milestone: null,
    },
    {
      key: 'BLOCK_DEFENSE',
      label: 'Block Defense',
      roles: [{ key: 'defender' }, { key: 'enforcer', allianceOnly: true }],
      minSeats: 1,
      soloCapable: true,
      startCostCents: 0,
      deadlineHours: 12,
      inviteTtlHours: 6,
      cooldownHours: 12,
      inviteLimitPerHour: 8,
      collusionPairLimit: 4,
      rewardCapCents: 25_000,
      units: 0,
      productKey: 'CRACK',
      bands: bands(25_000, 10_000, 'The block holds', 'You slowed them down', 'The threat outlasted the crew'),
      windows: [{ key: 'action', optional: false, sourceKinds: ['block-war', 'turf-push'] }],
      milestone: null,
    },
    {
      key: 'BIG_SCORE',
      label: 'The Big Score',
      roles: [{ key: 'intel' }, { key: 'driver' }, { key: 'enforcer' }],
      minSeats: 1,
      soloCapable: true,
      startCostCents: 5_000,
      deadlineHours: 72,
      inviteTtlHours: 24,
      cooldownHours: 48,
      inviteLimitPerHour: 6,
      collusionPairLimit: 3,
      rewardCapCents: 10_000,
      units: 0,
      productKey: 'CRACK',
      bands: bands(10_000, 4_000, 'The score is told for years', 'You got a piece of the plan', 'The score never came together'),
      windows: [
        { key: 'intel', optional: true, sourceKinds: ['intel-rumor'] },
        { key: 'prep', optional: true, sourceKinds: ['run'] },
        { key: 'action', optional: false, sourceKinds: ['block-war', 'turf-push'] },
      ],
      milestone: { kind: 'operation_big_score', title: 'The Big Score' },
    },
  ],
};
