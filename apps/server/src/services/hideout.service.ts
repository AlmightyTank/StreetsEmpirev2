import type { PrismaClient } from '@prisma/client';
import {
  hideoutV2For,
  type HideoutRequirementKey,
  type HideoutRoomKey,
  type Ruleset,
} from '@streets/rulesets';
import type {
  GameActionResult,
  HideoutRequirementDto,
  HideoutRoomV2Dto,
  HideoutUpgradeInput,
  HideoutUpgradeResult,
  HideoutV2Dto,
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

function requirementValue(key: HideoutRequirementKey, player: PlayerState): number {
  switch (key) {
    case 'CLEAN_SHIFT_STREAK':
      return player.cleanShiftStreak;
    case 'ROCKS_SUPPLIED':
      return player.rocksSuppliedToPip;
    case 'RAIDS_DONE':
      return player.raidsDone;
    case 'DRIVE_BYS_DONE':
      return player.driveBysDone;
    case 'LOW_RIDERS':
      return player.lowRiders;
    case 'WEAPONS_OWNED':
      return player.pistols + player.shotguns + player.tek9s + player.ak47s;
  }
}

/** Evaluates a room level's configured requirements against the player's current progress. */
function requirementsFor(
  room: HideoutRoomKey,
  targetLevel: number,
  ruleset: Ruleset,
  player: PlayerState,
): HideoutRequirementDto[] {
  const requirements = hideoutV2For(ruleset)?.rooms[room]?.requirements?.[targetLevel] ?? [];
  return requirements.map((requirement) => {
    const current = requirementValue(requirement.key, player);
    return {
      key: requirement.key,
      label: requirement.label,
      current,
      required: requirement.amount,
      met: current >= requirement.amount,
    };
  });
}

/** Summarizes unmet cash and progress requirements, or returns null when the upgrade is available. */
function roomLockReason(
  nextCostCents: number,
  player: PlayerState,
  requirements: readonly HideoutRequirementDto[],
): string | null {
  const missing: string[] = [];
  if (player.cashCents < BigInt(nextCostCents)) {
    missing.push(`${dollars(Number(BigInt(nextCostCents) - player.cashCents))} more cash`);
  }
  for (const requirement of requirements) {
    if (!requirement.met) {
      missing.push(`${requirement.label} ${requirement.current}/${requirement.required}`);
    }
  }
  return missing.length ? `Need ${missing.join('; ')}.` : null;
}

/** Exposes specialization choices without selecting one before branch persistence is available. */
function specializationFor(
  room: HideoutRoomKey,
  ruleset: Ruleset,
): HideoutRoomV2Dto['specialization'] {
  const specialization = hideoutV2For(ruleset)?.rooms[room]?.specialization;
  if (!specialization) return null;
  return {
    unlockLevel: specialization.unlockLevel,
    selectedKey: null,
    choices: specialization.choices.map((choice) => ({ ...choice })),
  };
}

/** Builds a player's room status; throws when the room or its next-level price is invalid. */
function toRoomDto(room: HideoutRoomKey, ruleset: Ruleset, player: PlayerState): HideoutRoomV2Dto {
  const rule = ruleset.hideout!.rooms[room];
  if (!rule) throw new RangeError(`Hideout room ${room} is not enabled in this ruleset.`);
  const level = levelOf(player, room);
  const maxed = level >= rule.maxLevel;
  const nextCostCents = maxed ? null : rule.costsCents[level] ?? null;
  const nextRequirements = maxed ? [] : requirementsFor(room, level + 1, ruleset, player);

  if (!maxed && (nextCostCents === null || !Number.isSafeInteger(nextCostCents) || nextCostCents <= 0)) {
    throw new RangeError(`Hideout room ${room} level ${level + 1} is missing a valid price.`);
  }

  const lockReason = maxed
    ? `${rule.name} is fully upgraded for this season.`
    : roomLockReason(nextCostCents!, player, nextRequirements);

  return {
    key: room,
    name: rule.name,
    blurb: rule.blurb,
    level,
    maxLevel: rule.maxLevel,
    nextCostCents,
    currentEffect: effect(room, level, ruleset),
    nextEffect: maxed ? null : effect(room, level + 1, ruleset),
    canUpgrade: !maxed && lockReason === null,
    lockReason,
    nextRequirements,
    specialization: specializationFor(room, ruleset),
  };
}

/** Builds player-specific Hideout status, including upgrade gates and specialization metadata. */
export function hideoutCatalog(ruleset: Ruleset, player: PlayerState): HideoutV2Dto {
  const extension = hideoutV2For(ruleset);
  if (!ruleset.hideout) {
    return {
      enabled: false,
      seasonScoped: true,
      rulesVersion: extension ? 2 : 1,
      totalLevel: 0,
      totalMaxLevel: 0,
      rooms: [],
    };
  }

  const rooms = ROOM_ORDER.filter((room) => Boolean(ruleset.hideout!.rooms[room]))
    .map((room) => toRoomDto(room, ruleset, player));
  return {
    enabled: true,
    seasonScoped: true,
    rulesVersion: extension ? 2 : 1,
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

/** Returns the Workshop bonus in whole product units, rounded down. */
export function hideoutWorkshopBonusProduct(base: number, ruleset: Ruleset, player: Pick<PlayerState, HideoutField>): number {
  const percent = (ruleset.hideout?.buffs.workshopCrackBonusPercentPerLevel ?? 0) * player.hideoutWorkshopLevel;
  return Math.floor(base * percent / 100);
}

/** Compatibility name for callers pinned to the original crack-only Hideout contract. */
export function hideoutWorkshopBonusCrack(base: number, ruleset: Ruleset, player: Pick<PlayerState, HideoutField>): number {
  return hideoutWorkshopBonusProduct(base, ruleset, player);
}

export function hideoutBackOfficeBonusCents(base: bigint, ruleset: Ruleset, player: Pick<PlayerState, HideoutField>): bigint {
  const percent = (ruleset.hideout?.buffs.backOfficeTakeBonusPercentPerLevel ?? 0) * player.hideoutBackOfficeLevel;
  return (base * BigInt(percent)) / 100n;
}

export const HideoutService = {
  catalog(ruleset: Ruleset, player: PlayerState): HideoutV2Dto {
    return hideoutCatalog(ruleset, player);
  },

  /** Buys the next room level after validating availability, progress requirements, and cash. */
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
        const levelAfter = levelBefore + 1;
        const requirements = requirementsFor(room, levelAfter, ruleset, current);
        const unmet = requirements.filter((requirement) => !requirement.met);
        if (unmet.length) {
          throw AppError.badRequest(
            'HIDEOUT_REQUIREMENT_MISSING',
            `Before upgrading ${rule.name}, finish: ${unmet.map((requirement) => `${requirement.label} ${requirement.current}/${requirement.required}`).join('; ')}.`,
          );
        }
        if (current.cashCents < BigInt(costCents)) {
          throw AppError.badRequest('NOT_ENOUGH_CASH', `You need ${dollars(costCents)} for the next ${rule.name} upgrade.`);
        }

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
