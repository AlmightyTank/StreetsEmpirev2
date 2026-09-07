/**
 * The contract between apps/server and apps/web.
 *
 * Money crosses the wire as integer cents in a `*Cents` field. The client
 * formats it; nothing multiplies or divides money on the way through.
 */

export type RoundStatus =
  | 'SCHEDULED'
  | 'REGISTRATION'
  | 'ACTIVE'
  | 'ENDED'
  | 'ARCHIVED';

export type ActivityType =
  | 'ROUND_JOINED'
  | 'SCOUT'
  | 'PRODUCE_CRACK'
  | 'STORE_BUY'
  | 'STORE_SELL'
  | 'PAYOUT_CHANGE'
  | 'AWAY_BONUS';

export interface ApiErrorBody {
  error: {
    /** Machine readable, e.g. NOT_ENOUGH_TURNS. */
    code: string;
    /** Written for a player, not a developer. Section 50. */
    message: string;
    /** Field level messages for form validation. */
    fields?: Record<string, string>;
  };
}

export interface AccountDto {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CityDto {
  id: string;
  slug: string;
  name: string;
  isEnabled: boolean;
}

export interface RoundDto {
  id: string;
  name: string;
  slug: string;
  status: RoundStatus;
  rulesetId: string;
  rulesetVersion: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string | null;
  /** Milliseconds remaining, or 0 once the round is over. */
  msRemaining: number;
  playerCount: number;
}

export interface TurnsDto {
  turns: number;
  turnCap: number;
  /** ISO timestamp of the next tick. Display only. */
  nextTurnAt: string;
  turnsGeneratedNextTick: number;
}

export interface ResourcesDto {
  cashCents: number;

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
}

export interface HappinessDto {
  whore: number;
  thug: number;
}

export interface RankDto {
  local: number | null;
  national: number | null;
  dailyStartingLocal: number | null;
  dailyStartingNational: number | null;
  /** Positive = climbed since the daily reset. */
  localMovement: number | null;
  nationalMovement: number | null;
}

export interface RoundPlayerDto {
  id: string;
  publicPimpId: number;
  displayName: string;
  city: CityDto;

  payoutPercent: number;
  netWorthCents: number;

  resources: ResourcesDto;
  turns: TurnsDto;
  happiness: HappinessDto;
  rank: RankDto;

  joinedAt: string;
  lastActiveAt: string;
}

export interface ActivityDto {
  id: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** GET /api/game/me - one authoritative dashboard payload. Section 45. */
export interface GameSnapshotDto {
  round: RoundDto;
  player: RoundPlayerDto;
  recentActivity: ActivityDto[];
}

/** A single resource moving. Section 44. */
export interface ResourceChange {
  resource: string;
  before: number;
  after: number;
  change: number;
}

/** Section 43. Every action endpoint answers in this shape. */
export interface PlayerSnapshot {
  cashCents: number;
  netWorthCents: number;
  turns: number;
  whoreHappiness: number;
  thugHappiness: number;
  resources: ResourcesDto;
}

export interface RankChanges {
  localBefore: number | null;
  localAfter: number | null;
  nationalBefore: number | null;
  nationalAfter: number | null;
}

export interface GameActionResult<T> {
  success: true;
  action: string;
  before: PlayerSnapshot;
  after: PlayerSnapshot;
  changes: ResourceChange[];
  result: T;
  rankChanges?: RankChanges;
}

// --- actions ----------------------------------------------------------------

export interface DistrictDto {
  key: string;
  slug: string;
  name: string;
  /** Rough guidance for the player, not the raw balance numbers. */
  recruiting: 'low' | 'medium' | 'high';
  money: 'low' | 'medium' | 'high';
  /**
   * What this district is actually worth to this player right now, after
   * diminishing returns. Shown so a shrinking rate reads as a mechanic rather
   * than a bug.
   */
  expectedWhoresPerTurn: number;
  expectedThugsPerTurn: number;
}

export interface DistrictsDto {
  districts: DistrictDto[];
  /** Recruitment left after the crew's own size, 0..1. */
  recruitment: { whores: number; thugs: number };
}

/** Upkeep every turn-spending action pays. Sections 27 and 30. */
export interface UpkeepResult {
  condomsUsed: number;
  crackUsed: number;
  beerUsed: number;
  whoresLeft: number;
  thugsLeft: number;
  /** What the whores brought in before the payout split. */
  grossEarnedCents: number;
  /** The pimp's cut, which is what landed in cash. */
  cashEarnedCents: number;
  turnsUsed: number;
  turnsRemaining: number;
}

export interface ScoutResult extends UpkeepResult {
  district: DistrictDto;
  whoresRecruited: number;
  thugsRecruited: number;
}

export interface ProduceCrackResult extends UpkeepResult {
  crackProduced: number;
}

export interface PayoutResult {
  before: number;
  after: number;
}
