import type {
  Account,
  City,
  PlayerActivity,
  Round,
  RoundPlayer,
} from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type {
  AccountDto,
  ActivityDto,
  CityDto,
  GameSnapshotDto,
  RoundDto,
  RoundPlayerDto,
} from '@streets/shared';
import { explainThugHappiness, explainWhoreHappiness } from '@streets/rules-engine';
import type { TurnSettlement } from '../services/turn.service.js';

/**
 * Money leaves the server as integer cents in a *Cents field and is never
 * divided on the way out. BigInt is narrowed to number here because JSON has
 * no bigint - safe well past any net worth a round can produce.
 */
function centsToNumber(value: bigint): number {
  return Number(value);
}

export function toAccountDto(account: Account): AccountDto {
  return {
    id: account.id,
    username: account.username,
    email: account.email,
    isAdmin: account.isAdmin,
    createdAt: account.createdAt.toISOString(),
    lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
  };
}

export function toCityDto(city: City): CityDto {
  return {
    id: city.id,
    slug: city.slug,
    name: city.name,
    isEnabled: city.isEnabled,
  };
}

export function toRoundDto(round: Round, playerCount: number): RoundDto {
  return {
    id: round.id,
    name: round.name,
    slug: round.slug,
    status: round.status,
    rulesetId: round.rulesetId,
    rulesetVersion: round.rulesetVersion,
    startsAt: round.startsAt.toISOString(),
    endsAt: round.endsAt.toISOString(),
    registrationOpensAt: round.registrationOpensAt?.toISOString() ?? null,
    msRemaining: Math.max(0, round.endsAt.getTime() - Date.now()),
    playerCount,
  };
}

/** Lower rank number is better, so movement is start minus current. */
function movement(start: number | null, current: number | null): number | null {
  if (start === null || current === null) return null;
  return start - current;
}

/**
 * `turns` comes from the settlement that just ran, not from the stored row, so
 * the countdown the client renders is anchored to the same clock the server
 * used to hand out those turns.
 */
export function toRoundPlayerDto(
  player: RoundPlayer & { city: City },
  ruleset: Ruleset,
  turns: TurnSettlement,
): RoundPlayerDto {
  return {
    id: player.id,
    publicPimpId: player.publicPimpId,
    displayName: player.displayName,
    city: toCityDto(player.city),

    payoutPercent: player.payoutPercent,
    netWorthCents: centsToNumber(player.netWorthCents),

    resources: {
      cashCents: centsToNumber(player.cashCents),
      whores: player.whores,
      thugs: player.thugs,
      condoms: player.condoms,
      medicine: player.medicine,
      crack: player.crack,
      beer: player.beer,
      pistols: player.pistols,
      shotguns: player.shotguns,
      tek9s: player.tek9s,
      ak47s: player.ak47s,
      lowRiders: player.lowRiders,
    },

    turns: {
      turns: turns.turns,
      turnCap: turns.turnCap,
      nextTurnAt: turns.nextTurnAt.toISOString(),
      turnsGeneratedNextTick: turns.turnsGeneratedNextTick,
    },

    happiness: {
      whore: player.whoreHappiness,
      thug: player.thugHappiness,
      whoreTerms: explainWhoreHappiness(player, ruleset).terms,
      thugTerms: explainThugHappiness(player, ruleset).terms,
    },

    rank: {
      local: player.localRank,
      national: player.nationalRank,
      dailyStartingLocal: player.dailyStartingLocalRank,
      dailyStartingNational: player.dailyStartingNationalRank,
      localMovement: movement(player.dailyStartingLocalRank, player.localRank),
      nationalMovement: movement(
        player.dailyStartingNationalRank,
        player.nationalRank,
      ),
    },

    joinedAt: player.createdAt.toISOString(),
    lastActiveAt: player.lastActiveAt.toISOString(),
  };
}

export function toActivityDto(activity: PlayerActivity): ActivityDto {
  return {
    id: activity.id,
    type: activity.type as ActivityDto['type'],
    payload: (activity.payload ?? {}) as Record<string, unknown>,
    createdAt: activity.createdAt.toISOString(),
  };
}

/** Section 45. One authoritative payload, so the dashboard makes one request. */
export function toGameSnapshotDto(input: {
  round: Round;
  playerCount: number;
  player: RoundPlayer & { city: City };
  ruleset: Ruleset;
  turns: TurnSettlement;
  recentActivity: PlayerActivity[];
}): GameSnapshotDto {
  return {
    round: toRoundDto(input.round, input.playerCount),
    player: toRoundPlayerDto(input.player, input.ruleset, input.turns),
    recentActivity: input.recentActivity.map(toActivityDto),
  };
}
