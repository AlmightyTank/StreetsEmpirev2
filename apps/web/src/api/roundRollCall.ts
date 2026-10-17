import type { GameActionResult, QuestRewardDto } from '@streets/shared';
import { api } from './client.js';

export const ROUND_ROLL_CALL_CHECKED_IN_EVENT = 'streets:round-roll-call-checked-in';

export interface RoundRollCallNewStamp { stamps: number; requiredStamps: number; }
let unshownStamp: RoundRollCallNewStamp | null = null;

/** Handles the first sign-in check-in that may arrive before the game shell mounts. */
export function publishRoundRollCallStamp(stamp: RoundRollCallNewStamp): void {
  unshownStamp = stamp;
  window.dispatchEvent(new CustomEvent(ROUND_ROLL_CALL_CHECKED_IN_EVENT, { detail: stamp }));
}

export function consumeRoundRollCallStamp(): RoundRollCallNewStamp | null {
  const stamp = unshownStamp;
  unshownStamp = null;
  return stamp;
}


export type RoundRollCallRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface RoundRollCallTier {
  tier: number;
  key: string;
  rewardVersion: string;
  rarity: RoundRollCallRarity;
  reached: boolean;
  claimed: boolean;
  claimedAt: string | null;
  claimable: boolean;
  rewards: QuestRewardDto[];
}

export type RollCallRecoveryReason =
  'ready' | 'closed' | 'complete' | 'limit' | 'allowance' | 'genuine_stamp' | 'no_eligible_day';

export interface RoundRollCallRecoveryStatus {
  used: number;
  limit: number;
  remaining: number;
  eligible: boolean;
  reason: RollCallRecoveryReason;
  nextDayIndex: number | null;
  genuineStamps: number;
  history: { dayIndex: number; recoveredAt: string }[];
}
export interface RoundRollCallRecoverResult extends RoundRollCallCheckIn {
  replayed: boolean;
  dayIndex: number;
  recovery: RoundRollCallRecoveryStatus;
}

export interface RoundRollCallBoard {
  rewardVersion: string;
  roundDays: number;
  requiredStamps: number;
  allowanceDays: number;
  roundDay: number;
  stamps: number;
  completed: boolean;
  active: boolean;
  ended: boolean;
  alreadyCheckedInToday: boolean;
  canCheckInToday: boolean;
  checkedInRoundDays: number[];
  missedCompletedDays: number;
  allowanceRemaining: number;
  canStillFinish: boolean;
  nextDayAt: string | null;
  roundEndsAt: string;
  grandPrize: {
    unlocked: boolean;
    themeOwned: boolean;
    crewOwned: boolean;
    themeStyle: string;
    crewStyle: string;
    name: string;
  };
  recovery: RoundRollCallRecoveryStatus;
  rewardTrack: RoundRollCallTier[];
}

export interface RoundRollCallClaimResult {
  rewardVersion: string;
  tier: number;
  rarity: RoundRollCallRarity;
  rewards: QuestRewardDto[];
}

export interface RoundRollCallCheckIn {
  recorded: boolean;
  stamps: number;
  requiredStamps: number;
  completed: boolean;
}

export const roundRollCallApi = {
  board: () => api.get<RoundRollCallBoard>('/game/round-roll-call'),
  checkIn: () => api.post<RoundRollCallCheckIn>('/game/round-roll-call/check-in'),
  recover: (actionId: string) => api.post<RoundRollCallRecoverResult>('/game/round-roll-call/recover', { actionId }),
  claim: (tier: number, actionId: string) =>
    api.post<GameActionResult<RoundRollCallClaimResult>>('/game/round-roll-call/claim', { tier, actionId }),
};
