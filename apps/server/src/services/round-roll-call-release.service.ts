import { ROUND_ROLL_CALL_ALLOWANCE_DAYS } from './round-roll-call.service.js';
import {
  ROUND_ROLL_CALL_REWARD_VERSION,
  ROLL_CALL_PER_STEP_CAPS,
  roundRollCallCatalog,
  validateRollCallRewards,
} from './round-roll-call-rewards.js';

export interface RollCallEconomyTotals {
  cashCents: number;
  turns: number;
  supplies: Record<'beer' | 'condoms' | 'medicine', number>;
}

/**
 * Worst-case liability assumes EVERY player claims EVERY tier. No stochastic
 * rewards or paid multipliers are permitted. Numbers are purely a dry run:
 * this service makes no grants and cannot alter a pinned round catalog.
 */
export function rollCallEconomyProjection(
  roundDays: number,
  players: number,
  rewardVersion: string = ROUND_ROLL_CALL_REWARD_VERSION,
) {
  if (!Number.isSafeInteger(roundDays) || roundDays < 0 || roundDays > 10_007) {
    throw new Error('Round Roll Call simulation needs 0..10007 whole round days.');
  }
  if (!Number.isSafeInteger(players) || players < 0 || players > 1_000_000) {
    throw new Error('Round Roll Call simulation needs 0..1000000 players.');
  }
  const requiredStamps = Math.max(0, roundDays - ROUND_ROLL_CALL_ALLOWANCE_DAYS);
  const catalog = roundRollCallCatalog(requiredStamps, rewardVersion);
  const perPlayer: RollCallEconomyTotals = {
    cashCents: 0, turns: 0, supplies: { beer: 0, condoms: 0, medicine: 0 },
  };
  const rarityCounts: Record<'common' | 'uncommon' | 'rare' | 'legendary', number> = {
    common: 0, uncommon: 0, rare: 0, legendary: 0,
  };
  for (const tier of catalog) {
    if (!validateRollCallRewards(tier.rewards)) throw new Error('Roll Call release simulation rejected unsafe reward.');
    rarityCounts[tier.rarity]++;
    for (const reward of tier.rewards) {
      const amount = reward.amount ?? 0;
      if (reward.kind === 'CASH') perPlayer.cashCents += amount;
      else if (reward.kind === 'TURNS') perPlayer.turns += amount;
      else if (reward.kind === 'ITEM' && reward.key && reward.key in perPlayer.supplies) {
        perPlayer.supplies[reward.key as keyof RollCallEconomyTotals['supplies']] += amount;
      } else throw new Error('Roll Call release simulation rejected non-consumable reward.');
    }
  }
  const totalSupplies = Object.values(perPlayer.supplies).reduce((total, amount) => total + amount, 0);
  const allStepsWithinCaps = catalog.every((tier) => tier.rewards.every((reward) => {
    const amount = reward.amount ?? 0;
    return reward.kind === 'CASH' ? amount <= ROLL_CALL_PER_STEP_CAPS.cashCents
      : reward.kind === 'TURNS' ? amount <= ROLL_CALL_PER_STEP_CAPS.turns
        : amount <= ROLL_CALL_PER_STEP_CAPS.supplies;
  }));
  return {
    rewardVersion,
    roundDays,
    requiredStamps,
    players,
    rarityCounts,
    perPlayer,
    totalSuppliesPerPlayer: totalSupplies,
    worstCase: {
      cashCents: perPlayer.cashCents * players,
      turns: perPlayer.turns * players,
      supplies: totalSupplies * players,
    },
    allStepsWithinCaps,
    finaleTier: requiredStamps > 0 ? requiredStamps : null,
    // Cosmetic entitlements are separate account-only items, not a gameplay
    // power grant; the underlying catalog has no cosmetic/weapon rewards.
    gameplayOnly: true,
  };
}

/**
 * Aggregate red flags for the operator page. Per-player stamp/receipt anomaly
 * checks are separately shown by /admin/round-roll-call/diagnose.
 */
export function rollCallReleaseWarnings(input: {
  players: number;
  roundDays: number;
  requiredStamps: number;
  actualLogins: number;
  recoveredStamps: number;
  recoveryAudits: number;
  rewardClaims: number;
  rewardVersion: string;
}): string[] {
  const warnings: string[] = [];
  if (input.recoveredStamps !== input.recoveryAudits) warnings.push('RECOVERY_AUDIT_MISMATCH');
  if (input.recoveredStamps > input.players * 2) warnings.push('RECOVERY_CAP_EXCEEDED');
  if (input.actualLogins + input.recoveredStamps > input.players * input.roundDays) {
    warnings.push('STAMP_CAP_EXCEEDED');
  }
  if (input.rewardClaims > input.players * input.requiredStamps) warnings.push('CLAIM_CAP_EXCEEDED');
  if (input.rewardVersion !== ROUND_ROLL_CALL_REWARD_VERSION) warnings.push('UNKNOWN_REWARD_VERSION');
  return warnings;
}
