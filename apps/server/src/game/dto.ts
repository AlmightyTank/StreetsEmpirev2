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
  RoundOverBadgeDto,
  RoundOverDto,
  RoundOverLegacyDto,
  RoundDto,
  RoundPlayerDto,
  SeasonHideoutDto,
} from '@streets/shared';
import { explainThugHappiness, explainWhoreHappiness, totalWeapons } from '@streets/rules-engine';
import { fitThugs } from '../services/action.service.js';
import type { TurnSettlement } from '../services/turn.service.js';
import { toHeatDto } from '../services/heat.service.js';

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
    emailVerifiedAt: account.emailVerifiedAt?.toISOString() ?? null,
    discordLinked: Boolean(account.discordId),
    discordUsername: account.discordUsername,
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
function armedThugsForDto(player: RoundPlayer): number {
  return Math.min(fitThugs(player), totalWeapons(player));
}

function movement(start: number | null, current: number | null): number | null {
  if (start === null || current === null) return null;
  return start - current;
}

export function toSeasonHideoutDto(player: Pick<RoundPlayer,
  'hideoutSafeRoomLevel' | 'hideoutLookoutsLevel' | 'hideoutWorkshopLevel' | 'hideoutBackOfficeLevel'
>): SeasonHideoutDto {
  const rooms = [
    { key: 'SAFE_ROOM' as const, name: 'Safe Room', level: player.hideoutSafeRoomLevel, maxLevel: 5 },
    { key: 'LOOKOUTS' as const, name: 'Lookouts', level: player.hideoutLookoutsLevel, maxLevel: 5 },
    { key: 'WORKSHOP' as const, name: 'Workshop', level: player.hideoutWorkshopLevel, maxLevel: 5 },
    { key: 'BACK_OFFICE' as const, name: 'Back Office', level: player.hideoutBackOfficeLevel, maxLevel: 5 },
  ];

  return {
    totalLevel: rooms.reduce((sum, room) => sum + room.level, 0),
    totalMaxLevel: rooms.reduce((sum, room) => sum + room.maxLevel, 0),
    rooms,
  };
}

/**
 * `turns` comes from the settlement that just ran, not from the stored row, so
 * the countdown the client renders is anchored to the same clock the server
 * used to hand out those turns.
 */
export function toRoundPlayerDto(
  player: RoundPlayer & { city: City; alliance?: { name: string; tag: string } | null },
  ruleset: Ruleset,
  turns: TurnSettlement,
  /** 0.4.0-C. Non-crack product stock from settling, where products move happiness. */
  products?: Record<string, number>,
  /** 0.5.0-B. The run in one line, from settling. */
  run: RoundPlayerDto['run'] = null,
  /** 0.5.0-D. The move on the road, from settling. */
  moving: RoundPlayerDto['moving'] = null,
  /** 0.5.0-E. A tail on the player's run or an ally's call, from settling. */
  convoyAlert: RoundPlayerDto['convoyAlert'] = null,
): RoundPlayerDto {
  return {
    id: player.id,
    publicPimpId: player.publicPimpId,
    displayName: player.displayName,
    alliance: player.alliance ? { name: player.alliance.name, tag: player.alliance.tag } : null,
    city: toCityDto(player.city),

    payoutPercent: player.payoutPercent,
    netWorthCents: centsToNumber(player.netWorthCents),

    resources: {
      cashCents: centsToNumber(player.cashCents),
      whores: player.whores,
      thugs: player.thugs,
      fitThugs: fitThugs(player),
      woundedThugs: player.woundedThugs,
      postedThugs: player.postedThugs,
      armedThugs: armedThugsForDto(player),
      unarmedThugs: Math.max(0, fitThugs(player) - armedThugsForDto(player)),
      condoms: player.condoms,
      medicine: player.medicine,
      product: player.crack,
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
      whoreTerms: explainWhoreHappiness({ ...player, products }, ruleset).terms,
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
    hideout: toSeasonHideoutDto(player),
    heat: toHeatDto(player.heat, player.netWorthCents, ruleset, player.lockedUntil),
    run,
    moving,
    convoyAlert,
    products: ruleset.products
      ? Object.entries(ruleset.products).sort(([, a], [, b]) => a.sortOrder - b.sortOrder).map(([key, product]) => ({
        key, name: product.name, quantity: key === 'CRACK' ? player.crack : products?.[key] ?? 0,
      }))
      : null,

    joinedAt: player.createdAt.toISOString(),
    lastActiveAt: player.lastActiveAt.toISOString(),
  };
}

export function toRoundOverDto(input: {
  round: Round;
  playerCount: number;
  player: RoundPlayer & { city: City };
  legacy: RoundOverLegacyDto;
  earnedLegacyBadges: RoundOverBadgeDto[];
  newLegacyBadges: RoundOverBadgeDto[];
}): RoundOverDto {
  return {
    round: toRoundDto(input.round, input.playerCount),
    player: {
      publicPimpId: input.player.publicPimpId,
      displayName: input.player.displayName,
      city: toCityDto(input.player.city),
      netWorthCents: centsToNumber(input.player.netWorthCents),
      cashCents: centsToNumber(input.player.cashCents),
      rank: {
        local: input.player.localRank,
        national: input.player.nationalRank,
      },
      hideout: toSeasonHideoutDto(input.player),
      joinedAt: input.player.createdAt.toISOString(),
      lastActiveAt: input.player.lastActiveAt.toISOString(),
    },
    legacy: input.legacy,
    earnedLegacyBadges: input.earnedLegacyBadges,
    newLegacyBadges: input.newLegacyBadges,
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
  products?: Record<string, number>;
  run?: RoundPlayerDto['run'];
  moving?: RoundPlayerDto['moving'];
  convoyAlert?: RoundPlayerDto['convoyAlert'];
  recentActivity: PlayerActivity[];
}): GameSnapshotDto {
  return {
    round: toRoundDto(input.round, input.playerCount),
    player: toRoundPlayerDto(input.player, input.ruleset, input.turns, input.products, input.run ?? null, input.moving ?? null, input.convoyAlert ?? null),
    recentActivity: input.recentActivity.map(toActivityDto),
  };
}
