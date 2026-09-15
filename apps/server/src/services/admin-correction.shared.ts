import type { Ruleset } from '@streets/rules-engine';
import { AppError } from '../utils/errors.js';
import type { PlayerState } from './action.service.js';
import { assertPlayerState } from './invariant.service.js';

/** The resource fields admin corrections touch, as plain numbers for audit records and activity. */
export const CORRECTION_FIELDS = [
  'cashCents', 'turns', 'whores', 'thugs', 'woundedThugs', 'condoms', 'medicine', 'crack', 'beer',
  'pistols', 'shotguns', 'tek9s', 'ak47s', 'lowRiders', 'driveBysDone',
] as const;

export type CorrectionSnapshot = Record<(typeof CORRECTION_FIELDS)[number], number>;

export function correctionSnapshot(state: PlayerState): CorrectionSnapshot {
  return Object.fromEntries(CORRECTION_FIELDS.map((field) => [field, Number(state[field])])) as CorrectionSnapshot;
}

/** Signed change per field, leaving out fields that did not move. */
export function correctionChanges(before: CorrectionSnapshot, after: CorrectionSnapshot): Record<string, number> {
  return Object.fromEntries(CORRECTION_FIELDS.filter((field) => after[field] !== before[field]).map((field) => [field, after[field] - before[field]]));
}

/** A correction must never leave a player in a state the game itself could not reach. */
export function assertCorrectionState(state: PlayerState, ruleset: Ruleset, who: string): void {
  try {
    assertPlayerState(state, ruleset);
  } catch (error) {
    throw AppError.conflict('CORRECTION_WOULD_BREAK_STATE', `That would leave ${who} in an impossible state (${error instanceof Error ? error.message : 'invalid state'}).`);
  }
}
