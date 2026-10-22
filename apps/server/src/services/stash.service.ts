import { Prisma, type PrismaClient } from '@prisma/client';
import type { StashDto, StashItemDto, StashItemKeyDto, UpdateStashLayoutInput } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { COMPONENTS } from './scavenging.service.js';

const COLUMNS = 10;
const ROWS = 6;
export function stashDimensions(storageLevel = 0): { columns: number; rows: number } {
  return { columns: COLUMNS + Math.max(0, storageLevel) * 2, rows: ROWS + Math.max(0, storageLevel) };
}
const FOOTPRINTS: Record<StashItemKeyDto, readonly [number, number]> = {
  CONDOM: [1, 1], MEDICINE: [1, 1], BEER: [1, 1], AMMO_BOX: [1, 1], PARTS_BOX: [1, 1],
  PISTOL: [1, 1], SHOTGUN: [2, 1], TEK9: [2, 1], AK47: [2, 1],
  LOW_RIDER: [2, 1], SEDAN: [2, 1], VAN: [2, 1],
  SCRAP_METAL: [1, 1], WIRING: [1, 1], TOOL_KIT: [1, 1], BOTTLES: [1, 1], LABELS: [1, 1],
  PACKAGING: [1, 1], LUMBER: [1, 1], FASTENERS: [1, 1], CLOTH: [1, 1], BASIC_MEDICINE: [1, 1],
  FUEL_CAN: [1, 1], RADIO: [1, 1], MOTOR_ASSEMBLY: [1, 1], REPAIR_SUPPLIES: [1, 1], SPECIALTY_CONTAINER: [1, 1],
  PRECISION_PARTS: [1, 1], ADVANCED_MEDICAL: [1, 1], HIGH_CAPACITY_FUEL_CELL: [1, 1], SPECIALIST_CIRCUITRY: [1, 1],
};
for (const component of COMPONENTS) FOOTPRINTS[component.key as StashItemKeyDto] = [1, 1];
type Position = { key: StashItemKeyDto; x: number; y: number };
type PlayerStash = {
  condoms: number; medicine: number; beer: number; ammo: number; vehicleParts: number;
  pistols: number; shotguns: number; tek9s: number; ak47s: number; lowRiders: number; sedans: number; vans: number;
  stashLayout: Prisma.JsonValue;
  scavengedComponents?: Prisma.JsonValue;
  hideoutStorageLevel?: number;
};

function ownedItems(player: PlayerStash): Array<{ key: StashItemKeyDto; quantity: number }> {
  const legacy = ([
    ['CONDOM', player.condoms], ['MEDICINE', player.medicine], ['BEER', player.beer],
    ['AMMO_BOX', player.ammo], ['PARTS_BOX', player.vehicleParts],
    ['PISTOL', player.pistols], ['SHOTGUN', player.shotguns], ['TEK9', player.tek9s], ['AK47', player.ak47s],
    ['LOW_RIDER', player.lowRiders], ['SEDAN', player.sedans], ['VAN', player.vans],
  ] as const).filter(([, quantity]) => quantity > 0).map(([key, quantity]) => ({ key, quantity }));
  const components = player.scavengedComponents && typeof player.scavengedComponents === 'object' && !Array.isArray(player.scavengedComponents)
    ? Object.entries(player.scavengedComponents).filter(([key, quantity]) => Object.hasOwn(FOOTPRINTS, key) && typeof quantity === 'number' && quantity > 0).map(([key, quantity]) => ({ key: key as StashItemKeyDto, quantity: quantity as number }))
    : [];
  return [...legacy, ...components];
}

function readPositions(value: Prisma.JsonValue): Position[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
    const item = row as Record<string, Prisma.JsonValue>;
    if (typeof item.key !== 'string' || !Object.hasOwn(FOOTPRINTS, item.key)) return [];
    if (typeof item.x !== 'number' || typeof item.y !== 'number') return [];
    return [{ key: item.key as StashItemKeyDto, x: item.x, y: item.y }];
  });
}

function inside(item: { key: StashItemKeyDto }, x: number, y: number, columns: number, rows: number): boolean {
  const [width, height] = FOOTPRINTS[item.key];
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x + width <= columns && y + height <= rows;
}

function overlaps(a: { key: StashItemKeyDto; x: number; y: number }, b: { key: StashItemKeyDto; x: number; y: number }): boolean {
  const [aw, ah] = FOOTPRINTS[a.key];
  const [bw, bh] = FOOTPRINTS[b.key];
  return a.x < b.x + bw && b.x < a.x + aw && a.y < b.y + bh && b.y < a.y + ah;
}

function firstFree(key: StashItemKeyDto, placed: Position[], columns: number, rows: number): Position {
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const candidate = { key, x, y };
      if (inside(candidate, x, y, columns, rows) && !placed.some((other) => overlaps(candidate, other))) return candidate;
    }
  }
  throw AppError.conflict('STASH_FULL', 'There is no open space in the stash.');
}

function buildDto(player: PlayerStash, requested?: UpdateStashLayoutInput): StashDto {
  const { columns, rows } = stashDimensions(player.hideoutStorageLevel);
  const owned = ownedItems(player);
  const ownedKeys = new Set(owned.map((item) => item.key));
  const supplied = requested?.items ?? [];
  const submitted = new Map<StashItemKeyDto, Position>();
  for (const row of supplied) {
    if (!ownedKeys.has(row.key)) continue;
    if (submitted.has(row.key)) throw AppError.badRequest('INVALID_STASH_LAYOUT', 'Each stash stack can only appear once.');
    submitted.set(row.key, row);
  }

  const saved = new Map(readPositions(player.stashLayout).filter((row) => ownedKeys.has(row.key)).map((row) => [row.key, row]));
  const placed: Position[] = [];
  for (const { key } of owned) {
    const wanted = submitted.get(key) ?? saved.get(key);
    if (wanted && inside(wanted, wanted.x, wanted.y, columns, rows) && !placed.some((other) => overlaps(wanted, other))) {
      placed.push(wanted);
      continue;
    }
    if (requested && submitted.has(key)) throw AppError.badRequest('INVALID_STASH_LAYOUT', 'Stash items cannot overlap or sit outside the grid.');
    placed.push(firstFree(key, placed, columns, rows));
  }

  const items: StashItemDto[] = owned.map(({ key, quantity }) => {
    const position = placed.find((row) => row.key === key)!;
    const [width, height] = FOOTPRINTS[key];
    return { ...position, quantity, width, height };
  });
  const usedCells = items.reduce((sum, item) => sum + item.width * item.height, 0);
  return { columns, rows, usedCells, totalCells: columns * rows, items };
}

/** True when adding one new stack can be placed without disturbing saved items. */
export function canFitAdditionalStack(stash: StashDto, key: StashItemKeyDto): boolean {
  if (stash.items.some((item) => item.key === key)) return true;
  const footprint = FOOTPRINTS[key];
  if (!footprint) return false;
  const [width, height] = footprint;
  for (let y = 0; y + height <= stash.rows; y += 1) {
    for (let x = 0; x + width <= stash.columns; x += 1) {
      const overlapsExisting = stash.items.some((item) =>
        x < item.x + item.width && item.x < x + width && y < item.y + item.height && item.y < y + height,
      );
      if (!overlapsExisting) return true;
    }
  }
  return false;
}

export const StashService = {
  async page(prisma: PrismaClient | Prisma.TransactionClient, roundPlayerId: string): Promise<StashDto> {
    const player = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { condoms: true, medicine: true, beer: true, ammo: true, vehicleParts: true, pistols: true, shotguns: true, tek9s: true, ak47s: true, lowRiders: true, sedans: true, vans: true, stashLayout: true, scavengedComponents: true, hideoutStorageLevel: true } });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
    return buildDto(player, undefined);
  },

  async saveLayout(prisma: PrismaClient, roundPlayerId: string, input: UpdateStashLayoutInput): Promise<StashDto> {
    return prisma.$transaction(async (tx) => {
      const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { condoms: true, medicine: true, beer: true, ammo: true, vehicleParts: true, pistols: true, shotguns: true, tek9s: true, ak47s: true, lowRiders: true, sedans: true, vans: true, stashLayout: true, scavengedComponents: true, hideoutStorageLevel: true } });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
      const result = buildDto(player, input);
      const layout: Position[] = result.items.map(({ key, x, y }) => ({ key, x, y }));
      await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { stashLayout: layout as Prisma.InputJsonValue } });
      return result;
    });
  },
};
