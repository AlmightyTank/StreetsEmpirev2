import type { PrismaClient, RoundPlayer } from '@prisma/client';
import { headsUpMinutes, productRecipes, reachAt, reachWindows } from '@streets/rules-engine';
import {
  hideoutV2For,
  type HideoutRequirementKey,
  type HideoutRoomKey,
  type Ruleset,
  type WeaponPriority,
} from '@streets/rulesets';
import type {
  GameActionResult,
  HideoutArmoryDto,
  HideoutAssetProtectionDto,
  HideoutGarageDto,
  HideoutInfirmaryDto,
  HideoutRequirementDto,
  HideoutRoomV2Dto,
  HideoutSecurityDto,
  HideoutUpgradeInput,
  HideoutUpgradeResult,
  HideoutWeaponPriorityInput,
  HideoutWeaponPriorityResult,
  HideoutV2Dto,
  HideoutWorkshopDto,
} from '@streets/shared';
import { ActionService, fitThugs, type PlayerState } from './action.service.js';
import { AppError } from '../utils/errors.js';
import { EconomyLedgerService } from './economy-ledger.service.js';

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

export type HideoutProductStock = Record<string, number>;

export interface HideoutProgressContext {
  turfBlocksHeld?: number;
  /** All owned cars, including Low-Riders currently assigned to active runs. */
  lowRidersOwned?: number;
}

function productUnitValueCents(ruleset: Ruleset, key: string): number {
  if (key === 'CRACK') return ruleset.economy.netWorth.perCrackCents;
  return ruleset.products?.[key]?.economy?.netWorthCents ?? ruleset.economy.netWorth.perCrackCents;
}

/** Product units the Safe Room can automatically seal at the player's current level. */
export function hideoutProtectedProductCapacity(
  ruleset: Ruleset,
  player: Pick<PlayerState, HideoutField>,
): number {
  const levels = hideoutV2For(ruleset)?.assetProtection?.protectedProductUnitsBySafeRoomLevel;
  if (!levels) return 0;
  return levels[player.hideoutSafeRoomLevel] ?? 0;
}

/**
 * Computes protected/exposed product from the real inventory without creating a
 * second stash. Highest-value units are sealed first; ties follow catalog order.
 */
export function hideoutProductProtection(
  ruleset: Ruleset,
  player: Pick<PlayerState, HideoutField | 'crack'>,
  products: HideoutProductStock = {},
): {
  capacity: number;
  protected: HideoutProductStock;
  exposed: HideoutProductStock;
  protectedUnits: number;
  exposedUnits: number;
} {
  const capacity = hideoutProtectedProductCapacity(ruleset, player);
  const stash: HideoutProductStock = { ...products, CRACK: Math.max(0, player.crack) };
  const catalogOrder = new Map(
    Object.entries(ruleset.products ?? {}).map(([key, definition]) => [key, definition.sortOrder]),
  );
  const protectedStock: HideoutProductStock = {};
  const exposed: HideoutProductStock = { ...stash };
  let remaining = capacity;

  for (const [key, quantity] of Object.entries(stash)
    .filter(([, quantity]) => quantity > 0)
    .sort(([a], [b]) =>
      productUnitValueCents(ruleset, b) - productUnitValueCents(ruleset, a)
      || (catalogOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (catalogOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
      || a.localeCompare(b))) {
    if (remaining <= 0) break;
    const sealed = Math.min(quantity, remaining);
    if (sealed <= 0) continue;
    protectedStock[key] = sealed;
    exposed[key] = quantity - sealed;
    remaining -= sealed;
  }

  const protectedUnits = Object.values(protectedStock).reduce((sum, quantity) => sum + quantity, 0);
  const exposedUnits = Object.values(exposed).reduce((sum, quantity) => sum + Math.max(0, quantity), 0);
  return { capacity, protected: protectedStock, exposed, protectedUnits, exposedUnits };
}

function assetProtectionDto(
  ruleset: Ruleset,
  player: PlayerState,
  products: HideoutProductStock,
): HideoutAssetProtectionDto | undefined {
  if (!hideoutV2For(ruleset)?.assetProtection) return undefined;
  const product = hideoutProductProtection(ruleset, player, products);
  const baseCashFloor = ruleset.combat?.loot.protectedCashCents ?? 0;
  const cashFloorCents = baseCashFloor + hideoutProtectedCashBonusCents(ruleset, player);
  const cashCents = Number(player.cashCents > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : player.cashCents);
  const protectedCashCents = Math.min(cashCents, cashFloorCents);
  const exposedCashCents = Math.max(0, cashCents - cashFloorCents);
  const keys = new Set([...Object.keys(product.protected), ...Object.keys(product.exposed)]);

  return {
    cashFloorCents,
    protectedCashCents,
    exposedCashCents,
    protectedProductCapacity: product.capacity,
    protectedProductUnits: product.protectedUnits,
    exposedProductUnits: product.exposedUnits,
    policy: 'HIGHEST_VALUE_FIRST',
    products: [...keys]
      .map((key) => {
        const protectedUnits = product.protected[key] ?? 0;
        const exposedUnits = product.exposed[key] ?? 0;
        return {
          key,
          name: ruleset.products?.[key]?.name ?? (key === 'CRACK' ? 'Crack' : key),
          total: protectedUnits + exposedUnits,
          protected: protectedUnits,
          exposed: exposedUnits,
          sortOrder: ruleset.products?.[key]?.sortOrder ?? (key === 'CRACK' ? 0 : Number.MAX_SAFE_INTEGER),
        };
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map(({ sortOrder: _sortOrder, ...row }) => row),
  };
}

function levelOf(player: Pick<PlayerState, HideoutField>, room: HideoutRoomKey): number {
  return player[ROOM_FIELDS[room]];
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function hideoutWorkshopOutputBonusPercent(
  ruleset: Ruleset,
  player: Pick<PlayerState, 'hideoutWorkshopLevel'>,
): number {
  const configured = hideoutV2For(ruleset)?.workshop?.outputBonusPercentByWorkshopLevel[player.hideoutWorkshopLevel];
  return configured ?? (ruleset.hideout?.buffs.workshopCrackBonusPercentPerLevel ?? 0) * player.hideoutWorkshopLevel;
}

export function hideoutWorkshopIngredientEfficiencyPercent(
  ruleset: Ruleset,
  player: Pick<PlayerState, 'hideoutWorkshopLevel'>,
): number {
  return hideoutV2For(ruleset)?.workshop?.ingredientEfficiencyPercentByWorkshopLevel[player.hideoutWorkshopLevel] ?? 0;
}

export function hideoutWorkshopIngredientCentsPerUnit(
  baseCents: number,
  ruleset: Ruleset,
  player: Pick<PlayerState, 'hideoutWorkshopLevel'>,
  product?: string,
): number {
  if (baseCents <= 0) return 0;
  const efficiency = hideoutWorkshopIngredientEfficiencyPercent(ruleset, player);
  const discounted = Math.max(1, Math.floor(baseCents * (100 - efficiency) / 100));
  if (!product) return discounted;

  // Never let Hideout efficiency create a cook-to-Pip cash loop, even if a
  // later ruleset changes a recipe or buyback price.
  const sellCents = product === 'CRACK'
    ? ruleset.stores.PIP.items.CRACK?.sellCents ?? 0
    : ruleset.products?.[product]?.economy?.pip?.sellCents ?? 0;
  const outputBonusPercent = hideoutWorkshopOutputBonusPercent(ruleset, player);
  const noResaleProfitFloor = Math.ceil(sellCents * (100 + outputBonusPercent) / 100);
  return Math.max(discounted, noResaleProfitFloor);
}

export function hideoutGarageRunLimit(
  ruleset: Ruleset,
  player: Pick<PlayerState, 'hideoutGarageLevel'>,
): number {
  const configured = hideoutV2For(ruleset)?.garage?.runLimitByGarageLevel[player.hideoutGarageLevel];
  if (configured !== undefined) return configured;
  return player.hideoutGarageLevel > 0 ? Math.max(2, ruleset.hideout?.buffs.garageRunLimit ?? 2) : 1;
}

export function hideoutGarageRelocationDiscountPercent(
  ruleset: Ruleset,
  player: Pick<PlayerState, 'hideoutGarageLevel'>,
): number {
  return hideoutV2For(ruleset)?.garage?.relocationFeeDiscountPercentByGarageLevel[player.hideoutGarageLevel] ?? 0;
}

export function hideoutWeaponPriority(
  ruleset: Ruleset,
  player: Pick<PlayerState, 'hideoutWeaponPriority'>,
): WeaponPriority {
  if (!hideoutV2For(ruleset)?.armory) return 'POWER';
  return player.hideoutWeaponPriority === 'CONSERVE' ? 'CONSERVE' : 'POWER';
}

export function hideoutMedicineEfficiencyPercent(
  ruleset: Ruleset,
  player: Pick<PlayerState, 'hideoutWorkshopLevel'>,
): number {
  return hideoutV2For(ruleset)?.infirmary
    ?.medicineEfficiencyPercentByWorkshopLevel[player.hideoutWorkshopLevel] ?? 0;
}

function armoryDto(ruleset: Ruleset, player: PlayerState): HideoutArmoryDto | undefined {
  if (!hideoutV2For(ruleset)?.armory) return undefined;
  const fit = fitThugs(player);
  const weapons = {
    pistols: player.pistols,
    shotguns: player.shotguns,
    tek9s: player.tek9s,
    ak47s: player.ak47s,
  };
  const total = weapons.pistols + weapons.shotguns + weapons.tek9s + weapons.ak47s;
  return {
    priority: hideoutWeaponPriority(ruleset, player),
    choices: [
      {
        key: 'POWER',
        name: 'Power First',
        blurb: 'Arm crews with the strongest guns first. This is the classic behavior.',
      },
      {
        key: 'CONSERVE',
        name: 'Conserve Premium',
        blurb: 'Use weaker guns first so premium weapons remain in reserve when possible.',
      },
    ],
    weapons: { ...weapons, total },
    fitThugs: fit,
    armedCapacity: Math.min(fit, total),
    unarmedFitThugs: Math.max(0, fit - total),
  };
}

function infirmaryDto(
  ruleset: Ruleset,
  player: PlayerState,
  nextRecoveryAt: Date | null,
): HideoutInfirmaryDto | undefined {
  if (!hideoutV2For(ruleset)?.infirmary) return undefined;
  const efficiency = hideoutMedicineEfficiencyPercent(ruleset, player);
  const multiplier = Math.max(1, 100 - efficiency);
  const maxTreatableThugs = Math.min(
    player.woundedThugs,
    Math.floor(player.medicine * 100 / multiplier),
  );
  const medicineNeededForAll = player.woundedThugs <= 0
    ? 0
    : Math.max(1, Math.ceil(player.woundedThugs * multiplier / 100));
  return {
    fitThugs: fitThugs(player),
    woundedThugs: player.woundedThugs,
    medicine: player.medicine,
    nextRecoveryAt: nextRecoveryAt?.toISOString() ?? null,
    medicineEfficiencyPercent: efficiency,
    medicineNeededForAll,
    maxTreatableThugs,
  };
}

function workshopDto(ruleset: Ruleset, player: PlayerState): HideoutWorkshopDto | undefined {
  if (!hideoutV2For(ruleset)?.workshop) return undefined;
  return {
    level: player.hideoutWorkshopLevel,
    outputBonusPercent: hideoutWorkshopOutputBonusPercent(ruleset, player),
    ingredientEfficiencyPercent: hideoutWorkshopIngredientEfficiencyPercent(ruleset, player),
    recipes: productRecipes(ruleset).map((recipe) => ({
      key: recipe.product,
      name: recipe.name,
      baseIngredientCentsPerUnit: recipe.ingredientCentsPerUnit,
      effectiveIngredientCentsPerUnit: hideoutWorkshopIngredientCentsPerUnit(
        recipe.ingredientCentsPerUnit,
        ruleset,
        player,
        recipe.product,
      ),
    })),
  };
}

function garageDto(ruleset: Ruleset, player: PlayerState): HideoutGarageDto | undefined {
  if (!hideoutV2For(ruleset)?.garage) return undefined;
  return {
    level: player.hideoutGarageLevel,
    runLimit: hideoutGarageRunLimit(ruleset, player),
    relocationFeeDiscountPercent: hideoutGarageRelocationDiscountPercent(ruleset, player),
  };
}

function effect(room: HideoutRoomKey, level: number, ruleset: Ruleset): string {
  const hideout = ruleset.hideout;
  if (!hideout || level <= 0) return 'No active bonus yet.';

  const buffs = hideout.buffs;
  if (room === 'SAFE_ROOM') {
    const productCapacity = hideoutV2For(ruleset)?.assetProtection?.protectedProductUnitsBySafeRoomLevel[level] ?? 0;
    return productCapacity > 0
      ? `${dollars(level * buffs.safeRoomProtectedCashCentsPerLevel)} extra cash protected from raids, plus up to ${productCapacity} highest-value product units sealed from loot.`
      : `${dollars(level * buffs.safeRoomProtectedCashCentsPerLevel)} extra cash protected from raids.`;
  }
  if (room === 'LOOKOUTS') {
    const security = hideoutV2For(ruleset)?.security;
    const tier = security?.warningTierByLookoutsLevel[level] ?? 'NONE';
    const history = security?.historyHoursByLookoutsLevel[level] ?? 0;
    const warning = tier === 'SOURCE'
      ? `named recon warnings for ${history}h`
      : tier === 'PRESENCE'
        ? `anonymous recon warnings for ${history}h`
        : 'no recon warnings';
    const headsUp = headsUpMinutes(ruleset, level);
    return `+${level * buffs.lookoutsDefenseBonusPercentPerLevel}% home raid defense strength · ${warning} · about ${headsUp.toFixed(1)} min convoy/turf heads-up.`;
  }
  if (room === 'WORKSHOP') {
    const output = hideoutV2For(ruleset)?.workshop?.outputBonusPercentByWorkshopLevel[level]
      ?? level * buffs.workshopCrackBonusPercentPerLevel;
    const efficiency = hideoutV2For(ruleset)?.workshop?.ingredientEfficiencyPercentByWorkshopLevel[level] ?? 0;
    return efficiency > 0
      ? `+${output}% product output · ${efficiency}% less ingredient cost.`
      : `+${output}% product from production.`;
  }
  if (room === 'GARAGE') {
    const extension = hideoutV2For(ruleset)?.garage;
    const runLimit = extension?.runLimitByGarageLevel[level] ?? (level > 0 ? (buffs.garageRunLimit ?? 2) : 1);
    const moveDiscount = extension?.relocationFeeDiscountPercentByGarageLevel[level] ?? 0;
    return moveDiscount > 0
      ? `Up to ${runLimit} active runs at once · ${moveDiscount}% off relocation fees.`
      : `Up to ${runLimit} active runs at once.`;
  }
  return `+${level * buffs.backOfficeTakeBonusPercentPerLevel}% personal cash take from street work.`;
}

function requirementValue(key: HideoutRequirementKey, player: PlayerState, progress: HideoutProgressContext): number {
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
      return progress.lowRidersOwned ?? player.lowRiders;
    case 'WEAPONS_OWNED':
      return player.pistols + player.shotguns + player.tek9s + player.ak47s;
    case 'TURF_BLOCKS_HELD':
      return progress.turfBlocksHeld ?? 0;
  }
}

/** Evaluates a room level's configured requirements against the player's current progress. */
function requirementsFor(
  room: HideoutRoomKey,
  targetLevel: number,
  ruleset: Ruleset,
  player: PlayerState,
  progress: HideoutProgressContext = {},
): HideoutRequirementDto[] {
  const requirements = hideoutV2For(ruleset)?.rooms[room]?.requirements?.[targetLevel] ?? [];
  return requirements.map((requirement) => {
    const current = requirementValue(requirement.key, player, progress);
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
function toRoomDto(room: HideoutRoomKey, ruleset: Ruleset, player: PlayerState, progress: HideoutProgressContext): HideoutRoomV2Dto {
  const rule = ruleset.hideout!.rooms[room];
  if (!rule) throw new RangeError(`Hideout room ${room} is not enabled in this ruleset.`);
  const level = levelOf(player, room);
  const maxed = level >= rule.maxLevel;
  const nextCostCents = maxed ? null : rule.costsCents[level] ?? null;
  const nextRequirements = maxed ? [] : requirementsFor(room, level + 1, ruleset, player, progress);

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
export function hideoutCatalog(
  ruleset: Ruleset,
  player: PlayerState,
  products: HideoutProductStock = {},
  progress: HideoutProgressContext = {},
): HideoutV2Dto {
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
    .map((room) => toRoomDto(room, ruleset, player, progress));
  return {
    enabled: true,
    seasonScoped: true,
    rulesVersion: extension ? 2 : 1,
    totalLevel: rooms.reduce((sum, room) => sum + room.level, 0),
    totalMaxLevel: rooms.reduce((sum, room) => sum + room.maxLevel, 0),
    rooms,
    ...(assetProtectionDto(ruleset, player, products) ? { assetProtection: assetProtectionDto(ruleset, player, products) } : {}),
    ...(workshopDto(ruleset, player) ? { workshop: workshopDto(ruleset, player) } : {}),
    ...(garageDto(ruleset, player) ? { garage: garageDto(ruleset, player) } : {}),
  };
}

async function securityDto(
  prisma: PrismaClient,
  ruleset: Ruleset,
  player: Pick<RoundPlayer, 'id' | 'roundId' | 'hideoutLookoutsLevel'> & { city: { slug: string } },
  now: Date,
): Promise<HideoutSecurityDto | undefined> {
  const security = hideoutV2For(ruleset)?.security;
  if (!security) return undefined;

  const level = player.hideoutLookoutsLevel;
  const tier = security.warningTierByLookoutsLevel[level] ?? 'NONE';
  const historyHours = security.historyHoursByLookoutsLevel[level] ?? 0;
  const headsUp = headsUpMinutes(ruleset, level);
  const seeUntil = new Date(now.getTime() + headsUp * 60_000);
  const since = new Date(now.getTime() - historyHours * 3_600_000);
  const localTrafficVisible = level >= security.localTrafficMinLevel;

  const [recons, convoyThreats, turfThreats, traffic] = await Promise.all([
    tier === 'NONE' || historyHours <= 0
      ? Promise.resolve([])
      : prisma.combatIntel.findMany({
          where: { targetId: player.id, updatedAt: { gte: since } },
          include: { observer: { select: { publicPimpId: true, displayName: true } } },
          orderBy: { updatedAt: 'desc' },
          take: 8,
        }),
    headsUp <= 0
      ? Promise.resolve([])
      : prisma.convoyTail.findMany({
          where: { ownerId: player.id, status: 'PENDING', landsAt: { gt: now, lte: seeUntil } },
          include: { attacker: { select: { publicPimpId: true, displayName: true } } },
          orderBy: { landsAt: 'asc' },
        }),
    headsUp <= 0
      ? Promise.resolve([])
      : prisma.turfPush.findMany({
          where: { defenderId: player.id, status: 'PENDING', landsAt: { gt: now, lte: seeUntil } },
          include: {
            attacker: { select: { publicPimpId: true, displayName: true } },
            turf: { include: { city: { select: { slug: true } } } },
          },
          orderBy: { landsAt: 'asc' },
        }),
    !localTrafficVisible
      ? Promise.resolve([])
      : prisma.run.findMany({
          where: { status: 'ACTIVE', roundPlayerId: { not: player.id }, roundPlayer: { roundId: player.roundId } },
          include: { stops: { orderBy: { order: 'asc' } } },
        }),
  ]);

  const revealSource = tier === 'SOURCE';
  const suspicious: HideoutSecurityDto['suspicious'] = [
    ...recons.map((row) => ({
      kind: 'RECON' as const,
      at: row.updatedAt.toISOString(),
      title: 'Recon spotted',
      detail: revealSource
        ? `${row.observer.displayName} (#${row.observer.publicPimpId}) checked your block.`
        : 'Someone checked your block.',
      urgent: false,
      actor: revealSource ? row.observer : null,
    })),
    ...convoyThreats.map((row) => ({
      kind: 'CONVOY_TAIL' as const,
      at: row.startedAt.toISOString(),
      title: 'Tail spotted',
      detail: `A tail on your run near ${ruleset.cities?.[row.city]?.name ?? row.city} lands at ${row.landsAt.toISOString()}.`,
      urgent: true,
      actor: revealSource ? row.attacker : null,
    })),
    ...turfThreats.map((row) => ({
      kind: 'TURF_PUSH' as const,
      at: row.startedAt.toISOString(),
      title: 'Turf push spotted',
      detail: `A push on your ${ruleset.cities?.[row.turf.city.slug]?.name ?? row.turf.city.slug} turf lands at ${row.landsAt.toISOString()}.`,
      urgent: true,
      actor: revealSource ? row.attacker : null,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  const localTrafficCount = localTrafficVisible
    ? traffic.filter((run) => {
        const stops = run.stops.map((stop) => ({
          city: stop.city,
          route: stop.route as string[],
          departAt: stop.departAt,
          arriveAt: stop.arriveAt,
          leaveAt: stop.leaveAt,
        }));
        return reachAt(reachWindows(ruleset, stops), now)
          .some((window) => window.city === player.city.slug);
      }).length
    : null;

  return {
    lookoutsLevel: level,
    defenseBonusPercent: hideoutDefenseBonusPercent(ruleset, player),
    reconWarningTier: tier,
    historyHours,
    convoyHeadsUpMinutes: headsUp,
    localTrafficVisible,
    localTrafficCount,
    pendingConvoyThreats: convoyThreats.length,
    pendingTurfThreats: turfThreats.length,
    suspicious,
    specializationHooks: {
      streetEyes: { warningHoursBonus: security.specializationHooks.streetEyesWarningHoursBonus, active: false },
      armedWatch: { defenseBonusPercent: security.specializationHooks.armedWatchDefenseBonusPercent, active: false },
    },
  };
}

export function hideoutProtectedCashBonusCents(ruleset: Ruleset, player: Pick<PlayerState, 'hideoutSafeRoomLevel'>): number {
  return (ruleset.hideout?.buffs.safeRoomProtectedCashCentsPerLevel ?? 0) * player.hideoutSafeRoomLevel;
}

export function hideoutDefenseBonusPercent(ruleset: Ruleset, player: Pick<PlayerState, 'hideoutLookoutsLevel'>): number {
  return (ruleset.hideout?.buffs.lookoutsDefenseBonusPercentPerLevel ?? 0) * player.hideoutLookoutsLevel;
}

/** Returns the Workshop bonus in whole product units, rounded down. */
export function hideoutWorkshopBonusProduct(base: number, ruleset: Ruleset, player: Pick<PlayerState, 'hideoutWorkshopLevel'>): number {
  return Math.floor(base * hideoutWorkshopOutputBonusPercent(ruleset, player) / 100);
}

/** Compatibility name for callers pinned to the original crack-only Hideout contract. */
export function hideoutWorkshopBonusCrack(base: number, ruleset: Ruleset, player: Pick<PlayerState, 'hideoutWorkshopLevel'>): number {
  return hideoutWorkshopBonusProduct(base, ruleset, player);
}

export function hideoutBackOfficeBonusCents(base: bigint, ruleset: Ruleset, player: Pick<PlayerState, 'hideoutBackOfficeLevel'>): bigint {
  const percent = (ruleset.hideout?.buffs.backOfficeTakeBonusPercentPerLevel ?? 0) * player.hideoutBackOfficeLevel;
  return (base * BigInt(percent)) / 100n;
}

export const HideoutService = {
  catalog(
    ruleset: Ruleset,
    player: PlayerState,
    products: HideoutProductStock = {},
    progress: HideoutProgressContext = {},
  ): HideoutV2Dto {
    return hideoutCatalog(ruleset, player, products, progress);
  },

  async page(
    prisma: PrismaClient,
    ruleset: Ruleset,
    player: RoundPlayer & { city: { slug: string } },
    state: PlayerState,
    products: HideoutProductStock = {},
    now: Date = new Date(),
  ): Promise<HideoutV2Dto> {
    const [turfBlocksHeld, awayCars, nextInjury] = await Promise.all([
      ruleset.turf
        ? prisma.turf.count({ where: { roundId: player.roundId, holderId: player.id } })
        : Promise.resolve(0),
      prisma.run.aggregate({
        where: { roundPlayerId: player.id, status: 'ACTIVE' },
        _sum: { lowRiders: true },
      }),
      hideoutV2For(ruleset)?.infirmary
        ? prisma.combatInjury.findFirst({
            where: { roundPlayerId: player.id },
            orderBy: [{ recoverAt: 'asc' }, { id: 'asc' }],
            select: { recoverAt: true },
          })
        : Promise.resolve(null),
    ]);
    const lowRidersOwned = state.lowRiders + (awayCars._sum.lowRiders ?? 0);
    const catalog = hideoutCatalog(ruleset, state, products, { turfBlocksHeld, lowRidersOwned });
    const [security, ledger] = await Promise.all([
      securityDto(prisma, ruleset, player, now),
      EconomyLedgerService.page(prisma, player.id, ruleset, state.hideoutBackOfficeLevel, now),
    ]);
    return {
      ...catalog,
      ...(security ? { security } : {}),
      ...(ledger ? { ledger } : {}),
      ...(armoryDto(ruleset, state) ? { armory: armoryDto(ruleset, state) } : {}),
      ...(infirmaryDto(ruleset, state, nextInjury?.recoverAt ?? null)
        ? { infirmary: infirmaryDto(ruleset, state, nextInjury?.recoverAt ?? null) }
        : {}),
    };
  },

  setWeaponPriority(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: HideoutWeaponPriorityInput,
  ): Promise<GameActionResult<HideoutWeaponPriorityResult>> {
    return ActionService.run<HideoutWeaponPriorityResult>(prisma, roundPlayerId, {
      action: 'HIDEOUT_ARMORY_PRIORITY',
      actionId: input.actionId,
      execute: ({ current, ruleset }) => {
        const armory = hideoutV2For(ruleset)?.armory;
        if (!armory) {
          throw AppError.conflict('ARMORY_DISABLED', 'Armory management is not available in this round.');
        }
        if (!armory.weaponPriorities.includes(input.priority)) {
          throw AppError.badRequest('INVALID_WEAPON_PRIORITY', 'Pick an Armory weapon priority.');
        }
        return {
          next: { ...current, hideoutWeaponPriority: input.priority },
          result: { priority: input.priority },
        };
      },
    });
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
      execute: async ({ tx, current, ruleset, player }) => {
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
        const [turfBlocksHeld, awayCars] = await Promise.all([
          ruleset.turf
            ? tx.turf.count({ where: { roundId: player.roundId, holderId: roundPlayerId } })
            : Promise.resolve(0),
          tx.run.aggregate({
            where: { roundPlayerId, status: 'ACTIVE' },
            _sum: { lowRiders: true },
          }),
        ]);
        const lowRidersOwned = current.lowRiders + (awayCars._sum.lowRiders ?? 0);
        const requirements = requirementsFor(room, levelAfter, ruleset, current, { turfBlocksHeld, lowRidersOwned });
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
          ledger: [{
            source: 'HIDEOUT_UPGRADE',
            label: `Hideout upgrade · ${rule.name} level ${levelAfter}`,
            amountCents: -BigInt(costCents),
          }],
          activity: {
            type: 'HIDEOUT_UPGRADE',
            payload: { room, name: rule.name, level: levelAfter, costCents },
          },
        };
      },
    });
  },
};
