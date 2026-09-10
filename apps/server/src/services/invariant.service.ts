import { restockedItems, type Ruleset } from '@streets/rules-engine';

export interface InvariantPlayerState {
  cashCents: bigint;
  turns: number;
  payoutPercent: number;
  whores: number;
  thugs: number;
  condoms: number;
  medicine: number;
  crack: number;
  beer: number;
  pistols: number;
  shotguns: number;
  tek9s: number;
  ak47s: number;
  lowRiders: number;
  cleanShiftStreak: number;
  rocksSuppliedToPip: number;
  pistolStock: number;
  shotgunStock: number;
  tek9Stock: number;
  ak47Stock: number;
  lowRiderStock: number;
  condomStock: number;
  medicineStock: number;
  beerStock: number;
  crackStock: number;
  thugStock: number;
}

const WHOLE_NON_NEGATIVE: readonly (keyof InvariantPlayerState)[] = [
  'turns',
  'whores',
  'thugs',
  'condoms',
  'medicine',
  'crack',
  'beer',
  'pistols',
  'shotguns',
  'tek9s',
  'ak47s',
  'lowRiders',
  'cleanShiftStreak',
  'rocksSuppliedToPip',
  'pistolStock',
  'shotgunStock',
  'tek9Stock',
  'ak47Stock',
  'lowRiderStock',
  'condomStock',
  'medicineStock',
  'beerStock',
  'crackStock',
  'thugStock',
];

function invalid(message: string): never {
  // Deliberately not an AppError: invariant failures are server bugs, so the
  // central error handler logs the detail and gives the player the generic 500.
  throw new RangeError(`Player-state invariant failed: ${message}`);
}

/**
 * 0.1.0-H. Last line of defense before an action is committed.
 *
 * Calculators and service validation should make these impossible already. If
 * a future balance change ever creates a negative resource, NaN, fractional
 * inventory or an out-of-rules payout, fail the transaction instead of
 * persisting a corrupt/exploitable player row.
 */
export function assertPlayerState(
  state: InvariantPlayerState,
  ruleset: Ruleset,
  phase: 'before' | 'after' = 'after',
): void {
  if (state.cashCents < 0n) invalid(`${phase}.cashCents is negative`);

  for (const field of WHOLE_NON_NEGATIVE) {
    const value = state[field];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      invalid(`${phase}.${field} must be a non-negative safe integer`);
    }
  }

  const payout = state.payoutPercent;
  if (
    !Number.isSafeInteger(payout) ||
    payout < ruleset.economy.payout.min ||
    payout > ruleset.economy.payout.max
  ) {
    invalid(`${phase}.payoutPercent is outside the ruleset`);
  }

  // A shelf above its cap is how an unlimited-stock exploit would look.
  for (const [field, { rule }] of restockedItems(ruleset)) {
    if (state[field] > rule.cap) {
      invalid(`${phase}.${field} is above the ruleset cap`);
    }
  }
}
