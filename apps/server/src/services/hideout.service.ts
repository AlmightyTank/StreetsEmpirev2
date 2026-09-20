import type { PrismaClient } from '@prisma/client';
import type { HideoutRoomKey, Ruleset } from '@streets/rulesets';
import type {
  GameActionResult,
  HideoutDto,
  HideoutRoomDto,
  HideoutUpgradeInput,
  HideoutUpgradeResult,
} from '@streets/shared';
import { ActionService, type PlayerState } from './action.service.js';
import { AppError } from '../utils/errors.js';

type HideoutField =
  | 'hideoutSafeRoomLevel'
  | 'hideoutLookoutsLevel'
  | 'hideoutWorkshopLevel'
  | 'hideoutBackOfficeLevel'
  | 'hideoutGarageLevel';

const ROOM_FIELDS: Record<HideoutRoomKey, HideoutField> = {
  SAFE_ROOM: 'hideoutSafeRoomLevel',
  LOOKOUTS: 'hideoutLookoutsLevel',
  WORKSHOP: 'hideoutWorkshopLevel',
  BACK_OFFICE: 'hideoutBackOfficeLevel',
  GARAGE: 'hideoutGarageLevel',
};

const ROOM_ORDER: readonly HideoutRoomKey[] = ['SAFE_ROOM', 'LOOKOUTS', 'WORKSHOP', 'BACK_OFFICE', 'GARAGE'];

function levelOf(player: Pick<PlayerState, HideoutField>, room: HideoutRoomKey): number {
  return player[ROOM_FIELDS[room]];
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function effect(room: HideoutRoomKey, level: number, ruleset: Ruleset): string {
  const hideout = ruleset.hideout;
  if (!hideout || level <= 0) return 'No active bonus yet.';

  const buffs = hideout.buffs;
  if (room === 'SAFE_ROOM') {
    return `${dollars(level * buffs.safeRoomProtectedCashCentsPerLevel)} extra cash protected from raids.`;
  }
  if (room === 'LOOKOUTS') {
    return `+${level * buffs.lookoutsDefenseBonusPercentPerLevel}% home raid defense strength.`;
  }
  if (room === 'WORKSHOP') {
    return `+${level * buffs.workshopCrackBonusPercentPerLevel}% product from production.`;
  }
  if (room === 'GARAGE') {
    return `Up to ${level > 0 ? (buffs.garageRunLimit ?? 2) : 1} active runs at once.`;
  }
  return `+${level * buffs.backOfficeTakeBonusPercentPerLevel}% personal cash take from street work.`;
}

function toRoomDto(room: HideoutRoomKey, ruleset: Ruleset, player: Pick<PlayerState, HideoutField>): HideoutRoomDto {
  const rule = ruleset.hideout!.rooms[room];
  if (!rule) throw new RangeError(`Hideout room ${room} is not enabled in this ruleset.`);
  const level = levelOf(player, room);
  const nextCostCents = level >= rule.maxLevel ? null : rule.costsCents[level] ?? null;

  return {
    key: room,
    name: rule.name,
    blurb: rule.blurb,
    level,
    maxLevel: rule.maxLevel,
    nextCostCents,
    currentEffect: effect(room, level, ruleset),
    nextEffect: level >= rule.maxLevel ? null : effect(room, level + 1, ruleset),
  };
}

export function hideoutCatalog(ruleset: Ruleset, player: Pick<PlayerState, HideoutField>): HideoutDto {
  if (!ruleset.hideout) {
    return { enabled: false, seasonScoped: true, totalLevel: 0, totalMaxLevel: 0, rooms: [] };
  }

  const rooms = ROOM_ORDER.filter((room) => Boolean(ruleset.hideout!.rooms[room]))
    .map((room) => toRoomDto(room, ruleset, player));
  return {
    enabled: true,
    seasonScoped: true,
    totalLevel: rooms.reduce((sum, room) => sum + room.level, 0),
    totalMaxLevel: rooms.reduce((sum, room) => sum + room.maxLevel, 0),
    rooms,
  };
}

export function hideoutProtectedCashBonusCents(ruleset: Ruleset, player: Pick<PlayerState, HideoutField>): number {
  return (ruleset.hideout?.buffs.safeRoomProtectedCashCentsPerLevel ?? 0) * player.hideoutSafeRoomLevel;
}

export function hideoutDefenseBonusPercent(ruleset: Ruleset, player: Pick<PlayerState, HideoutField>): number {
  return (ruleset.hideout?.buffs.lookoutsDefenseBonusPercentPerLevel ?? 0) * player.hideoutLookoutsLevel;
}

export function hideoutWorkshopBonusCrack(base: number, ruleset: Ruleset, player: Pick<PlayerState, HideoutField>): number {
  const percent = (ruleset.hideout?.buffs.workshopCrackBonusPercentPerLevel ?? 0) * player.hideoutWorkshopLevel;
  return Math.floor(base * percent / 100);
}

export function hideoutBackOfficeBonusCents(base: bigint, ruleset: Ruleset, player: Pick<PlayerState, HideoutField>): bigint {
  const percent = (ruleset.hideout?.buffs.backOfficeTakeBonusPercentPerLevel ?? 0) * player.hideoutBackOfficeLevel;
  return (base * BigInt(percent)) / 100n;
}

export const HideoutService = {
  catalog(ruleset: Ruleset, player: PlayerState): HideoutDto {
    return hideoutCatalog(ruleset, player);
  },

  upgrade(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: HideoutUpgradeInput,
  ): Promise<GameActionResult<HideoutUpgradeResult>> {
    return ActionService.run<HideoutUpgradeResult>(prisma, roundPlayerId, {
      action: 'HIDEOUT_UPGRADE',
      actionId: input.actionId,
      execute: ({ current, ruleset }) => {
        const hideout = ruleset.hideout;
        if (!hideout) {
          throw AppError.conflict('HIDEOUT_DISABLED', 'Hideouts are not available in this round.');
        }

        const room = input.room as HideoutRoomKey;
        const rule = hideout.rooms[room];
        const field = ROOM_FIELDS[room];
        if (!rule) throw AppError.badRequest('HIDEOUT_ROOM_DISABLED', 'That room is not available in this round.');
        const levelBefore = current[field];
        if (levelBefore >= rule.maxLevel) {
          throw AppError.badRequest('HIDEOUT_MAXED', `${rule.name} is already fully upgraded.`);
        }

        const maybeCostCents = rule.costsCents[levelBefore];
        if (!Number.isSafeInteger(maybeCostCents) || maybeCostCents === undefined || maybeCostCents <= 0) {
          throw AppError.conflict('HIDEOUT_RULES_INVALID', 'This hideout upgrade is missing a price.');
        }
        const costCents = maybeCostCents;
        if (current.cashCents < BigInt(costCents)) {
          throw AppError.badRequest('NOT_ENOUGH_CASH', `You need ${dollars(costCents)} for the next ${rule.name} upgrade.`);
        }

        const levelAfter = levelBefore + 1;
        return {
          next: {
            ...current,
            cashCents: current.cashCents - BigInt(costCents),
            [field]: levelAfter,
          },
          result: {
            room,
            roomName: rule.name,
            levelBefore,
            levelAfter,
            costCents,
            effect: effect(room, levelAfter, ruleset),
          },
          activity: {
            type: 'HIDEOUT_UPGRADE',
            payload: { room, name: rule.name, level: levelAfter, costCents },
          },
        };
      },
    });
  },
};
